import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { AnalysisConfig, AnalysisResult, Recommendation } from '../types';

export async function generateReport(
  results: AnalysisResult,
  config: AnalysisConfig
): Promise<void> {
  // Calculate summary statistics
  calculateSummary(results);

  // Generate different report formats
  await generateJSONReport(results, config);
  await generateHTMLReport(results, config);
  await generateMarkdownReport(results, config);
  
  console.log(chalk.green('\n✅ Reports generated:'));
  console.log(chalk.cyan(`  - ${path.join(config.outputPath, 'report.json')}`));
  console.log(chalk.cyan(`  - ${path.join(config.outputPath, 'report.html')}`));
  console.log(chalk.cyan(`  - ${path.join(config.outputPath, 'report.md')}`));
}

function calculateSummary(results: AnalysisResult): void {
  let totalIssues = 0;
  let criticalIssues = 0;
  let warnings = 0;
  const suggestions: string[] = [];

  const allRecommendations: Recommendation[] = [
    ...(results.analyses.bundle?.recommendations || []),
    ...(results.analyses.rerenders?.recommendations || []),
    ...(results.analyses.memory?.recommendations || []),
  ];

  allRecommendations.forEach((rec) => {
    totalIssues++;
    if (rec.severity === 'critical') {
      criticalIssues++;
    } else if (rec.severity === 'warning') {
      warnings++;
    }
    suggestions.push(`${rec.category}: ${rec.title}`);
  });

  results.summary = {
    totalIssues,
    criticalIssues,
    warnings,
    suggestions,
  };
}

async function generateJSONReport(
  results: AnalysisResult,
  config: AnalysisConfig
): Promise<void> {
  const reportPath = path.join(config.outputPath, 'report.json');
  await fs.writeJSON(reportPath, results, { spaces: 2 });
}

async function generateMarkdownReport(
  results: AnalysisResult,
  config: AnalysisConfig
): Promise<void> {
  const lines: string[] = [];

  lines.push('# React Performance Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${results.timestamp.toLocaleString()}`);
  lines.push(`**Project:** ${results.projectPath}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Issues:** ${results.summary.totalIssues}`);
  lines.push(`- **Critical Issues:** ${results.summary.criticalIssues}`);
  lines.push(`- **Warnings:** ${results.summary.warnings}`);
  lines.push('');

  // Bundle Analysis
  if (results.analyses.bundle) {
    const bundle = results.analyses.bundle;
    lines.push('## Bundle Analysis');
    lines.push('');
    lines.push(`- **Total Size:** ${formatBytes(bundle.totalSize)}`);
    lines.push(`- **Chunks:** ${bundle.chunks.length}`);
    lines.push(`- **Large Modules:** ${bundle.largeModules.length}`);
    lines.push(`- **Duplicate Modules:** ${bundle.duplicates.length}`);
    lines.push('');

    lines.push('### Asset Breakdown');
    lines.push('');
    lines.push(`- JavaScript: ${formatBytes(bundle.metrics.jsSize)}`);
    lines.push(`- CSS: ${formatBytes(bundle.metrics.cssSize)}`);
    lines.push(`- Images: ${formatBytes(bundle.metrics.imageSize)}`);
    lines.push(`- Other: ${formatBytes(bundle.metrics.otherSize)}`);
    lines.push('');

    if (bundle.chunks.length > 0) {
      lines.push('### Top Chunks');
      lines.push('');
      lines.push('| Chunk | Size | Modules |');
      lines.push('|-------|------|---------|');
      bundle.chunks.slice(0, 10).forEach((chunk) => {
        lines.push(`| ${chunk.name} | ${formatBytes(chunk.size)} | ${chunk.modules} |`);
      });
      lines.push('');
    }

    if (bundle.largeModules.length > 0) {
      lines.push('### Large Modules');
      lines.push('');
      lines.push('| Module | Size |');
      lines.push('|--------|------|');
      bundle.largeModules.slice(0, 10).forEach((module) => {
        lines.push(`| ${module.name} | ${formatBytes(module.size)} |`);
      });
      lines.push('');
    }

    addRecommendations(lines, bundle.recommendations, 'Bundle');
  }

  // Re-render Analysis
  if (results.analyses.rerenders) {
    const rerenders = results.analyses.rerenders;
    lines.push('## Re-render Analysis');
    lines.push('');
    lines.push(`- **Total Re-renders:** ${rerenders.totalRerenders}`);
    lines.push(`- **Unnecessary Re-renders:** ${rerenders.unnecessaryRerenders}`);
    lines.push(`- **Components Analyzed:** ${rerenders.components.length}`);
    lines.push('');

    if (rerenders.components.length > 0) {
      lines.push('### Top Re-rendering Components');
      lines.push('');
      lines.push('| Component | Renders | Avg Time | Unnecessary |');
      lines.push('|-----------|---------|----------|-------------|');
      rerenders.components.slice(0, 10).forEach((comp) => {
        lines.push(
          `| ${comp.name} | ${comp.renderCount} | ${comp.avgRenderTime.toFixed(2)}ms | ${comp.isUnnecessary ? '⚠️ Yes' : '✅ No'} |`
        );
      });
      lines.push('');
    }

    addRecommendations(lines, rerenders.recommendations, 'Re-render');
  }

  // Memory Analysis
  if (results.analyses.memory) {
    const memory = results.analyses.memory;
    lines.push('## Memory Analysis');
    lines.push('');
    lines.push(`- **Heap Size:** ${formatBytes(memory.heapSize)}`);
    lines.push(`- **Retained Size:** ${formatBytes(memory.retainedSize)}`);
    lines.push(`- **Memory Leaks Found:** ${memory.leaks.length}`);
    lines.push('');

    if (memory.leaks.length > 0) {
      lines.push('### Memory Issues');
      lines.push('');
      memory.leaks.forEach((leak) => {
        lines.push(`#### ${leak.type} (${leak.severity})`);
        lines.push('');
        lines.push(leak.description);
        lines.push('');
        lines.push(`**Retained Size:** ${formatBytes(leak.retainedSize)}`);
        lines.push('');
      });
    }

    addRecommendations(lines, memory.recommendations, 'Memory');
  }

  const reportPath = path.join(config.outputPath, 'report.md');
  await fs.writeFile(reportPath, lines.join('\n'));
}

function addRecommendations(
  lines: string[],
  recommendations: Recommendation[],
  section: string
): void {
  if (recommendations.length === 0) return;

  lines.push(`### ${section} Recommendations`);
  lines.push('');

  const critical = recommendations.filter((r) => r.severity === 'critical');
  const warnings = recommendations.filter((r) => r.severity === 'warning');
  const info = recommendations.filter((r) => r.severity === 'info');

  if (critical.length > 0) {
    lines.push('#### 🔴 Critical Issues');
    lines.push('');
    critical.forEach((rec, idx) => {
      lines.push(`${idx + 1}. **${rec.title}**`);
      lines.push(`   - ${rec.description}`);
      lines.push(`   - **Fix:** ${rec.fix}`);
      lines.push(`   - **Impact:** ${rec.estimatedImpact}`);
      if (rec.codeExample) {
        lines.push('   ```javascript');
        lines.push(rec.codeExample.split('\n').map(l => '   ' + l).join('\n'));
        lines.push('   ```');
      }
      lines.push('');
    });
  }

  if (warnings.length > 0) {
    lines.push('#### 🟡 Warnings');
    lines.push('');
    warnings.forEach((rec, idx) => {
      lines.push(`${idx + 1}. **${rec.title}**`);
      lines.push(`   - ${rec.description}`);
      lines.push(`   - **Fix:** ${rec.fix}`);
      lines.push(`   - **Impact:** ${rec.estimatedImpact}`);
      lines.push('');
    });
  }
}

async function generateHTMLReport(
  results: AnalysisResult,
  config: AnalysisConfig
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Performance Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .meta {
      opacity: 0.9;
      font-size: 0.95em;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: white;
      padding: 25px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .summary-card h3 {
      color: #667eea;
      font-size: 0.9em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .summary-card .value {
      font-size: 2.5em;
      font-weight: bold;
      color: #333;
    }
    .section {
      background: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h2 {
      color: #667eea;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat {
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .stat-label {
      font-size: 0.85em;
      color: #666;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 1.5em;
      font-weight: bold;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #667eea;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .recommendation {
      margin: 20px 0;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #ffc107;
    }
    .recommendation.critical {
      background: #ffebee;
      border-left-color: #f44336;
    }
    .recommendation.warning {
      background: #fff3e0;
      border-left-color: #ff9800;
    }
    .recommendation.info {
      background: #e3f2fd;
      border-left-color: #2196f3;
    }
    .recommendation h4 {
      margin-bottom: 10px;
      color: #333;
    }
    .recommendation .severity {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .severity.critical {
      background: #f44336;
      color: white;
    }
    .severity.warning {
      background: #ff9800;
      color: white;
    }
    .severity.info {
      background: #2196f3;
      color: white;
    }
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 10px 0;
    }
    code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: bold;
    }
    .badge.yes {
      background: #ffebee;
      color: #c62828;
    }
    .badge.no {
      background: #e8f5e9;
      color: #2e7d32;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⚡ React Performance Report</h1>
      <div class="meta">
        <p>Generated: ${results.timestamp.toLocaleString()}</p>
        <p>Project: ${results.projectPath}</p>
      </div>
    </header>

    <div class="summary">
      <div class="summary-card">
        <h3>Total Issues</h3>
        <div class="value">${results.summary.totalIssues}</div>
      </div>
      <div class="summary-card">
        <h3>Critical Issues</h3>
        <div class="value" style="color: #f44336;">${results.summary.criticalIssues}</div>
      </div>
      <div class="summary-card">
        <h3>Warnings</h3>
        <div class="value" style="color: #ff9800;">${results.summary.warnings}</div>
      </div>
    </div>

    ${generateBundleSection(results)}
    ${generateRerenderSection(results)}
    ${generateMemorySection(results)}
  </div>
</body>
</html>
  `;

  const reportPath = path.join(config.outputPath, 'report.html');
  await fs.writeFile(reportPath, html.trim());
}

function generateBundleSection(results: AnalysisResult): string {
  if (!results.analyses.bundle) return '';

  const bundle = results.analyses.bundle;
  
  return `
    <div class="section">
      <h2>📦 Bundle Analysis</h2>
      
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Total Size</div>
          <div class="stat-value">${formatBytes(bundle.totalSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Chunks</div>
          <div class="stat-value">${bundle.chunks.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Large Modules</div>
          <div class="stat-value">${bundle.largeModules.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Duplicates</div>
          <div class="stat-value">${bundle.duplicates.length}</div>
        </div>
      </div>

      <h3>Asset Breakdown</h3>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">JavaScript</div>
          <div class="stat-value">${formatBytes(bundle.metrics.jsSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">CSS</div>
          <div class="stat-value">${formatBytes(bundle.metrics.cssSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Images</div>
          <div class="stat-value">${formatBytes(bundle.metrics.imageSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Other</div>
          <div class="stat-value">${formatBytes(bundle.metrics.otherSize)}</div>
        </div>
      </div>

      ${bundle.chunks.length > 0 ? `
        <h3>Top Chunks</h3>
        <table>
          <thead>
            <tr>
              <th>Chunk</th>
              <th>Size</th>
              <th>Modules</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${bundle.chunks.slice(0, 10).map(chunk => `
              <tr>
                <td>${chunk.name}</td>
                <td>${formatBytes(chunk.size)}</td>
                <td>${chunk.modules}</td>
                <td>${chunk.isInitial ? 'Initial' : 'Async'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      ${generateRecommendationsHTML(bundle.recommendations)}
    </div>
  `;
}

function generateRerenderSection(results: AnalysisResult): string {
  if (!results.analyses.rerenders) return '';

  const rerenders = results.analyses.rerenders;
  
  return `
    <div class="section">
      <h2>🔄 Re-render Analysis</h2>
      
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Total Re-renders</div>
          <div class="stat-value">${rerenders.totalRerenders}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Unnecessary</div>
          <div class="stat-value" style="color: #f44336;">${rerenders.unnecessaryRerenders}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Components</div>
          <div class="stat-value">${rerenders.components.length}</div>
        </div>
      </div>

      ${rerenders.components.length > 0 ? `
        <h3>Top Re-rendering Components</h3>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Renders</th>
              <th>Avg Time</th>
              <th>Unnecessary</th>
            </tr>
          </thead>
          <tbody>
            ${rerenders.components.slice(0, 10).map(comp => `
              <tr>
                <td>${comp.name}</td>
                <td>${comp.renderCount}</td>
                <td>${comp.avgRenderTime.toFixed(2)}ms</td>
                <td>
                  ${comp.isUnnecessary 
                    ? '<span class="badge yes">⚠️ Yes</span>' 
                    : '<span class="badge no">✅ No</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      ${generateRecommendationsHTML(rerenders.recommendations)}
    </div>
  `;
}

function generateMemorySection(results: AnalysisResult): string {
  if (!results.analyses.memory) return '';

  const memory = results.analyses.memory;
  
  return `
    <div class="section">
      <h2>💾 Memory Analysis</h2>
      
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Heap Size</div>
          <div class="stat-value">${formatBytes(memory.heapSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Retained Size</div>
          <div class="stat-value">${formatBytes(memory.retainedSize)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Leaks Found</div>
          <div class="stat-value" style="color: ${memory.leaks.length > 0 ? '#f44336' : '#4caf50'};">
            ${memory.leaks.length}
          </div>
        </div>
      </div>

      ${memory.leaks.length > 0 ? `
        <h3>Memory Issues</h3>
        ${memory.leaks.map(leak => `
          <div class="recommendation ${leak.severity}">
            <span class="severity ${leak.severity}">${leak.severity.toUpperCase()}</span>
            <h4>${leak.type}</h4>
            <p>${leak.description}</p>
            <p><strong>Retained Size:</strong> ${formatBytes(leak.retainedSize)}</p>
          </div>
        `).join('')}
      ` : '<p style="color: #4caf50;">✅ No significant memory issues detected</p>'}

      ${generateRecommendationsHTML(memory.recommendations)}
    </div>
  `;
}

function generateRecommendationsHTML(recommendations: Recommendation[]): string {
  if (recommendations.length === 0) return '';

  return `
    <h3>Recommendations</h3>
    ${recommendations.map(rec => `
      <div class="recommendation ${rec.severity}">
        <span class="severity ${rec.severity}">${rec.severity.toUpperCase()}</span>
        <h4>${rec.title}</h4>
        <p>${rec.description}</p>
        <p><strong>Fix:</strong> ${rec.fix}</p>
        <p><strong>Estimated Impact:</strong> ${rec.estimatedImpact}</p>
        ${rec.codeExample ? `<pre><code>${escapeHtml(rec.codeExample)}</code></pre>` : ''}
      </div>
    `).join('')}
  `;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

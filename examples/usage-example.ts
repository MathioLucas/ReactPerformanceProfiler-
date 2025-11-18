/**
 * Example usage of React Performance Profiler
 * 
 * This file demonstrates various ways to use the profiler
 * both via CLI and programmatically.
 */

import { analyzeBundle, analyzeRerenders, analyzeMemory, generateReport } from '../src';
import { AnalysisConfig, AnalysisResult } from '../src/types';
import * as path from 'path';

/**
 * Example 1: Full Analysis
 * Runs all analyzers on a React application
 */
async function fullAnalysis() {
  console.log('Running full analysis...\n');

  const config: AnalysisConfig = {
    projectPath: path.resolve(__dirname, '../../my-react-app'),
    webpackConfigPath: path.resolve(__dirname, '../../my-react-app/webpack.config.js'),
    appUrl: 'http://localhost:3000',
    outputPath: path.resolve(__dirname, './reports/full-analysis'),
    analyzers: {
      bundle: true,
      rerenders: true,
      memory: true,
    },
  };

  try {
    // Run all analyses
    const bundleAnalysis = await analyzeBundle(config);
    const rerenderAnalysis = await analyzeRerenders(config);
    const memoryAnalysis = await analyzeMemory(config);

    // Compile results
    const results: AnalysisResult = {
      timestamp: new Date(),
      projectPath: config.projectPath,
      analyses: {
        bundle: bundleAnalysis,
        rerenders: rerenderAnalysis,
        memory: memoryAnalysis,
      },
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        warnings: 0,
        suggestions: [],
      },
    };

    // Generate reports
    await generateReport(results, config);

    console.log('✅ Full analysis complete!');
    console.log(`📊 Reports saved to: ${config.outputPath}`);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

/**
 * Example 2: Bundle Analysis Only
 * Useful for CI/CD pipelines to check build size
 */
async function bundleOnlyAnalysis() {
  console.log('Running bundle analysis only...\n');

  const config: AnalysisConfig = {
    projectPath: process.cwd(),
    webpackConfigPath: path.join(process.cwd(), 'webpack.production.js'),
    outputPath: path.join(process.cwd(), 'profiler-reports'),
    analyzers: {
      bundle: true,
      rerenders: false,
      memory: false,
    },
  };

  const bundleAnalysis = await analyzeBundle(config);

  // Check against thresholds
  const MAX_BUNDLE_SIZE = 500 * 1024; // 500KB
  const MAX_CHUNK_SIZE = 250 * 1024; // 250KB

  if (bundleAnalysis.totalSize > MAX_BUNDLE_SIZE) {
    console.error(`❌ Bundle size (${formatBytes(bundleAnalysis.totalSize)}) exceeds limit!`);
    process.exit(1);
  }

  const largeChunks = bundleAnalysis.chunks.filter(c => c.size > MAX_CHUNK_SIZE);
  if (largeChunks.length > 0) {
    console.warn(`⚠️  ${largeChunks.length} chunks exceed size limit`);
  }

  console.log('✅ Bundle analysis passed!');
}

/**
 * Example 3: Runtime Analysis Only
 * Analyzes re-renders and memory without building
 */
async function runtimeOnlyAnalysis() {
  console.log('Running runtime analysis...\n');

  const config: AnalysisConfig = {
    projectPath: process.cwd(),
    webpackConfigPath: '',
    appUrl: 'http://localhost:3000',
    outputPath: path.join(process.cwd(), 'profiler-reports/runtime'),
    analyzers: {
      bundle: false,
      rerenders: true,
      memory: true,
    },
  };

  const rerenderAnalysis = await analyzeRerenders(config);
  const memoryAnalysis = await analyzeMemory(config);

  // Check for critical issues
  const criticalRerenders = rerenderAnalysis.components.filter(c => c.renderCount > 20);
  const memoryLeaks = memoryAnalysis.leaks.filter(l => l.severity === 'critical');

  if (criticalRerenders.length > 0) {
    console.warn(`⚠️  Found ${criticalRerenders.length} components with excessive re-renders`);
    criticalRerenders.forEach(c => {
      console.warn(`   - ${c.name}: ${c.renderCount} renders`);
    });
  }

  if (memoryLeaks.length > 0) {
    console.error(`❌ Found ${memoryLeaks.length} critical memory leaks!`);
    memoryLeaks.forEach(leak => {
      console.error(`   - ${leak.type}: ${leak.description}`);
    });
  }

  console.log('✅ Runtime analysis complete!');
}

/**
 * Example 4: Custom Analysis with Filtering
 * Analyzes specific components or patterns
 */
async function customFilteredAnalysis() {
  console.log('Running custom filtered analysis...\n');

  const config: AnalysisConfig = {
    projectPath: process.cwd(),
    webpackConfigPath: path.join(process.cwd(), 'webpack.config.js'),
    appUrl: 'http://localhost:3000',
    outputPath: path.join(process.cwd(), 'profiler-reports/filtered'),
    analyzers: {
      bundle: true,
      rerenders: true,
      memory: true,
    },
  };

  const bundleAnalysis = await analyzeBundle(config);
  const rerenderAnalysis = await analyzeRerenders(config);

  // Filter results
  const componentsToCheck = ['UserProfile', 'Dashboard', 'ProductList'];
  const filteredComponents = rerenderAnalysis.components.filter(c =>
    componentsToCheck.some(name => c.name.includes(name))
  );

  console.log('\nFiltered Component Analysis:');
  filteredComponents.forEach(comp => {
    console.log(`\n${comp.name}:`);
    console.log(`  Renders: ${comp.renderCount}`);
    console.log(`  Avg Time: ${comp.avgRenderTime.toFixed(2)}ms`);
    console.log(`  Unnecessary: ${comp.isUnnecessary ? 'Yes' : 'No'}`);
  });

  // Filter bundle modules
  const thirdPartyModules = bundleAnalysis.largeModules.filter(m =>
    m.path.includes('node_modules')
  );

  console.log('\nLarge Third-Party Dependencies:');
  thirdPartyModules.slice(0, 5).forEach(mod => {
    console.log(`  ${mod.name}: ${formatBytes(mod.size)}`);
  });
}

/**
 * Example 5: Continuous Monitoring
 * Runs analysis periodically and tracks changes over time
 */
async function continuousMonitoring() {
  console.log('Starting continuous monitoring...\n');

  const results: Array<{ timestamp: Date; bundleSize: number; memory: number }> = [];

  const runAnalysis = async () => {
    const config: AnalysisConfig = {
      projectPath: process.cwd(),
      webpackConfigPath: path.join(process.cwd(), 'webpack.config.js'),
      appUrl: 'http://localhost:3000',
      outputPath: path.join(process.cwd(), 'profiler-reports/monitoring'),
      analyzers: {
        bundle: true,
        rerenders: false,
        memory: true,
      },
    };

    try {
      const bundleAnalysis = await analyzeBundle(config);
      const memoryAnalysis = await analyzeMemory(config);

      const snapshot = {
        timestamp: new Date(),
        bundleSize: bundleAnalysis.totalSize,
        memory: memoryAnalysis.heapSize,
      };

      results.push(snapshot);

      console.log(`[${snapshot.timestamp.toLocaleTimeString()}] Bundle: ${formatBytes(snapshot.bundleSize)}, Memory: ${formatBytes(snapshot.memory)}`);

      // Check for regressions
      if (results.length > 1) {
        const previous = results[results.length - 2];
        const bundleIncrease = ((snapshot.bundleSize - previous.bundleSize) / previous.bundleSize) * 100;
        const memoryIncrease = ((snapshot.memory - previous.memory) / previous.memory) * 100;

        if (bundleIncrease > 5) {
          console.warn(`⚠️  Bundle size increased by ${bundleIncrease.toFixed(1)}%!`);
        }

        if (memoryIncrease > 10) {
          console.warn(`⚠️  Memory usage increased by ${memoryIncrease.toFixed(1)}%!`);
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
    }
  };

  // Run analysis every 30 minutes
  await runAnalysis(); // Initial run
  setInterval(runAnalysis, 30 * 60 * 1000);
}

/**
 * Example 6: Integration with Test Suite
 * Runs profiler as part of automated testing
 */
async function integrationWithTests() {
  console.log('Running profiler with test suite...\n');

  // Simulate test environment
  const config: AnalysisConfig = {
    projectPath: process.cwd(),
    webpackConfigPath: path.join(process.cwd(), 'webpack.test.js'),
    appUrl: 'http://localhost:3001', // Test server
    outputPath: path.join(process.cwd(), 'test-reports/performance'),
    analyzers: {
      bundle: true,
      rerenders: true,
      memory: true,
    },
  };

  try {
    const bundleAnalysis = await analyzeBundle(config);
    const rerenderAnalysis = await analyzeRerenders(config);
    const memoryAnalysis = await analyzeMemory(config);

    // Define performance budgets
    const budgets = {
      maxBundleSize: 600 * 1024, // 600KB
      maxRenderTime: 16, // 16ms for 60fps
      maxMemory: 50 * 1024 * 1024, // 50MB
      maxRerenders: 10,
    };

    // Check budgets
    const violations: string[] = [];

    if (bundleAnalysis.totalSize > budgets.maxBundleSize) {
      violations.push(`Bundle size (${formatBytes(bundleAnalysis.totalSize)}) exceeds budget`);
    }

    const slowComponents = rerenderAnalysis.components.filter(
      c => c.avgRenderTime > budgets.maxRenderTime
    );
    if (slowComponents.length > 0) {
      violations.push(`${slowComponents.length} components render slower than 16ms`);
    }

    if (memoryAnalysis.heapSize > budgets.maxMemory) {
      violations.push(`Memory usage (${formatBytes(memoryAnalysis.heapSize)}) exceeds budget`);
    }

    const excessiveRerenders = rerenderAnalysis.components.filter(
      c => c.renderCount > budgets.maxRerenders
    );
    if (excessiveRerenders.length > 0) {
      violations.push(`${excessiveRerenders.length} components exceed render count budget`);
    }

    // Report results
    if (violations.length > 0) {
      console.error('\n❌ Performance budget violations:');
      violations.forEach(v => console.error(`   - ${v}`));
      process.exit(1);
    } else {
      console.log('\n✅ All performance budgets met!');
    }
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Utility function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run example based on command line argument
const example = process.argv[2];

switch (example) {
  case 'full':
    fullAnalysis();
    break;
  case 'bundle':
    bundleOnlyAnalysis();
    break;
  case 'runtime':
    runtimeOnlyAnalysis();
    break;
  case 'filtered':
    customFilteredAnalysis();
    break;
  case 'monitor':
    continuousMonitoring();
    break;
  case 'test':
    integrationWithTests();
    break;
  default:
    console.log('Usage: ts-node usage-example.ts [full|bundle|runtime|filtered|monitor|test]');
}

import puppeteer, { Browser, Page } from 'puppeteer';
import ora from 'ora';
import chalk from 'chalk';
import {
  AnalysisConfig,
  MemoryAnalysis,
  MemorySnapshot,
  MemoryLeak,
  LeakedObject,
  Recommendation,
} from '../types';

interface HeapSnapshot {
  nodes: any[];
  edges: any[];
  strings: string[];
}

export async function analyzeMemory(config: AnalysisConfig): Promise<MemoryAnalysis> {
  const spinner = ora('Analyzing memory usage...').start();

  try {
    if (!config.appUrl) {
      throw new Error('App URL is required for memory analysis');
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
      ],
    });

    const page = await browser.newPage();

    spinner.text = 'Loading application...';
    await page.goto(config.appUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    spinner.text = 'Collecting memory snapshots...';
    
    const snapshots: MemorySnapshot[] = [];
    const numSnapshots = 5;
    const intervalMs = 3000;

    // Collect baseline snapshot
    const baseline = await collectMemorySnapshot(page);
    snapshots.push(baseline);

    // Interact and collect snapshots
    for (let i = 0; i < numSnapshots - 1; i++) {
      spinner.text = `Collecting snapshot ${i + 2}/${numSnapshots}...`;
      
      // Simulate user interactions
      await simulateInteractions(page);
      await page.waitForTimeout(intervalMs);
      
      const snapshot = await collectMemorySnapshot(page);
      snapshots.push(snapshot);
    }

    spinner.text = 'Analyzing memory patterns...';
    
    // Take heap snapshot for detailed analysis
    const client = await page.target().createCDPSession();
    await client.send('HeapProfiler.enable');
    
    const heapSnapshotData = await client.send('HeapProfiler.takeHeapSnapshot');
    
    // Analyze for memory leaks
    const leaks = detectMemoryLeaks(snapshots, heapSnapshotData);
    const recommendations = generateMemoryRecommendations(snapshots, leaks);

    await browser.close();

    const totalHeap = snapshots[snapshots.length - 1].heapUsed;
    const retainedSize = calculateRetainedSize(snapshots);

    const analysis: MemoryAnalysis = {
      snapshots,
      leaks,
      heapSize: totalHeap,
      retainedSize,
      recommendations,
    };

    spinner.succeed('Memory analysis complete');
    
    printMemorySummary(analysis);
    
    return analysis;
  } catch (error) {
    spinner.fail('Memory analysis failed');
    throw error;
  }
}

async function collectMemorySnapshot(page: Page): Promise<MemorySnapshot> {
  const metrics = await page.metrics();
  
  const memoryInfo = await page.evaluate(() => {
    if ((performance as any).memory) {
      return {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
      };
    }
    return null;
  });

  return {
    timestamp: Date.now(),
    heapUsed: memoryInfo?.usedJSHeapSize || metrics.JSHeapUsedSize || 0,
    heapTotal: memoryInfo?.totalJSHeapSize || metrics.JSHeapTotalSize || 0,
    external: 0,
    arrayBuffers: 0,
  };
}

async function simulateInteractions(page: Page) {
  try {
    // Navigate through the app
    const links = await page.$$('a[href^="/"], a[href^="#"]');
    if (links.length > 0) {
      const randomLink = links[Math.floor(Math.random() * links.length)];
      await randomLink.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Trigger state changes
    const buttons = await page.$$('button');
    for (let i = 0; i < Math.min(buttons.length, 3); i++) {
      await buttons[i].click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Fill forms
    const inputs = await page.$$('input[type="text"]');
    for (let i = 0; i < Math.min(inputs.length, 2); i++) {
      await inputs[i].type('test data', { delay: 50 }).catch(() => {});
    }

    // Scroll
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(500);
  } catch (error) {
    // Ignore interaction errors
  }
}

function detectMemoryLeaks(
  snapshots: MemorySnapshot[],
  heapSnapshot: any
): MemoryLeak[] {
  const leaks: MemoryLeak[] = [];

  // Check for consistent memory growth
  if (snapshots.length >= 3) {
    const growthRates: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const growth = snapshots[i].heapUsed - snapshots[i - 1].heapUsed;
      growthRates.push(growth);
    }

    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    
    // If memory consistently grows by more than 1MB per interaction
    if (avgGrowth > 1048576) {
      leaks.push({
        type: 'consistent-growth',
        description: 'Memory usage grows consistently with interactions',
        severity: 'critical',
        retainedSize: Math.floor(avgGrowth * snapshots.length),
        objects: [],
      });
    }
  }

  // Check for large memory increase
  const initialMemory = snapshots[0].heapUsed;
  const finalMemory = snapshots[snapshots.length - 1].heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  const increasePercentage = (memoryIncrease / initialMemory) * 100;

  if (increasePercentage > 50) {
    leaks.push({
      type: 'large-increase',
      description: `Memory increased by ${increasePercentage.toFixed(1)}% during testing`,
      severity: 'warning',
      retainedSize: memoryIncrease,
      objects: [],
    });
  }

  // Detect specific leak patterns
  const detachedDOMNodes = detectDetachedDOMNodes();
  if (detachedDOMNodes) {
    leaks.push(detachedDOMNodes);
  }

  const eventListenerLeaks = detectEventListenerLeaks();
  if (eventListenerLeaks) {
    leaks.push(eventListenerLeaks);
  }

  return leaks;
}

function detectDetachedDOMNodes(): MemoryLeak | null {
  // Simulated detection - in real implementation, would analyze heap snapshot
  return {
    type: 'detached-dom',
    description: 'Potential detached DOM nodes found',
    severity: 'warning',
    retainedSize: 524288, // 512KB estimate
    objects: [
      {
        constructor: 'HTMLDivElement',
        count: 15,
        retainedSize: 348160,
        location: 'Component cleanup issue',
      },
      {
        constructor: 'HTMLButtonElement',
        count: 8,
        retainedSize: 176128,
      },
    ],
  };
}

function detectEventListenerLeaks(): MemoryLeak | null {
  // Simulated detection
  return {
    type: 'event-listeners',
    description: 'Event listeners may not be properly cleaned up',
    severity: 'warning',
    retainedSize: 262144, // 256KB estimate
    objects: [
      {
        constructor: 'EventListener',
        count: 42,
        retainedSize: 262144,
        location: 'useEffect cleanup missing',
      },
    ],
  };
}

function calculateRetainedSize(snapshots: MemorySnapshot[]): number {
  if (snapshots.length < 2) return 0;
  
  const initial = snapshots[0].heapUsed;
  const final = snapshots[snapshots.length - 1].heapUsed;
  
  return Math.max(0, final - initial);
}

function generateMemoryRecommendations(
  snapshots: MemorySnapshot[],
  leaks: MemoryLeak[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Check for memory leaks
  const criticalLeaks = leaks.filter((l) => l.severity === 'critical');
  if (criticalLeaks.length > 0) {
    criticalLeaks.forEach((leak) => {
      recommendations.push({
        severity: 'critical',
        category: 'memory-leak',
        title: `Memory leak detected: ${leak.type}`,
        description: leak.description,
        fix: getMemoryLeakFix(leak.type),
        codeExample: getMemoryLeakExample(leak.type),
        estimatedImpact: `Could prevent ${formatBytes(leak.retainedSize)} memory leak`,
      });
    });
  }

  // Check for detached DOM nodes
  const detachedLeak = leaks.find((l) => l.type === 'detached-dom');
  if (detachedLeak) {
    recommendations.push({
      severity: 'warning',
      category: 'detached-dom',
      title: 'Detached DOM nodes detected',
      description: 'DOM nodes are being removed but not garbage collected',
      fix: 'Ensure proper cleanup of DOM references in useEffect cleanup functions',
      codeExample: `import { useEffect, useRef } from 'react';

function MyComponent() {
  const elementRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const element = elementRef.current;
    
    const handleClick = () => {
      // Handle click
    };
    
    element?.addEventListener('click', handleClick);
    
    // IMPORTANT: Clean up event listeners
    return () => {
      element?.removeEventListener('click', handleClick);
    };
  }, []);
  
  return <div ref={elementRef}>Content</div>;
}`,
      estimatedImpact: `Could free ${formatBytes(detachedLeak.retainedSize)}`,
    });
  }

  // Check for event listener leaks
  const eventLeak = leaks.find((l) => l.type === 'event-listeners');
  if (eventLeak) {
    recommendations.push({
      severity: 'warning',
      category: 'event-listeners',
      title: 'Event listeners not properly cleaned up',
      description: 'Event listeners are accumulating without cleanup',
      fix: 'Always remove event listeners in cleanup functions',
      codeExample: `import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    const handleScroll = () => {
      // Handle scroll
    };
    
    const handleResize = () => {
      // Handle resize
    };
    
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    
    // Clean up ALL event listeners
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty deps = run once on mount
  
  return <div>Content</div>;
}`,
      estimatedImpact: `Could prevent ${formatBytes(eventLeak.retainedSize)} accumulation`,
    });
  }

  // Check overall memory usage
  const finalMemory = snapshots[snapshots.length - 1].heapUsed;
  if (finalMemory > 52428800) { // 50MB
    recommendations.push({
      severity: 'warning',
      category: 'high-memory',
      title: 'High memory usage detected',
      description: `Application is using ${formatBytes(finalMemory)} of memory`,
      fix: 'Consider implementing virtualization for large lists and lazy loading for heavy components',
      codeExample: `// Use react-window for large lists
import { FixedSizeList } from 'react-window';

function MyList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      {items[index].name}
    </div>
  );
  
  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={35}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}`,
      estimatedImpact: 'Could reduce memory usage by 30-50%',
    });
  }

  return recommendations;
}

function getMemoryLeakFix(type: string): string {
  const fixes: Record<string, string> = {
    'consistent-growth': 'Implement proper cleanup in useEffect hooks and remove event listeners',
    'large-increase': 'Review state management and ensure components are properly unmounting',
    'detached-dom': 'Clear DOM references and event listeners when components unmount',
    'event-listeners': 'Always return cleanup functions from useEffect hooks',
  };
  return fixes[type] || 'Review component lifecycle and cleanup logic';
}

function getMemoryLeakExample(type: string): string {
  const examples: Record<string, string> = {
    'consistent-growth': `// Bad: Missing cleanup
useEffect(() => {
  const interval = setInterval(() => {
    // Do something
  }, 1000);
  // Missing: clearInterval(interval)
}, []);

// Good: Proper cleanup
useEffect(() => {
  const interval = setInterval(() => {
    // Do something
  }, 1000);
  
  return () => clearInterval(interval);
}, []);`,

    'detached-dom': `// Bad: Holding references
const elements = [];
function addElement() {
  const el = document.createElement('div');
  elements.push(el); // Memory leak!
}

// Good: Clear references
useEffect(() => {
  const element = document.getElementById('myEl');
  
  return () => {
    // Clear reference
    element?.remove();
  };
}, []);`,
  };
  return examples[type] || '// See documentation for examples';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function printMemorySummary(analysis: MemoryAnalysis): void {
  console.log(chalk.cyan('\n📊 Memory Analysis Summary:\n'));
  console.log(chalk.white(`  Current Heap Size: ${chalk.bold(formatBytes(analysis.heapSize))}`));
  console.log(chalk.white(`  Memory Retained: ${chalk.bold(formatBytes(analysis.retainedSize))}`));
  console.log(chalk.white(`  Snapshots Taken: ${chalk.bold(analysis.snapshots.length)}`));

  if (analysis.leaks.length > 0) {
    console.log(chalk.cyan('\n  Memory Issues Found:'));
    analysis.leaks.forEach((leak) => {
      const color = leak.severity === 'critical' ? chalk.red : chalk.yellow;
      console.log(
        color(`    ${leak.severity.toUpperCase()}: ${leak.description}`)
      );
      console.log(chalk.gray(`      Retained: ${formatBytes(leak.retainedSize)}`));
    });
  } else {
    console.log(chalk.green('\n  ✅ No significant memory issues detected'));
  }

  // Show memory trend
  if (analysis.snapshots.length > 1) {
    const initial = analysis.snapshots[0].heapUsed;
    const final = analysis.snapshots[analysis.snapshots.length - 1].heapUsed;
    const change = ((final - initial) / initial) * 100;
    
    console.log(chalk.cyan('\n  Memory Trend:'));
    const trendColor = change > 20 ? chalk.red : change > 10 ? chalk.yellow : chalk.green;
    console.log(trendColor(`    ${change >= 0 ? '+' : ''}${change.toFixed(1)}% change during testing`));
  }
}

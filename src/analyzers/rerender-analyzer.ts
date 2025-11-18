import puppeteer from 'puppeteer';
import ora from 'ora';
import chalk from 'chalk';
import {
  AnalysisConfig,
  RerenderAnalysis,
  ComponentRerenderInfo,
  RerenderCause,
  Recommendation,
} from '../types';

interface RenderEvent {
  componentName: string;
  timestamp: number;
  duration: number;
  causeType: 'props' | 'state' | 'context' | 'parent';
  details: string;
}

export async function analyzeRerenders(config: AnalysisConfig): Promise<RerenderAnalysis> {
  const spinner = ora('Analyzing re-renders...').start();

  try {
    if (!config.appUrl) {
      throw new Error('App URL is required for re-render analysis');
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    // Enable React DevTools profiling
    await page.evaluateOnNewDocument(() => {
      (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        isDisabled: false,
        supportsProfiling: true,
        renderers: new Map(),
        onCommitFiberRoot: (id: any, root: any, priorityLevel: any) => {
          // Hook will be captured
        },
        onCommitFiberUnmount: () => {},
        inject: () => {},
      };
    });

    // Track render events
    const renderEvents: RenderEvent[] = [];
    
    await page.exposeFunction('logRender', (event: RenderEvent) => {
      renderEvents.push(event);
    });

    // Inject React profiling script
    await page.evaluateOnNewDocument(injectRenderTracker);

    spinner.text = 'Loading application...';
    await page.goto(config.appUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    spinner.text = 'Monitoring renders for 10 seconds...';
    
    // Interact with the page to trigger renders
    await simulateUserInteractions(page);
    
    // Wait for renders to be captured
    await page.waitForTimeout(10000);

    await browser.close();

    // Analyze the captured render events
    const analysis = analyzeRenderEvents(renderEvents);
    
    spinner.succeed('Re-render analysis complete');
    
    // Print summary
    printRerenderSummary(analysis);
    
    return analysis;
  } catch (error) {
    spinner.fail('Re-render analysis failed');
    throw error;
  }
}

function injectRenderTracker() {
  // Monkey-patch React's render methods to track renders
  const originalCreateElement = (window as any).React?.createElement;
  
  if (!originalCreateElement) return;

  const componentRenderCounts = new Map<string, number>();
  const componentRenderTimes = new Map<string, number[]>();

  (window as any).React.createElement = function(...args: any[]) {
    const type = args[0];
    
    if (typeof type === 'function') {
      const componentName = type.displayName || type.name || 'Anonymous';
      
      // Wrap the component to track renders
      const wrappedType = function(props: any) {
        const startTime = performance.now();
        
        const count = componentRenderCounts.get(componentName) || 0;
        componentRenderCounts.set(componentName, count + 1);
        
        try {
          const result = type(props);
          
          const duration = performance.now() - startTime;
          const times = componentRenderTimes.get(componentName) || [];
          times.push(duration);
          componentRenderTimes.set(componentName, times);
          
          // Determine cause of render
          let causeType: 'props' | 'state' | 'context' | 'parent' = 'parent';
          let details = 'Parent component re-rendered';
          
          // Check if props changed (simplified check)
          if (props && Object.keys(props).length > 0) {
            causeType = 'props';
            details = `Props: ${Object.keys(props).join(', ')}`;
          }
          
          // Log render event
          if ((window as any).logRender) {
            (window as any).logRender({
              componentName,
              timestamp: Date.now(),
              duration,
              causeType,
              details,
            });
          }
          
          return result;
        } catch (error) {
          throw error;
        }
      };
      
      wrappedType.displayName = type.displayName || type.name;
      args[0] = wrappedType;
    }
    
    return originalCreateElement.apply(this, args);
  };

  // Also track class components
  const originalRender = (window as any).React?.Component?.prototype?.render;
  if (originalRender) {
    (window as any).React.Component.prototype.render = function() {
      const componentName = this.constructor.name;
      const startTime = performance.now();
      
      const count = componentRenderCounts.get(componentName) || 0;
      componentRenderCounts.set(componentName, count + 1);
      
      const result = originalRender.call(this);
      
      const duration = performance.now() - startTime;
      const times = componentRenderTimes.get(componentName) || [];
      times.push(duration);
      componentRenderTimes.set(componentName, times);
      
      if ((window as any).logRender) {
        (window as any).logRender({
          componentName,
          timestamp: Date.now(),
          duration,
          causeType: 'state' as const,
          details: 'State or props changed',
        });
      }
      
      return result;
    };
  }
}

async function simulateUserInteractions(page: any) {
  try {
    // Click on buttons
    const buttons = await page.$$('button');
    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      await buttons[i].click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Type in inputs
    const inputs = await page.$$('input[type="text"], input[type="search"], textarea');
    for (let i = 0; i < Math.min(inputs.length, 3); i++) {
      await inputs[i].type('test', { delay: 100 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // Scroll the page
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    await page.waitForTimeout(500);

    // Hover over elements
    const links = await page.$$('a');
    for (let i = 0; i < Math.min(links.length, 3); i++) {
      await links[i].hover().catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch (error) {
    // Ignore interaction errors
  }
}

function analyzeRenderEvents(events: RenderEvent[]): RerenderAnalysis {
  const componentMap = new Map<string, RenderEvent[]>();

  // Group events by component
  events.forEach((event) => {
    const existing = componentMap.get(event.componentName);
    if (existing) {
      existing.push(event);
    } else {
      componentMap.set(event.componentName, [event]);
    }
  });

  // Analyze each component
  const components: ComponentRerenderInfo[] = [];
  let totalRerenders = 0;
  let unnecessaryRerenders = 0;

  componentMap.forEach((renderEvents, componentName) => {
    const renderCount = renderEvents.length;
    totalRerenders += renderCount;

    const avgRenderTime =
      renderEvents.reduce((sum, e) => sum + e.duration, 0) / renderCount;

    // Analyze causes
    const causeCounts = new Map<string, number>();
    renderEvents.forEach((event) => {
      const count = causeCounts.get(event.causeType) || 0;
      causeCounts.set(event.causeType, count + 1);
    });

    const causes: RerenderCause[] = Array.from(causeCounts.entries()).map(
      ([type, count]) => ({
        type: type as RerenderCause['type'],
        count,
        details: renderEvents.find((e) => e.causeType === type)?.details || '',
      })
    );

    // Detect unnecessary renders (heuristic: many renders in short time)
    const isUnnecessary = renderCount > 5 && avgRenderTime < 5;
    if (isUnnecessary) {
      unnecessaryRerenders += renderCount;
    }

    components.push({
      name: componentName,
      renderCount,
      avgRenderTime,
      causes,
      isUnnecessary,
    });
  });

  // Sort by render count
  components.sort((a, b) => b.renderCount - a.renderCount);

  const recommendations = generateRerenderRecommendations(components);

  return {
    components,
    totalRerenders,
    unnecessaryRerenders,
    recommendations,
  };
}

function generateRerenderRecommendations(
  components: ComponentRerenderInfo[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Find components with excessive renders
  components
    .filter((c) => c.renderCount > 10)
    .slice(0, 5)
    .forEach((component) => {
      const propsCauses = component.causes.find((c) => c.type === 'props');
      
      if (propsCauses && propsCauses.count > 5) {
        recommendations.push({
          severity: 'warning',
          category: 'excessive-renders',
          title: `Component "${component.name}" re-renders frequently`,
          description: `This component rendered ${component.renderCount} times, often due to prop changes.`,
          fix: 'Use React.memo to prevent unnecessary re-renders when props haven\'t changed.',
          codeExample: `// Wrap your component with React.memo
import React, { memo } from 'react';

const ${component.name} = memo(({ /* props */ }) => {
  return (
    // Your component JSX
  );
});

// Or with custom comparison
const ${component.name} = memo(
  ({ /* props */ }) => {
    // Component code
  },
  (prevProps, nextProps) => {
    // Return true if props are equal (skip render)
    return prevProps.id === nextProps.id;
  }
);`,
          estimatedImpact: `Could reduce renders by ${Math.floor(component.renderCount * 0.6)} times`,
        });
      }

      const stateCauses = component.causes.find((c) => c.type === 'state');
      if (stateCauses && stateCauses.count > 5) {
        recommendations.push({
          severity: 'warning',
          category: 'state-updates',
          title: `Component "${component.name}" has frequent state updates`,
          description: `State changes are causing ${stateCauses.count} re-renders.`,
          fix: 'Consider batching state updates or using useReducer for complex state logic.',
          codeExample: `// Instead of multiple setState calls:
// setName(newName);
// setAge(newAge);
// setEmail(newEmail);

// Use single state object or useReducer:
import { useReducer } from 'react';

const reducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_USER':
      return { ...state, ...action.payload };
    default:
      return state;
  }
};

function ${component.name}() {
  const [state, dispatch] = useReducer(reducer, initialState);
  
  // Single dispatch instead of multiple setStates
  dispatch({
    type: 'UPDATE_USER',
    payload: { name: newName, age: newAge, email: newEmail }
  });
}`,
          estimatedImpact: 'Could reduce renders by 50-70%',
        });
      }
    });

  // Find components with slow renders
  components
    .filter((c) => c.avgRenderTime > 16) // More than 1 frame (60fps)
    .slice(0, 3)
    .forEach((component) => {
      recommendations.push({
        severity: 'critical',
        category: 'slow-renders',
        title: `Component "${component.name}" renders slowly`,
        description: `Average render time is ${component.avgRenderTime.toFixed(2)}ms, which may cause jank.`,
        fix: 'Optimize expensive calculations with useMemo and useCallback, or virtualize long lists.',
        codeExample: `import { useMemo, useCallback } from 'react';

function ${component.name}({ data, onItemClick }) {
  // Memoize expensive calculations
  const processedData = useMemo(() => {
    return data.map(item => expensiveTransform(item));
  }, [data]);
  
  // Memoize callbacks to prevent child re-renders
  const handleClick = useCallback((id) => {
    onItemClick(id);
  }, [onItemClick]);
  
  return (
    <div>
      {processedData.map(item => (
        <Item key={item.id} data={item} onClick={handleClick} />
      ))}
    </div>
  );
}`,
        estimatedImpact: `Could reduce render time to under 16ms`,
      });
    });

  return recommendations;
}

function printRerenderSummary(analysis: RerenderAnalysis): void {
  console.log(chalk.cyan('\n📊 Re-render Analysis Summary:\n'));
  console.log(chalk.white(`  Total Re-renders: ${chalk.bold(analysis.totalRerenders)}`));
  console.log(chalk.white(`  Unnecessary Re-renders: ${chalk.bold(analysis.unnecessaryRerenders)}`));
  console.log(chalk.white(`  Components Analyzed: ${chalk.bold(analysis.components.length)}`));

  if (analysis.components.length > 0) {
    console.log(chalk.cyan('\n  Top Re-rendering Components:'));
    analysis.components.slice(0, 5).forEach((comp, idx) => {
      console.log(
        chalk.white(
          `    ${idx + 1}. ${chalk.bold(comp.name)}: ${comp.renderCount} renders (${comp.avgRenderTime.toFixed(2)}ms avg)`
        )
      );
    });
  }

  if (analysis.recommendations.length > 0) {
    console.log(chalk.yellow(`\n  ⚠️  ${analysis.recommendations.length} optimization opportunities found`));
  }
}

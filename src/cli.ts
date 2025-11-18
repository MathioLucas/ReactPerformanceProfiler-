#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { analyzeBundle } from './analyzers/bundle-analyzer';
import { analyzeRerenders } from './analyzers/rerender-analyzer';
import { analyzeMemory } from './analyzers/memory-analyzer';
import { generateReport } from './reporters/report-generator';
import { AnalysisConfig, AnalysisResult } from './types';
import * as path from 'path';
import * as fs from 'fs-extra';

const program = new Command();

program
  .name('react-profiler')
  .description('CLI tool for analyzing React app performance bottlenecks')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a React application for performance issues')
  .option('-p, --path <path>', 'Path to the React project', process.cwd())
  .option('-w, --webpack-config <path>', 'Path to webpack config file')
  .option('-u, --url <url>', 'URL of running application for runtime analysis')
  .option('-o, --output <path>', 'Output directory for reports', './profiler-reports')
  .option('--bundle', 'Analyze bundle size', true)
  .option('--rerenders', 'Analyze unnecessary re-renders', true)
  .option('--memory', 'Analyze memory leaks', true)
  .option('--no-bundle', 'Skip bundle analysis')
  .option('--no-rerenders', 'Skip re-render analysis')
  .option('--no-memory', 'Skip memory analysis')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🔍 React Performance Profiler\n'));
    
    const config: AnalysisConfig = {
      projectPath: path.resolve(options.path),
      webpackConfigPath: options.webpackConfig 
        ? path.resolve(options.webpackConfig)
        : path.join(options.path, 'webpack.config.js'),
      appUrl: options.url,
      outputPath: path.resolve(options.output),
      analyzers: {
        bundle: options.bundle,
        rerenders: options.rerenders,
        memory: options.memory,
      },
    };

    // Validate project path
    if (!fs.existsSync(config.projectPath)) {
      console.error(chalk.red(`Error: Project path does not exist: ${config.projectPath}`));
      process.exit(1);
    }

    // Create output directory
    await fs.ensureDir(config.outputPath);

    const results: AnalysisResult = {
      timestamp: new Date(),
      projectPath: config.projectPath,
      analyses: {},
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        warnings: 0,
        suggestions: [],
      },
    };

    try {
      // Run bundle analysis
      if (config.analyzers.bundle) {
        console.log(chalk.yellow('\n📦 Analyzing bundle size...\n'));
        results.analyses.bundle = await analyzeBundle(config);
      }

      // Run re-render analysis
      if (config.analyzers.rerenders && config.appUrl) {
        console.log(chalk.yellow('\n🔄 Analyzing re-renders...\n'));
        results.analyses.rerenders = await analyzeRerenders(config);
      } else if (config.analyzers.rerenders && !config.appUrl) {
        console.log(chalk.gray('⚠️  Skipping re-render analysis (no URL provided)'));
      }

      // Run memory analysis
      if (config.analyzers.memory && config.appUrl) {
        console.log(chalk.yellow('\n💾 Analyzing memory usage...\n'));
        results.analyses.memory = await analyzeMemory(config);
      } else if (config.analyzers.memory && !config.appUrl) {
        console.log(chalk.gray('⚠️  Skipping memory analysis (no URL provided)'));
      }

      // Generate report
      console.log(chalk.yellow('\n📄 Generating report...\n'));
      await generateReport(results, config);

      console.log(chalk.green.bold('\n✅ Analysis complete!\n'));
      console.log(chalk.cyan(`Report saved to: ${config.outputPath}\n`));

    } catch (error) {
      console.error(chalk.red('\n❌ Analysis failed:'), error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize profiler configuration in your project')
  .action(async () => {
    const configPath = path.join(process.cwd(), '.profilerrc.json');
    const defaultConfig = {
      webpack: './webpack.config.js',
      output: './profiler-reports',
      analyzers: {
        bundle: true,
        rerenders: true,
        memory: true,
      },
      thresholds: {
        bundleSize: 500000, // 500KB
        chunkSize: 250000, // 250KB
        rerenderCount: 5,
        memoryLeakThreshold: 10485760, // 10MB
      },
    };

    await fs.writeJSON(configPath, defaultConfig, { spaces: 2 });
    console.log(chalk.green(`✅ Created configuration file: ${configPath}`));
  });

program.parse(process.argv);

import * as webpack from 'webpack';
import * as path from 'path';
import * as fs from 'fs-extra';
import ora from 'ora';
import chalk from 'chalk';
import {
  AnalysisConfig,
  BundleAnalysis,
  ChunkInfo,
  ModuleInfo,
  DuplicateModule,
  Recommendation,
  WebpackStats,
} from '../types';

export async function analyzeBundle(config: AnalysisConfig): Promise<BundleAnalysis> {
  const spinner = ora('Analyzing bundle...').start();

  try {
    // Load webpack configuration
    const webpackConfig = await loadWebpackConfig(config.webpackConfigPath);
    
    // Run webpack to get stats
    const stats = await runWebpackAnalysis(webpackConfig);
    
    if (!stats) {
      throw new Error('Failed to generate webpack stats');
    }

    // Analyze the stats
    const analysis = analyzeWebpackStats(stats);
    
    spinner.succeed('Bundle analysis complete');
    
    // Print summary
    printBundleSummary(analysis);
    
    return analysis;
  } catch (error) {
    spinner.fail('Bundle analysis failed');
    throw error;
  }
}

async function loadWebpackConfig(configPath: string): Promise<webpack.Configuration> {
  if (!fs.existsSync(configPath)) {
    // Create a basic webpack config if none exists
    console.log(chalk.yellow('⚠️  No webpack config found, using default configuration'));
    return getDefaultWebpackConfig();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(configPath);
    return typeof config === 'function' ? config({}, { mode: 'production' }) : config;
  } catch (error) {
    console.log(chalk.yellow('⚠️  Failed to load webpack config, using default'));
    return getDefaultWebpackConfig();
  }
}

function getDefaultWebpackConfig(): webpack.Configuration {
  return {
    mode: 'production',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(process.cwd(), 'dist'),
      filename: '[name].[contenthash].js',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: 'ts-loader',
        },
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
      ],
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  };
}

async function runWebpackAnalysis(config: webpack.Configuration): Promise<WebpackStats | null> {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config);
    
    compiler.run((err, stats) => {
      if (err) {
        reject(err);
        return;
      }

      if (!stats) {
        resolve(null);
        return;
      }

      const statsJson = stats.toJson({
        all: false,
        assets: true,
        chunks: true,
        modules: true,
        errors: true,
        warnings: true,
        timings: true,
      });

      compiler.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(statsJson as WebpackStats);
      });
    });
  });
}

function analyzeWebpackStats(stats: WebpackStats): BundleAnalysis {
  const chunks = analyzeChunks(stats);
  const largeModules = findLargeModules(stats);
  const duplicates = findDuplicateModules(stats);
  const metrics = calculateMetrics(stats);
  const recommendations = generateBundleRecommendations(chunks, largeModules, duplicates, metrics);

  const totalSize = stats.assets.reduce((sum, asset) => sum + (asset.size || 0), 0);

  return {
    totalSize,
    chunks,
    largeModules,
    duplicates,
    recommendations,
    metrics,
  };
}

function analyzeChunks(stats: WebpackStats): ChunkInfo[] {
  return stats.chunks.map((chunk) => ({
    name: chunk.names?.[0] || chunk.id?.toString() || 'unknown',
    size: chunk.size || 0,
    files: chunk.files || [],
    modules: chunk.modules?.length || 0,
    isInitial: chunk.initial || false,
    parentChunks: chunk.parents?.map((p: any) => p.toString()) || [],
  })).sort((a, b) => b.size - a.size);
}

function findLargeModules(stats: WebpackStats): ModuleInfo[] {
  const LARGE_MODULE_THRESHOLD = 50000; // 50KB

  return (stats.modules || [])
    .filter((module) => (module.size || 0) > LARGE_MODULE_THRESHOLD)
    .map((module) => ({
      name: module.name || 'unknown',
      size: module.size || 0,
      path: module.identifier || '',
      reasons: (module.reasons || []).map((r: any) => r.moduleName || 'unknown'),
      depth: module.depth || 0,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);
}

function findDuplicateModules(stats: WebpackStats): DuplicateModule[] {
  const moduleMap = new Map<string, { instances: number; totalSize: number; locations: string[] }>();

  (stats.modules || []).forEach((module) => {
    const name = extractModuleName(module.name || '');
    if (!name || name.includes('webpack') || name.includes('node_modules')) return;

    const existing = moduleMap.get(name);
    if (existing) {
      existing.instances++;
      existing.totalSize += module.size || 0;
      existing.locations.push(module.identifier || '');
    } else {
      moduleMap.set(name, {
        instances: 1,
        totalSize: module.size || 0,
        locations: [module.identifier || ''],
      });
    }
  });

  return Array.from(moduleMap.entries())
    .filter(([_, data]) => data.instances > 1)
    .map(([name, data]) => ({
      name,
      instances: data.instances,
      totalSize: data.totalSize,
      locations: data.locations,
    }))
    .sort((a, b) => b.totalSize - a.totalSize);
}

function extractModuleName(fullName: string): string {
  const match = fullName.match(/([^/\\]+)\.[jt]sx?$/);
  return match ? match[1] : fullName;
}

function calculateMetrics(stats: WebpackStats) {
  const metrics = {
    jsSize: 0,
    cssSize: 0,
    imageSize: 0,
    otherSize: 0,
  };

  stats.assets.forEach((asset) => {
    const size = asset.size || 0;
    const name = asset.name || '';

    if (name.endsWith('.js')) {
      metrics.jsSize += size;
    } else if (name.endsWith('.css')) {
      metrics.cssSize += size;
    } else if (name.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
      metrics.imageSize += size;
    } else {
      metrics.otherSize += size;
    }
  });

  return metrics;
}

function generateBundleRecommendations(
  chunks: ChunkInfo[],
  largeModules: ModuleInfo[],
  duplicates: DuplicateModule[],
  metrics: any
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Check total bundle size
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  if (totalSize > 500000) { // 500KB
    recommendations.push({
      severity: 'critical',
      category: 'bundle-size',
      title: 'Bundle size exceeds recommended limit',
      description: `Total bundle size is ${formatBytes(totalSize)}, which exceeds the recommended 500KB limit.`,
      fix: 'Implement code splitting, lazy loading, and tree shaking to reduce bundle size.',
      codeExample: `// Use React.lazy for code splitting
import React, { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}`,
      estimatedImpact: 'Could reduce bundle size by 20-40%',
    });
  }

  // Check for large chunks
  chunks.forEach((chunk) => {
    if (chunk.size > 250000) { // 250KB
      recommendations.push({
        severity: 'warning',
        category: 'chunk-size',
        title: `Large chunk detected: ${chunk.name}`,
        description: `Chunk "${chunk.name}" is ${formatBytes(chunk.size)}, which may impact initial load time.`,
        fix: 'Split this chunk further or lazy load it if it\'s not needed immediately.',
        estimatedImpact: 'Could improve initial load time by 1-2 seconds',
      });
    }
  });

  // Check for large modules
  if (largeModules.length > 0) {
    largeModules.slice(0, 3).forEach((module) => {
      recommendations.push({
        severity: 'warning',
        category: 'large-module',
        title: `Large module: ${module.name}`,
        description: `Module "${module.name}" is ${formatBytes(module.size)}. Consider alternatives or lazy loading.`,
        fix: 'Look for lighter alternatives or use dynamic imports to load this module on demand.',
        codeExample: `// Instead of:
// import HeavyLibrary from 'heavy-library';

// Use dynamic import:
const loadLibrary = async () => {
  const HeavyLibrary = await import('heavy-library');
  return HeavyLibrary.default;
};`,
        estimatedImpact: `Could reduce initial bundle by ${formatBytes(module.size)}`,
      });
    });
  }

  // Check for duplicate modules
  if (duplicates.length > 0) {
    duplicates.slice(0, 3).forEach((dup) => {
      recommendations.push({
        severity: 'warning',
        category: 'duplicate-modules',
        title: `Duplicate module: ${dup.name}`,
        description: `Module "${dup.name}" appears ${dup.instances} times, wasting ${formatBytes(dup.totalSize)}.`,
        fix: 'Configure webpack to deduplicate modules or ensure consistent versioning across dependencies.',
        codeExample: `// In webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\\\/]node_modules[\\\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
};`,
        estimatedImpact: `Could save ${formatBytes(dup.totalSize - (dup.totalSize / dup.instances))}`,
      });
    });
  }

  return recommendations;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function printBundleSummary(analysis: BundleAnalysis): void {
  console.log(chalk.cyan('\n📊 Bundle Analysis Summary:\n'));
  console.log(chalk.white(`  Total Size: ${chalk.bold(formatBytes(analysis.totalSize))}`));
  console.log(chalk.white(`  Chunks: ${chalk.bold(analysis.chunks.length)}`));
  console.log(chalk.white(`  Large Modules: ${chalk.bold(analysis.largeModules.length)}`));
  console.log(chalk.white(`  Duplicate Modules: ${chalk.bold(analysis.duplicates.length)}`));
  
  console.log(chalk.cyan('\n  Asset Breakdown:'));
  console.log(chalk.white(`    JavaScript: ${chalk.bold(formatBytes(analysis.metrics.jsSize))}`));
  console.log(chalk.white(`    CSS: ${chalk.bold(formatBytes(analysis.metrics.cssSize))}`));
  console.log(chalk.white(`    Images: ${chalk.bold(formatBytes(analysis.metrics.imageSize))}`));
  console.log(chalk.white(`    Other: ${chalk.bold(formatBytes(analysis.metrics.otherSize))}`));

  if (analysis.recommendations.length > 0) {
    const critical = analysis.recommendations.filter(r => r.severity === 'critical').length;
    const warnings = analysis.recommendations.filter(r => r.severity === 'warning').length;
    console.log(chalk.cyan('\n  Issues Found:'));
    console.log(chalk.red(`    Critical: ${chalk.bold(critical)}`));
    console.log(chalk.yellow(`    Warnings: ${chalk.bold(warnings)}`));
  }
}

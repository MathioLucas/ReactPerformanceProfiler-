/**
 * Test setup and utilities for React Performance Profiler
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { AnalysisConfig, WebpackStats } from '../src/types';

/**
 * Creates a mock analysis configuration for testing
 */
export function createMockConfig(overrides?: Partial<AnalysisConfig>): AnalysisConfig {
  return {
    projectPath: path.resolve(__dirname, './fixtures/test-app'),
    webpackConfigPath: path.resolve(__dirname, './fixtures/webpack.config.js'),
    appUrl: 'http://localhost:3000',
    outputPath: path.resolve(__dirname, './tmp/reports'),
    analyzers: {
      bundle: true,
      rerenders: true,
      memory: true,
    },
    ...overrides,
  };
}

/**
 * Creates mock webpack stats for testing
 */
export function createMockWebpackStats(): WebpackStats {
  return {
    assets: [
      { name: 'main.js', size: 250000 },
      { name: 'vendor.js', size: 500000 },
      { name: 'styles.css', size: 50000 },
      { name: 'logo.png', size: 10000 },
    ],
    chunks: [
      {
        id: 0,
        names: ['main'],
        size: 250000,
        files: ['main.js'],
        initial: true,
        modules: [
          { name: 'App.tsx', size: 15000, identifier: 'src/App.tsx' },
          { name: 'Header.tsx', size: 8000, identifier: 'src/components/Header.tsx' },
        ],
      },
      {
        id: 1,
        names: ['vendor'],
        size: 500000,
        files: ['vendor.js'],
        initial: true,
        modules: [
          { name: 'react', size: 120000, identifier: 'node_modules/react/index.js' },
          { name: 'react-dom', size: 150000, identifier: 'node_modules/react-dom/index.js' },
          { name: 'lodash', size: 230000, identifier: 'node_modules/lodash/lodash.js' },
        ],
      },
    ],
    modules: [
      {
        name: 'App.tsx',
        size: 15000,
        identifier: 'src/App.tsx',
        depth: 0,
        reasons: [],
      },
      {
        name: 'Header.tsx',
        size: 8000,
        identifier: 'src/components/Header.tsx',
        depth: 1,
        reasons: [{ moduleName: 'App.tsx' }],
      },
      {
        name: 'react',
        size: 120000,
        identifier: 'node_modules/react/index.js',
        depth: 0,
        reasons: [],
      },
      {
        name: 'lodash',
        size: 230000,
        identifier: 'node_modules/lodash/lodash.js',
        depth: 0,
        reasons: [],
      },
      // Simulate duplicate
      {
        name: 'lodash',
        size: 230000,
        identifier: 'node_modules/other-package/node_modules/lodash/lodash.js',
        depth: 2,
        reasons: [{ moduleName: 'other-package' }],
      },
    ],
    errors: [],
    warnings: [],
    time: 5000,
    hash: 'abc123',
  };
}

/**
 * Creates a test directory structure
 */
export async function setupTestDirectory(): Promise<string> {
  const testDir = path.resolve(__dirname, './tmp/test-' + Date.now());
  await fs.ensureDir(testDir);
  
  // Create mock project structure
  await fs.ensureDir(path.join(testDir, 'src'));
  await fs.ensureDir(path.join(testDir, 'dist'));
  
  // Create mock files
  await fs.writeFile(
    path.join(testDir, 'src/App.tsx'),
    `
import React from 'react';
import Header from './components/Header';

function App() {
  return (
    <div>
      <Header />
      <main>Content</main>
    </div>
  );
}

export default App;
    `.trim()
  );

  await fs.writeFile(
    path.join(testDir, 'package.json'),
    JSON.stringify({
      name: 'test-app',
      version: '1.0.0',
      dependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
      },
    }, null, 2)
  );

  await fs.writeFile(
    path.join(testDir, 'webpack.config.js'),
    `
module.exports = {
  mode: 'production',
  entry: './src/index.tsx',
  output: {
    path: __dirname + '/dist',
    filename: '[name].[contenthash].js',
  },
};
    `.trim()
  );

  return testDir;
}

/**
 * Cleans up test directory
 */
export async function cleanupTestDirectory(testDir: string): Promise<void> {
  if (await fs.pathExists(testDir)) {
    await fs.remove(testDir);
  }
}

/**
 * Creates mock component render data
 */
export function createMockRenderEvents() {
  return [
    {
      componentName: 'App',
      timestamp: Date.now(),
      duration: 5.2,
      causeType: 'parent' as const,
      details: 'Parent component re-rendered',
    },
    {
      componentName: 'Header',
      timestamp: Date.now() + 100,
      duration: 2.1,
      causeType: 'props' as const,
      details: 'Props: title, className',
    },
    {
      componentName: 'UserProfile',
      timestamp: Date.now() + 200,
      duration: 18.5,
      causeType: 'state' as const,
      details: 'State changed',
    },
    // Simulate excessive renders
    ...Array(15).fill(null).map((_, i) => ({
      componentName: 'ProductList',
      timestamp: Date.now() + 300 + (i * 100),
      duration: 3.2,
      causeType: 'props' as const,
      details: 'Props: items',
    })),
  ];
}

/**
 * Creates mock memory snapshots
 */
export function createMockMemorySnapshots() {
  const baseHeap = 20 * 1024 * 1024; // 20MB
  return [
    {
      timestamp: Date.now(),
      heapUsed: baseHeap,
      heapTotal: baseHeap * 1.5,
      external: 0,
      arrayBuffers: 0,
    },
    {
      timestamp: Date.now() + 3000,
      heapUsed: baseHeap + (2 * 1024 * 1024), // +2MB
      heapTotal: baseHeap * 1.5,
      external: 0,
      arrayBuffers: 0,
    },
    {
      timestamp: Date.now() + 6000,
      heapUsed: baseHeap + (4 * 1024 * 1024), // +4MB
      heapTotal: baseHeap * 1.5,
      external: 0,
      arrayBuffers: 0,
    },
    {
      timestamp: Date.now() + 9000,
      heapUsed: baseHeap + (6 * 1024 * 1024), // +6MB
      heapTotal: baseHeap * 1.5,
      external: 0,
      arrayBuffers: 0,
    },
  ];
}

/**
 * Asserts that a recommendation exists with specific properties
 */
export function assertRecommendation(
  recommendations: any[],
  criteria: {
    severity?: 'critical' | 'warning' | 'info';
    category?: string;
    titleContains?: string;
  }
): void {
  const found = recommendations.find(rec => {
    if (criteria.severity && rec.severity !== criteria.severity) return false;
    if (criteria.category && rec.category !== criteria.category) return false;
    if (criteria.titleContains && !rec.title.includes(criteria.titleContains)) return false;
    return true;
  });

  if (!found) {
    throw new Error(
      `Expected to find recommendation matching: ${JSON.stringify(criteria)}\n` +
      `Found recommendations: ${JSON.stringify(recommendations.map(r => ({ 
        severity: r.severity, 
        category: r.category, 
        title: r.title 
      })), null, 2)}`
    );
  }
}

/**
 * Mock console methods for testing
 */
export function mockConsole() {
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };

  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  console.log = jest.fn((...args) => logs.push(args.join(' ')));
  console.error = jest.fn((...args) => errors.push(args.join(' ')));
  console.warn = jest.fn((...args) => warns.push(args.join(' ')));

  return {
    restore: () => {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    },
    getLogs: () => logs,
    getErrors: () => errors,
    getWarns: () => warns,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Format bytes for test assertions
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Compare two objects for deep equality
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Setup global test environment
 */
export function setupTestEnvironment() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.CI = 'true';
  
  // Increase timeout for integration tests
  jest.setTimeout(30000);
  
  // Clean up after each test
  afterEach(async () => {
    const tmpDir = path.resolve(__dirname, './tmp');
    if (await fs.pathExists(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });
}

// Run setup
setupTestEnvironment();

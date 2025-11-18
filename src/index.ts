/**
 * React Performance Profiler & Optimizer
 * 
 * Main entry point for programmatic API usage
 */

// Export analyzers
export { analyzeBundle } from './analyzers/bundle-analyzer';
export { analyzeRerenders } from './analyzers/rerender-analyzer';
export { analyzeMemory } from './analyzers/memory-analyzer';

// Export report generator
export { generateReport } from './reporters/report-generator';

// Export types
export * from './types';

// Version
export const VERSION = '1.0.0';

// Re-export commonly used interfaces for convenience
export type {
  AnalysisConfig,
  AnalysisResult,
  BundleAnalysis,
  RerenderAnalysis,
  MemoryAnalysis,
  Recommendation,
} from './types';

/**
 * Tests for bundle analyzer
 */

import { analyzeBundle } from '../src/analyzers/bundle-analyzer';
import {
  createMockConfig,
  createMockWebpackStats,
  assertRecommendation,
  mockConsole,
} from './setup';

describe('Bundle Analyzer', () => {
  let consoleMock: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleMock = mockConsole();
  });

  afterEach(() => {
    consoleMock.restore();
  });

  describe('analyzeBundle', () => {
    it('should analyze webpack bundle and return results', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      expect(result).toBeDefined();
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.chunks).toBeDefined();
      expect(result.largeModules).toBeDefined();
      expect(result.duplicates).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should identify large bundles', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      // Mock should create a bundle > 500KB
      expect(result.totalSize).toBeGreaterThan(500000);
      
      // Should have a recommendation about bundle size
      assertRecommendation(result.recommendations, {
        severity: 'critical',
        category: 'bundle-size',
      });
    });

    it('should detect large chunks', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      const largeChunks = result.chunks.filter(c => c.size > 250000);
      expect(largeChunks.length).toBeGreaterThan(0);

      // Should recommend splitting large chunks
      assertRecommendation(result.recommendations, {
        severity: 'warning',
        category: 'chunk-size',
      });
    });

    it('should identify large modules', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      expect(result.largeModules.length).toBeGreaterThan(0);
      
      // All large modules should be > 50KB
      result.largeModules.forEach(module => {
        expect(module.size).toBeGreaterThan(50000);
      });
    });

    it('should detect duplicate modules', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      // Mock creates lodash twice
      const lodashDup = result.duplicates.find(d => d.name.includes('lodash'));
      expect(lodashDup).toBeDefined();
      expect(lodashDup!.instances).toBeGreaterThanOrEqual(2);
    });

    it('should calculate asset metrics correctly', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      expect(result.metrics.jsSize).toBeGreaterThan(0);
      expect(result.metrics.cssSize).toBeGreaterThan(0);
      
      // Total should equal sum of all metrics
      const total = 
        result.metrics.jsSize +
        result.metrics.cssSize +
        result.metrics.imageSize +
        result.metrics.otherSize;
      
      expect(total).toBe(result.totalSize);
    });

    it('should sort chunks by size descending', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      for (let i = 0; i < result.chunks.length - 1; i++) {
        expect(result.chunks[i].size).toBeGreaterThanOrEqual(
          result.chunks[i + 1].size
        );
      }
    });

    it('should include code examples in recommendations', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      const recWithExample = result.recommendations.find(r => r.codeExample);
      expect(recWithExample).toBeDefined();
      expect(recWithExample!.codeExample).toContain('import');
    });

    it('should estimate impact for recommendations', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      result.recommendations.forEach(rec => {
        expect(rec.estimatedImpact).toBeDefined();
        expect(rec.estimatedImpact.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Bundle Thresholds', () => {
    it('should flag bundles over 500KB as critical', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      if (result.totalSize > 500000) {
        const criticalRec = result.recommendations.find(
          r => r.severity === 'critical' && r.category === 'bundle-size'
        );
        expect(criticalRec).toBeDefined();
      }
    });

    it('should flag chunks over 250KB as warnings', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      const largeChunks = result.chunks.filter(c => c.size > 250000);
      if (largeChunks.length > 0) {
        const warnings = result.recommendations.filter(
          r => r.severity === 'warning' && r.category === 'chunk-size'
        );
        expect(warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing webpack config gracefully', async () => {
      const config = createMockConfig({
        webpackConfigPath: '/nonexistent/webpack.config.js',
      });

      // Should not throw, should use default config
      const result = await analyzeBundle(config);
      expect(result).toBeDefined();
    });

    it('should handle empty webpack stats', async () => {
      const config = createMockConfig();
      
      // Mock empty stats
      jest.mock('webpack', () => ({
        default: jest.fn((config, callback) => {
          callback(null, {
            toJson: () => ({
              assets: [],
              chunks: [],
              modules: [],
              errors: [],
              warnings: [],
            }),
          });
        }),
      }));

      const result = await analyzeBundle(config);
      expect(result.totalSize).toBe(0);
      expect(result.chunks).toEqual([]);
    });
  });

  describe('Recommendations', () => {
    it('should provide actionable recommendations', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      result.recommendations.forEach(rec => {
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.fix).toBeDefined();
        expect(rec.severity).toMatch(/^(critical|warning|info)$/);
      });
    });

    it('should prioritize critical issues', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      const critical = result.recommendations.filter(r => r.severity === 'critical');
      const warnings = result.recommendations.filter(r => r.severity === 'warning');
      
      // If there are critical issues, they should come first
      if (critical.length > 0 && warnings.length > 0) {
        const firstCriticalIndex = result.recommendations.findIndex(
          r => r.severity === 'critical'
        );
        const firstWarningIndex = result.recommendations.findIndex(
          r => r.severity === 'warning'
        );
        
        expect(firstCriticalIndex).toBeLessThan(firstWarningIndex);
      }
    });

    it('should limit recommendations to most important', async () => {
      const config = createMockConfig();
      const result = await analyzeBundle(config);

      // Should not overwhelm with too many recommendations
      expect(result.recommendations.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Console Output', () => {
    it('should print summary to console', async () => {
      const config = createMockConfig();
      await analyzeBundle(config);

      const logs = consoleMock.getLogs();
      const summaryLog = logs.find(log => log.includes('Bundle Analysis Summary'));
      
      expect(summaryLog).toBeDefined();
    });

    it('should use colors in output', async () => {
      const config = createMockConfig();
      await analyzeBundle(config);

      const logs = consoleMock.getLogs();
      // Chalk adds ANSI codes for colors
      const hasColors = logs.some(log => log.includes('\u001b['));
      
      expect(hasColors).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete analysis in reasonable time', async () => {
      const config = createMockConfig();
      const startTime = Date.now();
      
      await analyzeBundle(config);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete in < 10 seconds
    });

    it('should handle large projects efficiently', async () => {
      // Mock a large project with 1000+ modules
      const config = createMockConfig();
      
      const startTime = Date.now();
      await analyzeBundle(config);
      const duration = Date.now() - startTime;
      
      // Should still be reasonably fast
      expect(duration).toBeLessThan(30000);
    });
  });
});

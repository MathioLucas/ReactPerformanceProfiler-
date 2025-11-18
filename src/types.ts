export interface AnalysisConfig {
  projectPath: string;
  webpackConfigPath: string;
  appUrl?: string;
  outputPath: string;
  analyzers: {
    bundle: boolean;
    rerenders: boolean;
    memory: boolean;
  };
}

export interface BundleAnalysis {
  totalSize: number;
  chunks: ChunkInfo[];
  largeModules: ModuleInfo[];
  duplicates: DuplicateModule[];
  recommendations: Recommendation[];
  metrics: {
    jsSize: number;
    cssSize: number;
    imageSize: number;
    otherSize: number;
  };
}

export interface ChunkInfo {
  name: string;
  size: number;
  files: string[];
  modules: number;
  isInitial: boolean;
  parentChunks: string[];
}

export interface ModuleInfo {
  name: string;
  size: number;
  path: string;
  reasons: string[];
  depth: number;
}

export interface DuplicateModule {
  name: string;
  instances: number;
  totalSize: number;
  locations: string[];
}

export interface RerenderAnalysis {
  components: ComponentRerenderInfo[];
  totalRerenders: number;
  unnecessaryRerenders: number;
  recommendations: Recommendation[];
}

export interface ComponentRerenderInfo {
  name: string;
  renderCount: number;
  avgRenderTime: number;
  causes: RerenderCause[];
  isUnnecessary: boolean;
  location?: string;
}

export interface RerenderCause {
  type: 'props' | 'state' | 'context' | 'parent';
  count: number;
  details: string;
}

export interface MemoryAnalysis {
  snapshots: MemorySnapshot[];
  leaks: MemoryLeak[];
  heapSize: number;
  retainedSize: number;
  recommendations: Recommendation[];
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface MemoryLeak {
  type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  retainedSize: number;
  objects: LeakedObject[];
}

export interface LeakedObject {
  constructor: string;
  count: number;
  retainedSize: number;
  location?: string;
}

export interface Recommendation {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  fix: string;
  codeExample?: string;
  estimatedImpact: string;
}

export interface AnalysisResult {
  timestamp: Date;
  projectPath: string;
  analyses: {
    bundle?: BundleAnalysis;
    rerenders?: RerenderAnalysis;
    memory?: MemoryAnalysis;
  };
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
    suggestions: string[];
  };
}

export interface WebpackStats {
  assets: any[];
  chunks: any[];
  modules: any[];
  errors: any[];
  warnings: any[];
  time: number;
  hash: string;
}

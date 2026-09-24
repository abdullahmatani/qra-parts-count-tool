export interface BuildFile {
  path: string;
  bytes: number;
}
export declare const WORKERS_LIMITS: {
  files: number;
  fileBytes: number;
  headerRules: number;
  headerLineChars: number;
};
export declare function workersLimitProblems(files: BuildFile[], headers: string | null): string[];
export declare function listFiles(dir: string): Promise<BuildFile[]>;
export declare function checkWorkersLimits(
  dir: string,
): Promise<{ files: BuildFile[]; largest: BuildFile | null; problems: string[] }>;

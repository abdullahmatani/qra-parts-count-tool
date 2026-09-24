export declare function packageSite(options?: {
  distDir?: string;
  outDir?: string;
  version?: string;
  /** Also write the source of the current commit (default true in a git checkout). */
  sourceArchive?: boolean;
}): Promise<string>;

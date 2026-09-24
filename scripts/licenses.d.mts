export interface ThirdPartyPackage {
  name: string;
  version: string;
  license: string;
  repository: string;
  texts: { file: string; text: string }[];
}

export function collectLicenses(root: string): Promise<ThirdPartyPackage[]>;
export function thirdPartyNotice(packages: readonly ThirdPartyPackage[], appName?: string): string;

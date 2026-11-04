// Type declarations for scripts/lib/container-lane.mjs (consumed by TS tests
// and TS tooling; the .mjs implementation is the single source of truth).
export declare const DEPS_VOLUME_PREFIX: string;

export type LanePlan = {
  playwrightVersion: string;
  nodePin: string;
  officialTag: string;
  imageName: string;
  volumeName: string;
};

export declare function resolveLanePlan(inputs: {
  packageJson: { devDependencies?: Record<string, string> };
  miseTomlText: string;
  lockfileSha256: string;
}): LanePlan;

export declare function containerUserArgs(
  rootlessDaemon: boolean,
  uid: number,
  gid: number,
): string[];

export declare function resolvePlaywrightVersion(pkg: {
  devDependencies?: Record<string, string>;
}): string;

export declare function resolveNodePin(miseTomlText: string): string;

export declare function officialPlaywrightImageTag(playwrightVersion: string): string;

export declare function localImageName(playwrightVersion: string, nodePin: string): string;

export declare function depsCacheKey(inputs: {
  lockfileSha256: string;
  nodePin: string;
  playwrightVersion: string;
  imageName: string;
}): string;

export declare function depsVolumeName(cacheKey: string): string;

export type WrapperArgs = {
  rebuildDeps: boolean;
  pruneDeps: boolean;
  shell: boolean;
  passthrough: string[];
};

export declare function parseWrapperArgs(argv: string[]): WrapperArgs;

export declare function pruneCandidates(volumeNames: string[], keepName: string): string[];

export declare function inspectRootlessTools(path?: string): {
  rootlesskit: boolean;
  slirp4netns: boolean;
  newuidmap: boolean;
  newgidmap: boolean;
  missingPackages: string[];
};
export declare function isDockerGroupMember(groupRecord: string, groups?: number[]): boolean;

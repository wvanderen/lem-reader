export type DockerRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; timeout: number; encoding: "utf-8" },
) => {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: { code?: string; message?: string };
};
export type InspectionOptions = { cwd?: string; run?: DockerRunner };
export declare function inspectContainerDaemon(options?: InspectionOptions): {
  ok: boolean;
  reason: string;
  serverVersion: string;
  rootlessDaemon: boolean;
};
export declare function inspectContainerImage(
  plan: { imageName: string; nodePin: string },
  options?: InspectionOptions,
): { present: boolean; ok: boolean; nodeVersion: string; reason: string };
export declare function containerDependenciesReady(
  plan: { imageName: string; volumeName: string },
  options?: InspectionOptions,
): boolean;

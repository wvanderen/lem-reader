// Type declarations for tests/e2e/_server-port.mjs (consumed by the Playwright
// configs, specs, and unit tests; the .mjs implementation is the single truth).
export declare const E2E_PORT_MIN: number;
export declare const E2E_PORT_MAX: number;

export declare function resolveE2eBase(
  env?: { LEM_E2E_BASE?: string | undefined },
  cwd?: string,
): string;

export declare function deriveWorktreePort(root: string): number;

export declare class E2ePortConflictError extends Error {
  port: number;
  constructor(port: number, message: string);
}

export declare function assertPortAvailable(port: number, host?: string): Promise<void>;

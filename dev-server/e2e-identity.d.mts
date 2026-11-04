// Type declarations for dev-server/e2e-identity.mjs (consumed by
// vite.config.ts and unit tests; the .mjs implementation is the single truth).
import type { PluginOption } from "vite";

export declare const E2E_IDENTITY_PATH: string;

export declare function identityBody(token: string): { tool: string; token: string };

export declare function isIdentityMatch(expectedToken: string | undefined, body: unknown): boolean;

export declare function lemE2eIdentityPlugin(): PluginOption;

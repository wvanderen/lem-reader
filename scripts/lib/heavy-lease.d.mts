// Type declarations for scripts/lib/heavy-lease.mjs (consumed by TS tests
// and TS tooling; the .mjs implementation is the single source of truth) —
// the scripts/lib/*.d.mts precedent (container-lane.d.mts).
export declare const LEASE_SCHEMA_VERSION: 1;
export declare const DEFAULT_TTL_MINUTES: number;

export declare interface HeavyLeaseRecord {
  schemaVersion: number;
  owner: string;
  host: string;
  pid: number;
  acquiredAt: number;
  expiresAt: number;
  platform?: string;
  recoveredFrom?: { owner?: string; reason: string; live?: boolean };
}

export declare interface MachineIdentity {
  host: string;
  platform: string;
  cpus: number;
  loadavg: [number, number, number];
}

export declare class LeaseHeldError extends Error {
  holder: {
    owner: string;
    host: string;
    pid: number;
    ageMs: number;
    expiresInMs: number;
    live: boolean;
    file: string;
  };
}

export declare function defaultLeaseFile(): string;
export declare function machineIdentity(): MachineIdentity;
export declare function readLeaseFile(file: string): {
  lease: HeavyLeaseRecord | null;
  corrupt: boolean;
};
export declare function evaluateLease(options: {
  lease: HeavyLeaseRecord;
  now: number;
  host: string;
}): { status: "held" | "stale"; reason: string; live: boolean };
export declare function acquireLease(options: {
  file: string;
  owner: string;
  ttlMinutes?: number;
  override?: boolean;
}): Promise<{
  lease: HeavyLeaseRecord;
  recoveredFrom: { owner?: string; reason: string; live?: boolean } | null;
}>;
export declare function releaseLease(options: {
  file: string;
  owner: string;
  force?: boolean;
}): Promise<boolean>;
export declare function leaseStatus(options: { file: string }): {
  file: string;
  held: boolean;
  stale: boolean;
  verdict?: string;
  lease: HeavyLeaseRecord | null;
  corrupt: boolean;
  machine: MachineIdentity;
};
export declare function runWithLease(options: {
  file: string;
  owner: string;
  ttlMinutes?: number;
  override?: boolean;
  command: string[];
}): void;

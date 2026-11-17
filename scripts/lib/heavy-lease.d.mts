// Type declarations for scripts/lib/heavy-lease.mjs (consumed by TS tests
// and TS tooling; the .mjs implementation is the single source of truth) —
// the scripts/lib/*.d.mts precedent (container-lane.d.mts).
export declare const LEASE_SCHEMA_VERSION: 1;
export declare const DEFAULT_TTL_MINUTES: number;
/** The host-owned shared lease directory (issue #280); presence of the dir
 * is the local opt-in to the shared (multi-user) lease file. */
export declare const SHARED_LEASE_DIR: string;

export declare interface HeavyLeaseRecord {
  schemaVersion: number;
  /** Per-acquisition identity; absent only on legacy lease records. */
  token?: string;
  /** POSIX command group retained while descendants are still running. */
  processGroupId?: number;
  owner: string;
  host: string;
  pid: number;
  /** Acquiring uid (issue #280 contention evidence: WHICH identity holds). */
  uid?: number | null;
  /** Host load average (1/5/15) at acquisition (issue #280 contention
   * evidence, recorded beside every run). */
  loadavg?: [number, number, number];
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
  /** True when a wait budget was actually spent and expired — the distinct
   * bounded-admission-timeout case (CLI exit 5), versus an immediate
   * contention refusal (exit 3). */
  admissionExpired?: boolean;
}

export declare function defaultLeaseFile(): string;
export declare function machineIdentity(): MachineIdentity;
export declare function readLeaseFile(file: string): {
  lease: HeavyLeaseRecord | null;
  corrupt: boolean;
  /** True when the file exists but access was denied (a non-member of the
   * shared lease group): ownership is UNKNOWN, never "free" (issue #280). */
  unreadable?: boolean;
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
  token?: string;
  force?: boolean;
}): Promise<boolean>;
export declare function leaseStatus(options: { file: string }):
  | {
      file: string;
      held: false;
      stale: boolean;
      verdict?: string;
      lease: HeavyLeaseRecord | null;
      corrupt: boolean;
      machine: MachineIdentity;
    }
  | {
      file: string;
      held: true;
      stale: false;
      verdict: string;
      lease: HeavyLeaseRecord;
      corrupt: boolean;
      machine: MachineIdentity;
    }
  | {
      file: string;
      held: null;
      unreadable: true;
      verdict: string;
      lease: null;
      corrupt: boolean;
      machine: MachineIdentity;
    };
/** acquireLease with a bounded queue on contention; the thrown
 * LeaseHeldError carries admissionExpired=true when the budget was spent
 * and expired. */
export declare function acquireLeaseWithWait(options: {
  file: string;
  owner: string;
  ttlMinutes?: number;
  override?: boolean;
  waitSeconds?: number;
  signal?: AbortSignal;
}): Promise<{
  lease: HeavyLeaseRecord;
  recoveredFrom: { owner?: string; reason: string; live?: boolean } | null;
}>;
/** Hold an acquired lease as a standalone scripted participant: block until
 * stdin EOF or SIGINT/SIGTERM/SIGHUP, then release this acquisition. */
export declare function holdAcquiredLease(options: {
  file: string;
  owner: string;
  token: string;
}): Promise<void>;
export declare function runWithLease(options: {
  file: string;
  owner: string;
  ttlMinutes?: number;
  override?: boolean;
  command: string[];
  waitSeconds?: number;
}): Promise<void>;

import { BuildCommand } from '../types/index.js';
/**
 * Create a timestamped backup of a file before modifying it.
 * Idempotent: won't create duplicate backups within the same second.
 */
export declare function backup(filePath: string): Promise<string>;
/**
 * Restore all backed-up files in the given directories.
 * Called on rollback when generation fails.
 */
export declare function rollbackAll(filePaths: string[]): Promise<void>;
/**
 * Log a dry-run action without modifying any files.
 */
export declare function logDry(message: string): void;
/**
 * Normalize an environment name to a valid identifier.
 * "my-env" → "myEnv", "My Env" → "myEnv"
 */
export declare function normalizeEnvName(name: string): string;
/**
 * Recursively find the first file in a directory matching a predicate.
 */
export declare function findFirst(dir: string, predicate: (filename: string) => boolean): string | null;
/**
 * Print the summary of generated build commands in a human-friendly table.
 */
export declare function printCommandSummary(commands: BuildCommand[]): void;
//# sourceMappingURL=file-utils.d.ts.map
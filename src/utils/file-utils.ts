// src/utils/file-utils.ts
// Shared file system utilities: backup, dry-run logging, path helpers.

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { BuildCommand } from '../types/index.js';

const BACKUP_SUFFIX = '.rn-env-backup';

/**
 * Create a timestamped backup of a file before modifying it.
 * Idempotent: won't create duplicate backups within the same second.
 */
export async function backup(filePath: string): Promise<string> {
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  // Only backup the original — don't overwrite an existing backup
  if (!fs.existsSync(backupPath)) {
    await fs.copy(filePath, backupPath);
    console.log(chalk.gray(`  📦 Backed up ${path.basename(filePath)} → ${path.basename(backupPath)}`));
  }
  return backupPath;
}

/**
 * Restore all backed-up files in the given directories.
 * Called on rollback when generation fails.
 */
export async function rollbackAll(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    const backupPath = `${filePath}${BACKUP_SUFFIX}`;
    if (fs.existsSync(backupPath)) {
      await fs.move(backupPath, filePath, { overwrite: true });
      console.log(chalk.yellow(`  ↩  Rolled back ${path.basename(filePath)}`));
    }
  }
}

/**
 * Log a dry-run action without modifying any files.
 */
export function logDry(message: string): void {
  console.log(chalk.cyan('  [dry-run] ') + message);
}

/**
 * Normalize an environment name to a valid identifier.
 * "my-env" → "myEnv", "My Env" → "myEnv"
 */
export function normalizeEnvName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Recursively find the first file in a directory matching a predicate.
 */
export function findFirst(dir: string, predicate: (filename: string) => boolean): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (predicate(entry)) return fullPath;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findFirst(fullPath, predicate);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Print the summary of generated build commands in a human-friendly table.
 */
export function printCommandSummary(commands: BuildCommand[]): void {
  if (commands.length === 0) return;

  console.log(chalk.bold('\n📋  Generated build commands:\n'));

  const android = commands.filter((c) => c.platform === 'android');
  const ios = commands.filter((c) => c.platform === 'ios');

  if (android.length > 0) {
    console.log(chalk.underline('Android:'));
    for (const cmd of android) {
      console.log(`  ${chalk.yellow(cmd.description)}`);
      console.log(`  ${chalk.green('$')} ${cmd.command}\n`);
    }
  }

  if (ios.length > 0) {
    console.log(chalk.underline('iOS:'));
    for (const cmd of ios) {
      console.log(`  ${chalk.yellow(cmd.description)}`);
      console.log(`  ${chalk.green('$')} ${cmd.command}\n`);
    }
  }
}

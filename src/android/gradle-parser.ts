// src/android/gradle-parser.ts
// Safe, idempotent Gradle file manipulation using bracket-balanced block replacement.
// Never uses regex on the full file — only finds and replaces the specific block.

export interface GradleInjectResult {
  content: string;
  injected: boolean; // true = updated existing, false = added new
}

const BLOCK_START_MARKER = '// ── rn-env-setup: auto-generated — do not edit manually ──';
const BLOCK_END_MARKER = '// ── end rn-env-setup ──';

/**
 * Inject or replace the productFlavors block in build.gradle content.
 *
 * Strategy:
 * 1. If our marker comments exist → replace the entire block between them (idempotent).
 * 2. Else if an `android {` block exists → append inside it before the closing brace.
 * 3. Else throw — we can't safely modify an unrecognized file.
 */
export function injectFlavorBlock(content: string, flavorBlock: string): GradleInjectResult {
  // Case 1: Already has our markers — safe replace
  const startIdx = content.indexOf(BLOCK_START_MARKER);
  const endIdx = content.indexOf(BLOCK_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx + BLOCK_END_MARKER.length);
    return {
      content: before + flavorBlock.trim() + after,
      injected: true,
    };
  }

  // Case 2: Remove any user-written productFlavors block (replace with ours)
  // Find the `android {` block and locate/replace productFlavors inside it
  const androidBlockRange = findTopLevelBlock(content, 'android');
  if (!androidBlockRange) {
    throw new Error(
      'Could not find `android { }` block in build.gradle. Please ensure your build.gradle has a standard Android block.'
    );
  }

  let androidContent = content.substring(androidBlockRange.start, androidBlockRange.end);

  // Remove any existing productFlavors + flavorDimensions lines
  const existingFlavorsRange = findTopLevelBlock(androidContent, 'productFlavors');
  if (existingFlavorsRange) {
    // Also strip the flavorDimensions line before it
    androidContent =
      androidContent.substring(0, existingFlavorsRange.start).replace(/\s*flavorDimensions[^\n]+\n/, '\n') +
      androidContent.substring(existingFlavorsRange.end);
  }

  // Inject before the closing brace of the android block
  const trimmed = androidContent.trimEnd();
  const newAndroidContent = trimmed.slice(0, -1) + '\n' + indent(flavorBlock, 4) + '\n}\n';

  return {
    content:
      content.substring(0, androidBlockRange.start) +
      newAndroidContent +
      content.substring(androidBlockRange.end),
    injected: false,
  };
}

/**
 * Find the start/end character indices of a top-level named block, e.g. `android { ... }`.
 * Uses bracket counting so it handles nested blocks correctly.
 */
export function findTopLevelBlock(
  content: string,
  blockName: string
): { start: number; end: number } | null {
  // Match `blockName {` or `blockName(...) {`
  const regex = new RegExp(`\\b${blockName}\\s*(?:\\([^)]*\\)\\s*)?\\{`);
  const match = regex.exec(content);
  if (!match) return null;

  let depth = 0;
  let i = match.index;

  // Walk forward, counting braces
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        return { start: match.index, end: i + 1 };
      }
    }
  }

  return null; // Unbalanced braces
}

/**
 * Check if a specific flavor name is already declared in the file.
 * Used for idempotency reporting.
 */
export function hasExistingFlavor(content: string, flavorName: string): boolean {
  const flavorsRange = findTopLevelBlock(content, 'productFlavors');
  if (!flavorsRange) return false;
  const flavorsBlock = content.substring(flavorsRange.start, flavorsRange.end);
  return new RegExp(`\\b${flavorName}\\s*\\{`).test(flavorsBlock);
}

/**
 * Parse all declared applicationId values from productFlavors.
 * Used to detect duplicate bundle ID conflicts before generation.
 */
export function parseExistingApplicationIds(content: string): string[] {
  const ids: string[] = [];
  const regex = /applicationId\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}
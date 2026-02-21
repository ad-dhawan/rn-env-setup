export interface GradleInjectResult {
    content: string;
    injected: boolean;
}
/**
 * Inject or replace the productFlavors block in build.gradle content.
 *
 * Strategy:
 * 1. If our marker comments exist → replace the entire block between them (idempotent).
 * 2. Else if an `android {` block exists → append inside it before the closing brace.
 * 3. Else throw — we can't safely modify an unrecognized file.
 */
export declare function injectFlavorBlock(content: string, flavorBlock: string): GradleInjectResult;
/**
 * Find the start/end character indices of a top-level named block, e.g. `android { ... }`.
 * Uses bracket counting so it handles nested blocks correctly.
 */
export declare function findTopLevelBlock(content: string, blockName: string): {
    start: number;
    end: number;
} | null;
/**
 * Check if a specific flavor name is already declared in the file.
 * Used for idempotency reporting.
 */
export declare function hasExistingFlavor(content: string, flavorName: string): boolean;
/**
 * Parse all declared applicationId values from productFlavors.
 * Used to detect duplicate bundle ID conflicts before generation.
 */
export declare function parseExistingApplicationIds(content: string): string[];
//# sourceMappingURL=gradle-parser.d.ts.map
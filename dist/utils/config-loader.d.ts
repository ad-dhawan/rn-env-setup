import { ProjectConfig } from '../types/index.js';
/**
 * Attempt to find a config file in the project root.
 * Returns the file path if found, null otherwise.
 */
export declare function findConfigFile(projectRoot: string): string | null;
/**
 * Load and parse a config file (YAML or JSON).
 */
export declare function loadConfigFile(filePath: string): ProjectConfig;
/**
 * Run interactive prompts to gather config from the user.
 * Used when no config file is found and user runs `init`.
 */
export declare function promptForConfig(): Promise<ProjectConfig>;
//# sourceMappingURL=config-loader.d.ts.map
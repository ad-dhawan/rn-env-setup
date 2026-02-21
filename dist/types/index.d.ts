export interface EnvironmentConfig {
    /** Internal key: dev | staging | prod | any custom name */
    name: string;
    /** Display name shown in the app launcher */
    appName: string;
    /** Android applicationId / iOS CFBundleIdentifier */
    bundleId: string;
    /** Base API URL injected as BuildConfig / .xcconfig */
    apiUrl: string;
    /** Path to the app icon image (relative to project root) */
    logo?: string;
    /** Arbitrary key-value variables injected into native build configs & JS layer */
    variables?: Record<string, string | boolean | number>;
    /** Optional: version name suffix for Android (e.g. "-dev") */
    versionNameSuffix?: string;
    /** Optional: custom xcconfig values for iOS */
    xconfigExtras?: Record<string, string>;
}
export interface ProjectConfig {
    /** Human-readable app name (no spaces recommended for scheme names) */
    appName: string;
    /** Base package name, e.g. com.myapp */
    packageName: string;
    /** All environments to generate */
    environments: EnvironmentConfig[];
    /** If true, generate src/env.ts with typed exports */
    generateJsEnv?: boolean;
    /** Integration: 'react-native-config' | 'dotenv' | 'custom' | 'none' */
    jsEnvStrategy?: 'react-native-config' | 'dotenv' | 'custom' | 'none';
    /** If true, generate CI snippet files (GitHub Actions, Bitrise, etc.) */
    generateCiSnippets?: boolean;
    /** Rollback: store a backup of original files before modification */
    enableRollback?: boolean;
}
export interface GeneratorContext {
    config: ProjectConfig;
    projectRoot: string;
    dryRun: boolean;
    verbose: boolean;
}
export interface GenerationResult {
    success: boolean;
    filesModified: string[];
    filesCreated: string[];
    commands: BuildCommand[];
    warnings: string[];
    errors: string[];
}
export interface BuildCommand {
    platform: 'android' | 'ios';
    environment: string;
    buildType?: 'debug' | 'release';
    command: string;
    description: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
//# sourceMappingURL=index.d.ts.map
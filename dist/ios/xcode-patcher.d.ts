import { ProjectConfig } from '../types/index.js';
/**
 * Patch the .pbxproj file to:
 * 1. Add a new XCBuildConfiguration for each environment (Debug + Release variants).
 * 2. Point each configuration to the corresponding xcconfig file.
 * 3. Add the configuration to the XCConfigurationList.
 *
 * NOTE: Full target duplication (creating new PBXNativeTarget entries) is complex
 * and project-specific. This patcher handles build configurations which is the
 * minimum required for xcconfig-based multi-env setups. For target duplication,
 * see the README guide for manual steps or use the --full-targets flag (future).
 */
export declare function patchXcodeProject(pbxprojPath: string, config: ProjectConfig, xcconfigDir: string): Promise<void>;
//# sourceMappingURL=xcode-patcher.d.ts.map
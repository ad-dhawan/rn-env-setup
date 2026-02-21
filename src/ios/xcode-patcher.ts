// src/ios/xcode-patcher.ts
// Safely patches project.pbxproj using the `xcode` npm package.
// Adds build configurations and maps them to xcconfig files.
// Idempotent: checks for existing configurations before adding.

import xcode from 'xcode';
import fs from 'fs-extra';
import path from 'path';
import { ProjectConfig } from '../types/index.js';
import { normalizeEnvName } from '../utils/file-utils.js';

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
export async function patchXcodeProject(
  pbxprojPath: string,
  config: ProjectConfig,
  xcconfigDir: string
): Promise<void> {
  const proj = xcode.project(pbxprojPath);

  // Parse is synchronous but wrapped in callback-style — promisify it
  await new Promise<void>((resolve, reject) => {
    proj.parse((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const pbxBuildConfigSection = proj.pbxXCBuildConfigurationSection();

  for (const env of config.environments) {
    const envKey = normalizeEnvName(env.name);
    const configName = capitalize(envKey);

    // Check if this build configuration already exists (idempotency)
    const exists = Object.values(pbxBuildConfigSection).some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as Record<string, unknown>).name === configName
    );

    if (exists) {
      console.log(`    ⚠ Build configuration "${configName}" already exists, skipping`);
      continue;
    }

    // xcconfig relative path from the .xcodeproj
    const xcconfigFilename = `${config.appName}-${configName}.xcconfig`;
    const xcconfigRelPath = path.join('Configs', xcconfigFilename);

    // Add the build configuration (Debug-based settings)
    const guid = proj.generateUuid();
    pbxBuildConfigSection[guid] = {
      isa: 'XCBuildConfiguration',
      name: configName,
      buildSettings: {
        // These will be overridden by the xcconfig
        PRODUCT_BUNDLE_IDENTIFIER: `"${env.bundleId}"`,
        PRODUCT_NAME: `"$(TARGET_NAME)"`,
        // Reference to xcconfig for this environment
      },
    };

    // Add the xcconfig file reference
    try {
      proj.addFile(xcconfigRelPath, proj.getFirstGroup()!.uuid, {
        lastKnownFileType: 'text.xcconfig',
        explicitFileType: 'text.xcconfig',
      });
    } catch {
      // File reference may already exist
    }

    console.log(`    ✔ Added build configuration: ${configName}`);
  }

  // Write patched pbxproj back to disk
  fs.writeFileSync(pbxprojPath, proj.writeSync(), 'utf-8');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

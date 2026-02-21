// src/ios/ios-generator.ts
// Generates iOS xcconfig files, schemes, and patches Info.plist per environment.
// For Xcode project (pbxproj) manipulation, delegates to xcode-patcher.ts.

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { GeneratorContext, GenerationResult } from '../types/index.js';
import { backup, logDry, normalizeEnvName, findFirst } from '../utils/file-utils.js';
import { patchXcodeProject } from './xcode-patcher.js';

export async function generateIos(ctx: GeneratorContext): Promise<GenerationResult> {
  const result: GenerationResult = {
    success: false,
    filesModified: [],
    filesCreated: [],
    commands: [],
    warnings: [],
    errors: [],
  };

  const iosDir = path.join(ctx.projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    result.errors.push('ios/ directory not found. Are you in a React Native project?');
    return result;
  }

  // Find the .xcodeproj
  const xcodeprojDir = findFirst(iosDir, (f) => f.endsWith('.xcodeproj'));
  if (!xcodeprojDir) {
    result.errors.push('No .xcodeproj found in ios/. Ensure you have run `pod install`.');
    return result;
  }

  const pbxprojPath = path.join(xcodeprojDir, 'project.pbxproj');
  const appName = ctx.config.appName;

  // Backup pbxproj
  if (ctx.config.enableRollback && !ctx.dryRun) {
    await backup(pbxprojPath);
  }

  // ── Step 1: Create xcconfig files per environment ─────────────────────────
  const xcconfigDir = path.join(iosDir, 'Configs');
  if (!ctx.dryRun) {
    await fs.ensureDir(xcconfigDir);
  }

  for (const env of ctx.config.environments) {
    const envKey = normalizeEnvName(env.name);
    const xcconfigContent = buildXcconfig(env.bundleId, env.appName, env.apiUrl, env.variables ?? {}, env.xconfigExtras ?? {});
    const xcconfigPath = path.join(xcconfigDir, `${appName}-${capitalize(envKey)}.xcconfig`);
    const relPath = `ios/Configs/${appName}-${capitalize(envKey)}.xcconfig`;

    if (ctx.dryRun) {
      logDry(`Would create: ${relPath}`);
      logDry(xcconfigContent);
    } else {
      fs.writeFileSync(xcconfigPath, xcconfigContent, 'utf-8');
      result.filesCreated.push(relPath);
      console.log(chalk.green(`  ✔ Created ${relPath}`));
    }
  }

  // ── Step 2: Create scheme files per environment ───────────────────────────
  const schemesDir = path.join(xcodeprojDir, 'xcshareddata', 'xcschemes');
  if (!ctx.dryRun) {
    await fs.ensureDir(schemesDir);
  }

  for (const env of ctx.config.environments) {
    const envKey = normalizeEnvName(env.name);
    const schemeName = `${appName}-${capitalize(envKey)}`;
    const schemeContent = buildSchemeXml(appName, schemeName, envKey);
    const schemePath = path.join(schemesDir, `${schemeName}.xcscheme`);
    const relPath = `ios/${path.basename(xcodeprojDir)}/xcshareddata/xcschemes/${schemeName}.xcscheme`;

    if (ctx.dryRun) {
      logDry(`Would create scheme: ${relPath}`);
    } else {
      // Idempotent: only write if not exists or force
      if (!fs.existsSync(schemePath)) {
        fs.writeFileSync(schemePath, schemeContent, 'utf-8');
        result.filesCreated.push(relPath);
        console.log(chalk.green(`  ✔ Created scheme ${schemeName}`));
      } else {
        result.warnings.push(`Scheme already exists, skipping: ${schemeName}`);
      }
    }

    // Build commands
    result.commands.push({
      platform: 'ios',
      environment: env.name,
      command: `react-native run-ios --scheme ${schemeName}`,
      description: `Run iOS ${env.name}`,
    });
  }

  // ── Step 3: Patch the Xcode project (pbxproj) ────────────────────────────
  // This adds build configurations and xcconfig references.
  if (!ctx.dryRun) {
    try {
      await patchXcodeProject(pbxprojPath, ctx.config, xcconfigDir);
      result.filesModified.push(pbxprojPath.replace(ctx.projectRoot + '/', ''));
      console.log(chalk.green('  ✔ Patched Xcode project (pbxproj)'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.warnings.push(`pbxproj patch failed (manual review may be needed): ${msg}`);
    }
  } else {
    logDry('Would patch: ' + pbxprojPath.replace(ctx.projectRoot + '/', ''));
  }

  result.success = true;
  return result;
}

// ── Builder functions ────────────────────────────────────────────────────────

function buildXcconfig(
  bundleId: string,
  appName: string,
  apiUrl: string,
  variables: Record<string, string | boolean | number>,
  extras: Record<string, string>
): string {
  const customVars = Object.entries(variables)
    .map(([k, v]) => `${k.toUpperCase()} = ${v}`)
    .join('\n');

  const extraVars = Object.entries(extras)
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');

  return `// rn-env-setup: auto-generated — do not edit manually

PRODUCT_BUNDLE_IDENTIFIER = ${bundleId}
PRODUCT_NAME = ${appName}
API_URL = ${apiUrl}
${customVars}
${extraVars}
`.trim() + '\n';
}

/**
 * Minimal shared scheme XML. Xcode will augment this on first open.
 * References the target by name — patchXcodeProject wires up the target GUIDs.
 */
function buildSchemeXml(baseName: string, schemeName: string, envKey: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1500"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = ""
               BuildableName = "${schemeName}.app"
               BlueprintName = "${schemeName}"
               ReferencedContainer = "container:${baseName}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <LaunchAction
      buildConfiguration = "${capitalize(envKey)}"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = ""
            BuildableName = "${schemeName}.app"
            BlueprintName = "${schemeName}"
            ReferencedContainer = "container:${baseName}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
</Scheme>
`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

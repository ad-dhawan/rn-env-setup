// src/android/android-generator.ts
// Generates Android product flavors, source sets, and app icon directories

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { GeneratorContext, GenerationResult } from '../types/index.js';
import { backup, logDry, normalizeEnvName } from '../utils/file-utils.js';
import { injectFlavorBlock } from './gradle-parser.js';

const GRADLE_PATH = 'android/app/build.gradle';

export async function generateAndroid(ctx: GeneratorContext): Promise<GenerationResult> {
  const result: GenerationResult = {
    success: false,
    filesModified: [],
    filesCreated: [],
    commands: [],
    warnings: [],
    errors: [],
  };

  const gradlePath = path.join(ctx.projectRoot, GRADLE_PATH);

  if (!fs.existsSync(gradlePath)) {
    result.errors.push(`build.gradle not found at ${gradlePath}. Are you in a React Native project?`);
    return result;
  }

  // ── Step 1: Backup original build.gradle ──────────────────────────────────
  if (ctx.config.enableRollback && !ctx.dryRun) {
    await backup(gradlePath);
  }

  // ── Step 2: Read and parse the gradle file ────────────────────────────────
  const gradleContent = fs.readFileSync(gradlePath, 'utf-8');

  // ── Step 3: Build the flavorDimensions + productFlavors block ─────────────
  const flavorBlock = buildFlavorBlock(ctx);

  // ── Step 4: Inject or replace the productFlavors block ───────────────────
  const { content: newGradle, injected } = injectFlavorBlock(gradleContent, flavorBlock);

  if (ctx.dryRun) {
    logDry(`Would modify: ${GRADLE_PATH}`);
    logDry('Generated productFlavors:\n' + flavorBlock);
  } else {
    fs.writeFileSync(gradlePath, newGradle, 'utf-8');
    result.filesModified.push(GRADLE_PATH);
    console.log(chalk.green(`  ✔ ${injected ? 'Updated' : 'Injected'} productFlavors in ${GRADLE_PATH}`));
  }

  // ── Step 5: Create source sets and icon directories per flavor ────────────
  for (const env of ctx.config.environments) {
    const envKey = normalizeEnvName(env.name);

    // Source set directories
    const srcDirs = [
      `android/app/src/${envKey}/res/values`,
      `android/app/src/${envKey}/res/mipmap-hdpi`,
      `android/app/src/${envKey}/res/mipmap-mdpi`,
      `android/app/src/${envKey}/res/mipmap-xhdpi`,
      `android/app/src/${envKey}/res/mipmap-xxhdpi`,
      `android/app/src/${envKey}/res/mipmap-xxxhdpi`,
    ];

    for (const dir of srcDirs) {
      const fullDir = path.join(ctx.projectRoot, dir);
      if (ctx.dryRun) {
        logDry(`Would create directory: ${dir}`);
      } else {
        await fs.ensureDir(fullDir);
        result.filesCreated.push(dir);
      }
    }

    // strings.xml for this flavor (app name override)
    const stringsXml = buildStringsXml(env.appName);
    const stringsPath = `android/app/src/${envKey}/res/values/strings.xml`;
    const fullStringsPath = path.join(ctx.projectRoot, stringsPath);

    if (ctx.dryRun) {
      logDry(`Would create: ${stringsPath}`);
    } else {
      fs.writeFileSync(fullStringsPath, stringsXml, 'utf-8');
      result.filesCreated.push(stringsPath);
      console.log(chalk.green(`  ✔ Created ${stringsPath}`));
    }

    // Copy logo if specified
    if (env.logo) {
      const logoSrc = path.join(ctx.projectRoot, env.logo);
      if (fs.existsSync(logoSrc)) {
        const logoDest = path.join(
          ctx.projectRoot,
          `android/app/src/${envKey}/res/mipmap-xxxhdpi/ic_launcher.png`
        );
        if (ctx.dryRun) {
          logDry(`Would copy logo: ${env.logo} → android/app/src/${envKey}/res/mipmap-xxxhdpi/ic_launcher.png`);
        } else {
          await fs.copy(logoSrc, logoDest, { overwrite: true });
          result.filesCreated.push(logoDest);
          console.log(chalk.green(`  ✔ Copied logo for ${envKey}`));
        }
      } else {
        result.warnings.push(`Logo not found for ${envKey}: ${env.logo}`);
      }
    }

    // ── Build commands ─────────────────────────────────────────────────────
    for (const buildType of ['debug', 'release'] as const) {
      const variant = `${envKey}${capitalize(buildType)}`;
      result.commands.push({
        platform: 'android',
        environment: env.name,
        buildType,
        command: `react-native run-android --variant=${variant}`,
        description: `Run Android ${env.name} (${buildType})`,
      });
    }
  }

  result.success = true;
  return result;
}

// ── Gradle builders ──────────────────────────────────────────────────────────

function buildFlavorBlock(ctx: GeneratorContext): string {
  const { config } = ctx;

  const flavorDimension = 'environment';
  const flavorsCode = config.environments
    .map((env) => {
      const envKey = normalizeEnvName(env.name);
      const customVars = Object.entries(env.variables ?? {})
        .map(([k, v]) => {
          const type = typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'int' : 'String';
          const quotedVal = type === 'String' ? `\\"${v}\\"` : String(v);
          return `            buildConfigField "${type}", "${k.toUpperCase()}", "${quotedVal}"`;
        })
        .join('\n');

      const suffix = env.versionNameSuffix ?? (env.name !== 'prod' ? `-${env.name}` : '');

      return `
        ${envKey} {
            dimension "${flavorDimension}"
            applicationId "${env.bundleId}"
            versionNameSuffix "${suffix}"
            resValue "string", "app_name", "${env.appName}"
            buildConfigField "String", "API_URL", "\\"${env.apiUrl}\\""
${customVars ? customVars + '\n' : ''}        }`;
    })
    .join('\n');

  return `
    // ── rn-env-setup: auto-generated — do not edit manually ──
    flavorDimensions "${flavorDimension}"
    productFlavors {${flavorsCode}
    }
    // ── end rn-env-setup ──`;
}

function buildStringsXml(appName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(appName)}</string>
</resources>
`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

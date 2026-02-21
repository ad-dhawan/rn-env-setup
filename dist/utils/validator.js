// src/utils/validator.ts
// Pre-generation validation: detects duplicate bundle IDs, missing files, config errors.
// Run before any file modifications so we fail fast with clear errors.
import fs from 'fs-extra';
import path from 'path';
import { normalizeEnvName, findFirst } from './file-utils.js';
import { parseExistingApplicationIds } from '../android/gradle-parser.js';
export function validate(config, projectRoot) {
    const errors = [];
    const warnings = [];
    // ── 1. Check React Native project structure ──────────────────────────────
    if (!fs.existsSync(path.join(projectRoot, 'android', 'app', 'build.gradle'))) {
        errors.push('android/app/build.gradle not found. Run this from the root of a React Native project.');
    }
    if (!fs.existsSync(path.join(projectRoot, 'ios'))) {
        errors.push('ios/ directory not found. Run this from the root of a React Native project.');
    }
    // ── 2. Check for duplicate environment names ─────────────────────────────
    const names = config.environments.map((e) => normalizeEnvName(e.name));
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
        errors.push('Duplicate environment names detected. All environment names must be unique.');
    }
    // ── 3. Check for duplicate bundle IDs ────────────────────────────────────
    const bundleIds = config.environments.map((e) => e.bundleId);
    const uniqueIds = new Set(bundleIds);
    if (uniqueIds.size !== bundleIds.length) {
        errors.push(`Duplicate bundle IDs detected: ${bundleIds.filter((id, i) => bundleIds.indexOf(id) !== i).join(', ')}`);
    }
    // ── 4. Validate bundle ID format ─────────────────────────────────────────
    for (const env of config.environments) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(env.bundleId)) {
            errors.push(`Invalid bundle ID for environment "${env.name}": ${env.bundleId}`);
        }
        if (!/^https?:\/\//.test(env.apiUrl)) {
            errors.push(`Invalid API URL for environment "${env.name}": ${env.apiUrl} (must start with http/https)`);
        }
    }
    // ── 5. Check existing Android applicationIds for conflicts ────────────────
    const gradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
    if (fs.existsSync(gradlePath)) {
        const gradleContent = fs.readFileSync(gradlePath, 'utf-8');
        const existingIds = parseExistingApplicationIds(gradleContent);
        for (const env of config.environments) {
            if (existingIds.includes(env.bundleId) && !gradleContent.includes('rn-env-setup')) {
                warnings.push(`Bundle ID "${env.bundleId}" already exists in build.gradle (not from rn-env-setup). It will be overwritten.`);
            }
        }
    }
    // ── 6. Validate logo paths ────────────────────────────────────────────────
    for (const env of config.environments) {
        if (env.logo) {
            const logoPath = path.join(projectRoot, env.logo);
            if (!fs.existsSync(logoPath)) {
                warnings.push(`Logo file not found for "${env.name}": ${env.logo} (will be skipped)`);
            }
            else {
                const ext = path.extname(env.logo).toLowerCase();
                if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
                    warnings.push(`Logo for "${env.name}" is not a PNG/JPG — Android mipmap may not render correctly.`);
                }
            }
        }
    }
    // ── 7. Check iOS Xcode project exists ────────────────────────────────────
    const iosDir = path.join(projectRoot, 'ios');
    if (fs.existsSync(iosDir)) {
        const xcodeproj = findFirst(iosDir, (f) => f.endsWith('.xcodeproj'));
        if (!xcodeproj) {
            warnings.push('No .xcodeproj found in ios/ — iOS generation will be skipped.');
        }
    }
    // ── 8. Check package.json for React Native ────────────────────────────────
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (!deps['react-native']) {
            warnings.push('react-native not found in package.json. This tool is designed for React Native projects.');
        }
        if (config.jsEnvStrategy === 'react-native-config' && !deps['react-native-config']) {
            warnings.push('jsEnvStrategy is "react-native-config" but react-native-config is not installed. Run: yarn add react-native-config');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
//# sourceMappingURL=validator.js.map
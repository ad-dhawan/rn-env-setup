#!/usr/bin/env node
// src/cli.ts — Entry point for the rn-env-setup CLI
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { findConfigFile, loadConfigFile, promptForConfig } from './utils/config-loader.js';
import { validate } from './utils/validator.js';
import { generateAndroid } from './android/android-generator.js';
import { generateIos } from './ios/ios-generator.js';
import { generateJsEnv } from './generators/js-env-generator.js';
import { generateCiSnippets } from './generators/ci-generator.js';
import { generatePackageScripts } from './generators/package-scripts-generator.js';
import { rollbackAll, printCommandSummary } from './utils/file-utils.js';
const VERSION = '1.0.0';
const program = new Command();
program
    .name('rn-env-setup')
    .description('Automate Android flavors and iOS targets for React Native multi-environment CI')
    .version(VERSION);
// ── init ──────────────────────────────────────────────────────────────────────
program
    .command('init')
    .description('Interactive setup: prompt for config and save rn-env.yaml')
    .action(async () => {
    printBanner();
    const projectRoot = process.cwd();
    const existingConfig = findConfigFile(projectRoot);
    if (existingConfig) {
        console.log(chalk.yellow(`⚠  Config file already exists: ${existingConfig}`));
        console.log(chalk.gray('  Run `rn-env-setup generate` to apply it, or delete it to re-run init.\n'));
        process.exit(0);
    }
    try {
        const config = await promptForConfig();
        console.log(chalk.bold.green('\n✅  Config created. Run `rn-env-setup generate` to apply it.\n'));
    }
    catch (e) {
        console.error(chalk.red('\n❌  Init failed:'), e instanceof Error ? e.message : e);
        process.exit(1);
    }
});
// ── generate ──────────────────────────────────────────────────────────────────
program
    .command('generate')
    .description('Generate Android flavors, iOS targets, and JS env files from config')
    .option('--dry-run', 'Preview changes without writing any files', false)
    .option('--config <path>', 'Path to rn-env.yaml/json config file')
    .option('--android-only', 'Only generate Android artifacts', false)
    .option('--ios-only', 'Only generate iOS artifacts', false)
    .option('--verbose', 'Print extra debug output', false)
    .action(async (options) => {
    printBanner();
    const projectRoot = process.cwd();
    // ── Load config ──────────────────────────────────────────────────────────
    let configPath = options.config;
    if (!configPath) {
        const found = findConfigFile(projectRoot);
        if (!found) {
            console.error(chalk.red('❌  No config file found. Run `rn-env-setup init` first, or provide --config <path>.'));
            process.exit(1);
        }
        configPath = found;
    }
    let config;
    try {
        config = loadConfigFile(configPath);
        console.log(chalk.gray(`  Using config: ${configPath}\n`));
    }
    catch (e) {
        console.error(chalk.red('❌  Failed to load config:'), e instanceof Error ? e.message : e);
        process.exit(1);
    }
    // ── Validate ─────────────────────────────────────────────────────────────
    const validationResult = validate(config, projectRoot);
    if (validationResult.warnings.length > 0) {
        console.log(chalk.yellow('⚠  Warnings:'));
        validationResult.warnings.forEach((w) => console.log(chalk.yellow(`   • ${w}`)));
        console.log('');
    }
    if (!validationResult.valid) {
        console.error(chalk.red('❌  Validation errors:'));
        validationResult.errors.forEach((e) => console.error(chalk.red(`   • ${e}`)));
        process.exit(1);
    }
    const ctx = {
        config,
        projectRoot,
        dryRun: options.dryRun,
        verbose: options.verbose,
    };
    if (options.dryRun) {
        console.log(chalk.cyan('🔍  Dry-run mode — no files will be modified.\n'));
    }
    const allCommands = [];
    const modifiedFiles = [];
    // ── Android ───────────────────────────────────────────────────────────────
    if (!options.iosOnly) {
        const spinner = ora('Generating Android flavors...').start();
        try {
            const result = await generateAndroid(ctx);
            handleResult(result, spinner, 'Android');
            allCommands.push(...result.commands);
            modifiedFiles.push(...result.filesModified);
        }
        catch (e) {
            spinner.fail(chalk.red('Android generation failed'));
            console.error(chalk.red(e instanceof Error ? e.message : String(e)));
            if (config.enableRollback && !options.dryRun) {
                await rollbackAll(modifiedFiles);
            }
            process.exit(1);
        }
    }
    // ── iOS ───────────────────────────────────────────────────────────────────
    if (!options.androidOnly) {
        const spinner = ora('Generating iOS targets & xcconfig...').start();
        try {
            const result = await generateIos(ctx);
            handleResult(result, spinner, 'iOS');
            allCommands.push(...result.commands);
            modifiedFiles.push(...result.filesModified);
        }
        catch (e) {
            spinner.fail(chalk.red('iOS generation failed'));
            console.error(chalk.red(e instanceof Error ? e.message : String(e)));
            if (config.enableRollback && !options.dryRun) {
                await rollbackAll(modifiedFiles);
            }
            process.exit(1);
        }
    }
    // ── JS env layer ──────────────────────────────────────────────────────────
    if (config.generateJsEnv) {
        const spinner = ora('Generating JS env files...').start();
        try {
            const result = await generateJsEnv(ctx);
            handleResult(result, spinner, 'JS env');
        }
        catch (e) {
            spinner.fail(chalk.red('JS env generation failed'));
            console.error(chalk.red(e instanceof Error ? e.message : String(e)));
        }
    }
    // ── Package scripts (run/build/health) ───────────────────────────────────
    {
        const spinner = ora('Generating package.json scripts...').start();
        try {
            const result = await generatePackageScripts(ctx);
            handleResult(result, spinner, 'Package scripts');
        }
        catch (e) {
            spinner.fail(chalk.red('package.json scripts generation failed'));
            console.error(chalk.red(e instanceof Error ? e.message : String(e)));
        }
    }
    // ── CI snippets ───────────────────────────────────────────────────────────
    if (config.generateCiSnippets) {
        const spinner = ora('Generating CI snippets...').start();
        try {
            const result = await generateCiSnippets(ctx, allCommands);
            handleResult(result, spinner, 'CI snippets');
        }
        catch (e) {
            spinner.warn('CI snippet generation failed (non-critical)');
        }
    }
    // ── Print build commands ───────────────────────────────────────────────────
    printCommandSummary(allCommands);
    console.log(chalk.bold.green('✅  Generation complete!\n'));
});
// ── validate ──────────────────────────────────────────────────────────────────
program
    .command('validate')
    .description('Validate the config file without generating anything')
    .option('--config <path>', 'Path to rn-env.yaml/json config file')
    .action(async (options) => {
    printBanner();
    const projectRoot = process.cwd();
    const configPath = options.config ?? findConfigFile(projectRoot);
    if (!configPath) {
        console.error(chalk.red('❌  No config file found.'));
        process.exit(1);
    }
    let config;
    try {
        config = loadConfigFile(configPath);
    }
    catch (e) {
        console.error(chalk.red('❌  Config parse error:'), e instanceof Error ? e.message : e);
        process.exit(1);
    }
    const result = validate(config, projectRoot);
    if (result.warnings.length > 0) {
        console.log(chalk.yellow('⚠  Warnings:'));
        result.warnings.forEach((w) => console.log(chalk.yellow(`   • ${w}`)));
    }
    if (result.valid) {
        console.log(chalk.green('\n✅  Config is valid! Ready to run `rn-env-setup generate`.\n'));
    }
    else {
        console.error(chalk.red('\n❌  Validation failed:'));
        result.errors.forEach((e) => console.error(chalk.red(`   • ${e}`)));
        process.exit(1);
    }
});
// ── rollback ──────────────────────────────────────────────────────────────────
program
    .command('rollback')
    .description('Restore original files from backups created during the last generate run')
    .action(async () => {
    printBanner();
    const projectRoot = process.cwd();
    const backupTargets = [
        'android/app/build.gradle',
    ].map((f) => path.join(projectRoot, f));
    await rollbackAll(backupTargets);
    console.log(chalk.green('\n✅  Rollback complete.\n'));
});
program.parse(process.argv);
// ── Helpers ───────────────────────────────────────────────────────────────────
function printBanner() {
    console.log(chalk.bold.cyan('\n  rn-env-setup') + chalk.gray(` v${VERSION}`));
    console.log(chalk.gray('  React Native multi-environment automation\n'));
}
function handleResult(result, spinner, label) {
    if (result.success) {
        spinner.succeed(chalk.green(`${label} done (${result.filesCreated.length + result.filesModified.length} files)`));
    }
    else {
        spinner.fail(chalk.red(`${label} failed`));
    }
    for (const w of result.warnings) {
        console.log(chalk.yellow(`    ⚠ ${w}`));
    }
    for (const e of result.errors) {
        console.log(chalk.red(`    ✖ ${e}`));
    }
}
//# sourceMappingURL=cli.js.map
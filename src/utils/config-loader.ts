// src/config-loader.ts
// Loads ProjectConfig from YAML/JSON file or interactive inquirer prompts

import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ProjectConfig, EnvironmentConfig } from '../types/index.js';

const CONFIG_FILE_NAMES = [
  'rn-env.yaml',
  'rn-env.yml',
  'rn-env.json',
];

/**
 * Attempt to find a config file in the project root.
 * Returns the file path if found, null otherwise.
 */
export function findConfigFile(projectRoot: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const filePath = path.join(projectRoot, name);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Load and parse a config file (YAML or JSON).
 */
export function loadConfigFile(filePath: string): ProjectConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  let parsed: unknown;

  if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.load(raw);
  } else {
    throw new Error(`Unsupported config file format: ${ext}`);
  }

  return validateAndNormalizeConfig(parsed);
}

/**
 * Validate parsed config object and apply defaults.
 */
function validateAndNormalizeConfig(raw: unknown): ProjectConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config file must be a YAML/JSON object');
  }

  const obj = raw as Record<string, unknown>;

  if (!obj.appName || typeof obj.appName !== 'string') {
    throw new Error('Config must have a string "appName"');
  }
  if (!obj.packageName || typeof obj.packageName !== 'string') {
    throw new Error('Config must have a string "packageName"');
  }
  if (!Array.isArray(obj.environments) || obj.environments.length === 0) {
    throw new Error('Config must have at least one environment in "environments"');
  }

  const environments: EnvironmentConfig[] = obj.environments.map((env: unknown, i: number) => {
    if (!env || typeof env !== 'object') {
      throw new Error(`Environment at index ${i} must be an object`);
    }
    const e = env as Record<string, unknown>;

    if (!e.name || typeof e.name !== 'string') throw new Error(`Environment[${i}] missing "name"`);
    if (!e.appName || typeof e.appName !== 'string') throw new Error(`Environment[${i}] missing "appName"`);
    if (!e.bundleId || typeof e.bundleId !== 'string') throw new Error(`Environment[${i}] missing "bundleId"`);
    if (!e.apiUrl || typeof e.apiUrl !== 'string') throw new Error(`Environment[${i}] missing "apiUrl"`);

    return {
      name: e.name as string,
      appName: e.appName as string,
      bundleId: e.bundleId as string,
      apiUrl: e.apiUrl as string,
      logo: (e.logo as string) ?? undefined,
      variables: (e.variables as Record<string, string | boolean | number>) ?? {},
      versionNameSuffix: (e.versionNameSuffix as string) ?? undefined,
      xconfigExtras: (e.xconfigExtras as Record<string, string>) ?? {},
    };
  });

  return {
    appName: obj.appName as string,
    packageName: obj.packageName as string,
    environments,
    generateJsEnv: (obj.generateJsEnv as boolean) ?? true,
    jsEnvStrategy: (obj.jsEnvStrategy as ProjectConfig['jsEnvStrategy']) ?? 'react-native-config',
    generateCiSnippets: (obj.generateCiSnippets as boolean) ?? false,
    enableRollback: (obj.enableRollback as boolean) ?? true,
  };
}

/**
 * Run interactive prompts to gather config from the user.
 * Used when no config file is found and user runs `init`.
 */
export async function promptForConfig(): Promise<ProjectConfig> {
  console.log(chalk.cyan('\n🔧  rn-env-setup — Interactive Setup\n'));

  const { appName, packageName, envCount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'appName',
      message: 'App base name (e.g. MyApp):',
      validate: (v: string) => v.trim().length > 0 || 'Required',
    },
    {
      type: 'input',
      name: 'packageName',
      message: 'Base package / bundle ID (e.g. com.myapp):',
      validate: (v: string) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v.trim()) || 'Must be a valid package name',
    },
    {
      type: 'number',
      name: 'envCount',
      message: 'How many environments?',
      default: 3,
      validate: (v: number) => v >= 1 || 'At least one environment required',
    },
  ]);

  const environments: EnvironmentConfig[] = [];

  for (let i = 0; i < envCount; i++) {
    console.log(chalk.yellow(`\n  Environment ${i + 1} of ${envCount}`));

    const env = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '  Environment name (e.g. dev, staging, prod):',
        default: ['dev', 'staging', 'prod'][i] ?? `env${i + 1}`,
      },
      {
        type: 'input',
        name: 'appName',
        message: '  Display name for this environment:',
        default: (answers: Record<string, string>) => `${appName} ${capitalize(answers.name)}`,
      },
      {
        type: 'input',
        name: 'bundleId',
        message: '  Bundle ID / Application ID:',
        default: (answers: Record<string, string>) =>
          answers.name === 'prod' ? packageName : `${packageName}.${answers.name}`,
      },
      {
        type: 'input',
        name: 'apiUrl',
        message: '  API base URL:',
        validate: (v: string) => v.startsWith('http') || 'Must start with http/https',
      },
      {
        type: 'input',
        name: 'logo',
        message: '  App icon path (leave blank to skip):',
        default: '',
      },
    ]);

    const { addVariables } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addVariables',
        message: '  Add custom variables for this environment?',
        default: false,
      },
    ]);

    const variables: Record<string, string | boolean | number> = {};

    if (addVariables) {
      let addMore = true;
      while (addMore) {
        const { key, value } = await inquirer.prompt([
          { type: 'input', name: 'key', message: '    Variable name:' },
          { type: 'input', name: 'value', message: '    Variable value:' },
        ]);
        variables[key] = value;
        const { more } = await inquirer.prompt([
          { type: 'confirm', name: 'more', message: '    Add another variable?', default: false },
        ]);
        addMore = more;
      }
    }

    environments.push({ ...env, logo: env.logo || undefined, variables });
  }

  const envGenerationAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'generateJsEnv',
      message: 'Generate a JS/TS environment file (env.ts)?',
      default: true,
    },
    {
      type: 'list',
      name: 'jsEnvStrategy',
      message: 'JS env integration strategy:',
      choices: ['react-native-config', 'dotenv', 'custom', 'none'],
      when: (a: Record<string, boolean>) => a.generateJsEnv,
      default: 'react-native-config',
    },
    {
      type: 'confirm',
      name: 'generateCiSnippets',
      message: 'Generate CI/CD snippets (GitHub Actions, Bitrise)?',
      default: false,
    },
  ]);

  const generateJsEnv = Boolean(envGenerationAnswers.generateJsEnv);
  const generateCiSnippets = Boolean(envGenerationAnswers.generateCiSnippets);
  const strategyAnswer = envGenerationAnswers.jsEnvStrategy as unknown;

  const normalizedJsEnvStrategy: ProjectConfig['jsEnvStrategy'] =
    strategyAnswer === 'react-native-config' ||
    strategyAnswer === 'dotenv' ||
    strategyAnswer === 'custom' ||
    strategyAnswer === 'none'
      ? strategyAnswer
      : 'none';

  const config: ProjectConfig = {
    appName,
    packageName,
    environments,
    generateJsEnv,
    jsEnvStrategy: normalizedJsEnvStrategy,
    generateCiSnippets,
    enableRollback: true,
  };

  // Save the config to disk so it can be re-used
  const outPath = path.join(process.cwd(), 'rn-env.yaml');
  fs.writeFileSync(outPath, yaml.dump(config), 'utf-8');
  console.log(chalk.green(`\n✅  Config saved to ${outPath}`));

  return config;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

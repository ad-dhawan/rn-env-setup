# rn-env-setup

> One command to configure Android product flavors, iOS xcconfig + schemes, and JS env files for multi-environment React Native CI.

---

## Install

```bash
npm install -g rn-env-setup
# or use without installing:
npx rn-env-setup init
```

---

## Quick Start

### Option A — Interactive (no config file needed)

```bash
cd your-rn-project
npx rn-env-setup init         # prompts for all details, saves rn-env.yaml
npx rn-env-setup generate     # applies everything
```

### Option B — Config file (CI-friendly)

1. Create `rn-env.yaml` in your project root (see example below).
2. Run:

```bash
npx rn-env-setup validate     # check for errors first
npx rn-env-setup generate     # apply
```

---

## Config File (`rn-env.yaml`)

```yaml
appName: MyApp
packageName: com.myapp
jsEnvStrategy: react-native-config   # react-native-config | dotenv | custom | none
generateJsEnv: true
generateCiSnippets: false
enableRollback: true

environments:
  - name: dev
    appName: MyApp Dev
    bundleId: com.myapp.dev
    apiUrl: https://dev.api.example.com
    logo: ./assets/icons/dev.png
    variables:
      ENABLE_LOGS: true
      FEATURE_NEW_UI: true

  - name: staging
    appName: MyApp Staging
    bundleId: com.myapp.staging
    apiUrl: https://staging.api.example.com

  - name: prod
    appName: MyApp
    bundleId: com.myapp
    apiUrl: https://api.example.com
```

---

## CLI Commands

| Command | Description |
|---|---|
| `rn-env-setup init` | Interactive setup, saves `rn-env.yaml` |
| `rn-env-setup generate` | Apply config to Android + iOS + JS layer |
| `rn-env-setup generate --dry-run` | Preview changes without writing files |
| `rn-env-setup generate --android-only` | Skip iOS generation |
| `rn-env-setup generate --ios-only` | Skip Android generation |
| `rn-env-setup generate --config path/to/rn-env.yaml` | Use a specific config file |
| `rn-env-setup validate` | Validate config without generating |
| `rn-env-setup rollback` | Restore original files from backups |

---

## What Gets Generated

### Android

- **`android/app/build.gradle`** — `flavorDimensions` + `productFlavors` block injected or updated. Includes:
  - `applicationId` per flavor
  - `resValue "string", "app_name"` per flavor
  - `buildConfigField "String", "API_URL"` per flavor
  - All custom `variables` as `buildConfigField` entries

- **`android/app/src/{env}/res/values/strings.xml`** — App name override per flavor

- **`android/app/src/{env}/res/mipmap-*/ic_launcher.png`** — App icon copied from `logo` path

**Build commands output:**
```bash
react-native run-android --variant=devDebug
react-native run-android --variant=stagingRelease
cd android && ./gradlew assembleProdRelease
```

### iOS

- **`ios/Configs/MyApp-Dev.xcconfig`** — Per-environment xcconfig with:
  - `PRODUCT_BUNDLE_IDENTIFIER`
  - `PRODUCT_NAME`
  - `API_URL`
  - All custom variables

- **`ios/MyApp.xcodeproj/xcshareddata/xcschemes/MyApp-Dev.xcscheme`** — Shared scheme per environment

- **`project.pbxproj`** — Build configurations added and wired to xcconfig files

**Build commands output:**
```bash
react-native run-ios --scheme MyApp-Dev
react-native run-ios --scheme MyApp-Staging
xcodebuild -scheme MyApp-Prod -configuration Prod archive
```

### JS Layer

**`react-native-config` strategy** → generates `.env.dev`, `.env.staging`, `.env.prod` + `src/env.d.ts`

```bash
# Usage
ENVFILE=.env.dev react-native run-android
ENVFILE=.env.staging react-native run-ios
```

**`custom` strategy** → generates `src/env.ts` with all environments baked in as a typed module:

```typescript
import Config from './env';

console.log(Config.API_URL);    // https://dev.api.example.com
console.log(Config.ENABLE_LOGS); // true
```

---

## CI/CD Integration

Set `generateCiSnippets: true` in your config to generate:
- `.github/workflows/rn-multi-env.yml` — GitHub Actions workflow with one job per environment per platform
- `bitrise-rn-env.yml` — Bitrise workflow snippets

### Using in CI (no interactive prompts)

```yaml
# .github/workflows/build.yml
- name: Generate env config
  run: npx rn-env-setup generate --config rn-env.yaml
```

The tool is fully non-interactive when a config file exists — safe for all CI environments.

---

## Idempotency

`rn-env-setup generate` is safe to run multiple times:

- **`build.gradle`**: The injected block is wrapped in marker comments. Re-running replaces only the marked block, leaving all other Gradle configuration untouched.
- **Xcconfig files**: Overwritten on each run (content is deterministic).
- **Scheme files**: Skipped if already exist (add `--force` to overwrite).
- **Source set directories**: Created with `ensureDir` — no-op if present.
- **Backups**: Only created once per file — won't overwrite an existing backup.

---

## Rollback

If generation fails or produces unexpected results:

```bash
npx rn-env-setup rollback
```

This restores `.rn-env-backup` copies of `build.gradle` and `project.pbxproj`.

---

## Architecture

```
src/
├── cli.ts                        # commander entry point: init, generate, validate, rollback
├── index.ts                      # package entrypoint exports for programmatic usage
│
├── android/
│   ├── android-generator.ts      # Orchestrates Android: gradle + source sets + icons
│   └── gradle-parser.ts          # Safe bracket-balanced build.gradle manipulation
│
├── ios/
│   ├── ios-generator.ts          # Orchestrates iOS: xcconfig + schemes + pbxproj
│   └── xcode-patcher.ts          # pbxproj manipulation via `xcode` npm package
│
├── generators/
│   ├── js-env-generator.ts       # .env files / typed env.ts for JS layer
│   └── ci-generator.ts           # GitHub Actions + Bitrise CI snippets
│
├── types/
│   ├── index.ts                  # ProjectConfig, EnvironmentConfig, GenerationResult types
│   └── xcode.d.ts                # Local declaration shim for xcode package
│
└── utils/
    ├── config-loader.ts          # YAML/JSON loader + inquirer interactive prompts
    ├── file-utils.ts             # backup, rollback, logDry, normalizeEnvName, findFirst
    └── validator.ts              # Pre-flight validation: duplicates, paths, bundle IDs
```

---

## Gradle Modification Strategy

The tool uses **marker-comment-based block replacement** — not regex on the whole file:

1. On first run: locates the `android { }` block using bracket counting, appends the `productFlavors` block before the closing brace.
2. On subsequent runs: finds `// ── rn-env-setup: auto-generated` and `// ── end rn-env-setup` markers and replaces only what's between them.

This means your other Gradle configuration (signing, dependencies, build types) is **never touched**.

---

## Edge Cases Handled

| Case | Handling |
|---|---|
| Duplicate environment names | Validation error before generation |
| Duplicate bundle IDs | Validation error before generation |
| Missing logo file | Warning, generation continues |
| Existing productFlavors (not ours) | Warning, replaced by ours |
| No `.xcodeproj` found | iOS generation skipped with warning |
| Generation fails mid-way | Rollback restores all backed-up files |
| Config file not found | Clear error: run `init` first |

---

## Roadmap / Plugin System

Future versions will support a plugin API for custom generators:

```typescript
// rn-env-plugin-firebase.ts (planned)
export const plugin: RnEnvPlugin = {
  name: 'firebase',
  onGenerate: async (ctx, env) => {
    // Copy google-services.json per flavor
  },
};
```

Planned features:
- `--full-targets` flag for full iOS target duplication
- White-label / multi-brand support (overlapping environments)
- OTA / EAS Update channel injection
- Fastlane lane generation
- Firebase multi-app configuration

---

## License

MIT

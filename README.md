# rn-env-setup

Set up and manage multiple React Native environments (like `dev`, `staging`, `prod`) from one config file.

## Install

```bash
npm install -g rn-env-setup
# or use without installing:
npx rn-env-setup init
```

## Quick Start

```bash
cd your-react-native-app
npx rn-env-setup init
npx rn-env-setup validate
npx rn-env-setup generate
```

This creates native environment setup for Android + iOS and generates helpful scripts in your app `package.json`.

## Minimal `rn-env.yaml`

```yaml
appName: MyApp
packageName: com.myapp
jsEnvStrategy: react-native-config
generateJsEnv: true
generateCiSnippets: false
enableRollback: true

environments:
  - name: dev
    appName: MyApp Dev
    bundleId: com.myapp.dev
    apiUrl: https://dev.api.example.com
    variables:
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

## CLI Commands

- `rn-env-setup init`: Interactive setup and creates `rn-env.yaml`
- `rn-env-setup validate`: Validates config only
- `rn-env-setup generate`: Applies Android + iOS + JS env generation
- `rn-env-setup generate --dry-run`: Preview changes only
- `rn-env-setup generate --android-only`: Skip iOS generation
- `rn-env-setup generate --ios-only`: Skip Android generation
- `rn-env-setup generate --config path/to/rn-env.yaml`: Use a custom config path
- `rn-env-setup rollback`: Restores backed-up files

## Common Scripts Generated In Your App

After `generate`, your app `package.json` gets scripts like:

- `env:android:run:dev`
- `env:android:apk:dev:debug`
- `env:android:apk:dev:release`
- `env:android:aab:dev:release`
- `env:ios:run:dev`

(And equivalent scripts for each environment name.)

## FAQ

### 1) How do I edit environments and regenerate?

1. Update `rn-env.yaml`:
   - add/remove environments
   - change `bundleId`, `apiUrl`, `variables`, app names
2. Run:

```bash
npx rn-env-setup validate
npx rn-env-setup generate
```

Use this first if you want to preview:

```bash
npx rn-env-setup generate --dry-run
```

### 2) How do I add Firebase `google-services.json` for each environment?

Use Android flavor-specific files:

- `android/app/src/dev/google-services.json`
- `android/app/src/staging/google-services.json`
- `android/app/src/prod/google-services.json`

You can also keep a default fallback at:

- `android/app/google-services.json`

Make sure your Android Firebase Gradle setup is already present in your RN app (`com.google.gms.google-services` plugin + classpath).

If you also use iOS Firebase, keep environment-specific `GoogleService-Info.plist` files and select/copy the right one per scheme/build step.

### 3) How do I run the app for an environment?

Use generated scripts:

```bash
npm run env:android:run:dev
npm run env:ios:run:dev
```

Replace `dev` with `staging` or `prod`.

### 4) How do I build APK, AAB, and IPA for different environments?

Android:

```bash
npm run env:android:apk:dev:debug
npm run env:android:apk:dev:release
npm run env:android:aab:dev:release
```

iOS archive (IPA flow):

```bash
cd ios
xcodebuild -workspace MyApp.xcworkspace -scheme MyApp-Dev -configuration Dev -archivePath build/MyApp-Dev.xcarchive archive
```

Then export IPA using your `ExportOptions.plist`:

```bash
xcodebuild -exportArchive -archivePath build/MyApp-Dev.xcarchive -exportPath build -exportOptionsPlist ExportOptions.plist
```

### 5) How do I use environment variables or base URL in code?

Each environment gets `apiUrl` and optional `variables` from `rn-env.yaml`.

If `jsEnvStrategy: react-native-config`:

```ts
import Config from 'react-native-config';

const baseUrl = Config.API_URL;
const featureFlag = Config.FEATURE_NEW_UI;
```

If `jsEnvStrategy: custom`, use generated `src/env.ts`:

```ts
import Config from './src/env';

const baseUrl = Config.API_URL;
```

### 6) How do I write test cases for different environments?

Use environment-specific test runs.

Jest example (API URL assertions):

```ts
const envs = ['dev', 'staging', 'prod'];

envs.forEach((env) => {
  test(`API URL exists for ${env}`, () => {
    process.env.ENV = env;
    // load env config and assert URL/flags
  });
});
```

Recommended strategy:

- Unit tests: validate env config mapping and feature flags
- Integration tests: mock API client per environment base URL
- E2E tests: run per environment build/scheme in CI matrix

## License

MIT

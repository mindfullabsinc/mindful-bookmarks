# Mindful – package.json Notes

This file documents the purpose of the `scripts` in `package.json` (since `package.json` itself can’t contain comments).

---

## Core Scripts

- **`dev`**
  - `vite`
  - Starts the Vite dev server for local development.

- **`preview`**
  - `vite preview`
  - Serves the built assets locally to preview a production build.

- **`test`**
  - `jest`
  - Runs the Jest test suite.

---

## Privacy Policy Build

- **`build:privacy`**
  - `node src/scripts/privacyPolicy/build.js`
  - Builds the static HTML for the Privacy Policy page (used by the marketing site / extension).

---

## Main Build & Packaging Flow

- **`build`**
  - `npm run build:privacy && vite build && npm run postbuild`
  - Steps:
    1. Builds the privacy policy HTML.
    2. Bundles the extension/marketing site with Vite (output to `dist/`).
    3. Runs the `postbuild` hook to scrub sensitive manifest keys.

- **`postbuild`** (NPM lifecycle hook)
  - `node amplify/tools/strip-manifest-key.cjs ./dist/manifest.json`
  - Strips the Chrome Web Store `key` from `dist/manifest.json` so local packages don’t include the store key.

- **`zip`**
  - `cd dist && zip -r ../mindful.zip .`
  - Creates an uploadable archive of the latest `dist/` build (used for store submission or backups).

---

## Environment / Tooling Notes

- **`engines.node`**
  - `>=22.17.0`
  - Project assumes Node 22.17.0 or newer for consistent tooling behavior.

- **`sideEffects`**
  - `["**/*.css"]`
  - Tells bundlers that CSS files have side effects and should not be tree-shaken away.

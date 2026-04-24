# Mindful
Chrome plugin for productivity and efficiently storing bookmarks

## How to install the Chrome extension
1. Download the source code: Either 1) run `git clone` or 2) download the code zip file from Github and extract it.
2. In Chrome, navigate to chrome://extensions/
3. In the top right corner, click to enable "Developer mode."
4. In the top left corner, click on "Load unpacked."
5. Navigate to the `mindful/` directory you just downloaded. As the root folder, select the `dist/` subdirectory and click select.
6. Now, the Mindful Chrome extension is running in your browser. To make it easier to access, you can pin it to your Chrome extensions bar.

## How to compile the React project for development
1. Run `npm install` to install all the packages.
2. Run `npm run build` from the root `mindful` directory.

## How to run the tests
1. To run one-off, run `npm test`
2. To run continually during development, run in watch mode: `npm test -- --watch`

## How to switch between sandbox vs. prod
This is all controlled by whatever file is named `amplify_outputs.json`.
### To work on production:
1. Download a copy of `amplify_outputs.json` from AWS Apps > Deployment and name it `amplify_outputs.prod.json`.
2. Run `cp amplify_outputs.prod.json amplify_outputs.json`

### To work on sandbox
1. Run `npx ampx sandbox` to have `amplify_outputs.json` generated for you.

## How to test the sandbox groupBookmarks endpoint

### API-level smoke test (rate limiting)
Run `amplify/tools/test_group_bookmarks.sh` from any directory — it reads the endpoint automatically from `amplify_outputs.sandbox.json` (falling back to `amplify_outputs.json`).

```
bash amplify/tools/test_group_bookmarks.sh
```

Calls 1–10 should return `200`; calls 11–12 should return `429`.

### End-to-end test via the Chrome extension
The extension normally calls the production API. To point it at your sandbox for local testing, make the following **temporary, local-only** changes (do not commit them):

**1. `src/scripts/import/groupingLLMRemote.ts`** — replace the `API_BASE_URL` constant with your sandbox endpoint:
```ts
// Get the endpoint from amplify_outputs.sandbox.json → custom.API.bookmarks.endpoint
const API_BASE_URL = "https://<your-sandbox-id>.execute-api.us-west-1.amazonaws.com";
```

**2. `public/manifest.json`** — add the sandbox API Gateway domain to `optional_host_permissions` and `content_security_policy.extension_pages`:
```json
"optional_host_permissions": [
  "https://api.mindfulbookmarks.com/*",
  "https://*.execute-api.us-west-1.amazonaws.com/*",
  ...
],
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' ... https://*.execute-api.us-west-1.amazonaws.com https://app.posthog.com;"
}
```

**3. Rebuild and reload:**
```
npm run build
```
Then reload the unpacked extension in `chrome://extensions`.

## How to cut a new release for the Chrome Extensions store
```
# cut release
git switch main
git pull
git switch -c release/chrome-1.7.0

# bump manifest + changelog, commit
git commit -am "chore(release): prepare chrome 1.7.0"

# build + zip for CWS, submit...
cd dist
zip -r ../mindful-extension-v1.2.2.zip .

# after approval
git tag v1.7.0
git push --tags
git switch main
git merge --no-ff release/chrome-1.7.0 || true
git branch -d release/chrome-1.7.0
```

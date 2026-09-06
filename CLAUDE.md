# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Electron + Vue 3 + TypeScript desktop client for Phlix Media Server. The renderer is a **thin consumer** of the shared `@phlix/ui` Vue app (all screens/stores/routing come from `@phlix/ui`; this repo only owns the Electron shell + the boot/bridge glue). Packaged as NSIS + APPX via `electron-builder`. Repo: `git@github.com:detain/phlix-windows-client.git`.

*Note: `.tsx` files in this repo are Vue JSX/TSX compiled by `@vitejs/plugin-vue-jsx`, NOT React. Despite the `.tsx` extension and some JSX syntax, they are Vue components. This has confused every reader so far — now you know.*

## Commands

```bash
npm run dev              # concurrent vite + electron (waits on :5173)
npm run dev:vite         # vite dev server only (port 5173, strictPort)
npm run dev:electron     # electron only (expects vite running)
npm run build            # build:vite + build:electron
npm run build:vite       # vite build → dist/renderer/
npm run build:electron   # tsc -p tsconfig.main.json → dist/main/
npm run package          # NSIS x64 installer → release/
npm run package:store    # APPX for Windows Store
npm test                 # vitest run
npm run test:watch       # vitest watch
npm run lint             # eslint .
npm run lint:fix         # eslint . --fix
```

Typecheck: renderer `npx vue-tsc --noEmit`; main/preload `npx tsc -p tsconfig.main.json --noEmit`.

Run a single test file: `npx vitest run tests/unit/main.test.ts`. Filter by name: `npx vitest run -t "browser fallback"`.

## Architecture

Three Electron processes wired by `contextBridge`. The renderer ships no UI of its own — it boots `@phlix/ui`'s `createPhlixApp(config)` (Vue 3 + Pinia + vue-router, all peer deps of `@phlix/ui`) and bridges Electron events into it.

- **Main** (`src/main/index.ts`): `BrowserWindow` creation, `Tray`, `Menu` (File/Playback/View/Help), `electron-log` init, `electron-store`. IPC handlers: existing `get-app-path` / `get-version` / `set-always-on-top` / `minimize-to-tray` / `hub:get-config` / `hub:set-config`, **plus** `app:get-server-url` (`store.get('serverUrl', null)`), `app:set-server-url` (`store.set('serverUrl', url)`), `app:get-device-id` (returns persisted `deviceId` or generates+persists `windows-<randomUUID()>`). Sends `media-play-pause` / `media-stop` / `media-rewind` / `media-forward` / `open-settings` to the renderer. Tray/menu/existing IPC unchanged.
- **Preload** (`src/preload/index.ts`): exposes `window.electronAPI` via `contextBridge.exposeInMainWorld`. Adds `getServerUrl()` / `setServerUrl(url)` / `getDeviceId()` (all `ipcRenderer.invoke`) alongside the existing app-info / window-control / media-event / hub-config members. Listener helpers return cleanup functions.
- **Renderer** (`src/renderer/`): a thin `@phlix/ui` consumer — no local pages/components/stores. Pinned to `@phlix/ui` (`github:detain/phlix-ui#v0.98.39`) + `@phlix/contracts` (`github:detain/phlix-contracts#v0.4.6`); Vue 3 / Pinia / vue-router are peer deps. Built with Vite + `@vitejs/plugin-vue`.

### Renderer layout

| Path | Purpose |
|------|---------|
| `src/renderer/main.ts` | Entry. `boot()` reads Electron config (`hubGetConfig`/`getDeviceId`/`getServerUrl`, defensive when `electronAPI` is undefined in a plain browser dev context), resolves app-mode + apiBase via `resolveAppConfig`, builds `deviceHeaders` via `@phlix/contracts` `buildPhlixHeaders`, `createPhlixApp({app, apiBase, deviceHeaders, defaultTheme:'nocturne', branding})`, `mount('#phlix-app')`, then `installElectronBridge(app)`. Exports `boot` for testing; top-level `void boot()` runs at load. |
| `src/renderer/resolveConfig.ts` | Pure exported `resolveAppConfig({hub, serverUrl, envUrl})`: returns `{app:'hub', apiBase:hub.hubUrl}` when `hub.hubUrl` set AND `connectionMode !== 'direct'`, else `{app:'server', apiBase}` with serverUrl → envUrl → `http://localhost:8096`. No Electron/DOM deps — unit-testable. |
| `src/renderer/electronBridge.ts` | `installElectronBridge(app)` pulls `$pinia`/`$router` off `app.config.globalProperties`, resolves `usePlayerStore(pinia)`, delegates to the pure `wireElectronBridge(player, router)`. Maps Electron media/window IPC → the phlix-ui player store + router: play-pause toggles `play()`/`pause()` off `player.playing`; stop → `closePlayer()`; open-settings → `router.push('/app/settings')`. `rewind`/`forward` relative-seek via `player.seekBy(∓10)` (phlix-ui v0.52.0 command bus). No-op outside Electron; returns a single cleanup that unregisters every listener. |
| `src/renderer/index.html` | Mounts `#phlix-app`, loads `/main.ts`. CSP locked to self + `https: http: blob:` media + `ws:` connect. |
| `src/renderer/types/electron.d.ts` | `window.electronAPI` typings (incl. `HubConfig`, `getServerUrl`/`setServerUrl`/`getDeviceId`). |
| `src/renderer/test-setup.ts` | `localStorage` mock for jsdom env. |
| `src/renderer/vite-env.d.ts` | Vite client types; `VITE_PHLIX_SERVER_URL` optional. |


### Routing

Routes are NOT defined here — they come from `createPhlixApp` (`@phlix/ui`'s router). The router base is `/app`; the Electron bridge navigates with full paths such as `router.push('/app/settings')`.

## Conventions

- **Thin consumer**: the renderer owns ZERO UI. All screens, stores, theming, and routing live in `@phlix/ui`. Do not re-add local pages/components/stores — extend `@phlix/ui` upstream and bump the pinned version instead.

  This rule was violated: roughly 1,900 lines of local UI accumulated across 14 components, 2 screens, 1 page and 1 store. Phase W2 deleted all of them. A rule with a scar attached is followed; a bare rule is not.

  Before adding any component to `src/renderer/` or `src/components/`, check `node_modules/@phlix/ui/src/` — the component likely already exists upstream.

- **Device identity** via `@phlix/contracts` `buildPhlixHeaders({deviceId, deviceName:'Phlix for Windows', deviceType:'windows'})`. No token/sessionId is passed here — `@phlix/ui`'s ApiClient owns `Authorization`/session.
- **App-mode + apiBase** are resolved once in `resolveAppConfig` (hub vs direct server). Persisted serverUrl comes from `app:get-server-url`; the stable deviceId from `app:get-device-id`.
- **Electron → player bridge**: Electron IPC events are bridged to `@phlix/ui`'s `usePlayerStore` + router in `electronBridge.ts`, never directly to UI. Add new media commands there.
- **TypeScript strict** with `noUnusedLocals` + `noUnusedParameters` (`tsconfig.json`). Avoid `any` — `@typescript-eslint/no-explicit-any` is warn.
- **`console.*`**: `no-console` is warn in the renderer; **off** in `src/main`/`src/preload` (Electron legitimately logs).
- **Unused args**: prefix `_`; rule `argsIgnorePattern: '^_'`.
- **IPC**: never use `ipcRenderer` directly in the renderer — extend `window.electronAPI` via `src/preload/index.ts` and type it in `src/renderer/types/electron.d.ts`.
- **CSP** in `src/renderer/index.html` allows `https: http: blob:` for media and `ws:` for connect — preserve when adding sources.

> Offline Downloads and realtime SyncPlay UIs were removed in the migration and are TEMPORARILY DROPPED, to be re-added later as shared `@phlix/ui` seams (tray Rewind/Forward now relative-seek via v0.52.0's player command bus).

## Testing

- Vitest with `jsdom` env (`vitest.config.mts`, `@vitejs/plugin-vue`), setup file `src/renderer/test-setup.ts` mocks `localStorage`.
- Includes glob: `tests/**/*.test.ts` and `tests/**/*.test.tsx`.
- Coverage via `@vitest/coverage-v8` (`v8` provider), reporters `text`/`json`/`html`; all source including `src/main/**` and `src/preload/**` is covered (58% floor enforced in CI).
- Test files: `tests/unit/resolveConfig.test.ts` (app-mode/apiBase resolution), `tests/unit/electronBridge.test.ts` (`wireElectronBridge` + `installElectronBridge`), `tests/unit/main.test.ts` (`boot()` entry — hub/direct/browser-fallback/env-fallback).
- Path alias: `@` → `src/renderer/` (both `vite.config.mts` and `vitest.config.mts`).

## TypeScript configs

- `tsconfig.json` — renderer; `extends @vue/tsconfig/tsconfig.dom.json`; `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`, `lib: [ES2020, DOM, DOM.Iterable]` (no `jsx`). Renderer typecheck via `vue-tsc --noEmit`.
- `tsconfig.main.json` — main + preload; `module: CommonJS`, `target: ES2020`, `outDir: dist`, `composite: true`. Referenced from `tsconfig.json`.

## Build & packaging

- `electron-builder` config lives in `package.json` under `"build"`: `appId: app.phlix.windows`, NSIS (`oneClick: false`, `perMachine: false`) + APPX (`publisher: CN=Phlix`), icon at `build/icon.ico`.
- Main entry shipped is `dist/main/index.js`; preload referenced as `preload.js` next to it (output by `tsc -p tsconfig.main.json`).
- Logs go to `%APPDATA%\phlix-windows\logs\` via `electron-log`.
- `dist/` is gitignored and NOT committed — CI (`build.yml`) builds it. `coverage/`, `release/`, and `*.tsbuildinfo` are gitignored too.
- ESLint is flat config (`eslint.config.mjs`, eslint 9 + `typescript-eslint` + `eslint-plugin-vue`). The old `.eslintrc.cjs`/`.eslintignore` were removed. Vite/Vitest configs use explicit-ESM extensions (`vite.config.mts`, `vitest.config.mts`).

## CI

- `.github/workflows/test.yml` — runs `npm test` and lint on every push/PR.
- `.github/workflows/build.yml` — builds release artifacts on tag push.

## Detailed developer guide

Full architecture diagrams, IPC handler walkthroughs, and packaging notes live in `DEVELOPER.md`. End-user setup is in `README.md`.

## Working preferences

- Keep `.github/workflows/*.yml` credentials hardcoded until secrets are explicitly provisioned — do not refactor to `${{ secrets.X }}` proactively.
- When invoking external CLIs, pass all flags every time (use empty strings instead of omitting flags).
- For multi-PR/multi-slice work, sequence steps one at a time — do not fan out parallel sub-agents.

## Before Committing

**IMPORTANT:** Before every git commit, you MUST ensure Caliber syncs agent configs with the latest code changes.

First, check if the pre-commit hook is already installed:
```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
```

- If **hook-active**: the hook handles sync automatically — just commit normally. Tell the user: "Caliber will sync your agent configs automatically via the pre-commit hook."
- If **no-hook**: run Caliber manually before committing:
  1. Tell the user: "Caliber: Syncing agent configs with your latest changes..."
  2. Run: `caliber refresh && git add CALIBER_LEARNINGS.md CLAUDE.md .claude/ AGENTS.md .agents/ 2>/dev/null`
  3. After it completes, briefly tell the user what Caliber updated. Then proceed with the commit.

**Valid `caliber refresh` options:** `--quiet` (suppress output) and `--dry-run` (preview without writing). Do not pass any other flags — options like `--auto-approve`, `--debug`, or `--force` do not exist and will cause errors.

**`caliber config`** takes no flags — it runs an interactive provider setup. Do not pass `--provider`, `--api-key`, or `--endpoint`.

If `caliber` is not found, tell the user: "This project uses Caliber for agent config sync. Run /setup-caliber to get set up."
## Session Learnings

Read `CALIBER_LEARNINGS.md` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
## Model Configuration

Recommended default: `claude-sonnet-4-6` with high effort (stronger reasoning; higher cost and latency than smaller models).
Smaller/faster models trade quality for speed and cost — pick what fits the task.
Pin your choice (`/model` in Claude Code, or `CALIBER_MODEL` when using Caliber with an API provider) so upstream default changes do not silently change behavior.

## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup) to keep AI agent configs in sync across Claude Code, Cursor, Copilot, and Codex.
Configs update automatically before each commit via `caliber refresh`.
If the pre-commit hook is not set up, run `/setup-caliber` to configure everything automatically.

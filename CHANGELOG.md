# Changelog

All notable changes to **phlix-windows-client** are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Changed — W34 (cs20retag): `@phlix/ui` re-tag v0.98.39 → v0.99.1 — 2026-09-05

- **Combined re-tag wave (this repo's first estate wave).** `package.json`
  re-tags `@phlix/ui` `github:detain/phlix-ui#v0.98.39` → `#v0.99.1`; the
  committed lockfile follows via `npm install --package-lock-only` — the
  `@phlix/ui` block moves to version `0.99.1` resolved at the peeled tag
  target `11428111` (annotated tag `v0.99.1` peels to that commit), with its
  nested `@phlix/contracts`/`@phlix/syncplay` declaration strings following
  v0.99.1's own pins (`#v0.4.5`/`#v0.1.4`). Churn disclosed: **zero** other
  lock entries moved — the direct `@phlix/contracts#v0.4.3` pin and its
  resolution are untouched (grant boundary), no unrelated package re-resolved.
  Pre-existing audit reds on this PR cleared in the same in-range, lock-only
  pattern (S430 precedent): `fast-uri` 3.1.5 → 3.1.7 (high) and
  `@xmldom/xmldom` 0.8.13 → 0.8.15 (moderate) via `npm update
  --package-lock-only`; `package.json` untouched.

### Added
- (workitem W7.5)

## [W7.7] — 2026-08-07

### Added — performance: parallelised boot IPC, deadline-based sleep timer, overlay reactivity, and resolved PIP video element (W5.1–W5.5)

- **Parallelised IPC calls at boot** — `src/renderer/main.ts` now fires `get-app-path`, `get-version`, `hub:get-config`, `app:get-device-id`, and `app:get-server-url` concurrently via `Promise.all()` instead of awaiting them sequentially, reducing time-to-first-paint on startup.
- **Deadline-based sleep timer** — the overlay sleep timer now uses `requestAnimationFrame` + a deadline timestamp instead of `setInterval`, stopping the countdown exactly at the target time and using CSS `transition` for smooth progress bar updates rather than polling on each tick.
- **Reactive overlay routing** — `src/renderer/overlay.tsx` now responds to `router.afterEach()` navigation events instead of polling `window.location.pathname`, updating the overlay only when the route actually changes.
- **PIP video element resolved once** — the Picture-in-Picture code path now queries the video element once with `querySelector` and reuses the reference, rather than calling `querySelector` repeatedly on every `visibilitychange` event which forced a layout recalculation.
- **Total tests: 228 → 245**.

### Added — CI pipeline hardened: packaging gated on quality gates, npm ci, test typecheck, no-console rule, electron-log, and audit/CodeQL (W6.1–W6.7)

- **Packaging gated on quality gates** — `build.yml`'s `build` job now declares `needs: [lint, typecheck, test, smoke]`, blocking packaging until all four gates pass; the `lint`, `typecheck`, `test`, and `smoke` jobs all run in parallel as separate workflow steps.
- **`npm ci` with lockfile-keyed cache** — all CI jobs now use `npm ci` (not `npm install`) with `cache: 'npm'` so the npm store is keyed to the lockfile hash, guaranteeing hermetic builds and eliminating lockfile drift.
- **TypeScript typecheck extended to test suite** — `tsconfig.test.json` was added so `vue-tsc --noEmit -p tsconfig.test.json` catches type errors in test files (which import compiled main/preload from `dist/`); this was failing silently before W6.3.
- **`electron-log` replaces `console.log`** — `src/main/index.ts` switched from `console.log`/`console.error` to the `electron-log` library, enabling structured log writing to `%APPDATA%\phlix-windows\logs\` and runtime log inspection.
- **`no-console` ESLint rule enforced for renderer** — `eslint.config.mjs` now has `'no-console': ['error', { allow: ['error', 'warn'] }]` for the renderer, causing test failures on any `console.log` committed in renderer code (main/preload/scripts are exempt).
- **`npm audit --audit-level=high` in CI** — the test job now runs `npm audit --audit-level=high` and fails the job if any high or critical vulnerabilities are found, closing the audit gap that existed before W6.5.
- **CodeQL security analysis added** — `codeql.yml` was added running `security-extended` queries on every push/PR, providing static analysis security coverage complementary to `npm audit`.
- **Total tests: 215 → 228**.

### Added — docs: CI baseline documented, architecture decisions recorded, README corrected, React/Vue confusion fixed (W7.4–W7.6)

- **`docs/ci-baseline.md` added** — records every CI gate verified in the W6 CI improvement pass, including smoke test, ESLint, vue-tsc, tsc main/preload, vitest, test typecheck, no-console rule, npm audit, packaging quality gate, npm ci, and CodeQL. Documents the one legitimate `continue-on-error: true` (Codacy coverage upload) and the coverage reporter configuration.
- **`docs/performance-notes.md` added** — records the W5.x performance investigation findings: list virtualisation is handled upstream by `@phlix/ui`'s `MediaGrid` (windowed rendering, no third-party library), and the boot parallelisation and sleep timer changes were measured and verified.
- **`docs/readme: correct nine false claims`** — corrected the README's stale dependency description, inaccurate feature list, wrong directory tree, and incorrect npm script references to match the as-built state after W0–W6 changes.
- **React/Vue confusion corrected** — README and comments that referred to "React" or "Vue.js JSX" were updated to correctly state "Vue JSX" throughout, since this project uses Vue 3 with `@vitejs/plugin-vue-jsx` which is a Vue JSX transform, not React.
- **Stale dependency pins removed** — `@phlix/ui` is pinned to `github:detain/phlix-ui#v0.98.39` and `@phlix/contracts` to `github:detain/phlix-contracts#v0.4.3`; the previous README incorrectly described `@phlix/ui` as coming from npm rather than GitHub.
- **Rotting inventory files removed** — `src/components/`, `src/pages/`, and `src/stores/` directories (all emptied during W2 dead-code deletion) were removed from the project tree and the README directory tree was updated accordingly.
- **Total tests: 245** (no behavioral change).

### Added — W7.6: Runtime server version enforcement (1.1.0 minimum at boot)

- **`src/main/versionCheck.ts` added** — `parseServerVersion(version)` parses semver strings into `{major, minor, patch}`; `checkMinServerVersion(apiBase)` queries `GET /api/v1/server/version`, compares the returned version semantically against `1.1.0`, and returns `false` only when the server explicitly reports a version below minimum. Fails open for old servers (pre-1.1.0) that don't implement the version endpoint — a warning is logged and boot continues.
- **`app:check-server-version` IPC channel added** — `src/main/index.ts` now exposes `checkMinServerVersion` over IPC so the renderer can call it during the boot sequence.
- **`checkServerVersion(apiBase)` added to `window.electronAPI`** — renderer-facing API typed in `src/renderer/types/electron.d.ts`.
- **Boot-sequence integration** — `src/renderer/main.ts:boot()` now calls `api.checkServerVersion(apiBase)` after `resolveAppConfig` resolves `apiBase` but before `createPhlixApp()` / `app.mount()`. If the check fails the boot aborts with a descriptive error log.
- **Design decision documented** — a comment in `src/renderer/main.ts` near the version check and in `versionCheck.ts` explains the fail-open rationale: pre-1.1.0 servers may still work for basic features, and blocking boot on an unknown server would break existing deployments unnecessarily.
- **`tests/unit/versionCheck.test.ts` added** — 18 tests covering: `parseServerVersion` (7 cases including malformed input), `checkMinServerVersion` (11 cases: >= 1.1.0 → true, < 1.1.0 → false, network error → fail-open, HTTP error → fail-open, missing version field → fail-open, malformed JSON → fail-open, trailing slash stripped, nested `data.version` field).
- **`CHANGELOG.md` line 34 corrected** — "docs: state and enforce" changed to "docs: state" since enforcement is being added here, not previously.
- **Total tests: 245 → 263**.

### Added — electron-builder files allow-list, asar packaging, and sourcemap disabled (W4.11)

- **`electron-builder` files allow-list added** — `package.json` `build.files` now lists
  `["dist/**", "build/**", "package.json"]`, explicitly controlling which files are included
  in the packaged app and excluding everything else from the asar archive.
- **`asar: true`, `npmRebuild: false`** — asar packaging is enabled and npm native rebuilds
  are disabled in the electron-builder config.
- **`sourcemap: false` in `vite.config.mts`** — Vite production build now disables
  sourcemap generation, reducing bundle size and not leaking source paths into the
  packaged renderer.
- **Total tests: 215**.

### Added — GPU and hardware-decode escape hatch (W4.12)

- **`PHLIX_DISABLE_GPU=1` environment variable** checked at module level in `src/main/index.ts`
  before `app.whenReady()` — when set, `app.disableHardwareAcceleration()` is called before
  any window is created.
- **`disableHardwareAcceleration` store preference** — a persisted electron-store preference
  checked alongside the env var in the `app.whenReady()` callback; `app.disableHardwareAcceleration()`
  is called if either signal is set.
- **Three IPC handlers** for the renderer to query and toggle the GPU preference:
  `gpu:get-disable-hardware-acceleration` (get current value), `gpu:set-disable-hardware-acceleration`
  (persist a new value), and `gpu:get-feature-status` (returns whether hardware acceleration is
  currently active).
- **Total tests: 228**.

### Changed — NSIS perMachine: false (per-user install, no admin required) (W4.8)

- **`package.json` `build.nsis.perMachine`** switched from `true` to `false` — the NSIS
  installer now installs per-user under `%LOCALAPPDATA%\Programs\Phlix` (electron-builder
  per-user default) instead of requiring admin rights to write to Program Files.
- No admin rights are required to install; auto-update (W4.9) works without elevation.
- **Note:** Logs (`electron-log`) and config (`electron-store`) still live under
  `%APPDATA%\phlix-windows` — only the install location changed.

### Added — native notifications with click-action routing (W4.7)

- **`Notification.isSupported()` check** — all notification APIs are gated behind a platform
  support check; on unsupported platforms the feature gracefully no-ops with a warn log.
- **`notificationsEnabled` preference** — persisted in electron-store (default `true`); can be
  toggled off to suppress all native notifications without uninstalling the app.
- **`notification:show` IPC channel** — `ipcMain.handle('notification:show', ...)` takes
  `{ title, body, clickAction? }` and constructs an Electron `Notification`; the renderer calls
  it via `window.electronAPI.showNotification(title, body, clickAction?)`.
- **`clickAction` routing** — when a notification is clicked, `phlix://internal{clickAction}` is
  parsed and routed through the existing W4.4 deep-link handler, allowing any internal route
  (e.g., `/media/id`, `/app/settings`) to be opened from a notification click.
- **`'internal'` host added to `KNOWN_HOSTS`** — `phlix://internal*` URLs are accepted by the
  deep-link parser and routed to the click action handler; the `'internal'` host is intentionally
  absent from the public deep-links documentation as it is an implementation detail for
  notification routing rather than a user-facing link type.
- **`tests/unit/notification.test.ts`** added with 7 tests covering: `isSupported()` guard,
  `notificationsEnabled` false skips notification, `title`/`body`/`clickAction` passthrough,
  click event fires and routes `phlix://internal` URL correctly, and graceful no-op on
  unsupported platforms.
- **Total tests: 207 → 215**.

### Added — sleep inhibition during playback (W4.6)

- **`powerSaveBlocker` module added** (`src/main/powerSaveBlocker.ts`) — wraps Electron's
  `powerSaveBlocker` API with module-level state (`powerBlockerId`) and an idempotent public API.
- **`ensurePowerBlocker(start: boolean)`** — when `start` is `true`, starts the blocker only if
  `powerSaveBlocker.isStarted(id)` returns `false`; when `start` is `false`, stops the blocker and
  sets `powerBlockerId = null` so a subsequent start creates a fresh blocker.
- **`power:update` IPC channel** — `ipcMain.on('power:update', (_, { playing }) => ensurePowerBlocker(playing))`
  wired in `src/main/index.ts`; renderer sends `{ playing: boolean }` on every play/pause transition.
- **Four teardown paths** ensure the blocker is stopped on window close, app quit, and renderer process
  crash: `win.on('close')`, `app.on('before-quit')`, and `app.on('render-process-gone')`.
- **`tests/unit/powerSaveBlocker.test.ts`** added with 20 tests covering: idempotent start/stop,
  `isStarted` guard prevents duplicate blockers, `powerBlockerId` reset after stop, all four teardown
  paths, and the IPC channel round-trip.
- **Total tests: 187 → 207**.

### Added — Windows SMTC integration: taskbar thumbnail buttons and progress bar (W4.5)

- **`setThumbarButtons`** — three taskbar thumbnail toolbar buttons (rewind 10 s, play/pause, forward 10 s) that update their icons and enabled state when play state changes. Icons are resized from `build/icon.png` with an `isEmpty()` guard so missing assets are handled gracefully.
- **`setProgressBar`** — taskbar progress indicator driven by playback position: indeterminate state (2) when a track is loaded but not yet playing, a `0.0–1.0` fraction during playback, and cleared (`-1`) when playback ends.
- **Two IPC send channels** — `thumbar:update` (feeds `setThumbarButtons` from renderer state) and `playback:progress` (feeds `setProgressBar` with `{ current, total }`).
- **Fixes** — indeterminate progress now applies immediately on play start rather than only after a seek; `willBePlaying` used instead of reading `player.playing` after the async `play()` call returns, avoiding a race where the button label could reflect stale state.
- **Total tests: 171 → 183**.

### Fixed — deep link listener cleanup and router optional chaining (W4.4)

- **`src/renderer/main.ts:165`** — Added optional chaining on
  `app.config?.globalProperties?.$router` so the deep link flush guard does not
  crash in test environments where the router is not yet initialised.
- **`src/preload/index.ts:59–62`** — Fixed `onDeeplink` cleanup: the `removeListener`
  call was passing the user's callback directly instead of the inner `listener`
  reference created and registered with `ipcRenderer.on`. Cleanup now correctly
  removes only the IPC listener.
- **`tests/unit/ipcChannels.test.ts`** updated: `deeplink:open` added to the push
  channel list (now 6 total), bringing total tests to 171.

### Added — window bounds persisted across sessions (W4.3)

- **`WindowBounds` interface** added (`x`, `y`, `width`, `height`, `isMaximized`) — typed bounds
  structure used for both storage and `setBounds()` calls.
- **Startup restore**: `createWindow()` reads saved bounds from `electron-store` and validates them
  with `isBoundsOnScreen()` before applying; off-screen bounds fall back to defaults (no `x`/`y`
  set, `defaultWidth`/`defaultHeight` used).
- **Maximized state** restored after window creation via `win.maximize()` / `win.unmaximize()`
  so the persisted state is applied after the window is already visible.
- **Debounced save on resize/move**: a 250 ms `setTimeout` saves bounds; the previous timeout is
  cleared before scheduling a new one, so rapid resize events coalesce into a single write.
- **Save on close**: bounds are written to the store in the `before-quit` handler before the
  minimize-to-tray logic runs, ensuring the final size is captured even when closing from tray.
- **`tests/unit/windowBounds.test.ts`** added with 21 tests covering: default bounds, fullscreen
  skip, all-bounds-on-screen restore, off-screen fallbacks, maximized/restore round-trips,
  debounce coalescing, close-persists-bounds, and `isBoundsOnScreen()` edge cases.
- **Total tests: 150 → 171**.

### Added — single-instance lock prevents multiple app windows (W4.2)

- **`app.requestSingleInstanceLock()`** added at module top of `src/main/index.ts` — the app
  acquires an exclusive lock on startup; if a second instance is launched the existing window is
  restored and focused instead of opening a second window.
- **`second-instance` handler** wired to restore and focus the primary window when a subsequent
  launch is attempted (minimized windows are restored first).
- **TODO comment** in the handler references W4.4 for deep-link routing — argv will be parsed
  for `phlix://` URLs once that step is implemented.
- **`tests/unit/singleInstance.test.ts`** added with 4 tests covering: lock acquisition, failed
  lock causes quit, window restore on second-instance, and window focus on second-instance.
- **`tests/unit/protocolHandler.test.ts`** mock updated to include `requestSingleInstanceLock`.
- **Total tests: 146 → 150**.

### Added — application icons (W4.1)

- **`build/icon.png`**, **`build/icon.ico`**, and **`build/tray-icon.png`** added — placeholder
  orange icons generated by `scripts/generate-icons.mjs`; the three files are produced
  idempotently and are gitignored so CI regenerates them on each build.
- **`scripts/check-assets.js`** added — prebuild validation hook (wired via `npm run prebuild`)
  that verifies all three icon files are present and exits 1 if any are missing, catching
  misconfigured build environments early.
- **`scripts/generate-icons.mjs`** added — idempotent script that generates the three icon
  placeholders; run manually or via the `prebuild` script so contributors without design
  assets can still build.
- **`createTray()` guarded with `isEmpty()` check** — `new Tray(icon)` is now reached only
  when the icon image is non-empty; on missing or empty icon the function returns early
  instead of throwing, making the tray conditional on assets being present.
- **`tests/unit/trayIcon.test.ts`** added with 3 tests covering: `isEmpty()` returns true
  for missing/empty images, `isEmpty()` returns false for a valid icon, and `createTray()`
  skips tray creation when the icon is empty.
- **Total tests: 143 → 146**.

### Audited — every IPC channel documented end-to-end (W3.7)

- **`docs/ipc-channels.md`** created — 43 lines, all 16 IPC channels in a 6-column table
  (channel name, direction, payload, return, main handler, preload method, renderer call sites).
  This document is load-bearing: `tests/unit/ipcChannels.test.ts` asserts the code matches it.
- **3 doc-vs-code alignment tests** added to `tests/unit/ipcChannels.test.ts` — parse the markdown
  table and assert that every entry in the table has a matching handler in the code, so adding an
  unpaired `ipcMain.handle` makes the pairing test fail.
- **10 behavioral round-trip tests** added for invoke/send/push channels in
  `tests/unit/ipcChannels.test.ts` under `describe('behavioral round-trips')`.
- **`main.test.ts` overlay mock added** — `overlay.tsx`'s `createWebHashHistory()` was running
  before jsdom was ready, causing vitest to exit 1 on every run; `vi.mock('../src/renderer/overlay')`
  now prevents the router initialisation during test setup.
- **Total tests: 130 → 143**.

### Deleted — dead File → Open File… menu item and no-op handler removed (W3.6)

- **`Open File…`** menu item removed from the File menu — the menu entry and its accelerator
  (`CmdOrCtrl+O`) are gone; no replacement was wired.
- **`onFileOpened` handler removed** from the renderer bridge — the `file-opened` IPC message
  from `openFile()`'s dialog callback was received by a no-op handler in `electronBridge.ts`
  (the `playLocalFile` seam does not yet exist upstream in `@phlix/ui`'s `PlayerPage`), so the
  entire path was dead code.
- No behaviour changed — local file playback was never functional and is not affected.

### Fixed — bridge cleanup functions made idempotent (W3.3)

- **`installElectronBridge()` and `installFocusGuard()` made idempotent**: both functions now
  track their cleanup at module level (`_cleanupBridge` / `_cleanupFocus`) and remove any
  previous registration before installing a new one, preventing duplicate listeners if either
  function is called more than once.
- **`cleanupOverlay()` exported** from `src/renderer/overlay.tsx` — returns a cleanup function that
  removes the overlay's focus guard listener; idempotent (safe to call when nothing is registered).
- **`disposeAll()` wired to HMR and page unload** in `src/renderer/main.ts`:
  `import.meta.hot.dispose()` and `window.addEventListener('beforeunload')` both invoke
  `disposeAll()`, which runs every registered cleanup (electron bridge + overlay) so listeners
  are properly removed on hot reloads and navigation away from the page.

### Fixed — minimize-to-tray preference is now persisted across quits (W3.2)

- **`isQuitting`** separated from **`minimizeToTray`**: `isQuitting` is a transient in-memory flag
  (set/cleared per quit sequence); `minimizeToTray` is a persisted electron-store preference.
- **Two `store.set('minimizeToTray', false)` calls removed** from the quit path in
  `src/main/index.ts` — these were destroying the persisted preference on every quit, forcing the
  user to re-enable minimize-to-tray after every app restart.
- **Tray context menu "Minimize to Tray" checkbox** added (`type: 'checkbox'`, checked state driven
  off `store.get('minimizeToTray', true)`, click handler calls `store.set('minimizeToTray', menuItem.checked)`),
  giving direct visual control and persistence without requiring a settings page.
- **IPC getter/setter added** for `minimizeToTray` over the preload bridge:
  `ipcMain.handle('tray:get-minimize-to-tray')` and `ipcMain.on('tray:set-minimize-to-tray')` in main,
  `getMinimizeToTray()` / `setMinimizeToTray()` in preload, typed in `electron.d.ts`.
- **9 new tests** covering: checkbox reflects store value, checkbox click updates store, quit path
  does not clobber the preference, `isQuitting` flag is independent of the persisted preference,
  and IPC getter/setter round-trips correctly.

### Fixed — menu accelerators no longer hijack text input (W3.1)

- **`registerAccelerator: false`** added to the Space, Left, and Right menu items in the Playback
  menu — these accelerators are now handled exclusively by the renderer focus guard rather than by
  Electron's global menu system.
- **`installFocusGuard(player)`** added to `src/renderer/electronBridge.ts` — intercepts
  `keydown` for Space, Left, and Right when the active element is a text input (`INPUT`,
  `TEXTAREA`) or an element with `contenteditable`, allowing normal text editing to proceed
  unobstructed.
- **`playbackMenuTemplate` extracted** into its own exported constant in `src/main/index.ts` for
  unit-testability.
- **9 new tests** covering: Space/Left/Right blocked in text inputs, Space/Left/Right passed through
  when player is focused, and the focus guard not interfering with other keys (Up, Down, Enter).

### Fixed — overlay entry point is now deterministic (W2.7)

- **`src/renderer/overlay.tsx` rewritten** — the Vue app is now created once at module level
  rather than being recreated on every retry; bounded retry with max 10 attempts at 1 second
  intervals; `console.error` logged when the mount target `#player-supplement-root` never appears.
- **`.use(pinia)` and `.use(router)` called explicitly** before mounting rather than relying on
  `activePinia` accident.
- **`src/renderer/overlay.html` deleted** — a standalone HTML entry point that was built by Vite
  but was never loaded by the Electron shell; the overlay is mounted onto `#player-supplement-root`
  inside the main `@phlix/ui` app.
- **4 new tests** in `tests/unit/overlay.test.ts` covering: mount on target appearance, bounded
  retry exhaustion, single `createApp` call across retries, and explicit `.use(pinia)`/`.use(router)`
  registration.

### Deleted — unused React and React DOM dependencies removed (W2.6)

- **`react`**, **`react-dom`**, **`@types/react`**, and **`@types/react-dom`** removed from
  `package.json` — these production dependencies were never imported or used; the renderer
  has never shipped its own UI (it boots the shared `@phlix/ui` Vue 3 app). The JSX transform
  plugin `@vitejs/plugin-vue-jsx` is retained: 4 `.tsx` files in the Vite build use Vue JSX,
  which requires that plugin (not React). Lockfile regenerated.
- No new exports were introduced; no behaviour changed.

### Deleted — 10 unreachable presentational components and 8 test files (W2.5)

- **`src/renderer/components/RatingBadge.tsx`**, **`ChapterList.tsx`**, **`AudioTrackList.tsx`**,
  **`SubtitleTrackList.tsx`**, **`RecommendationCard.tsx`**, **`RecommendationsPanel.tsx`**,
  **`MusicAlbumCard.tsx`**, **`MusicArtistCard.tsx`**, **`MusicScreen.tsx`**, and
  **`MusicAlbumScreen.tsx`** removed — 10 presentational components that were never rendered
  anywhere in the thin-consumer app; 1,883 lines deleted.
- **`tests/unit/RatingBadge.test.tsx`**, **`ChapterList.test.tsx`**, **`AudioTrackList.test.tsx`**,
  **`SubtitleTrackList.test.tsx`**, **`RecommendationCard.test.tsx`**, **`RecommendationsPanel.test.tsx`**,
  **`MusicAlbumCard.test.tsx`**, and **`MusicArtistCard.test.tsx`** removed — 8 test files deleted
  along with the components (test count: 183 → 109; coverage: 69.41% → 69.33%).

### Deleted — local SyncPlay stack removed in favour of @phlix/ui (W2.1)

- **`useSyncPlayStore.ts` removed** from `src/stores/` — the Pinia store that locally duplicated
  SyncPlay state is gone; the upstream `SyncPlayPage` in `@phlix/ui` is now reachable via the
  nav wired in W1.4.
- **`tests/unit/useSyncPlayStore.test.ts` removed** — 279 lines of store unit tests deleted along
  with the store itself.
- **`@phlix/syncplay` dependency removed** from `package.json` and the lockfile regenerated.

### Deleted — local ParentalControlsPage fork removed (W2.2)

- **`src/pages/ParentalControlsPage.vue` removed** — the 1373-line local fork of the upstream
  `ParentalControlsPage` from `@phlix/ui` is gone. The upstream `/app/parental` route (registered
  by `createPhlixApp`) remains reachable; it is on the route-reachability allow-list
  (`/app/parental` exempt from nav-coverage requirement). `src/pages/` is now empty and the
  directory entry has been removed from `README.md`.

### Deleted — local SkipButton removed (W2.4)

- **`src/renderer/components/SkipButton.tsx` removed** — the 147-line local component was
  permanently broken; it read `item.markers` which the server never sends. Skip-intro is now
  handled by `@phlix/ui`'s `PlayerPage` directly.
- **`tests/unit/SkipButton.test.tsx` and 8 sibling test files removed** — 160 lines of tests
  deleted along with the component (test count: 192 → 183).

### Deleted — mock UserRatingPicker removed (W2.3)

- **`src/renderer/components/UserRatingPicker.tsx` removed** — the 170-line local component had
  commented-out real fetch calls and faked success with `setTimeout`; it was never rendered
  anywhere. Rating actions are now provided by `@phlix/ui`'s media detail page directly.
- **`tests/unit/UserRatingPicker.test.tsx` removed** — 8 test files (113 lines total) deleted
  along with the component.

### Verified — admin page surface and settings (W1.7)

- **`docs/ui-surface.md`** corrected: the admin page count was revised from "22" (wrong estimate from a stale `admin.d.ts` comment) to **"23"** (verified via live bundle analysis of `@phlix/ui v0.98.34 dist/phlix-ui.js`). `buildAdminRoutes()` yields 20 pages and `buildHubAdminRoutes()` yields HubDashboardPage + 3 hub-only + 3 common = 7 pages total.
- **WebhookLogsPage removed** from the admin page table — it is a tab within LogsPage, not a distinct route.
- **Settings confirmed schema-driven** (`SettingsResponse` with `types`, `meta`, `overridden` fields), not a hardcoded form.
- **Plugins admin confirmed complete** in `@phlix/ui v0.98.34`: list, enable/disable, catalog browse, detail view (with `settings_schema`), schema-editor via `updateSettings`, plus install/uninstall/checkUpdates/testCredentials.
- **Plugin update not exercised** — no throwaway server available in this environment.

### Added — nav entries and route-reachability guard for W1.4 nav-wiring

- **`buildMenu` now registers WatchHistory, Explore, Recommendations, and SyncPlay** in both
  server and hub mode nav. These four pages were registered by `createPhlixApp` but had no way
  in — each navigation request landed on a blank screen.
- **`buildExtraRoutes` added to the routeReachability test** so the guard now checks both menu
  coverage and the extraRoutes seam.
- **`tests/unit/routeReachability.test.ts`** created: aVitest guard that reads routes from
  `createPhlixApp`'s router and fails if any route is absent from `buildMenu` and absent from a
  25-entry `DEEP_LINK_ALLOW_LIST`. `extractRoutePaths` correctly resolves relative child paths
  (e.g. `'dashboard'` → `/app/admin/dashboard`); `/app/parental`, `/app/admin`, and
  `/app/admin/*` are on the allow-list.

### Added — `@phlix/ui` v0.98.34 page/route inventory documented

- **`docs/ui-surface.md`** created to track the `@phlix/ui` page surface. Documents 43 root
  pages, 23 admin pages (66 total), nav entry wiring state (3/22 server-mode, 3/8 hub pages),
  4 unlinked pages, and 5 missing hub pages. Serves as the baseline for W1.x nav-wiring work.

### Changed — @phlix/ui re-pinned from v0.81.0 to v0.98.34

- **`@phlix/ui` switched from tarball URL to `github:detain/phlix-ui#v0.98.34`** (matching
  the form used by the Tizen client). This closes a 17-minor version gap (v0.81.0 → v0.98.34)
  and brings 80 upstream commits into the Windows client.
- **All 80 commits were transparent** — no renamed exports, no changed prop signatures, and
  no duplicate component conflicts were introduced. The Windows client required no code changes
  to compile or test after the re-pin.

### Changed — SyncPlay contracts upgraded, local shadow types removed

- **`@phlix/contracts` bumped to `v0.4.1`** (from `v0.3.12`). This pulls in the
  `SyncPlayGroup` vocabulary fix from the contracts package.
- **Local SyncPlay shadow types removed** from `src/renderer/types/electron.d.ts`:
  `SyncPlayRoom`, `SyncPlaySession`, `SyncPlayUser`, `SyncPlayRole`, and
  `SyncPlayPermission` were local duplicates that shadowed the types now exported by
  `@phlix/contracts`. `useSyncPlayStore.ts` imports these from `@phlix/contracts` instead.
- **Orphaned UI components deleted**: `SyncPlayModal.vue` and `SyncPlayOverlay.vue`
  violated the thin-consumer rule and were never reachable.
- **Room placeholder updated**: the local room fallback in `joinRoom()` now includes
  all required `SyncPlayGroup` fields so the store compiles against `v0.4.1`.

### Added — hub nav and routes: 8 of 8 pages now wired (W1.5)

- **`buildMenu`** in hub mode now registers `SharedWithMePage` (`/app/shared`) and
  `InviteLinksPage` (`/app/invites`) nav entries alongside the four hub entries that
  were already present (MyServers, Federation, Shares, Watch History, Explore,
  Recommendations, SyncPlay, Admin).
- **`buildExtraRoutes`** wires the three remaining hub pages: `ServerDetailPage`
  (`/app/server/:id`), `FederationSharesPage` (`/app/federation/shares`), and
  `AcceptInvitePage` (`/app/accept-invite`, deep-link only — no nav entry;
  already allow-listed from W1.4). All eight hub pages are now reachable.
- **Hub-mode gating**: both functions branch on `if (appMode === 'hub')`, leaving
  server mode entirely untouched.
- **Relay proxy HTTP verbs (stale caveat removed)**: `phlix-hub/src/Application.php`
  registers `GET`, `PUT`, `DELETE`, `PATCH`, and `POST` on the relay proxy
  (lines 479–495). The "only `GET`/`HEAD`" caveat previously documented on the
  user-item data write endpoints (`POST .../favorite`, `PUT .../rating`,
  `DELETE .../favorite`) is stale and has been corrected in the API reference
  (`phlix-docs/docs/reference/api.md`).

## [W0.8] — 2025-07-31

### Added — smoke test that launches Electron in CI on ubuntu and windows

A `@playwright/test` smoke test (`tests/smoke/boot.spec.ts`) now launches the packaged Electron app against `dist/` and asserts four guards: `window.electronAPI` is defined (preload script loaded, W0.1), device ID is not the hardcoded `'windows-dev'` fallback (W0.3), the renderer navigated to a `/app/*` route (W0.4), and the console is free of CSP violations and preload errors. The test runs in CI on both `ubuntu-latest` (`xvfb-run`) and `windows-latest` (`.github/workflows/test.yml` smoke job) and is also a prerequisite of the packaging job (`.github/workflows/build.yml`). `npm run smoke` is permanently part of the verification block.

> **W0.8 update (fix loop 6):** The smoke test now runs Chromium in headed mode (`headless: false`) with `xvfb-run` providing a virtual X display on ubuntu CI. This replaces the `--ozone-platform=headless` approach which caused rendering loop failures. The `--disable-gpu` flag is also removed since headed mode in a virtual display does not require it.

> **W0.8 update (fix loop 7):** The smoke test now uses an aggressive set of Chromium flags tuned for CI environments: `--no-sandbox`, `--disable-gpu`, `--disable-software-rasterizer`, `--disable-dev-shm-usage`, `--disable-accelerated-2d-canvas`, `--no-first-run`, `--no-zygote`, `--single-process`, `--disable-ipc-flooding-protection`, `--disable-features=NetworkService,VizDisplayCompositor,ChromeUILoadTimes`, `--disable-gpu-compositing`, and `--headless=new`. These flags suppress GPU rendering, zygote spawn, and multi-process features that cause instability in containerized CI runners. A resilient `firstWindow()` fallback was also added — if `firstWindow()` times out the test checks `electronApp.windows()` directly before failing, so a window that opened just before the timeout is still accepted.

### Fixed — smoke test reliability and diagnostics improvements

The smoke test (`tests/smoke/boot.spec.ts`) has been improved in three ways: it now uses `firstWindow()` instead of `waitForEvent('window')` because `waitForEvent` can race in headless mode where events fire before the listener is attached; the window-launch timeout has been increased from 30 seconds to 60 seconds to accommodate slower CI runners; and stderr/stdout from the Electron process is now captured and echoed to the test output (`electronApp.on('output', ...)`) so CI diagnostics can include the app's startup logs when a failure occurs.

### Fixed — test job now builds the app before running unit tests

The `test` job in `.github/workflows/test.yml` previously ran `npm test` directly. Tests that import compiled output (e.g. main-process or preload modules via `dist/`) would fail because `dist/` did not exist. The job now runs `npm run build` before `npm test`, ensuring `dist/` is populated for test imports.

### Fixed — Content-Security-Policy updated to unblock posters, HLS workers, and WebSocket connections

Posters (cover art, backdrops) loaded from an HTTP server were blocked by the previous CSP `img-src` directive, so no cover art appeared on an HTTP-only setup. Transcoded HLS streams failed because the HLS transmux worker is a `blob:` URL that was not allowlisted in `worker-src` or `child-src`. WebSocket connections to an HTTPS hub (`wss://`) were blocked because only `ws:` was permitted. The CSP in `src/renderer/index.html` and `src/renderer/overlay.html` now reads:

```
default-src 'self'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' http: https: ws: wss: app:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;
```

Posters render on any HTTP server, transcoded HLS streams play, and `wss://` hub connections succeed. Note that `style-src 'self' 'unsafe-inline'` is required for Vue scoped styles (`<style scoped>`), which inject dynamic attribute selectors that cannot be nonce-hashed at build time.

### Fixed — packaged app now loads via `app://` protocol instead of `loadFile`

The desktop client now registers `app://` as a custom privileged protocol before `app.whenReady()` and serves the packaged renderer through a `protocol.handle` handler in `src/main/index.ts`. This avoids Chromium's `file://` origin security restrictions that blocked module fetches and caused `createWebHistory()` to fail with a SecurityError when using `loadFile`. The handler also provides path-traversal protection (rejecting `app://-/../../etc/passwd` with a 403) and falls back to `index.html` for SPA routing. No `loadFile` is used in production.

### Added — stable, per-install device ID sent to the server on every request

The desktop client now identifies itself with a real, stable device ID (`X-Phlix-Device-ID`) instead of sending no device identifier at all. On first launch a UUID-based ID is generated and persisted to electron-store; every subsequent launch returns the same value, so the server can recognize the same installation across restarts and profile switches. The format is `windows-<uuid>` (e.g. `windows-8f3a2b1c-...`). In a plain browser dev context (where the Electron bridge is absent) a per-session `browser-<uuid>` is used with a console warning — support may ask for the device ID when diagnosing connection issues.

### Fixed — preload script path now resolves to where tsc writes it

The `BrowserWindow` webPreferences `preload` path in `src/main/index.ts:37` was
`path.join(__dirname, 'preload.js')`, resolving at runtime to `dist/main/preload.js`.
`tsc -p tsconfig.main.json`, however, writes the compiled preload to `dist/preload/index.js`.
The mismatch caused Electron to fail with "Unable to load preload script" on every
production launch and `window.electronAPI` was never defined. The path now reads
`path.join(__dirname, '../preload/index.js')`, matching tsc's actual output layout.
A build-time assertion (`scripts/assert-preload.mjs`) is now wired into
`build:electron` so a missing preload fails the build rather than silently breaking
production launches.

### Fixed — sandbox enabled and external URL validation

The renderer previously ran with `sandbox: false`, `contextIsolation: true`, and
`nodeIntegration: false`. With `sandbox: false` the renderer could spawn arbitrary
processes and access Node.js APIs indirectly. Additionally, `shell.openExternal`
and the `will-navigate` handler accepted any URL scheme without checking, allowing a
compromised or malicious page to open `file://` URLs (reading local files) or
`javascript:` URLs (running arbitrary code in the Electron shell context).

The window now boots with `sandbox: true`. A new `validateExternalUrl()` function in
`src/main/urlValidator.ts` permits only `http:` and `https:` schemes. The
`setWindowOpenHandler` calls `shell.openExternal` only after validation and always
returns `deny`. The `will-navigate` handler calls `validateExternalUrl` and
`preventDefault()` on anything else, blocking renderer-initiated navigation to
dangerous schemes. Unsandboxed or non-http/https navigation attempts are logged
with a `[security]` prefix.

### Changed — coverage now measured for main and preload processes with 58% floor enforced in CI

Coverage reports (`@vitest/coverage-v8`) now include `src/main/**` and `src/preload/**`. The previous exclusion of Electron-process glue has been removed. Codecov upload in `.github/workflows/test.yml` enforces `fail_ci_if_error: true`, and the coverage floor is set to 58% (measured from 59.81% minus a 1-point buffer).

### Changed — dependency bump for in-player quality selection (G2)

- **`@phlix/ui` bumped to `v0.74.0`, `@phlix/contracts` to `v0.2.0`** (from
  `v0.55.0` / `v0.1.1`) in `package.json` and `package-lock.json`. This pulls in
  `@phlix/ui`'s `QualityMenu` (the on-screen stream-quality picker rendered in
  the player's control bar, shown whenever there are ≥2 switchable hls.js ABR
  rungs) and `@phlix/contracts`'s `Rendition` / `variants` types.
- **No application code changes were needed.** This app has a real mouse and
  keyboard, not a D-pad — unlike the sibling `phlix-tizen-client`, which needed
  a remote-input bridge (yellow-button open/close, D-pad Arrow suppression,
  `MutationObserver` + `router.afterEach` teardown) so its TV remote could
  drive the picker. Here, `QualityMenu` is `@phlix/ui`'s ARIA-`combobox`
  `Select`; its canonical keyboard path (`ArrowUp`/`ArrowDown` to open and
  navigate, `Enter` to confirm, `Escape`/`Tab` to close) and plain mouse clicks
  both work out of the box through ordinary browser focus handling — nothing
  in this repo intercepts keyboard input for the renderer (the only
  `keydown`-adjacent handling is the Electron application **menu accelerators**
  in `src/main/index.ts`: `Space` play/pause, `Left`/`Right` rewind/forward,
  `F11` fullscreen, `CmdOrCtrl+O`/`CmdOrCtrl+,`). Those accelerators collide
  with zero of the Select's primary Arrow/Enter/Escape path; only the
  redundant `Space`-to-select affordance is shadowed by the play/pause
  accelerator, which is not a regression worth bridging.
- No default-quality wiring was added: `PhlixAppConfig` (the object passed to
  `createPhlixApp`) has no default-quality field — `defaultQuality` is a
  `@phlix/ui` `usePreferencesStore` user preference set via the shared
  Settings screen, not something this Electron shell configures at boot.

# Phlix Windows - Developer Guide

This document provides detailed information for developers working on the Phlix Windows desktop application.

## Architecture Overview

The Phlix Windows app follows the standard Electron architecture with three distinct processes. The
renderer is a **thin consumer** of the shared `@phlix/ui` Vue app — it does not ship its own pages,
components, or stores. It boots `createPhlixApp(config)` and bridges Electron events into it.

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                          │
│  - Window management                                     │
│  - System tray                                           │
│  - Native menus                                          │
│  - IPC handlers (incl. app:get/set-server-url,           │
│    app:get-device-id, hub:get/set-config)                │
│  - App lifecycle                                         │
└─────────────────────────────────────────────────────────┘
                           │
                    contextBridge
                    (preload/index.ts)
                           │
┌─────────────────────────────────────────────────────────┐
│                   RENDERER PROCESS                        │
│  boot() (main.ts)                                        │
│    ├─ resolveAppConfig()  → app-mode + apiBase           │
│    ├─ buildPhlixHeaders()  (@phlix/contracts)            │
│    ├─ createPhlixApp(config)  (@phlix/ui: Vue 3 +        │
│    │     Pinia + vue-router — the entire UI)             │
│    ├─ app.mount('#phlix-app')                            │
│    └─ installElectronBridge(app)                         │
│         └─ Electron media/window IPC → usePlayerStore    │
│            + router                                      │
└─────────────────────────────────────────────────────────┘
```

The renderer pins `@phlix/ui` (`github:detain/phlix-ui#v0.98.39`) and `@phlix/contracts`
(`github:detain/phlix-contracts#v0.4.6`). Vue 3, Pinia, and vue-router are peer deps of `@phlix/ui`.
All screens, navigation, theming, and state come from `@phlix/ui`; this repo owns only the Electron
shell and the boot/bridge glue.

Both are pinned by GitHub tag — upstream master changes are inert until both the tag and the pin move.

### Main Process (`src/main/index.ts`)

The main process is responsible for:

1. **Window Creation and Management**
   - Creates `BrowserWindow` with security settings
   - Handles window events (ready-to-show, close, closed)
   - Manages window state (fullscreen, always-on-top)

2. **System Tray**
   - Creates tray icon with context menu
   - Provides media control shortcuts
   - Click to show/hide main window

3. **Application Menu**
   - File menu (Settings, Quit)
   - Playback menu (Play/Pause, Stop, Rewind, Forward, Fullscreen)
   - View menu (Reload, DevTools, Zoom, Fullscreen)
   - Help menu (About)

4. **IPC Communication**
   - `get-app-path` - Returns user data directory
   - `get-version` - Returns app version
   - `set-always-on-top` - Toggle window always-on-top
   - `minimize-to-tray` - Hide window to tray
   - `hub:get-config` / `hub:set-config` - Read/write persisted Hub configuration
   - `app:get-server-url` (`store.get('serverUrl', null)`) / `app:set-server-url` (`store.set('serverUrl', url)`) - Persisted direct media server URL
   - `app:get-device-id` - Returns the persisted `deviceId`, or generates+persists `windows-<randomUUID()>` on first call

5. **Logging**
   - Uses `electron-log` for comprehensive logging
   - Logs to `%APPDATA%\phlix-windows\logs\`
   - Global exception handlers for uncaught errors

### Preload Script (`src/preload/index.ts`)

The preload script uses `contextBridge` to expose safe APIs to the renderer:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Window controls
  setAlwaysOnTop: (value: boolean) => ipcRenderer.send('set-always-on-top', value),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),

  // Media controls (from main to renderer)
  onMediaPlayPause: (callback: () => void) => { ... },
  onMediaStop: (callback: () => void) => { ... },
  onMediaRewind: (callback: () => void) => { ... },
  onMediaForward: (callback: () => void) => { ... },

  // Settings
  onOpenSettings: (callback: () => void) => { ... },

  // Hub configuration
  hubGetConfig: () => ipcRenderer.invoke('hub:get-config'),
  hubSetConfig: (config) => ipcRenderer.invoke('hub:set-config', config),

  // Direct server URL + stable device id
  getServerUrl: () => ipcRenderer.invoke('app:get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('app:set-server-url', url),
  getDeviceId: () => ipcRenderer.invoke('app:get-device-id')
});
```

### Renderer Process (`src/renderer/`)

The renderer is a thin consumer of `@phlix/ui` — there are no local pages, components, or stores.

```
src/renderer/
├── main.ts            # Entry: boot() builds config and mounts @phlix/ui, then installs the bridge
├── resolveConfig.ts   # Pure app-mode + apiBase resolution (hub vs direct server)
├── electronBridge.ts  # Maps Electron media/window IPC → @phlix/ui player store + router
├── index.html         # Mounts #phlix-app, loads /main.ts
├── test-setup.ts      # jsdom localStorage mock
├── vite-env.d.ts      # Vite client types (VITE_PHLIX_SERVER_URL optional)
└── types/electron.d.ts  # window.electronAPI typings (HubConfig + new IPC methods)
```

## Renderer Internals

### Boot sequence (`main.ts`)

`boot()` runs at module load (`void boot()`) and is exported for testing:

1. Read Electron config defensively — `hubGetConfig()`, `getDeviceId()`, `getServerUrl()`. When
   `window.electronAPI` is undefined (plain browser dev), it falls back to a per-session
   `browser-<uuid>` with a console warning, no hub, and `VITE_PHLIX_SERVER_URL` for the server URL.
2. `resolveAppConfig({ hub, serverUrl, envUrl })` → `{ app, apiBase }`.
3. `buildPhlixHeaders({ deviceId, deviceName: 'Phlix for Windows', deviceType: 'windows' })`
   (`@phlix/contracts`) — no token/sessionId; `@phlix/ui`'s ApiClient owns auth.
4. `createPhlixApp({ app, apiBase, deviceHeaders, defaultTheme: 'nocturne', branding: { wordmark: 'Phlix' } })`.
5. `app.mount('#phlix-app')`.
6. `installElectronBridge(app)`.

### App-mode + apiBase resolution (`resolveConfig.ts`)

`resolveAppConfig(input)` is pure and unit-tested:

- **Hub mode** (`{ app: 'hub', apiBase: hub.hubUrl }`) when `hub.hubUrl` is set AND
  `hub.connectionMode !== 'direct'`.
- Otherwise **server mode** (`{ app: 'server', apiBase }`) with the base resolved as
  `serverUrl || envUrl || 'http://localhost:8096'` (empty strings are skipped by `||`).

### Electron → player bridge (`electronBridge.ts`)

`installElectronBridge(app)` reads `$pinia` and `$router` off `app.config.globalProperties` (both set
by pinia's and vue-router's `.use()` inside `createPhlixApp`, so they exist after `mount()`), resolves
`usePlayerStore(pinia)`, and delegates to the pure, structurally-typed `wireElectronBridge(player, router)`:

| Electron event | Action |
|----------------|--------|
| `media-play-pause` | toggle `player.play()` / `player.pause()` off `player.playing` |
| `media-stop` | `player.closePlayer()` |
| `open-settings` | `router.push('/app/settings')` |
| `media-rewind` / `media-forward` | `player.seekBy(-10)` / `player.seekBy(10)` — relative seek via the `@phlix/ui` v0.52.0 player command bus |
The bridge is a no-op when `window.electronAPI` is absent, and returns a single cleanup function that
unregisters every listener.

## UI & State

All UI, navigation, theming, and state come from `@phlix/ui` (Pinia stores + vue-router, router base
`/app`). This repo defines no Vue components or stores of its own. To change a screen, fix it upstream
in `@phlix/ui` and bump the pinned `github:detain/phlix-ui#vX.Y.Z` version in `package.json`.

## Building and Testing

### Development Workflow

1. **Start development mode:**
   ```bash
   npm run dev
   ```

2. **Code changes:**
   - Main process: Electron auto-launches via `wait-on`
   - Renderer: Vite hot reloads automatically

3. **Debug:**
   - Open DevTools (View > Toggle Developer Tools)
   - Main process logs in terminal
   - Renderer logs in DevTools console

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage report
npm test -- --coverage
```

### Test Structure

Tests use Vitest (`jsdom`, `@vitejs/plugin-vue`) with TypeScript. There are 22 tests across three
files:

- `tests/unit/resolveConfig.test.ts` — app-mode/apiBase resolution
- `tests/unit/electronBridge.test.ts` — `wireElectronBridge` + `installElectronBridge`
- `tests/unit/main.test.ts` — `boot()` entry (hub / direct-server / browser-fallback / env-fallback)

Coverage uses `@vitest/coverage-v8`; all source including `src/main/**` and `src/preload/**` is covered (58% floor enforced in CI)
(it needs an Electron runtime, not jsdom). Example (`main.test.ts` mocks `@phlix/ui`, `@phlix/contracts`,
and `./electronBridge`, plus the CSS side-effect imports):

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@phlix/ui', () => ({ createPhlixApp: vi.fn(() => ({ mount: vi.fn() })) }));

describe('boot (renderer entry)', () => {
  it('resolves Electron config, mounts the app, and installs the bridge', async () => {
    // set window.electronAPI fakes, then:
    const mod = await import('@/main');
    await mod.boot();
    // assert createPhlixApp arg object, mount('#phlix-app'), installElectronBridge(app)
  });
});
```

### TypeScript Configuration

The project uses separate TypeScript configs:

- **tsconfig.json** - Renderer; `extends @vue/tsconfig/tsconfig.dom.json`, targets ES2020 with DOM
  libs, `moduleResolution: bundler`, `noEmit` (no `jsx`). Typecheck with `vue-tsc --noEmit`.
- **tsconfig.main.json** - Main + preload; CommonJS for Electron compatibility. Typecheck with
  `tsc -p tsconfig.main.json --noEmit`.

### Build Pipeline

1. **Vite build** (`npm run build:vite`)
   - Bundles the `@phlix/ui` Vue renderer with TypeScript (`@vitejs/plugin-vue`)
   - Outputs to `dist/renderer/`

2. **Electron build** (`npm run build:electron`)
   - Compiles main process TypeScript
   - Compiles preload script
   - Outputs to `dist/main/`

3. **Package** (`npm run package`)
   - Uses electron-builder
   - Creates NSIS installer and APPX package
   - Output in `release/`

`dist/`, `coverage/`, `release/`, and `*.tsbuildinfo` are gitignored — CI (`build.yml`) builds `dist/`.

## Security Considerations

### Context Isolation

The app enables context isolation, disables node integration, and enables the sandbox:

```typescript
webPreferences: {
  preload: path.join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

### IPC Security

- All IPC uses `invoke`/`send` pattern
- Preload exposes only necessary APIs via `contextBridge`
- No direct `ipcRenderer` access in renderer

### Content Security

- External links are validated via `validateExternalUrl()` (allows only `http:` and `https:`)
  before calling `shell.openExternal()`; the handler always returns `deny`
- The `will-navigate` handler blocks renderer-initiated navigation to non-http(s) schemes
- Renderer loads local content in production via the `app://` privileged protocol

## Adding New Features

### Adding a New IPC Handler

1. **Main process** (`src/main/index.ts`):
   ```typescript
   ipcMain.handle('my-handler', async (event, ...args) => {
     // Handle the request
     return result;
   });
   ```

2. **Preload** (`src/preload/index.ts`):
   ```typescript
   myHandler: (...args) => ipcRenderer.invoke('my-handler', ...args),
   ```

3. **Type it** in `src/renderer/types/electron.d.ts`, then use via `window.electronAPI.myHandler()`.

### Adding UI / screens / stores / routes

UI, Pinia stores, and routes are NOT defined in this repo — they all live in `@phlix/ui`. To add or
change a screen, store, or route:

1. Implement it upstream in `@phlix/ui`.
2. Cut a new `@phlix/ui` release and bump the pinned
   `"@phlix/ui": "github:detain/phlix-ui#vX.Y.Z"` in `package.json`.

If a new screen needs to be driven by an Electron tray/menu event, wire that event into the relevant
`@phlix/ui` store inside `src/renderer/electronBridge.ts` (and add the IPC per the section above).

### Bridging a new Electron media command

1. Emit the event from the main process and expose an `onX(callback)` helper in the preload.
2. In `wireElectronBridge` (`electronBridge.ts`), register the listener and call the appropriate
   `@phlix/ui` store action (e.g. `usePlayerStore`). Push its cleanup onto the `cleanups` array.
   Rewind/Forward use `player.seekBy(±10)` (v0.52.0 command bus).

## Troubleshooting

### Main process not reloading

Main process requires full app restart. Run:
```bash
npm run dev
```

### Preload script errors

Ensure `tsconfig.main.json` includes preload files and outputs to correct location.

### Renderer not loading

Check:
- Vite server is running on port 5173
- Main process `isDev` detection is correct
- Preload path is correct in production

### Tests failing with localStorage

Wrap tests with jsdom environment or mock localStorage in tests.

## Resources

- [Architecture Decision Records](./docs/decisions/) — rationale behind key technical choices
- [Electron Documentation](https://www.electronjs.org/docs)
- [Vue 3 Documentation](https://vuejs.org)
- [Pinia Documentation](https://pinia.vuejs.org)
- [Vue Router Documentation](https://router.vuejs.org)
- [Vite Documentation](https://vitejs.dev)
- [Vitest Documentation](https://vitest.dev)
- `@phlix/ui` and `@phlix/contracts` (private — `github:detain/phlix-ui`, `github:detain/phlix-contracts`)

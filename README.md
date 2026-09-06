# Phlix Windows Desktop App

[![Build](https://github.com/detain/phlix-windows-client/actions/workflows/build.yml/badge.svg)](https://github.com/detain/phlix-windows-client/actions/workflows/build.yml)
[![Test](https://github.com/detain/phlix-windows-client/actions/workflows/test.yml/badge.svg)](https://github.com/detain/phlix-windows-client/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/detain/phlix-windows-client/branch/master/graph/badge.svg)](https://codecov.io/gh/detain/phlix-windows-client)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](.github/workflows/test.yml)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6?logo=windows&logoColor=white)

A native Windows desktop application for the Phlix Media Server, built with Electron, Vue 3, and TypeScript. The user interface is provided by the shared **`@phlix/ui`** Vue app; this repo is a thin Electron shell + consumer.

## Project Overview

Phlix Windows provides a full-featured media server client for Windows, enabling users to browse, stream, and manage their media library with native desktop integration including system tray, media keys, and native menus. The entire renderer UI is the shared `@phlix/ui` app booted via `createPhlixApp(config)`, so screens and theming stay in sync with the other Phlix clients.

## Features

- **Media Library Browser** - Browse and search your media collection (provided by `@phlix/ui`)
- **Video Player** - Full-featured video playback with controls
- **System Tray Integration** - Minimize to tray with media controls
- **Native Menus** - Full application menu with keyboard shortcuts
- **Media Key Support** - Media key support via thumbar buttons and tray/menu keyboard accelerators (Play/Pause, Stop, Rewind/Fast-Forward ±10s bridged into the player)
- **Authentication** - Secure login with session persistence (handled by `@phlix/ui`)
- **Shared UI** - Modern Vue 3 interface from `@phlix/ui` with the Nocturne theme
- **Settings Management** - Configurable preferences including minimize-to-tray behavior
- **Hub Mode** - Connect to a Phlix Hub to manage multiple servers, with support for direct-LAN and relay connection modes

## Minimum Server Version

Phlix Windows requires Phlix Media Server **1.1.0** or later. Key features include skip-intro markers, SyncPlay groups, media facets, and schema-driven settings.

## Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js** >=24.0.0
- **npm** v9.x or later (comes with Node.js)
- **Git** for version control
- **Windows 10/11** as the target platform

For development:
- **Visual Studio Code** (recommended) with extensions:
  - ESLint
  - Prettier
  - TypeScript and related tools

## Installation

1. **Clone the repository**
   ```bash
    git clone https://github.com/detain/phlix-windows-client.git
   cd phlix-windows
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment** (optional)

   Create a `.env` file in the root directory if you need a custom default server URL (used as the
   build-time fallback when no server URL is persisted and Hub mode is not configured):
   ```
   VITE_PHLIX_SERVER_URL=http://localhost:8096
   ```

## Configuration

The application stores configuration in the user's app data directory:
- **Windows**: `%APPDATA%\phlix-windows`

### Configuration Options

| Setting (electron-store key) | Default | Description |
|---------|---------|-------------|
| `minimizeToTray` | `true` | Minimize to system tray instead of closing |
| `serverUrl` | (none) | Persisted direct media server URL (`app:get/set-server-url`) |
| `deviceId` | Auto-generated | Stable per-install device id `windows-<uuid>` (`app:get-device-id`) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PHLIX_SERVER_URL` | (none) | Build-time fallback is empty (user must configure a server or Hub URL at first boot) |
| `NODE_ENV` | `development` | Runtime environment |

Hub mode is configured at runtime (persisted via `hub:set-config` in electron-store), not via an environment variable — see the Hub Mode section below.

## Building the App

### Development Mode

Run the application in development mode with hot reload:

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5173`
- Electron app with automatic reload on changes

### Production Build

**Build both renderer and main process:**
```bash
npm run build
```

**Build only the renderer (Vue app):**
```bash
npm run build:vite
```

**Build only the main process (Electron):**
```bash
npm run build:electron
```

### Packaging

Package the app for Windows distribution:

**NSIS Installer (recommended):**
```bash
npm run package
```

**Windows Store (APPX):**
```bash
npm run package:store
```

The packaged output will be in the `release/` directory.

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Structure

Tests live in `tests/` — run `npm test` to execute the full suite.

### Linting & Typecheck

```bash
# Run ESLint (flat config: eslint.config.mjs)
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Typecheck the renderer (Vue) and the Electron main/preload
npx vue-tsc --noEmit
npx tsc -p tsconfig.main.json --noEmit
```

## Project Structure

```
phlix-windows/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.ts    # Main entry point, window management, IPC, tray
│   ├── preload/        # Preload script (context bridge)
│   │   └── index.ts    # Secure IPC exposure to renderer
│   └── renderer/       # Thin @phlix/ui consumer (no local pages/components/stores)
│       ├── main.ts            # Entry: boot() → createPhlixApp() → mount → installElectronBridge
│       ├── resolveConfig.ts   # Pure app-mode + apiBase resolution (hub vs direct server)
│       ├── electronBridge.ts  # Maps Electron media/window IPC → @phlix/ui player store + router
│       ├── index.html         # Mounts #phlix-app
│       ├── test-setup.ts      # jsdom localStorage mock
│       ├── vite-env.d.ts
│       └── types/electron.d.ts
├── tests/
│   └── unit/           # resolveConfig · electronBridge · main
├── build/              # Build resources (icons)
├── release/            # Packaged application output (gitignored)
├── package.json
├── vite.config.mts
├── vitest.config.mts
├── eslint.config.mjs
└── tsconfig.json
```

## Architecture

### Electron Process Model

1. **Main Process** (`src/main/index.ts`)
   - Creates BrowserWindow
   - Manages system tray and menus
   - Handles IPC from renderer (incl. `app:get-server-url`/`app:set-server-url`/`app:get-device-id`)
   - Manages app lifecycle

2. **Preload Script** (`src/preload/index.ts`)
   - Exposes safe APIs via contextBridge (incl. `getServerUrl`/`setServerUrl`/`getDeviceId`)
   - Provides IPC invoke/send methods
   - Relays media control events to the renderer

3. **Renderer Process** (`src/renderer/`)
   - A thin consumer of the shared `@phlix/ui` Vue app, booted via `createPhlixApp(config)`
   - Vue 3 + Pinia + vue-router (peer deps of `@phlix/ui`)
   - Pinned to `@phlix/ui` `github:detain/phlix-ui#v0.99.1` and `@phlix/contracts` `github:detain/phlix-contracts#v0.4.6`
   - Vite (`@vitejs/plugin-vue`) for development and bundling

### UI & State

All screens, navigation, theming, and state live in the shared **`@phlix/ui`** app (Pinia stores + vue-router). This repo does not define its own pages, components, or stores. Configuration passed to `createPhlixApp` (app-mode, `apiBase`, `deviceHeaders`, theme, branding) is resolved at boot from Electron config; device headers are built with `@phlix/contracts` `buildPhlixHeaders`. Electron tray/menu events are bridged into `@phlix/ui`'s player store and router by `src/renderer/electronBridge.ts`.

## Deployment

### GitHub Actions CI/CD

The project uses GitHub Actions for continuous integration:

- **test.yml** - Runs on every push/PR to validate code
- **build.yml** - Creates releases on tags and publishes packages

> **Note:** For local development use `npm install`. For automated CI pipelines (including the GitHub Actions workflows above), use `npm ci` — it performs a clean, reproducible install from the lockfile, which is faster and safer than `npm install` in CI environments.

### Release Process

1. Update version in `package.json`
2. Create git tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
3. GitHub Actions will automatically:
   - Run ESLint, vue-tsc, tsc -p tsconfig.main.json, vitest, npm audit --audit-level=high, and smoke test before packaging
   - Build the application
   - Create GitHub Release
   - Upload artifacts

### Windows Installer

The build workflow produces:
- **NSIS Installer** - Traditional `.exe` installer
- **APPX Package** - For Windows Store distribution

## Hub Mode

Hub Mode allows you to connect to a Phlix Hub to manage and access multiple Phlix servers through a single interface. This is useful for users with servers in different locations or network environments.

### Features

- **Hub Authentication** - Sign in to your Phlix Hub account
- **Server Switcher** - Quickly switch between your claimed servers
- **Connection Modes**:
  - **Direct** - Connect directly to servers via LAN for lowest latency
  - **Relay** - Route traffic through the hub for remote access
- **Session Persistence** - Hub session persists across app restarts

### Configuration

Hub configuration is persisted at runtime in electron-store (via the `hub:set-config` IPC) — there is
no environment variable for it. At boot, `resolveAppConfig` runs the app in **hub mode** (against
`hub.hubUrl`) whenever a Hub URL is configured and the connection mode is not explicitly `direct`;
otherwise it runs in **server mode** against the persisted direct server URL.

#### In-App Configuration
1. Open Settings
2. Navigate to Hub Mode section
3. Enter your Hub URL
4. Sign in with your Hub credentials
5. Select a server from your claimed servers list
6. Choose connection mode (Direct or Relay)

### Connection Flow

1. User configures Hub URL and signs in; the choice is persisted via `hub:set-config`
2. On next boot, `resolveAppConfig` selects hub vs direct server mode and the `apiBase`
3. App fetches the list of claimed servers from the Hub (via `@phlix/ui`)
4. API calls route through direct-LAN or hub-relay based on the chosen mode
5. Active server and connection mode persist across sessions

## Troubleshooting

### Common Issues

**App doesn't start:**
- Ensure Node.js 18+ is installed
- Run `npm install` to install dependencies
- Check console for error messages

**Vite server port conflict:**
- Kill processes using port 5173
- Modify `vite.config.mts` to use a different port

**Build fails with native modules:**
- Run `npm rebuild` to rebuild native dependencies
- Ensure electron-builder is up to date

### Logs

Application logs are stored in:
- **Windows**: `%APPDATA%\phlix-windows\logs\`

Use `electron-log` for runtime logging:
```typescript
import log from 'electron-log';
log.info('Application started');
```

## License

MIT License - see project repository for details.

## Status

### What Works

- **Electron shell** — Main/preload/renderer architecture with secure `contextBridge` IPC
- **Thin renderer** — Boots `@phlix/ui` via `createPhlixApp()`; no local UI ownship
- **System tray** — Minimize-to-tray, tray menu with media controls
- **Native menus** — Full File/Playback/View/Help menu bar with keyboard accelerators
- **Media keys** — Thumbar buttons and tray/menu keyboard accelerators (Play/Pause, Stop, Rewind/Forward ±10s)
- **Hub Mode** — Connect to a Phlix Hub; direct-LAN and relay connection modes
- **Packaging** — NSIS x64 installer and APPX via `electron-builder`
- **CI pipeline** — ESLint, vue-tsc, tsc -p tsconfig.main.json, vitest, npm audit, smoke test gate on every PR/push
- **Coverage** — Reports generated and uploaded to Codecov and Codacy on each CI run

### Known Limitations

- App boots to Connect screen on first launch (no default server URL; user must configure a server or Hub)
- Offline Downloads and realtime SyncPlay UIs are temporarily dropped (to be re-added as shared `@phlix/ui` seams)

## Support

For issues and feature requests, please use the GitHub issue tracker.

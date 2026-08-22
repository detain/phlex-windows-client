/**
 * Phlix Media Server Client for Windows.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import type { MenuItem } from '@phlix/ui';
import type { RouteRecordRaw } from 'vue-router';
import {
  createPhlixApp,
  buildAdminRoutes,
  buildHubAdminRoutes,
  LibraryScanPage,
  MyServersPage,
  FederationPage,
  ManageSharesPage,
  SharedWithMePage,
  InviteLinksPage,
  AcceptInvitePage,
  FederationSharesPage,
  ServerDetailPage
} from '@phlix/ui';
import { buildPhlixHeaders } from '@phlix/contracts';
import '@phlix/ui/style.css';
import '@phlix/ui/fonts.css';
import { resolveAppConfig } from './resolveConfig';
import log from 'electron-log';
import { installElectronBridge } from './electronBridge';
import { setupMediaSession } from './mediaSession';

/** Module-level cleanup references — cleared after each run to support re-boot. */
let _cleanupBridge: (() => void) | null = null;
let _cleanupDeeplink: (() => void) | null = null;
let _cleanupMediaSession: (() => void) | null = null;

/**
 * Runs all registered renderer teardown functions (bridge, deeplink listeners).
 * Safe to call multiple times; each cleanup is nullified after running.
 */
function cleanupRenderer(): void {
  _cleanupBridge?.();
  _cleanupBridge = null;
  _cleanupDeeplink?.();
  _cleanupDeeplink = null;
  _cleanupMediaSession?.();
  _cleanupMediaSession = null;
}

/**
 * Top-bar nav for the current app mode. Mirrors the server and hub web-uis so the
 * desktop client gets the same surfaces — crucially the gated "Admin" entry,
 * which the shell shows only for an authenticated admin (`useAuthStore().isAdmin`).
 * Without a supplied `menu` the shell renders NO nav at all (no Browse/Admin), so
 * this is what makes the admin section reachable in the Windows client.
 */
export function buildMenu(appMode: 'server' | 'hub'): MenuItem[] {
  if (appMode === 'hub') {
    return [
      { id: 'my-servers', label: 'My Servers', to: '/app/servers' },
      { id: 'federation', label: 'Federation', to: '/app/federation' },
      { id: 'manage-shares', label: 'Shares', to: '/app/shares' },
      { id: 'shared-with-me', label: 'Shared with Me', to: '/app/shared' },
      { id: 'invite-links', label: 'Invite Links', to: '/app/invites' },
      { id: 'history', label: 'Watch History', to: '/app/history' },
      { id: 'explore', label: 'Explore', to: '/app/explore' },
      { id: 'recommendations', label: 'Recommendations', to: '/app/recommendations' },
      { id: 'admin', label: 'Admin', to: '/app/admin/dashboard', requiresAdmin: true }
    ];
  }
  // Server mode: mirrors web-ui/src/main.ts:30-77 entry for entry.
  // `libraryLinks` expands Browse into one nav link per library (fetched from
  // /api/v1/libraries), matching the per-library Browse sections.
  // `requiresLibraryType` hides each media-type entry unless a library of that
  // type exists — fail-closed while the library list is still loading.
  return [
    { id: 'browse', label: 'Browse', to: '/app', libraryLinks: true },
    { id: 'music', label: 'Music', to: '/app/music', requiresLibraryType: 'music' },
    { id: 'books', label: 'Books', to: '/app/books', requiresLibraryType: 'book' },
    { id: 'audiobooks', label: 'Audiobooks', to: '/app/audiobooks', requiresLibraryType: 'audiobook' },
    { id: 'photos', label: 'Photos', to: '/app/photo/albums', requiresLibraryType: 'photo' },
    { id: 'search', label: 'Search', to: '/app/search' },
    { id: 'history', label: 'Watch History', to: '/app/history' },
    { id: 'explore', label: 'Explore', to: '/app/explore' },
    { id: 'recommendations', label: 'Recommendations', to: '/app/recommendations' },
    { id: 'settings', label: 'Settings', to: '/app/settings' },
    { id: 'admin', label: 'Admin', to: '/app/admin/dashboard', requiresAdmin: true }
  ];
}

/**
 * Extra routes for the current app mode: the shared admin section (`/app/admin/*`,
 * reachable via the gated "Admin" nav entry) plus mode-specific pages. In hub mode
 * this includes MyServersPage (`/app/servers`), ServerDetailPage (`/app/server/:id`),
 * FederationPage (`/app/federation`), FederationSharesPage (`/app/federation/shares`),
 * ManageSharesPage (`/app/shares`), SharedWithMePage (`/app/shared`), InviteLinksPage
 * (`/app/invites`), AcceptInvitePage (`/app/accept-invite` — deep-link only, no nav entry),
 * and the hub-admin section. Server mode adds LibraryScanPage.
 * Mirrors the server/hub web-uis. Routes carry the full `/app` prefix (history base is '/').
 */
export function buildExtraRoutes(appMode: 'server' | 'hub'): RouteRecordRaw[] {
  if (appMode === 'hub') {
    return [
      { path: '/app/servers', name: 'my-servers', component: MyServersPage },
      { path: '/app/server/:id', name: 'server-detail', component: ServerDetailPage },
      { path: '/app/federation', name: 'federation', component: FederationPage },
      { path: '/app/federation/shares', name: 'federation-shares', component: FederationSharesPage },
      { path: '/app/shares', name: 'manage-shares', component: ManageSharesPage },
      { path: '/app/shared', name: 'shared-with-me', component: SharedWithMePage },
      { path: '/app/invites', name: 'invite-links', component: InviteLinksPage },
      { path: '/app/accept-invite', name: 'accept-invite', component: AcceptInvitePage },
      ...buildHubAdminRoutes()
    ];
  }
  return [
    ...buildAdminRoutes(),
    { path: '/app/library/scan', name: 'library-scan', component: LibraryScanPage }
  ];
}

export async function boot(): Promise<void> {
  const api = window.electronAPI;

  // Deep link queue: stores URLs that arrived before router was ready
  const deeplinkQueue: string[] = [];

  // Read Electron-persisted config defensively so the renderer still boots in a
  // plain browser dev context where window.electronAPI is undefined.
  // Parallelize three independent IPC calls to minimize first-paint latency.
  // Running them concurrently vs sequentially shaves ~2/3 of the IPC round-trip time.
  // Why Promise.all instead of Promise.allSettled: these three IPC calls are all
  // required for a meaningful boot. hubGetConfig, deviceId, and serverUrl must all
  // succeed — if any one of them fails there is no point painting the UI (no server to
  // talk to, no device identity, etc.). This is a deliberate fail-fast design: one
  // broken dependency aborts the entire boot rather than silently painting a broken
  // state. The three calls are independent, so Promise.all parallelizes them optimally.
  const bootStart = performance.now();
  const [hubResult, deviceIdResult, serverUrlResult] = api
    ? await Promise.all([
        api.hubGetConfig(),
        api.getDeviceId(),
        api.getServerUrl()
      ])
    : [null, null, null];
  const bootEnd = performance.now();
  log.info(`[Boot] IPC parallelization: first paint data loaded in ${(bootEnd - bootStart).toFixed(1)}ms`);

  const hub = hubResult;
  const deviceId =
    deviceIdResult ??
    (() => {
      const fallbackId = `browser-${crypto.randomUUID()}`;
      log.warn('[Phlix] Electron bridge unavailable — using per-session device ID:', fallbackId);
      return fallbackId;
    })();
  const serverUrl = serverUrlResult;
  const envUrl = import.meta.env.VITE_PHLIX_SERVER_URL ?? null;

  const { app: appMode, apiBase } = resolveAppConfig({ hub, serverUrl, envUrl });

  // W7.6: Enforce minimum server version (1.1.0) before mounting the renderer.
  // Design decision: fail-open for unknown servers. Pre-1.1.0 servers that don't
  // implement the /api/v1/server/version endpoint may still work for basic features.
  // Logging a warning and allowing boot to continue is the pragmatic choice — the
  // alternative (blocking boot on an unknown server) would break existing deployments.
  if (api) {
    const versionOk = await api.checkServerVersion(apiBase);
    if (!versionOk) {
      // Server version is too low — the main process has already logged a descriptive error.
      // Abort the boot rather than showing a broken UI to the user.
      log.error('[Boot] Server version check failed — aborting boot');
      return;
    }
  }

  const deviceHeaders = buildPhlixHeaders({
    deviceId,
    deviceName: 'Phlix for Windows',
    deviceType: 'windows'
  });

  const isHub = appMode === 'hub';

  const app = createPhlixApp({
    app: appMode,
    apiBase,
    // This desktop app ships with no server baked in. When `apiBase` is empty
    // (nothing persisted/seeded yet) @phlix/ui routes to its first-run Connect
    // screen instead of showing a login form aimed at nothing. Mirror the chosen
    // URL back into Electron-store so resolveAppConfig re-seeds it next launch.
    requireConnection: true,
    onConnectionChange: (url) => {
      if (api) {
        void api.setServerUrl(url ?? '');
      } else {
        log.warn('[Phlix] Cannot persist server URL: Electron bridge unavailable, URL was:', url);
      }
    },
    // In hub mode, land on the servers directory (not the media-server Browse page,
    // whose server-only endpoints 404 on the hub) and skip continue-watching.
    ...(isHub ? { home: '/app/servers', features: { resumeSync: false } } : {}),
    // Top-bar nav (incl. the admin-gated "Admin" entry) + the admin section / mode
    // pages, mirroring the server & hub web-uis.
    menu: buildMenu(appMode),
    extraRoutes: buildExtraRoutes(appMode),
    deviceHeaders,
    defaultTheme: 'nocturne',
    branding: { wordmark: 'Phlix' }
  });

  app.mount('#phlix-app');

  // Wire Electron media events to @phlix/ui player store
  _cleanupBridge = installElectronBridge(app);

  // W4.5: Set up navigator.mediaSession for SMTC integration
  _cleanupMediaSession = setupMediaSession();

  // Expose phlix-ui router so overlay components can subscribe to navigation events
  // This is consumed by PlayerSupplement to detect player route changes without polling
  const phlixRouter = app.config?.globalProperties?.$router;
  if (phlixRouter) {
    Object.defineProperty(window, '__phlixRouter', {
      value: phlixRouter,
      writable: false,
      configurable: true
    });
  }

  // Flush deep link queue once router is ready
  const router = app.config?.globalProperties?.$router as { isReady?: () => Promise<void>; push: (to: string) => unknown } | undefined;
  if (router) {
    if (router.isReady) {
      router.isReady().then(() => {
        for (const path of deeplinkQueue) {
          router.push(path);
        }
        deeplinkQueue.length = 0;
      });
    }
  }

  // Listen for deep links from main process (W4.4)
  if (api && api.onDeeplink) {
    _cleanupDeeplink = api.onDeeplink((path: string) => {
      if (router && router.isReady && router.push) {
        router.isReady().then(() => {
          router.push(path);
        });
      } else {
        deeplinkQueue.push(path);
      }
    });
  }

  // Mount Vue overlay for P3-S4 player UX features (skip/sleep/PiP)
  // Imported dynamically after Vue app mounts so Pinia is active
  void import('./overlay');

  // HMR dispose hook: clean up all renderer resources before Vite replaces the module
  import.meta.hot?.dispose(() => {
    cleanupRenderer();
  });

  // beforeunload cleanup: mirrors HMR dispose for non-HMR page refreshes/navigation
  // Guard with typeof to support test environments (jsdom) that don't provide addEventListener
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
      cleanupRenderer();
    });
  }
}

// Auto-boot only when the mount target exists. Unit tests import this module for
// buildMenu/buildExtraRoutes; running boot() there would mount into a nonexistent
// element and leave async work (e.g. the dynamic overlay import) that resolves
// after the test environment is torn down.
if (typeof document !== 'undefined' && document.getElementById('phlix-app')) {
  void boot();
}

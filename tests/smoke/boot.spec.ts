/**
 * Boot smoke test — spawns Electron as a detached child process, then attaches
 * via Playwright's CDP (Chrome DevTools Protocol) connection.
 *
 * This bypasses Playwright's built-in Electron launcher entirely, which avoids
 * the per-run Electron binary download that was eating into the firstWindow()
 * timeout budget.
 *
 * On Linux, wraps Electron with xvfb-run to provide a virtual display for
 * headless CI environments.
 *
 * Guards against:
 * - W0.1: window.electronAPI not defined (preload script failed to load)
 * - W0.3: device ID hardcoded as 'windows-dev' instead of a real UUID
 * - W0.4: renderer not navigating to /app/* route
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { test, expect, chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const ELECTRON_PORT = 9222;
// Electron binds the CDP endpoint to 127.0.0.1 (IPv4) only. Using "localhost"
// makes Playwright resolve to ::1 first on CI and fail with ECONNREFUSED, so pin
// both sides to IPv4 explicitly.
const ELECTRON_HOST = '127.0.0.1';

/**
 * Kill the Electron process AND its process group.
 *
 * The child is spawned with `detached: true`, so it leads its own process group
 * (xvfb-run → Xvfb → Electron → renderer/gpu children). Killing just the direct
 * child leaves Electron running orphaned — it keeps the single-instance lock and
 * holds port 9222, which makes subsequent smoke runs fail to bind. On POSIX,
 * signal the negative PID (the group); on Windows fall back to the plain kill.
 */
function killElectronProcess(proc: ChildProcess): void {
  if (!proc.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-proc.pid, 'SIGTERM');
      return;
    } catch {
      // Group kill failed — fall through to a direct kill.
    }
  }
  proc.kill();
}

test('boot smoke test', async () => {
  // Path to the compiled main process entry
  const distMainPath = path.resolve(__dirname, '../../dist/main/index.js');

  // Build the spawn command based on platform
  // Windows: use electron.cmd directly
  // Linux: wrap with xvfb-run to provide virtual display in headless CI
  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  const electronArgs = [
    distMainPath,
    `--disable-gpu`,
    `--no-sandbox`,
    `--remote-debugging-address=${ELECTRON_HOST}`,
    `--remote-debugging-port=${ELECTRON_PORT}`,
  ];

  let spawnCmd: string;
  let spawnArgs: string[];

  if (isLinux) {
    // On Linux, use xvfb-run to provide a virtual X server display
    spawnCmd = 'xvfb-run';
    spawnArgs = [
      '--auto-servernum',
      '--server-args=-screen 0 1280x720x24',
      'electron',
      ...electronArgs,
    ];
  } else {
    // Windows npm creates electron.cmd, not electron
    spawnCmd = isWindows ? 'electron.cmd' : 'electron';
    spawnArgs = electronArgs;
  }

  const electronProcess = spawn(
    spawnCmd,
    spawnArgs,
    {
      detached: true,
      stdio: 'ignore',
      shell: isWindows,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Force production mode so the renderer is served from dist/ via the
        // app:// protocol instead of dev mode (which opens DevTools and tries to
        // load the Vite dev server). ELECTRON_DISABLE_GPU avoids GPU-process
        // crashes under xvfb. DISPLAY is intentionally omitted: xvfb-run sets it
        // for the Electron child.
        PHLIX_FORCE_PRODUCTION: '1',
        ELECTRON_DISABLE_GPU: '1',
      },
    }
  );

  // Prevent the child process from keeping the parent alive
  electronProcess.unref();

  // Give Electron time to start before attempting CDP connection
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  if (electronProcess.exitCode !== null) {
    killElectronProcess(electronProcess);
    throw new Error(`Electron process exited early with code ${electronProcess.exitCode}`);
  }

  // Attach Playwright to the running Electron instance via CDP
  let browser;
  try {
    browser = await chromium.connectOverCDP(
      `http://${ELECTRON_HOST}:${ELECTRON_PORT}`,
      { timeout: 30_000 }
    );
  } catch (connectError) {
    killElectronProcess(electronProcess);
    throw new Error(
      `Failed to connect to Electron via CDP: ${connectError}`
    );
  }

  // Get or create the first browser context and its pages
  let context = browser.contexts()[0];
  if (!context) {
    context = await browser.newContext();
  }

  const pages = context.pages();
  const window = pages[0];

  if (!window) {
    await browser.close();
    killElectronProcess(electronProcess);
    throw new Error('No window found in Electron CDP session');
  }

  // --- W0.1 guard: preload script must have loaded, exposing window.electronAPI ---
  const electronAPI = await window.evaluate(() => (globalThis as unknown as Window).electronAPI);
  expect(electronAPI).toBeDefined();

  // --- W0.3 guard: device ID must NOT be the dev fallback 'windows-dev' ---
  const deviceId = await window.evaluate(
    () => (globalThis as unknown as Window).electronAPI!.getDeviceId()
  );
  expect(deviceId).not.toBe('windows-dev');

  // --- W0.4 guard: renderer must have navigated to a /app/* route ---
  const pageUrl = window.url();
  const url = new URL(pageUrl);
  expect(url.pathname).toMatch(/^\/app/);

  // --- Console cleanliness: zero CSP violations and zero preload errors ---
  const consoleViolations: string[] = [];
  const page = window;
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        text.includes('Content Security Policy') ||
        text.includes('Unable to load preload script')
      ) {
        consoleViolations.push(text);
      }
    }
  });

  await page.waitForTimeout(2000);
  expect(
    consoleViolations,
    `Console violations found: ${JSON.stringify(consoleViolations)}`
  ).toHaveLength(0);

  await browser.close();

  // Clean up the Electron process (and its whole process group)
  killElectronProcess(electronProcess);
});

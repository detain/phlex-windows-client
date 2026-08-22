/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(__dirname, '../..');

describe('notification IPC', () => {
  // Normalize line endings: on Windows checkouts the source files carry CRLF,
  // which breaks the multi-line regexes below (\n vs \r\n).
  const mainSource = readFileSync(resolve(PROJECT_ROOT, 'src/main/index.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const preloadSource = readFileSync(resolve(PROJECT_ROOT, 'src/preload/index.ts'), 'utf-8').replace(/\r\n/g, '\n');

  it('notification:show handler checks Notification.isSupported()', () => {
    expect(mainSource).toMatch(/Notification\.isSupported\(\)/);
  });

  it('notification:show handler checks notificationsEnabled store preference', () => {
    expect(mainSource).toMatch(/notificationsEnabled/);
  });

  it('notification:show handler creates new Notification with title and body', () => {
    expect(mainSource).toMatch(/new Notification\(\{ title, body \}\)/);
  });

  it('notification onClick focuses mainWindow', () => {
    expect(mainSource).toMatch(/mainWindow\?\.show\(\)/);
    expect(mainSource).toMatch(/mainWindow\?\.focus\(\)/);
  });

  it('notification click routes via handleDeepLinkUrl with phlix://internal prefix', () => {
    expect(mainSource).toMatch(/handleDeepLinkUrl\(`phlix:\/\/internal\$\{clickAction\}`\)/);
  });

  it('parseDeepLinkUrl accepts phlix://internal paths and returns the path', () => {
    expect(mainSource).toMatch(/host\s*===\s*'internal'/);
    expect(mainSource).toMatch(/return\s+path\s*;/);
  });

  it('preload exposes showNotification via ipcRenderer.invoke', () => {
    expect(preloadSource).toMatch(/showNotification.*\n.*ipcRenderer\.invoke/);
  });

  it('showNotification accepts title, body, and optional clickAction', () => {
    expect(preloadSource).toMatch(/title: string,\s*body: string,\s*clickAction\?: string/);
  });
});

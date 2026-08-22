import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Using relative path because @ alias points to src/renderer/, not src/main/
import { parseServerVersion, checkMinServerVersion, MIN_SERVER_VERSION } from '../../src/main/versionCheck';
import log from 'electron-log';

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('parseServerVersion', () => {
  it('parses "1.2.3" correctly', () => {
    const result = parseServerVersion('1.2.3');
    expect(result).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses "1.1.0" correctly', () => {
    const result = parseServerVersion('1.1.0');
    expect(result).toEqual({ major: 1, minor: 1, patch: 0 });
  });

  it('parses "0.9.0" correctly', () => {
    const result = parseServerVersion('0.9.0');
    expect(result).toEqual({ major: 0, minor: 9, patch: 0 });
  });

  it('parses "10.20.30" correctly', () => {
    const result = parseServerVersion('10.20.30');
    expect(result).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('returns null for malformed version strings', () => {
    expect(parseServerVersion('1.2')).toBeNull();
    expect(parseServerVersion('1')).toBeNull();
    expect(parseServerVersion('v1.2.3')).toBeNull();
    expect(parseServerVersion('1.2.3.4')).toBeNull();
    expect(parseServerVersion('')).toBeNull();
    expect(parseServerVersion('abc')).toBeNull();
  });

  it('returns null for non-string inputs', () => {
    expect(parseServerVersion(null as unknown as string)).toBeNull();
    expect(parseServerVersion(undefined as unknown as string)).toBeNull();
    expect(parseServerVersion(123 as unknown as string)).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    const result = parseServerVersion('  1.2.3  ');
    expect(result).toEqual({ major: 1, minor: 2, patch: 3 });
  });
});

describe('checkMinServerVersion', () => {
  const { fetch } = window;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    (window as unknown as { fetch: typeof fetch }).fetch = fetchSpy;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (window as unknown as { fetch: typeof fetch }).fetch = fetch;
  });

  it('returns true (skip check) when apiBase is empty string', async () => {
    const result = await checkMinServerVersion('');
    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns true when server version is 1.2.3 (above minimum 1.1.0)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '1.2.3' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
  });

  it('returns true when server version is exactly 1.1.0', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '1.1.0' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
  });

  it('returns false when server version is 0.9.0 (below minimum 1.1.0)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.9.0' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      '[versionCheck] Server version 0.9.0 is below minimum supported 1.1.0 — blocking boot'
    );
  });

  it('returns false when server version is 1.0.9 (below minimum 1.1.0)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '1.0.9' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(false);
  });

  it('returns true when server version is 2.0.0 (major version above minimum)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '2.0.0' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
  });

  it('returns true (fail-open) on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not reach version endpoint')
    );
  });

  it('returns true (fail-open) on HTTP error (404, 500, etc.)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 404')
    );
  });

  it('returns true (fail-open) when response has no version field', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      '[versionCheck] Server response missing version field — allowing boot to continue'
    );
  });

  it('returns true (fail-open) when response has malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('parse error'); }
    } as unknown as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      '[versionCheck] Server returned non-JSON response for version endpoint — allowing boot to continue'
    );
  });

  it('returns true (fail-open) when version field is empty string', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '' })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      '[versionCheck] Server response missing version field — allowing boot to continue'
    );
  });

  it('handles version nested under "data" field', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { version: '1.2.3' } })
    } as Response);

    const result = await checkMinServerVersion('http://localhost:8096');
    expect(result).toBe(true);
  });

  it('strips trailing slash from apiBase before building URL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '1.1.0' })
    } as Response);

    await checkMinServerVersion('http://localhost:8096/');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8096/api/v1/server/version',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('respects the MIN_SERVER_VERSION constant', () => {
    expect(MIN_SERVER_VERSION).toBe('1.1.0');
  });
});

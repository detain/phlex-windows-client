/**
 * W5.5 Verification: Confirm unbounded list fetches are gone
 *
 * This test verifies:
 * 1. MusicScreen.tsx and MusicAlbumScreen.tsx were deleted (W2.5)
 * 2. No remaining unbounded music/artists or music/albums fetches in src/
 * 3. No remaining references to MusicScreen or MusicAlbumScreen
 * 4. @phlix/ui MusicLibraryPage uses limit/offset paging
 *
 * Implemented with fs + regex instead of grep/pipe shell commands so the
 * checks run identically on Linux and Windows (the POSIX shell syntax is not
 * portable to cmd.exe).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

/** Recursively collect all file paths under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Lines in a file matching the regex, split tolerantly to LF/CRLF. */
function matchingLines(file: string, re: RegExp): string[] {
  const content = fs.readFileSync(file, 'utf-8');
  return content.split(/\r?\n/).filter((line) => re.test(line));
}

describe('W5.5: Unbounded list fetch cleanup', () => {
  it('src/screens/ directory does not exist (screens were deleted)', () => {
    expect(fs.existsSync(path.join(SRC, 'screens'))).toBe(false);
  });

  it('no music/artists or music/albums fetches in src/', () => {
    const hits = walk(SRC)
      .flatMap((file) => matchingLines(file, /music\/artists|music\/albums/))
      .map((line) => line.trim());
    expect(hits).toEqual([]);
  });

  it('no MusicScreen or MusicAlbumScreen references in src/', () => {
    const hits = walk(SRC)
      .flatMap((file) => matchingLines(file, /MusicScreen|MusicAlbumScreen/))
      .map((line) => line.trim());
    expect(hits).toEqual([]);
  });

  it('no unbounded fetch or apiClient calls without limit in src/', () => {
    // Mirror grep -rn's `path:line:content` output so the exclusions below
    // match the same strings the original shell pipeline filtered on.
    const hits = walk(SRC)
      .flatMap((file) =>
        matchingLines(file, /fetch\(|apiClient\./)
          .map((line) => `${path.relative(ROOT, file)}:${line}`)
      )
      .filter((entry) => !entry.includes('limit'))
      .filter((entry) => !entry.includes('node_modules'))
      .filter((entry) => !entry.includes('src/main/versionCheck'))
      .map((entry) => entry.trim());
    expect(hits).toEqual([]);
  });

  it('@phlix/ui MusicLibraryPage has limit/offset/paging support', () => {
    const distDir = path.join(ROOT, 'node_modules', '@phlix', 'ui', 'dist');
    const pageFiles = fs
      .readdirSync(distDir)
      .filter((name) => /MusicLibraryPage-.*\.js$/.test(name));
    expect(pageFiles.length).toBeGreaterThan(0);

    const content = pageFiles
      .map((name) => fs.readFileSync(path.join(distDir, name), 'utf-8'))
      .join('\n');

    for (const token of ['limit', 'offset', 'page']) {
      expect(content).toContain(token);
    }
  });
});
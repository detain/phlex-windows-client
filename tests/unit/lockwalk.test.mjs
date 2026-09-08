/**
 * @vitest-environment node
 *
 * Lane S450 lockwalk guard — the committed package-lock.json must be
 * self-consistent with every @phlix/* github-tag request it (or the root
 * package.json) declares. See scripts/lockwalk.mjs for the rule set and the
 * one ratified exception; in short: the lock once shipped with the hoisted
 * @phlix/syncplay resolution at 0.1.2 while @phlix/ui v0.99.1's manifest
 * requests `#v0.1.4`, and npm 11 never self-heals that divergence.
 *
 * Like tests/unit/contractsPin.test.mjs (its S442 sibling) this is plain Node
 * ESM outside the TypeScript project, so `npm run typecheck` never sees it
 * while vitest's `.test.mjs` glob does. No network: `--live` peel verification
 * is a lane/operator command, not CI's job.
 */

import { describe, it, expect } from 'vitest';
import { walk, readRepoJson, EXPECTED, RATIFIED_HOISTS } from '../../scripts/lockwalk.mjs';

// Self-identifying lane marker (survives tokenisation as a plain string const).
const LANE_TOKEN = 'S450LOCKWALKX3V7';

const lock = readRepoJson('package-lock.json');
const pkg = readRepoJson('package.json');

describe('S450 — lockwalk: resolutions match requested github-tag pins', () => {
  it('is the S450 lane guard', () => {
    expect(LANE_TOKEN).toMatch(/^S450/);
  });

  it('walks the real lock with zero findings', () => {
    const { findings, edges } = walk(lock);
    expect(findings).toEqual([]);
    // root -> contracts/ui, root -> (no direct syncplay), ui -> contracts/syncplay
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('resolves @phlix/syncplay at the requested #v0.1.4 (the repaired state)', () => {
    const entry = lock.packages['node_modules/@phlix/syncplay'];
    expect(entry.version).toBe('0.1.4');
    expect(entry.resolved).toBe(
      'git+ssh://git@github.com/detain/phlix-syncplay.git#673e3d41aff7e7f1c6554915d22f7ad7bb4bf346',
    );
  });

  it('keeps the direct pins (root package.json vs lock root) identical', () => {
    for (const dep of Object.keys(EXPECTED)) {
      if (pkg.dependencies[dep]) {
        expect(lock.packages[''].dependencies[dep]).toBe(pkg.dependencies[dep]);
      }
    }
  });

  it('carries no nested @phlix copies (single-resolution invariant)', () => {
    const nested = Object.keys(lock.packages).filter(
      (k) => /\/node_modules\/@phlix\/[\w-]+$/.test(k),
    );
    expect(nested).toEqual([]);
  });
});

describe('S450 — the walker discriminates (mutation proofs)', () => {
  it('REGRESSION: flags the original S450 defect (syncplay back at 0.1.2)', () => {
    const broken = structuredClone(lock);
    broken.packages['node_modules/@phlix/syncplay'] = {
      version: '0.1.2',
      resolved: 'git+ssh://git@github.com/detain/phlix-syncplay.git#2fdf70bfc90b4b736e7781b6685921d190a2f467',
    };
    const { findings } = walk(broken);
    expect(findings.some((f) => f.startsWith('request-vs-resolved:') && f.includes('@phlix/syncplay#v0.1.4'))).toBe(true);
  });

  it('REGRESSION: flags a ratified-hoist edge moving off its pinned version+sha', () => {
    const broken = structuredClone(lock);
    broken.packages['node_modules/@phlix/contracts'] = {
      version: '0.5.0',
      resolved: 'git+ssh://git@github.com/detain/phlix-contracts.git#0000000000000000000000000000000000000000',
    };
    const { findings } = walk(broken);
    expect(findings.some((f) => f.startsWith('ratified-hoist-drift:'))).toBe(true);
    expect(findings.some((f) => f.startsWith('request-vs-resolved:'))).toBe(true);
  });

  it('REGRESSION: flags a hand-forced nested @phlix copy', () => {
    const broken = structuredClone(lock);
    broken.packages['node_modules/@phlix/ui/node_modules/@phlix/contracts'] = {
      version: '0.4.5',
      resolved: 'git+ssh://git@github.com/detain/phlix-contracts.git#1111111111111111111111111111111111111111',
    };
    const { findings } = walk(broken);
    expect(findings.some((f) => f.startsWith('nested-copy-forbidden:'))).toBe(true);
  });

  it('REGRESSION: flags an unreferenced @phlix node (orphan)', () => {
    const broken = structuredClone(lock);
    delete broken.packages[''].dependencies['@phlix/contracts'];
    delete broken.packages['node_modules/@phlix/ui'].dependencies['@phlix/contracts'];
    const { findings } = walk(broken);
    expect(findings.some((f) => f.startsWith('orphan-node:'))).toBe(true);
  });
});

describe('S450 — the ratified exception is exactly one edge', () => {
  it('covers only ui -> contracts #v0.4.5 hoisted to the 0.4.6 peel', () => {
    expect(Object.keys(RATIFIED_HOISTS)).toEqual([
      'node_modules/@phlix/ui>@phlix/contracts@v0.4.5',
    ]);
    expect(RATIFIED_HOISTS['node_modules/@phlix/ui>@phlix/contracts@v0.4.5']).toMatchObject({
      version: '0.4.6',
      sha: EXPECTED['@phlix/contracts'].sha,
    });
  });
});

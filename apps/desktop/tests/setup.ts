/**
 * Point the whole test run at a throwaway library.
 *
 * `store.ts` reads `DATA_DIR` once, when it is imported. A test that sets the
 * override itself is therefore only safe while it happens to be the first file
 * to pull that module in — and when it is not, the suite reads and writes the
 * owner's real books under `~/Library/Application Support/Cairn/`.
 *
 * Setting it here, before any test module loads, makes the order irrelevant.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.CAIRN_DATA_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-test-'));
  process.env.CAIRN_DATA_DIR = dir;
  // Cleaning up belongs here rather than in a test file: every file shares this
  // directory now, so one removing it in `afterAll` would delete another's fixtures.
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
}

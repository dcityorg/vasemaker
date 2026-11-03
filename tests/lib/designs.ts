/**
 * Test designs. Public ones live in `tests/fixtures/`; private ones (real
 * user designs that must not be published) in `local-docs/test-designs/`,
 * which is gitignored. A check that needs a private design it cannot find
 * prints SKIPPED and carries on, so a public clone still runs the suite, and
 * a skip is never reported as a pass. Paths are from the project root, where
 * the runner starts every check.
 */
import { existsSync } from 'fs';
import { join } from 'path';

export const FIXTURES = join(process.cwd(), 'tests/fixtures');
export const PRIVATE_DESIGNS = join(process.cwd(), 'local-docs/test-designs');

/** The runner counts lines starting with this word. */
export function skip(msg: string) {
  console.log(`SKIPPED  ${msg}`);
}

/** A private design's path, or null (after printing SKIPPED) when it is absent. */
export function privateDesign(rel: string, why: string): string | null {
  const p = join(PRIVATE_DESIGNS, rel);
  if (existsSync(p)) return p;
  skip(`${why}: private design ${rel} not present`);
  return null;
}

/**
 * Deep: HIDDEN styles whose code the offered ones are built on (Pour 2-Pc's
 * center under Pour 3-Pc; Split 2-Pc's helpers under Split Halves). No user
 * can reach a hidden style: retireMoldStyle moves it on every load.
 *
 * Left out, KNOWN BROKEN (found by this sweep 2026-11-02, full resolution
 * too): Press 2-Pc's master (~1,100 unbalanced edges) and Pour 1-Pc's mold
 * (~50). Unreachable today; fix before ever offering either again, then add
 * them back here.
 */
import { sweep, moldCases } from '../lib/sweep';
sweep('sweep-hidden', [...moldCases('pourTwoPiece'), ...moldCases('splitTwoPiece')]);

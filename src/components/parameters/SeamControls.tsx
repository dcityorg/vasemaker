'use client';

/**
 * Seam lines and the sprig's snap buttons (Gary, 2026-11-09). A sprig on a
 * Split Halves or Split Thirds mold releases when it is centred on a piece or
 * sits across a seam, and locks in between (verify-vase-sprig F), so the Vase
 * and Sprig pages can show where that mold's seams fall and put the sprig on
 * one of those spots exactly. The Seam Angle is the Mold page's, per style.
 */

import { useSeamsView, setSeamsView, type SeamsView } from '@/store/view-prefs';
import { useSeamAngle } from '@/hooks/use-seam-angle';
import { seamAngles, pieceCentreAngles, nearestAngle } from '@/engine/mold/seams';

const SEAM_LABELS: Record<Exclude<SeamsView, 'off'>, string> = { halves: 'Split Halves', thirds: 'Split Thirds' };

/** View → Display: Seams Off / Halves / Thirds. */
export function SeamsSelect() {
  const seams = useSeamsView();
  return (
    <div className="flex items-center gap-2 mb-2"
      title="Lines where a Split Halves or Split Thirds mold divides the vase (solid: the seams; dashed: the middle of each piece), at the Seam Angle set for that style on the Mold page. A sprig releases best centred on a piece or across a seam">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Seams</label>
      <select value={seams} onChange={(e) => setSeamsView(e.target.value as SeamsView)}
        className="flex-1 min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-primary)]">
        <option value="off">Off</option>
        <option value="halves">Split Halves</option>
        <option value="thirds">Split Thirds</option>
      </select>
    </div>
  );
}

const snapBtn = 'flex-1 px-2 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors';

/** Under a sprig's Around slider: move it to the nearest piece centre or seam. */
export function SeamSnap({ angle, onSnap }: { angle: number; onSnap: (angle: number) => void }) {
  const seams = useSeamsView();
  if (seams === 'off') {
    return (
      <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2 opacity-70">
        Turn on Seams (View → Display) to line it up with a split mold&apos;s pieces.
      </p>
    );
  }
  return <SnapButtons mold={seams} angle={angle} onSnap={onSnap} />;
}

function SnapButtons({ mold, angle, onSnap }: { mold: Exclude<SeamsView, 'off'>; angle: number; onSnap: (angle: number) => void }) {
  const seamAngle = useSeamAngle(mold);
  const centre = nearestAngle(angle, pieceCentreAngles(mold, seamAngle));
  const seam = nearestAngle(angle, seamAngles(mold, seamAngle));
  return (
    <div className="flex gap-1.5 mb-2">
      <button className={snapBtn} onClick={() => onSnap(centre)}
        title={`Move it to the middle of the nearest ${SEAM_LABELS[mold]} piece (${centre}°) — the dashed line`}>
        Centre on a piece
      </button>
      <button className={snapBtn} onClick={() => onSnap(seam)}
        title={`Move it onto the nearest ${SEAM_LABELS[mold]} seam (${seam}°) — the solid line. Each side then comes away with its own piece`}>
        On a seam
      </button>
    </div>
  );
}

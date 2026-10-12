/**
 * dcity.org analytics — §2 of DCity/ANALYTICS.md (the shared contract for all
 * four dcity.org sites; change it there, not here). The GoatCounter tag itself
 * is in app/layout.tsx (§1).
 *
 * One event per DESIGN exported, not per file: Hermes's collector matches the
 * name exactly, and the dashboard ratio is exports per 100 visitors.
 */

type GoatCounter = { count?: (o: { path: string; title: string; event: boolean }) => void };

export const EXPORT_EVENT = 'vasemaker-export-stl';

export function dcCountExport(name: string = EXPORT_EVENT): void {
  if (typeof window === 'undefined') return;
  // Opt-out: a browser that has visited dcity.org/nocount is never counted.
  if (document.cookie.indexOf('dcity_nocount=1') !== -1) return;
  const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
  if (gc && gc.count) gc.count({ path: name, title: name, event: true });
}

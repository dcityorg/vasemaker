/**
 * Plain-text bench sheet, saved alongside a JSON settings file.
 *
 * Gary's request (2026-07-30): the plaster batch size and the printer-fit
 * numbers are what he needs at the bench, and opening the app just to read them
 * is a nuisance. Save Settings therefore writes «name».txt next to «name».json,
 * in MoldMaker (all four styles) and HandleMaker alike.
 *
 * Deliberately only those numbers plus enough identity to know which mold the
 * sheet belongs to — this is a bench note, not a settings dump. The JSON beside
 * it is the authoritative record.
 *
 * Generic by design: the two tools describe completely different parts (a mold
 * has max-diameter-and-height, a handle mold has a plate footprint and a wall
 * set), so each caller supplies its own rows and this module only formats.
 */

import { estimatePlaster } from '@/engine/mold/mold-stats';
import { PLASTER_MATERIALS } from '@/config/mold-params';
import type { PlasterType } from '@/engine/mold/mold-types';

export interface ReportRow {
  label: string;
  value: string;
}

/** One printed part and its numbers. `note` renders as "Label (note)". */
export interface ReportPart {
  label: string;
  note?: string;
  rows: ReportRow[];
}

export interface PrintReportInput {
  /** File/profile name — becomes the heading. */
  title: string;
  /** Identity rows: which design, which style, when saved. */
  identity: ReportRow[];
  material: PlasterType;
  plasterVolumeMm3: number;
  /** Label for the volume row, e.g. "Volume (both halves)" on the handle mold. */
  volumeLabel?: string;
  parts: ReportPart[];
  keySettings: ReportRow[];
}

const grams = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${n.toFixed(0)} g`);
const pad = (label: string, width = 22) => label.padEnd(width);
const block = (title: string) => [title, '-'.repeat(title.length)];
const rows = (rs: ReportRow[], indent = '') => rs.map((r) => `${indent}${pad(r.label, 22 - indent.length)}${r.value}`);

export function buildPrintReport(i: PrintReportInput): string {
  const est = estimatePlaster(i.plasterVolumeMm3, i.material);
  const material = PLASTER_MATERIALS[i.material];
  const L: string[] = [];

  L.push(i.title, '='.repeat(Math.max(12, i.title.length)), '');
  L.push(...rows(i.identity), '');

  L.push(...block('PLASTER'));
  L.push(...rows([
    { label: 'Material', value: material.label },
    { label: i.volumeLabel ?? 'Volume', value: `${est.volumeCm3.toFixed(0)} cm3` },
    { label: 'Powder', value: grams(est.powderGrams) },
    { label: 'Water', value: `${grams(est.waterGrams)}  (${est.waterGrams.toFixed(0)} mL)` },
    { label: 'Mix ratio', value: `${material.waterRatio} parts water : 100 parts plaster, by weight` },
  ]));
  L.push('', 'Estimates only — plaster density varies with mixing. Mix a little extra.', '');

  L.push(...block('PRINTER FIT'));
  for (const p of i.parts) {
    L.push(p.note ? `${p.label} (${p.note})` : p.label);
    L.push(...rows(p.rows, '  '));
  }
  L.push('');

  if (i.keySettings.length) {
    L.push(...block('KEY SETTINGS'));
    L.push(...rows(i.keySettings), '');
  }

  L.push('Full settings are in the .json file beside this one — load it with Load Settings.', '');
  return L.join('\n');
}

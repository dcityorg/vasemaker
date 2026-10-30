/**
 * Photo depth in the browser (Gary, 2026-10-29): Depth Anything V2 Small
 * (Apache-2.0), half precision, run by Transformers.js on this computer — the
 * picture never leaves it. The engine half (heights from the depth) is
 * engine/sprig/photo-depth.ts.
 *
 * Nothing here loads until the person has said yes once (the dialog in the
 * Sprig sidebar); that yes is remembered in this browser. Then the library
 * comes from jsDelivr and the model from Hugging Face — about 55 MB the first
 * time (measured 2026-10-29: model 49.6 MB, runtime 4.1 MB compressed,
 * library 0.2 MB), after which the browser's cache serves both, so Vercel
 * carries none of it.
 */

import { create } from 'zustand';
import type { DepthMap } from '@/engine/sprig/photo-depth';
import type { RgbaImage } from '@/engine/sprig/image-prep';

/** Pinned: a new version is a deliberate change, not whatever the CDN has today. */
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'onnx-community/depth-anything-v2-small';
const DTYPE = 'fp16';
/** What the dialog says it costs, MB (see the header). */
export const PHOTO_DEPTH_MB = 55;

const ALLOWED_KEY = 'vasemaker-photo-depth';

export type PhotoDepthStatus =
  | { state: 'off' }                      // never said yes in this browser
  | { state: 'idle' }                     // allowed; model not loaded this session
  | { state: 'loading'; loaded: number; total: number }   // bytes
  | { state: 'running' }
  | { state: 'ready' }
  | { state: 'failed'; message: string };

export const usePhotoDepth = create<{ status: PhotoDepthStatus; allowed: boolean }>(() => ({
  status: { state: 'off' }, allowed: false,
}));

/** Read the remembered yes — after hydration, never during render on the server. */
export function initPhotoDepth() {
  let yes = false;
  try { yes = window.localStorage.getItem(ALLOWED_KEY) === 'yes'; } catch { /* storage blocked */ }
  if (yes && !usePhotoDepth.getState().allowed) usePhotoDepth.setState({ allowed: true, status: { state: 'idle' } });
}

/** The person said yes: remember it, and let the depth jobs start. */
export function allowPhotoDepth() {
  try { window.localStorage.setItem(ALLOWED_KEY, 'yes'); } catch { /* this session only */ }
  usePhotoDepth.setState({ allowed: true, status: { state: 'idle' } });
}

type Estimator = (image: unknown) => Promise<{ predicted_depth: { data: Float32Array; dims: number[] } }>;
interface TransformersModule {
  pipeline: (task: string, model: string, o: Record<string, unknown>) => Promise<Estimator>;
  RawImage: new (data: Uint8ClampedArray, w: number, h: number, channels: number) => unknown;
}

let lib: Promise<{ T: TransformersModule; run: Estimator }> | null = null;

function loadModel() {
  if (lib) return lib;
  lib = (async () => {
    // Bytes per file, summed for one progress bar.
    const files = new Map<string, { loaded: number; total: number }>();
    usePhotoDepth.setState({ status: { state: 'loading', loaded: 0, total: 0 } });
    const url: string = LIBRARY;   // a plain string, so neither TS nor webpack tries to bundle it
    const T = (await import(/* webpackIgnore: true */ url)) as TransformersModule;
    const run = await T.pipeline('depth-estimation', MODEL, {
      dtype: DTYPE,
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status !== 'progress' || !e.file) return;
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
        let loaded = 0, total = 0;
        files.forEach((f) => { loaded += f.loaded; total += f.total; });
        usePhotoDepth.setState({ status: { state: 'loading', loaded, total } });
      },
    });
    return { T, run };
  })();
  lib.catch(() => { lib = null; });
  return lib;
}

const CACHE_SIZE = 4;
const cache = new Map<string, Promise<DepthMap>>();

/**
 * The model's depth for this picture (larger = nearer), at the model's own
 * output size. Cached by `key` (the drawing), so undo, and every page showing
 * the same sprig, reuse one run. Rejects when Photo depth is not allowed or
 * the model cannot run here (an old browser, too little memory).
 */
export function estimateDepth(key: string, img: RgbaImage): Promise<DepthMap> {
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (async () => {
    if (!usePhotoDepth.getState().allowed) throw new Error('Photo depth is not turned on');
    try {
      const { T, run } = await loadModel();
      usePhotoDepth.setState({ status: { state: 'running' } });
      const data = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      // On white, not on transparent black: a cut-out's background reads as paper.
      const rgba = new Uint8ClampedArray(data.length);
      for (let k = 0; k < data.length; k += 4) {
        const a = data[k + 3] / 255;
        for (let c = 0; c < 3; c++) rgba[k + c] = Math.round(data[k + c] * a + 255 * (1 - a));
        rgba[k + 3] = 255;
      }
      const out = await run(new T.RawImage(rgba, img.width, img.height, 4));
      const d = out.predicted_depth;
      const [h, w] = d.dims.slice(-2);
      usePhotoDepth.setState({ status: { state: 'ready' } });
      return { data: Float32Array.from(d.data), width: w, height: h };
    } catch (e) {
      usePhotoDepth.setState({ status: { state: 'failed', message: e instanceof Error ? e.message : String(e) } });
      throw e;
    }
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return job;
}

/**
 * Download & image capture utilities — browser-only.
 * Shared download logic with cleanup to avoid browser burst limits (Brave).
 */

import type { CaptureFormat } from '@/config/capture';

// Remember last file handle from any open/save operation so subsequent
// save dialogs open in the same directory (File System Access API only).
let lastFileHandle: FileSystemFileHandle | null = null;

/** Store a file handle so future save dialogs start in its directory. */
export function setLastFileHandle(handle: FileSystemFileHandle): void {
  lastFileHandle = handle;
}

/**
 * Convert a canvas element to a Blob in the specified format.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: CaptureFormat,
  quality = 0.92
): Promise<Blob> {
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      mimeType,
      quality
    );
  });
}

// Track previous object URLs so we can revoke them and free download slots
let prevObjectUrl: string | null = null;
let prevAnchor: HTMLAnchorElement | null = null;

/** Anchor click download with cleanup to avoid browser burst limits. */
function anchorDownload(blob: Blob, filename: string): void {
  if (prevAnchor && prevAnchor.parentNode) {
    prevAnchor.parentNode.removeChild(prevAnchor);
  }
  if (prevObjectUrl) {
    URL.revokeObjectURL(prevObjectUrl);
  }

  const url = URL.createObjectURL(blob);
  prevObjectUrl = url;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  prevAnchor = a;
  a.click();
}

// Types for File System Access API
type PickerWindow = Window & {
  showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
};

/**
 * General-purpose blob download with cleanup to avoid burst limits.
 * Used by Export STL and other non-design downloads.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  anchorDownload(blob, filename);
}

/**
 * Trigger a download of an image blob.
 * Uses showSaveFilePicker when available, falls back to anchor click.
 */
export async function downloadImage(blob: Blob, filename: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || 'png';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : 'image/png';
      const handle = await (window as unknown as PickerWindow).showSaveFilePicker({
        suggestedName: filename,
        startIn: lastFileHandle ?? undefined,
        types: [{
          description: ext === 'jpg' ? 'JPEG Image' : 'PNG Image',
          accept: { [mimeType]: [`.${ext}`] },
        }],
      });
      lastFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[Download] showSaveFilePicker failed, falling back to anchor:', err);
    }
  }
  anchorDownload(blob, filename);
}

/**
 * Save a design JSON file. Uses showSaveFilePicker when available so the user
 * gets a native save dialog. Returns the chosen filename (without extension)
 * so the UI can update the design name if the user renamed it in the dialog.
 * Returns null if the user cancelled.
 */
export async function saveDesignFile(json: string, suggestedName: string): Promise<string | null> {
  const blob = new Blob([json], { type: 'application/json' });
  const filename = `${suggestedName}.json`;

  if ('showSaveFilePicker' in window) {
    try {
      console.log('[SaveDesign] Using showSaveFilePicker');
      const handle = await (window as unknown as PickerWindow).showSaveFilePicker({
        suggestedName: filename,
        startIn: lastFileHandle ?? undefined,
        types: [{
          description: 'JSON Design File',
          accept: { 'application/json': ['.json'] },
        }],
      });
      lastFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      const chosenName = handle.name.replace(/\.json$/i, '');
      console.log('[SaveDesign] Saved as:', chosenName);
      return chosenName;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[SaveDesign] User cancelled');
        return null;
      }
      console.warn('[SaveDesign] showSaveFilePicker failed, falling back to anchor:', err);
    }
  } else {
    console.log('[SaveDesign] showSaveFilePicker not available, using anchor download');
  }

  // Fallback: anchor click — name stays as suggested
  anchorDownload(blob, filename);
  return suggestedName;
}

/**
 * Open a design JSON file using the File System Access API.
 * Returns { name, text } on success, null if cancelled or API not available.
 * Remembers the directory for subsequent save dialogs.
 */
export async function openDesignFile(): Promise<{ name: string; text: string } | null> {
  if (!('showOpenFilePicker' in window)) return null;
  try {
    const [handle] = await (window as unknown as PickerWindow).showOpenFilePicker({
      startIn: lastFileHandle ?? undefined,
      types: [{
        description: 'JSON Design File',
        accept: { 'application/json': ['.json'] },
      }],
    });
    lastFileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    return { name: file.name.replace(/\.json$/i, ''), text };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.warn('[LoadDesign] showOpenFilePicker failed:', err);
    return null;
  }
}

/**
 * Save an STL blob using the File System Access API with directory memory.
 * Falls back to anchor download if API not available or user cancels.
 */
export async function saveSTLFile(blob: Blob, filename: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as PickerWindow).showSaveFilePicker({
        suggestedName: filename,
        startIn: lastFileHandle ?? undefined,
        types: [{
          description: 'STL 3D Model',
          accept: { 'application/octet-stream': ['.stl'] },
        }],
      });
      lastFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[ExportSTL] showSaveFilePicker failed, falling back to anchor:', err);
    }
  }
  anchorDownload(blob, filename);
}

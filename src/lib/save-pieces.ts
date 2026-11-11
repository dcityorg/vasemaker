/**
 * Save the open vase or handle to its own file before something replaces it:
 * the Mold tab's "also save the vase / handle?" box and the Load list's
 * "Save mine, then load". Same files as those tabs' own Save Design.
 */
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore, isHandleUnnamed } from '@/store/handle-store';
import { isVaseUnnamed } from '@/presets';
import { ensureNamed } from '@/components/parameters/DesignName';
import { saveDesignFile } from '@/lib/image-capture';
import { withEnding, withoutEnding, ENDING } from '@/lib/file-names';

/** The open vase, as the Vase tab saves it. False if cancelled. */
export async function saveCurrentVase(): Promise<boolean> {
  const { designName: vn, params } = useVaseStore.getState();
  const name = await ensureNamed('Vase', isVaseUnnamed(vn), vn ?? '', (n) => useVaseStore.setState({ designName: n }));
  if (!name) return false;
  const chosen = await saveDesignFile(JSON.stringify(params, null, 2), withEnding(name, ENDING.vase));
  if (chosen === null) return false;
  useVaseStore.setState({ designName: withoutEnding(chosen, [ENDING.vase]), isDirty: false });
  return true;
}

/** The open handle, as the Handle tab saves it (without its bench sheet).
 *  `afterAnother`: a second save in a row (see saveDesignFile). */
export async function saveCurrentHandle(afterAnother: boolean): Promise<boolean> {
  const { params, settingsName: hn } = useHandleStore.getState();
  const json = JSON.stringify({ app: 'VaseMaker', type: 'handle-settings', settings: params }, null, 2);
  const name = await ensureNamed('Handle', isHandleUnnamed(hn), hn, (n) => useHandleStore.getState().setSettingsName(n));
  if (!name) return false;
  const chosen = await saveDesignFile(json, withEnding(name, ENDING.handle), afterAnother);
  if (chosen === null) return false;
  useHandleStore.getState().markSaved(params, withoutEnding(chosen, [ENDING.handle]));
  return true;
}

/**
 * Load a saved design file and build it with the app's own code
 * (src/lib/design-files.ts, src/engine/mold/build-mold.ts). The only glue
 * here is what the sidebars do with the stores: an old mold file's foot goes
 * onto the open vase, and the Mold page builds with the vase's foot
 * (use-mold-meshes.ts) and casts the VASE's handle when the style uses it.
 */
import type { VaseParameters } from '@/engine/types';
import type { MoldParameters } from '@/engine/mold/mold-types';
import { moldBuildInputs } from '@/engine/mold/handle-on-vase';
import { moldWithVaseFoot } from '@/engine/mold/vase-foot';
import { generateMold } from '@/engine/mold/build-mold';
import { designKind, vaseFromFile, readMoldFile, moldFromSettings, handleFromFile, sprigFromFile } from '@/lib/design-files';

export { designKind as kindOf, vaseFromFile as loadVase, handleFromFile as loadHandle, sprigFromFile as loadSprig };

/** Mold tab → Load Design, taking the file's vase and handle (the "use the file's" answer). */
export function loadMold(parsed: Parameters<typeof readMoldFile>[0], openVase: VaseParameters = vaseFromFile({})) {
  const file = readMoldFile(parsed);
  let vase = file.vase ? vaseFromFile(file.vase) : openVase;
  if (!file.vase && file.legacyFoot) vase = { ...vase, bottom: { ...vase.bottom, ...file.legacyFoot } };
  const { params: stored, retired } = moldFromSettings(file.settings);
  return { vase, stored, mold: moldWithVaseFoot(stored, vase), handle: file.handle, retired };
}

/** The Mold page's build, without a mark or sprig field. A cast handle comes
 *  from the vase (its copy, Around and Top Below Rim), as on the Mold page. */
export function buildMold(vase: VaseParameters, mold: MoldParameters) {
  const inputs = moldBuildInputs(vase, mold);
  return generateMold(vase, inputs.mold, inputs.handle);
}

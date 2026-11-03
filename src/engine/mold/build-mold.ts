/**
 * Build the mold for a style — the Mold page's build, and the tests'. The
 * caller sets the bottom-mark and vase-sprig fields first (they are module
 * state the generators read) and passes the handle only when the style uses it.
 */
import type { VaseParameters } from '@/engine/types';
import type { MoldParameters } from './mold-types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { generateMoldMeshes, type MoldMeshes } from './mold-generator';
import { generateOnePieceMold, type OnePieceMoldMeshes } from './one-piece-generator';
import { generatePourTwoPieceMold, type PourTwoPieceMoldMeshes } from './pour-two-piece-generator';
import { generatePourThreePieceMold, type PourThreePieceMoldMeshes } from './pour-three-piece-generator';
import { generateSplitTwoPieceMold, type SplitTwoPieceMoldMeshes } from './split-two-piece-generator';
import { generateSplitHalvesMold, type SplitHalvesMoldMeshes } from './split-halves-generator';
import { generateSplitThirdsMold, type SplitThirdsMoldMeshes } from './split-thirds-generator';

/** Any mold style's generated meshes — discriminated by `style`. */
export type AnyMoldMeshes = MoldMeshes | OnePieceMoldMeshes | PourTwoPieceMoldMeshes | PourThreePieceMoldMeshes | SplitTwoPieceMoldMeshes | SplitHalvesMoldMeshes | SplitThirdsMoldMeshes;

export function generateMold(vaseParams: VaseParameters, moldParams: MoldParameters, handle: HandleParameters | null): AnyMoldMeshes {
  switch (moldParams.moldStyle) {
    case 'onePiece':
      return generateOnePieceMold(vaseParams, moldParams);
    case 'pourTwoPiece':
      return generatePourTwoPieceMold(vaseParams, moldParams);
    case 'pourThreePiece':
      return generatePourThreePieceMold(vaseParams, moldParams);
    case 'splitTwoPiece':
      return generateSplitTwoPieceMold(vaseParams, moldParams, handle);
    case 'splitHalves':
      return generateSplitHalvesMold(vaseParams, moldParams, handle);
    case 'splitThirds':
      return generateSplitThirdsMold(vaseParams, moldParams);
    default:
      return generateMoldMeshes(vaseParams, moldParams);
  }
}

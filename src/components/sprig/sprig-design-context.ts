/**
 * Which design the Sprig page is editing: the sprig or the mark (the
 * `Sprig | Mark` tabs, 2026-10-26). The sidebar, viewport and meshes hook read
 * their store through this, so one set of controls serves both designs.
 */

import { createContext, useContext } from 'react';
import { sprigDesign, type SprigDesign } from '@/store/sprig-store';

export const SprigDesignContext = createContext<SprigDesign>(sprigDesign);

export const useSprigDesign = () => useContext(SprigDesignContext);

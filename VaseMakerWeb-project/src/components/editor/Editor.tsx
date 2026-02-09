'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { HelpPanel } from './HelpPanel';
import { Viewport } from '@/components/viewport/Viewport';

/**
 * Main editor layout — sidebar on left, 3D viewport filling the rest,
 * optional help panel on right.
 */
export function Editor() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar helpOpen={helpOpen} onToggleHelp={() => setHelpOpen(h => !h)} />
      <div className="flex-1 min-w-0">
        <Viewport />
      </div>
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

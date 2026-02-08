'use client';

import { Sidebar } from './Sidebar';
import { Viewport } from '@/components/viewport/Viewport';

/**
 * Main editor layout — sidebar on left, 3D viewport filling the rest.
 */
export function Editor() {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex-1">
        <Viewport />
      </div>
    </div>
  );
}

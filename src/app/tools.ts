import {
  Circle,
  Highlighter,
  Link2,
  MousePointer2,
  SquareDashed,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import { EsdvIcon } from '@/features/markup/EsdvIcon';
import type { Tool } from '@/store/ui-store';

export interface ToolDef {
  tool: Tool;
  icon: LucideIcon | typeof EsdvIcon;
  labelKey: `toolbar.${Tool | 'dashed'}`;
  shortcut: string;
}

export const TOOLS: ToolDef[] = [
  { tool: 'select', icon: MousePointer2, labelKey: 'toolbar.select', shortcut: 'V' },
  { tool: 'circle', icon: Circle, labelKey: 'toolbar.circle', shortcut: 'C' },
  { tool: 'dashed', icon: SquareDashed, labelKey: 'toolbar.dashed', shortcut: 'D' },
  { tool: 'highlighter', icon: Highlighter, labelKey: 'toolbar.highlighter', shortcut: 'H' },
  { tool: 'link', icon: Link2, labelKey: 'toolbar.link', shortcut: 'L' },
  { tool: 'esdv', icon: EsdvIcon, labelKey: 'toolbar.esdv', shortcut: 'E' },
  { tool: 'stamp', icon: Stamp, labelKey: 'toolbar.stamp', shortcut: 'S' },
];

import { Brain, ChartNoAxesCombined, FileText, Home, Layers, Link2 } from 'lucide-react';
import type { NavItem, StudyTool } from './types';

interface MaterialGlyph {
  d: string;
  transform?: string;
}

interface MaterialGlyphSet {
  outline: readonly MaterialGlyph[];
  filled?: readonly MaterialGlyph[];
}

type MaterialGlyphTab = 'home' | 'quiz' | 'community' | 'review' | 'profile';

export const MATERIAL_GLYPHS: Record<MaterialGlyphTab, MaterialGlyphSet> = {
  home: {
    outline: [{ d: 'M160-120v-400H40l440-440 440 440H800v400H560v-280H400v280H160Zm80-80h80v-280h320v280h80v-350L480-852 240-550v350Z' }],
    filled: [{ d: 'M160-120v-400H40l440-440 440 440H800v400H560v-280H400v280H160Z' }],
  },
  quiz: {
    outline: [{ d: 'M280-80q-33 0-56.5-23.5T200-160v-640q0-33 23.5-56.5T280-880h320l240 240v480q0 33-23.5 56.5T760-80H280Zm0-80h480v-480H560v-160H280v640Zm80-360h320v-80H360v80Zm0 160h320v-80H360v80Zm0 160h200v-80H360v80Z' }],
  },
  community: {
    outline: [
      { d: 'M200-160v-640q0-33 23.5-56.5T280-880h400q33 0 56.5 23.5T760-800v640H200Zm80-80h400v-560H280v560Z' },
      { d: 'M384-320h64l24-72h112l24 72h64L560-640h-64L384-320Zm110-136 34-102 34 102h-68Z' },
    ],
  },
  review: {
    outline: [
      { d: 'm344-716 300-120 188 472-300 120-188-472Zm46 44 152 380 226-90-152-380-226 90Z' },
      { d: 'm278-642-102 40 188 472 300-120-34-86-74 30 4 10-226 90-152-380 126-50-30-76Z' },
      { d: 'm210-568-102 40 188 472 300-120-30-76-74 30 0 0-226 90-152-380 126-50-30-76Z' },
    ],
  },
  profile: {
    outline: [{ d: 'M160-240v-80h640v80H160Zm0-200v-80h640v80H160Zm0-200v-80h640v80H160Z' }],
  },
};

export const STUDY_TOOLS: readonly StudyTool[] = [
  { id: 'quiz', label: 'Quiz Builder', hint: 'Turn notes into a quiz', icon: FileText, tone: 'indigo' },
  { id: 'summarizer', label: 'Summarizer', hint: 'Condense any topic', icon: Brain, tone: 'amber' },
  { id: 'community', label: 'Study materials', hint: 'Browse shared sets', icon: Link2, tone: 'sky' },
  { id: 'review', label: 'Review', hint: 'Clear your due cards', icon: Layers, tone: 'violet' },
];

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'quiz', label: 'Quiz Builder', icon: FileText },
  { id: 'summarizer', label: 'Summarizer', icon: Brain },
  { id: 'community', label: 'Study materials', icon: Link2 },
  { id: 'review', label: 'Review', icon: Layers },
  { id: 'profile', label: 'Dashboard', icon: ChartNoAxesCombined },
];

import { Brain, ChartNoAxesCombined, FileText, Home, Layers, Link2 } from 'lucide-react';
import type { NavItem, StudyTool } from './types';

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

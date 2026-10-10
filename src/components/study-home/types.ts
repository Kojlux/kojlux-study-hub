import type { Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { NavTab } from '../BottomNav';

/** App tabs plus the Summarizer mode, which shares the quiz screen. */
export type StudyTab = Exclude<NavTab, 'home'> | 'summarizer';
export type WorkspaceNavId = NavTab | 'summarizer';

/** Called whenever a tile, nav item, or CTA wants to switch tabs. */
export type NavigateHandler = (tab: StudyTab) => void;

/** Colour families shared by tool tiles, activity icons and tag chips. */
export type ToolTone = 'indigo' | 'amber' | 'sky' | 'violet';
export type TagTone = ToolTone | 'emerald' | 'rose';

export interface StudyTool {
  id: Exclude<StudyTab, 'profile'>;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: ToolTone;
}

export interface NavItem {
  id: WorkspaceNavId;
  label: string;
  icon: LucideIcon;
}

/** Visual presentation of one row in the recent-activity log. */
export interface ActivityMeta {
  label: string;
  icon: LucideIcon;
  tone: TagTone;
}

// ---------------------------------------------------------------------------
// Hook state / return shapes
// ---------------------------------------------------------------------------

/**
 * `frontIndex` and `backIndex` are tracked separately so the back face keeps
 * showing the *previous* answer while it fades out. Otherwise the text would
 * swap to the next card's answer mid cross-fade.
 */
export interface FlashcardCycleState {
  frontIndex: number;
  backIndex: number;
  isFlipped: boolean;
  /** Bumped on manual flips so the interval restarts from a full period. */
  epoch: number;
}

export interface FlashcardCycle {
  frontIndex: number;
  backIndex: number;
  isFlipped: boolean;
  flip: () => void;
  setPaused: Dispatch<SetStateAction<boolean>>;
}

export interface SidebarCollapse {
  collapsed: boolean;
  toggle: () => void;
}

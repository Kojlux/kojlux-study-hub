import React from 'react';
import { Home, FileText, Activity, Brain, LayoutDashboard } from 'lucide-react';

export type NavTab = 'home' | 'quiz' | 'visualizer' | 'review' | 'profile';

const TABS: { key: NavTab; label: string; icon: any }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'quiz', label: 'Create', icon: FileText },
  { key: 'visualizer', label: 'Visualize', icon: Activity },
  { key: 'review', label: 'Review', icon: Brain },
  { key: 'profile', label: 'Dashboard', icon: LayoutDashboard },
];

export default function BottomNav({ active, dueCount, onChange }: { active: NavTab; dueCount: number; onChange: (t: NavTab) => void }) {
  return (
    <>
      {/* Phones: fixed bottom tab bar — unchanged from before. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto flex items-center justify-around px-2 py-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="relative w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition"
            >
              <div className={`relative p-1.5 rounded-xl ${active === key ? 'text-focus-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                <Icon className="w-5 h-5" />
                {key === 'review' && dueCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {dueCount > 9 ? '9+' : dueCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-tight mt-0.5 ${active === key ? 'text-focus-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tablets and up: a fixed left rail instead of a bottom bar, so the
          nav uses the extra vertical/horizontal room a bigger screen has
          rather than staying pinned to a cramped strip along the bottom.
          Icon-only rail from md, full labeled sidebar once there's enough
          width at lg. */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-20 lg:w-56 md:py-6 md:px-2 lg:px-3 md:gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200/80 dark:border-slate-800">
        <div className="hidden lg:block px-3 mb-5">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Kojlux</span>
        </div>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative flex items-center gap-3 w-full px-3 py-3 rounded-xl transition ${
              active === key
                ? 'bg-focus-primary/10 text-focus-primary'
                : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="relative shrink-0">
              <Icon className="w-5 h-5" />
              {key === 'review' && dueCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {dueCount > 9 ? '9+' : dueCount}
                </span>
              )}
            </span>
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-tight">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
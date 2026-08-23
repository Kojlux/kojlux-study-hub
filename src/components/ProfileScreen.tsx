import React from 'react';
import { signOut } from 'firebase/auth';
import { Sun, Moon, LogOut, User as UserIcon, Flame, Layers } from 'lucide-react';
import { auth } from '../firebase';
import { GRADE_LEVEL_OPTIONS } from '../constants';

interface Props {
  email: string;
  username: string;
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  streak: number;
  totalReviews: number;
}

export default function ProfileScreen({
  email, username, gradeLevel, onGradeLevelChange, darkMode, onToggleDarkMode, streak, totalReviews,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-2xl bg-focus-primary flex items-center justify-center shrink-0">
          <UserIcon className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-base font-black text-slate-900 dark:text-white">{username}</h1>
          <p className="text-xs text-slate-400">{email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
          <Flame className="w-4.5 h-4.5 text-focus-primary" />
          <p className="text-xl font-black mt-1.5 text-slate-900 dark:text-white">{streak}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Day streak</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
          <Layers className="w-4.5 h-4.5 text-focus-primary" />
          <p className="text-xl font-black mt-1.5 text-slate-900 dark:text-white">{totalReviews}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cards reviewed</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Grade level</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_LEVEL_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => onGradeLevelChange(g)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                gradeLevel === g ? 'bg-focus-primary text-white border-focus-primary' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onToggleDarkMode}
        className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4"
      >
        <span className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          {darkMode ? <Moon className="w-4.5 h-4.5 text-focus-primary" /> : <Sun className="w-4.5 h-4.5 text-focus-primary" />}
          {darkMode ? 'Dark mode' : 'Light mode'}
        </span>
        <span className={`w-10 h-5.5 rounded-full p-0.5 transition ${darkMode ? 'bg-focus-primary' : 'bg-slate-200'}`}>
          <span className={`block w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-4.5' : ''}`} />
        </span>
      </button>

      <button
        onClick={() => signOut(auth)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-sm font-bold"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  );
}

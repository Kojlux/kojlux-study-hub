import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Mail, Lock, User as UserIcon, AlertCircle } from 'lucide-react';
import { GRADE_LEVEL_OPTIONS } from '../constants';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gradeLevel, setGradeLevel] = useState(GRADE_LEVEL_OPTIONS[2]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: username.trim() || email.split('@')[0] });
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: email.trim(),
          username: username.trim() || email.split('@')[0],
          gradeLevel,
          createdAt: new Date().toISOString(),
          streak: 0,
        });
      }
    } catch (err: any) {
      setError(humanizeAuthError(err?.code || err?.message || 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-focus-bg px-5">
      <div className="w-full max-w-sm space-y-7">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden shadow-lg shadow-focus-primary/20">
            <img
              src={`${import.meta.env.BASE_URL}icon.png`}
              alt="Kojlux Study Hub app icon"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Kojlux Study Hub</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Focused study, built on how memory actually works.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-2">
            {(['signin', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  mode === m ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <label className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 border border-slate-200/70 dark:border-slate-700">
              <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Display name"
                className="bg-transparent outline-none text-sm w-full text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </label>
          )}

          <label className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 border border-slate-200/70 dark:border-slate-700">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="bg-transparent outline-none text-sm w-full text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </label>

          <label className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 border border-slate-200/70 dark:border-slate-700">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="bg-transparent outline-none text-sm w-full text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </label>

          {mode === 'register' && (
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Grade level</span>
              <div className="flex flex-wrap gap-1.5">
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setGradeLevel(g)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                      gradeLevel === g
                        ? 'bg-focus-primary text-white border-focus-primary'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-focus-primary hover:bg-focus-primary-dark text-white text-sm font-bold rounded-xl transition shadow-sm disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

function humanizeAuthError(code: string): string {
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Incorrect email or password.';
  }
  if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  return 'Something went wrong. Please try again.';
}

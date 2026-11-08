import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, AlertCircle, BookOpen, Lock, Mail, UserRound } from 'lucide-react';
import { auth, db } from '../firebase';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { saveLocal, scopedKey } from '../lib/storage';
import './AuthScreen.css';

interface AuthScreenProps {
  onBack?: () => void;
  onContinueAsGuest: () => void;
}

export default function AuthScreen({ onBack, onContinueAsGuest }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gradeLevel, setGradeLevel] = useState(GRADE_LEVEL_OPTIONS[2]);
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getRedirectResult(auth)
      .then(() => {
        if (active) setGoogleError(null);
      })
      .catch((err: unknown) => {
        if (active) {
          setGoogleError(humanizeAuthError(getAuthErrorCode(err)));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setGoogleError(null);
    setVerificationNotice(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          try {
            await sendEmailVerification(credential.user);
          } finally {
            await signOut(auth);
          }
          setVerificationNotice(`We sent a verification link to ${email.trim()}. Verify your inbox, then sign in again.`);
          return;
        }
      } else {
        const emailAddress = email.trim();
        const accountName = username.trim() || emailAddress.split('@')[0];
        const credential = await createUserWithEmailAndPassword(auth, emailAddress, password);
        try {
          await updateProfile(credential.user, { displayName: accountName });
          await setDoc(doc(db, 'users', credential.user.uid), {
            email: emailAddress,
            username: accountName,
            gradeLevel,
            createdAt: new Date().toISOString(),
            streak: 0,
          });
          saveLocal(scopedKey('kojlux_first_study_guide_pending', credential.user.uid), true);
          await sendEmailVerification(credential.user);
        } catch (registrationError) {
          await signOut(auth);
          throw registrationError;
        }
        await signOut(auth);
        setVerificationNotice(`We sent a verification link to ${emailAddress}. Verify your inbox, then sign in to finish creating your account.`);
      }
    } catch (err: any) {
      setError(humanizeAuthError(err?.code || err?.message || 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleError(null);
    setVerificationNotice(null);
    setBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

    try {
      if (isMobileBrowser) {
        await signInWithRedirect(auth, provider);
      } else {
        try {
          await signInWithPopup(auth, provider);
        } catch (popupError: unknown) {
          if (getAuthErrorCode(popupError).includes('popup-blocked')) {
            await signInWithRedirect(auth, provider);
            return;
          }
          throw popupError;
        }
      }
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      setGoogleError(
        code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')
          ? 'Google sign-in was closed before it finished. Choose Continue with Google to try again.'
          : humanizeAuthError(code)
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    const address = email.trim();
    setError(null);
    setResetSent(false);
    if (!address) {
      setError('Enter your email address first, then choose Forgot password.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setResetSent(true);
    } catch (err: any) {
      setError(humanizeAuthError(err?.code || err?.message || 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gateway">
      <div className="auth-gateway__layout">
        <aside className="auth-gateway__showcase" aria-label="Kojlux Study Hub">
          <div className="auth-gateway__brand">
            <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" />
            <span>Kojlux <span>Study Hub</span></span>
          </div>
          <div className="auth-gateway__story">
            <p className="auth-gateway__eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
            <h1>Make learning<br />feel a little lighter.</h1>
            <p>Turn what you’re studying into clear notes, thoughtful quizzes, and knowledge that stays with you.</p>
            <div className="auth-gateway__art" aria-hidden="true">
              <div className="auth-gateway__orbit auth-gateway__orbit--one" />
              <div className="auth-gateway__orbit auth-gateway__orbit--two" />
              <div className="auth-study-card auth-study-card--back">
                <span>QUICK REVIEW</span>
                <div className="auth-study-card__lines"><i /><i /><i /></div>
              </div>
              <div className="auth-study-card auth-study-card--front">
                <span className="auth-study-card__tag"><BookOpen size={13} /> TODAY’S NOTE</span>
                <strong>Small steps<br />add up.</strong>
                <span className="auth-study-card__progress"><i /></span>
                <small>YOUR STUDY MOMENT</small>
              </div>
              <div className="auth-gateway__spark auth-gateway__spark--one">✦</div>
              <div className="auth-gateway__spark auth-gateway__spark--two">✦</div>
            </div>
          </div>
          <p className="auth-gateway__footnote">A little progress, every day.</p>
        </aside>

        <main className="auth-gateway__main">
          {onBack && (
            <button type="button" onClick={onBack} className="auth-gateway__back" aria-label="Back to your study space">
              <ArrowLeft size={16} /> <span>Back</span>
            </button>
          )}
          <section className="auth-card">
            <div className="auth-card__mobile-brand">
              <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" />
              <span>Kojlux Study Hub</span>
            </div>
            <p className="auth-card__eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'YOUR STUDY SPACE AWAITS'}</p>
            <h2>{mode === 'signin' ? 'Good to see you.' : 'Let’s get started.'}</h2>
            <p className="auth-card__intro">
              {mode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create your account and keep your learning in sync.'}
            </p>

            <button type="button" onClick={handleGoogleSignIn} disabled={busy} className="auth-google-button">
              <span aria-hidden="true" className="auth-google-button__g">G</span>
              {busy ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
            {googleError && (
              <p role="alert" className="auth-notice auth-notice--error auth-google-error">
                <AlertCircle size={16} /> {googleError}
              </p>
            )}
            <div className="auth-divider"><span>or continue with email</span></div>

            <form onSubmit={handleSubmit} className="auth-form">
              {mode === 'register' && (
                <label className="auth-field">
                  <span>Your name</span>
                  <span className="auth-field__control">
                    <UserRound size={17} aria-hidden="true" />
                    <input
                      autoComplete="name"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="How should we address you?"
                    />
                  </span>
                </label>
              )}
              <label className="auth-field">
                <span>Email address</span>
                <span className="auth-field__control">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </span>
              </label>
              <label className="auth-field">
                <span className="auth-field__label">
                  Password
                  {mode === 'signin' && (
                    <button type="button" onClick={handlePasswordReset} disabled={busy} className="auth-forgot">
                      Forgot password?
                    </button>
                  )}
                </span>
                <span className="auth-field__control">
                  <Lock size={17} aria-hidden="true" />
                  <input
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === 'signin' ? 'Enter your password' : 'At least 6 characters'}
                  />
                </span>
              </label>
              {mode === 'register' && (
                <label className="auth-field">
                  <span>Grade level</span>
                  <select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}>
                    {GRADE_LEVEL_OPTIONS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
              )}
              {resetSent && (
                <p role="status" className="auth-notice auth-notice--success">
                  Password reset email sent. Check your inbox.
                </p>
              )}
              {verificationNotice && <p role="status" className="auth-notice auth-notice--success">{verificationNotice}</p>}
              {error && (
                <p role="alert" className="auth-notice auth-notice--error">
                  <AlertCircle size={16} /> {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="auth-submit">
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                {!busy && <ArrowRight size={17} />}
              </button>
            </form>

            <p className="auth-card__switch">
              {mode === 'signin' ? 'New to Kojlux?' : 'Already have an account?'}{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === 'signin' ? 'register' : 'signin');
                  setError(null);
                  setGoogleError(null);
                  setVerificationNotice(null);
                }}
              >
                {mode === 'signin' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
            <div className="auth-card__guest">
              <span>Just looking to study?</span>
              <button type="button" onClick={onContinueAsGuest} disabled={busy}>Continue as a guest</button>
            </div>
            <p className="auth-card__privacy">
              Your work stays private. <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy policy</a>
            </p>
          </section>
        </main>
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
  if (code.includes('unauthorized-domain')) return 'This app domain is not yet enabled for Google sign-in.';
  if (code.includes('operation-not-allowed')) return 'Google sign-in is not enabled for this app yet. Please use email or try again later.';
  if (code.includes('popup-blocked')) return 'Allow sign-in pop-ups in your browser, or try again on your phone.';
  if (code.includes('network-request-failed')) return 'Could not reach Google sign-in. Check your connection and try again.';
  if (code.includes('web-storage-unsupported')) return 'This browser is blocking the storage Google sign-in needs. Try a regular browser window.';
  if (code.includes('account-exists-with-different-credential')) {
    return 'An account already exists with this email. Sign in with your original method first.';
  }
  if (code.includes('auth/')) return `Google sign-in could not start (${code.replace('auth/', '')}). Please try again or use email.`;
  return 'Something went wrong. Please try again.';
}

function getAuthErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const authError = error as Error & { code?: string };
    return authError.code || authError.message;
  }
  return '';
}

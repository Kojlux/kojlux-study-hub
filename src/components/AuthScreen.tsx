import React, { useEffect, useRef, useState } from 'react';
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
import { ArrowLeft, ArrowRight, AlertCircle, BookOpen, Layers, Library, ListChecks, Lock, Mail, PenLine, UserRound } from 'lucide-react';
import { auth, db } from '../firebase';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { saveLocal, scopedKey } from '../lib/storage';
import './AuthScreen.css';
import './AuthBackground.css';

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
      <AuthDoodles />
      <AuthSketchpad />
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
              <AuthShowcaseCards />
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


/** Decorative margin doodles that draw themselves, then fade and redraw. Purely visual. */
function AuthDoodles() {
  const doodle = (cls: string, delay: string, paths: string[]) => (
    <svg
      key={cls}
      className={`auth-doodle ${cls}`}
      viewBox="0 0 80 80"
      focusable="false"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} pathLength={1} style={{ animationDelay: `calc(${delay} + ${i * 0.5}s)` }} />
      ))}
    </svg>
  );
  return (
    <div className="auth-doodles" aria-hidden="true">
      <div className="auth-doodles__zone">
        {doodle('auth-doodle--squiggle', '0s', ['M6 40 q9 -16 18 0 t18 0 t18 0'])}
        {doodle('auth-doodle--star', '1.8s', ['M40 12 L46.8 30.7 L66.6 31.4 L50.9 43.6 L56.5 62.7 L40 51.5 L23.5 62.7 L29.1 43.6 L13.4 31.4 L33.2 30.7 Z'])}
        {doodle('auth-doodle--arrow', '3.6s', ['M10 56 C 24 22, 50 18, 68 34', 'M57 29 L68 34 L63 45'])}
        {doodle('auth-doodle--check', '5.4s', ['M14 42 L32 60 L66 18'])}
        {doodle('auth-doodle--bulb', '7.2s', ['M40 10 a20 20 0 0 1 12 36 v8 h-24 v-8 a20 20 0 0 1 12 -36 z', 'M32 62 h16'])}
        {doodle('auth-doodle--sparkle', '9s', ['M40 8 Q43 37 72 40 Q43 43 40 72 Q37 43 8 40 Q37 37 40 8 Z'])}
      </div>
    </div>
  );
}


/**
 * Lets visitors doodle on the empty parts of the page. Their ink is a different colour from the
 * built-in doodles, stays for a few seconds, then fades away. The form is never blocked: the
 * canvas sits behind the layout and only receives touches/clicks that land on empty background.
 */
function AuthSketchpad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    type Point = { x: number; y: number };
    type Stroke = { pts: Point[]; color: string; endedAt: number | null };
    const HOLD_MS = 4000; // ink stays fully visible this long after the finger/mouse lifts
    const FADE_MS = 2500; // then fades out over this long
    const strokes: Stroke[] = [];
    let current: Stroke | null = null;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.2;
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        const stroke = strokes[i];
        let alpha = 1;
        if (stroke.endedAt !== null) {
          const age = now - stroke.endedAt;
          if (age > HOLD_MS + FADE_MS) {
            strokes.splice(i, 1);
            continue;
          }
          if (age > HOLD_MS) alpha = 1 - (age - HOLD_MS) / FADE_MS;
        }
        const pts = stroke.pts;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 1.8, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length - 1; j += 1) {
          ctx.quadraticCurveTo(pts[j].x, pts[j].y, (pts[j].x + pts[j + 1].x) / 2, (pts[j].y + pts[j + 1].y) / 2);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = strokes.length > 0 ? window.requestAnimationFrame(render) : 0;
    };
    const kick = () => {
      if (!raf) raf = window.requestAnimationFrame(render);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      const color = getComputedStyle(canvas).getPropertyValue('--auth-draw').trim() || '#e8795a';
      current = { pts: [{ x: event.clientX, y: event.clientY }], color, endedAt: null };
      strokes.push(current);
      setHint(false);
      kick();
    };
    const onMove = (event: PointerEvent) => {
      if (!current) return;
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      for (const e of events.length ? events : [event]) current.pts.push({ x: e.clientX, y: e.clientY });
      kick();
    };
    const onUp = () => {
      if (!current) return;
      current.endedAt = performance.now();
      current = null;
      kick();
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    const hintTimer = window.setTimeout(() => setHint(false), 14000);
    return () => {
      window.clearTimeout(hintTimer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="auth-sketch" aria-hidden="true" />
      <p className="auth-sketch-hint" data-hidden={!hint} aria-hidden="true">
        Feel like doodling? Draw anywhere on the page.
      </p>
    </>
  );
}


type ShowcaseVisual = 'progress' | 'quiz' | 'lines' | 'flip' | 'chips';
interface ShowcaseCard {
  tag: string;
  Icon: React.ComponentType<{ size?: number }>;
  title: [string, string];
  caption: string;
  visual: ShowcaseVisual;
}

// The cards on the left panel take turns at the front. Edit the wording here.
const SHOWCASE_CARDS: ShowcaseCard[] = [
  { tag: 'TODAY’S NOTE', Icon: BookOpen, title: ['Small steps', 'add up.'], caption: 'YOUR STUDY MOMENT', visual: 'progress' },
  { tag: 'QUIZ', Icon: ListChecks, title: ['Practice until', 'it clicks.'], caption: 'BUILT FROM YOUR NOTES', visual: 'quiz' },
  { tag: 'NOTECRAFT', Icon: PenLine, title: ['Any topic,', 'clean notes.'], caption: 'READY IN SECONDS', visual: 'lines' },
  { tag: 'REVIEW', Icon: Layers, title: ['Flip, recall,', 'repeat.'], caption: 'FLASHCARDS THAT STICK', visual: 'flip' },
  { tag: 'STUDY MATERIALS', Icon: Library, title: ['Study smarter,', 'together.'], caption: 'BROWSE SHARED MATERIALS', visual: 'chips' },
];

function ShowcaseVisualBlock({ kind }: { kind: ShowcaseVisual }) {
  switch (kind) {
    case 'progress':
      return <span className="auth-study-card__progress"><i /></span>;
    case 'quiz':
      return <span className="auth-mini auth-mini--quiz"><i /><i data-on="true" /><i /><b /></span>;
    case 'lines':
      return <span className="auth-mini auth-mini--lines"><i /><i /></span>;
    case 'flip':
      return <span className="auth-mini auth-mini--flip"><i /><i /></span>;
    case 'chips':
      return <span className="auth-mini auth-mini--chips"><i /><i /><i /></span>;
  }
}

/** Study cards that take turns at the front of the left panel. Decorative only. */
function AuthShowcaseCards() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setLeaving(indexRef.current);
      indexRef.current = (indexRef.current + 1) % SHOWCASE_CARDS.length;
      setIndex(indexRef.current);
    }, calm ? 7000 : 4800);
    return () => window.clearInterval(timer);
  }, []);

  const front = SHOWCASE_CARDS[index];
  const next = SHOWCASE_CARDS[(index + 1) % SHOWCASE_CARDS.length];
  const gone = leaving === null ? null : SHOWCASE_CARDS[leaving];

  const renderFront = (card: ShowcaseCard, extra: string, key: string) => (
    <div key={key} className={`auth-study-card auth-study-card--front ${extra}`}>
      <span className="auth-study-card__tag"><card.Icon size={13} /> {card.tag}</span>
      <strong>{card.title[0]}<br />{card.title[1]}</strong>
      <ShowcaseVisualBlock kind={card.visual} />
      <small>{card.caption}</small>
    </div>
  );

  return (
    <>
      <div key={`back-${index}`} className="auth-study-card auth-study-card--back auth-study-card--enter">
        <span>{next.tag}</span>
        <div className="auth-study-card__lines"><i /><i /><i /></div>
      </div>
      {renderFront(front, 'auth-study-card--enter', `front-${index}`)}
      {gone && renderFront(gone, 'auth-study-card--leave', `leave-${index}`)}
    </>
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
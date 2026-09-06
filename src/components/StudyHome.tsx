import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  FileText,
  Link2,
  Layers,
  Activity,
  Flame,
  ChevronRight,
  ArrowRight,
  Clock,
  X,
  CheckCircle2,
  Printer,
  Award,
  LockKeyhole,
  Sparkles,
  RotateCcw,
  Star,
  Crown,
  Gem,
  Trophy,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { HistoryItem, QuizData, SummaryData, VisualizationResponse } from '../types';

interface Props {
  username: string;
  streak: number;
  activityDays: string[];
  history: HistoryItem[];
  onNavigate: (tab: 'quiz' | 'community' | 'summarizer' | 'review') => void;
}

export default function StudyHome({ username, streak, activityDays, history, onNavigate }: Props) {
  const recent = history.slice(0, 4);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [celebration, setCelebration] = useState<number | null>(null);

  useEffect(() => {
    const shown = Number(localStorage.getItem('kojlux_last_badge_milestone') || 0);
    const earned = earnedMilestone(activityDays.length);
    if (earned > shown) {
      localStorage.setItem('kojlux_last_badge_milestone', String(earned));
      setCelebration(earned);
    }
  }, [activityDays.length]);

  const daysActive = activityDays.length;
  const nextMilestone = nextMilestoneFor(daysActive);
  const prevMilestone = prevMilestoneFor(daysActive);
  const tierSpan = Math.max(nextMilestone - prevMilestone, 1);
  const tierProgress = Math.min(Math.max((daysActive - prevMilestone) / tierSpan, 0), 1);
  const remainingToNext = Math.max(nextMilestone - daysActive, 0);

  const creationsThisWeek = useMemo(() => {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - weekMs;
    return history.filter((h) => new Date(h.createdAt).getTime() >= cutoff).length;
  }, [history]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Still up studying';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs text-slate-400 font-semibold">{greeting},</p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5 tracking-tight">
          {username || 'Student'}
        </h1>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => setShowProgress(true)}
          className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-focus-primary to-focus-primary-dark p-5 text-left text-white shadow-lg shadow-focus-primary/25 transition active:scale-[0.99]"
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/15" />
          <div className="pointer-events-none absolute -left-14 bottom-0 h-32 w-32 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              <StreakRing progress={tierProgress} />
              <Flame className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">Day streak</p>
              <p className="text-3xl font-black leading-none mt-1 tabular-nums">{streak}</p>
              <p className="mt-2 text-[11px] text-white/75 leading-snug">
                {remainingToNext > 0
                  ? `${remainingToNext} active day${remainingToNext === 1 ? '' : 's'} to ${badgeName(nextMilestone)}`
                  : 'Next badge is ready — tap to view'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/50 shrink-0 transition group-hover:translate-x-0.5" />
          </div>
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <StatChip icon={Sparkles} label="This week" value={creationsThisWeek} />
          <StatChip icon={Layers} label="Total created" value={history.length} />
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Study tools</p>
        <div className="grid grid-cols-2 gap-2.5">
          <ToolCard
            icon={FileText}
            label="Quiz Builder"
            hint="Turn notes into a quiz"
            accent="bg-focus-primary/10 text-focus-primary"
            onClick={() => onNavigate('quiz')}
          />
          <ToolCard
            icon={Brain}
            label="Summarizer"
            hint="Condense any topic"
            accent="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
            onClick={() => onNavigate('summarizer')}
          />
          <ToolCard
            icon={Link2}
            label="Study materials"
            hint="Browse shared sets"
            accent="bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
            onClick={() => onNavigate('community')}
          />
          <ToolCard
            icon={Layers}
            label="Review"
            hint="Clear your due cards"
            accent="bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400"
            onClick={() => onNavigate('review')}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Recent</p>
        {recent.length > 0 ? (
          <div className="space-y-2">
            {recent.map((h) => (
              <RecentRow key={h.id} item={h} onClick={() => setSelected(h)} />
            ))}
          </div>
        ) : (
          <EmptyRecent onCreate={() => onNavigate('quiz')} />
        )}
      </div>

      {selected && <HistoryDetailModal item={selected} onClose={() => setSelected(null)} />}
      {showProgress && (
        <BadgeProgressModal
          activityDays={activityDays}
          onClose={() => setShowProgress(false)}
          onReplay={(day) => {
            setShowProgress(false);
            setCelebration(day);
          }}
        />
      )}
      {celebration !== null && <BadgePackReveal milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streak hero bits
// ---------------------------------------------------------------------------

function StreakRing({ progress, size = 60, stroke = 5 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="white" strokeOpacity={0.25} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-none tabular-nums">{value}</p>
        <p className="text-[10px] text-slate-400 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge milestone helpers + rarity system
// ---------------------------------------------------------------------------

const BADGE_NAMES = ['First Spark', 'Five-Day Focus', 'Ten-Day Momentum', 'Fifteen-Day Scholar', 'Twenty-Day Mastery'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function toRoman(n: number) {
  return ROMAN[n - 1] ?? String(n);
}

function earnedMilestone(streak: number) {
  return streak >= 5 ? Math.floor(streak / 5) * 5 : streak >= 1 ? 1 : 0;
}

// The named tiers stop at day 20, but the streak doesn't — every 5 days
// after that rolls into a new "Prestige" level (I, II, III...), like a
// season pass or a game's prestige system, so long-term users always have
// a next card to chase instead of hitting a wall.
function badgeName(day: number) {
  if (day <= 20) return BADGE_NAMES[Math.min(Math.floor(day / 5), BADGE_NAMES.length - 1)];
  const level = Math.floor((day - 20) / 5);
  return `Prestige ${toRoman(level)}`;
}

// Only render a manageable set of cards: the five classic tiers, plus (once
// a student is deep into prestige territory) a rolling window around their
// current level so the grid never grows without bound.
function milestoneList(streak: number) {
  const s = Math.max(streak, 0);
  const core = [1, 5, 10, 15, 20];
  if (s < 20) {
    const highest = Math.max(5, Math.ceil((s + 1) / 5) * 5);
    return core.filter((d) => d <= highest);
  }
  const nextPrestige = Math.ceil((s + 1 - 20) / 5) * 5 + 20;
  const prevPrestige = Math.max(25, Math.floor((s - 20) / 5) * 5 + 20);
  const windowStart = Math.max(25, prevPrestige - 5);
  const prestigeMilestones: number[] = [];
  for (let d = windowStart; d <= nextPrestige; d += 5) prestigeMilestones.push(d);
  return [...core, ...prestigeMilestones];
}

// Lifetime count of badges a student has actually earned, independent of
// how many cards are currently visible in the (windowed) grid above.
function totalBadgesEarned(days: number) {
  if (days < 1) return 0;
  return 1 + Math.floor(days / 5);
}
function nextMilestoneFor(days: number) {
  if (days < 1) return 1;
  if (days < 5) return 5;
  if (days < 10) return 10;
  if (days < 15) return 15;
  if (days < 20) return 20;
  return Math.ceil((days + 1) / 5) * 5;
}
function prevMilestoneFor(days: number) {
  if (days < 1) return 0;
  if (days < 5) return 1;
  if (days < 10) return 5;
  if (days < 15) return 10;
  if (days < 20) return 15;
  return Math.floor(days / 5) * 5;
}

type Rarity = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'prestige';

function rarityForMilestone(day: number): Rarity {
  if (day > 20) return 'prestige';
  if (day === 20) return 'diamond';
  if (day >= 15) return 'platinum';
  if (day >= 10) return 'gold';
  if (day >= 5) return 'silver';
  return 'bronze';
}

// Star rating climbs with rarity, same shorthand FIFA/FC Ultimate Team
// cards use so a glance at the card tells you how rare the pull was.
function starsForMilestone(day: number) {
  if (day > 20) return 5;
  if (day === 20) return 5;
  if (day >= 15) return 4;
  if (day >= 10) return 3;
  if (day >= 5) return 2;
  return 1;
}

const RARITY: Record<
  Rarity,
  { label: string; gradient: string; ring: string; glow: string; chip: string; particle: string; icon: any; holo?: boolean }
> = {
  bronze: {
    label: 'Bronze',
    gradient: 'from-orange-700 via-amber-600 to-orange-900',
    ring: 'ring-orange-300/40',
    glow: 'rgba(194,120,3,0.55)',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
    particle: '#d97706',
    icon: Award,
  },
  silver: {
    label: 'Silver',
    gradient: 'from-slate-300 via-slate-100 to-slate-400',
    ring: 'ring-slate-300/50',
    glow: 'rgba(148,163,184,0.6)',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    particle: '#cbd5e1',
    icon: Award,
  },
  gold: {
    label: 'Gold',
    gradient: 'from-amber-300 via-yellow-400 to-amber-600',
    ring: 'ring-amber-300/50',
    glow: 'rgba(245,158,11,0.65)',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    particle: '#fbbf24',
    icon: Trophy,
  },
  platinum: {
    label: 'Platinum',
    gradient: 'from-cyan-200 via-sky-300 to-indigo-400',
    ring: 'ring-sky-300/50',
    glow: 'rgba(56,189,248,0.65)',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    particle: '#38bdf8',
    icon: Trophy,
  },
  diamond: {
    label: 'Diamond',
    gradient: 'from-sky-100 via-cyan-200 to-blue-300',
    ring: 'ring-cyan-200/60',
    glow: 'rgba(165,243,252,0.85)',
    chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200',
    particle: '#a5f3fc',
    icon: Gem,
  },
  prestige: {
    label: 'Prestige',
    gradient: 'from-fuchsia-400 via-violet-400 to-cyan-300',
    ring: 'ring-fuchsia-300/60',
    glow: 'rgba(217,70,239,0.7)',
    chip: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300',
    particle: '#e879f9',
    icon: Crown,
    holo: true,
  },
};

// ---------------------------------------------------------------------------
// Badge progress modal
// ---------------------------------------------------------------------------

function BadgeProgressModal({
  activityDays,
  onClose,
  onReplay,
}: {
  activityDays: string[];
  onClose: () => void;
  onReplay: (day: number) => void;
}) {
  const days = activityDays.length;
  const milestones = milestoneList(days);
  const next = nextMilestoneFor(days);
  const prev = prevMilestoneFor(days);
  const span = Math.max(next - prev, 1);
  const progress = Math.min(Math.max((days - prev) / span, 0), 1);
  const remaining = Math.max(next - days, 0);
  const currentRarity = RARITY[rarityForMilestone(prev)];
  const collected = totalBadgesEarned(days);

  return (
    <div className="fixed inset-0 z-[210] bg-focus-bg dark:bg-slate-950 overflow-y-auto">
      <BadgeCardStyles />
      {/* soft ambient glow behind the header — gives the page some depth
          instead of a flat single-color background */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60 dark:opacity-40"
        style={{ background: `radial-gradient(60% 60% at 50% 0%, ${currentRarity.glow}, transparent 70%)` }}
      />

      <div className="relative max-w-md mx-auto min-h-screen px-5 pt-6 pb-10">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Your progress</p>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">Creator streak</h1>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${currentRarity.gradient} p-5 mb-3 shadow-xl`}>
          <div className="khc-foil absolute inset-0" />
          <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0 h-[72px] w-[72px]">
              <StreakRing progress={progress} size={72} stroke={6} />
              <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-white tabular-nums">
                {days}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${currentRarity.chip}`}>
                <currentRarity.icon className="w-2.5 h-2.5" />
                {currentRarity.label} tier
              </span>
              <p className="mt-1.5 text-sm font-bold text-white leading-snug">
                {remaining > 0 ? `${remaining} more to ${badgeName(next)}` : `${badgeName(next)} ready`}
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-black/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
            <p className="text-lg font-black text-slate-800 dark:text-slate-100 leading-none tabular-nums">{collected}</p>
            <p className="text-[10px] text-slate-400 mt-1">Badges collected</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
            <p className="text-lg font-black text-slate-800 dark:text-slate-100 leading-none tabular-nums">{days}</p>
            <p className="text-[10px] text-slate-400 mt-1">Active days</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 px-1 mb-4 leading-relaxed">
          Create a quiz, make a summary, or share study material each day to keep your streak — and your card
          collection — growing.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {milestones.map((day) => (
            <BadgeCard
              key={day}
              day={day}
              earned={days >= day}
              isNext={day === next}
              onReplay={days >= day ? onReplay : undefined}
            />
          ))}
        </div>

        <p className="text-[10px] text-slate-400 mt-5 px-1">
          {days} active creation day{days === 1 ? '' : 's'} recorded
          {days >= 20 ? ' — new Prestige cards unlock every 5 days from here.' : '.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge card — the collectible-card look (FC-Mobile-pull inspired): foil
// texture, rarity gradient, a medallion emblem, and a star rating so a
// glance tells you how rare it is. Locked cards get a quieter, silhouette
// treatment so earned cards keep all the visual weight.
// ---------------------------------------------------------------------------

function BadgeCard({
  day,
  earned,
  isNext,
  onReplay,
}: {
  day: number;
  earned: boolean;
  isNext?: boolean;
  onReplay?: (day: number) => void;
}) {
  const rarity = RARITY[rarityForMilestone(day)];
  const Icon = rarity.icon;
  const stars = starsForMilestone(day);

  if (!earned) {
    return (
      <div
        className={`relative flex flex-col items-center gap-2 rounded-[1.4rem] p-4 pt-5 text-center border border-dashed ${
          isNext
            ? 'khc-pulse border-focus-primary/40 bg-focus-primary/[0.04] dark:bg-focus-primary/[0.06]'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        }`}
      >
        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
          <LockKeyhole className="w-5 h-5 text-slate-300 dark:text-slate-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight text-slate-400 dark:text-slate-500">{badgeName(day)}</p>
          <p className="text-[10px] mt-0.5 text-slate-300 dark:text-slate-600">
            Day {day} · {rarity.label}
          </p>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wide ${isNext ? 'text-focus-primary' : 'text-slate-300 dark:text-slate-600'}`}>
          {isNext ? 'Up next' : 'Locked'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`khc-card group relative flex flex-col items-center gap-2 overflow-hidden rounded-[1.4rem] bg-gradient-to-br ${rarity.gradient} p-4 pt-5 text-center ring-1 ring-inset ring-white/25 shadow-lg`}
    >
      <div className="khc-foil absolute inset-0" />
      {rarity.holo && <div className="khc-holo absolute inset-0" />}
      <div className="khc-sheen absolute inset-0" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40 backdrop-blur-sm">
        <Icon className="h-7 w-7 text-white drop-shadow" />
      </div>
      <div className="relative min-w-0">
        <p className="text-xs font-black leading-tight text-white drop-shadow-sm">{badgeName(day)}</p>
        <p className="text-[10px] mt-0.5 text-white/75">
          Day {day} · {rarity.label}
        </p>
      </div>
      <div className="relative flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`h-2.5 w-2.5 ${i < stars ? 'fill-white text-white' : 'text-white/25'}`} />
        ))}
      </div>
      {onReplay && (
        <button
          onClick={() => onReplay(day)}
          aria-label={`Replay ${badgeName(day)} reveal`}
          className="relative mt-0.5 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-white transition hover:bg-white/30"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="text-[10px] font-bold">Replay</span>
        </button>
      )}
    </div>
  );
}

function BadgeCardStyles() {
  return (
    <style>{`
      @keyframes khc-holo-shift-kf {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @keyframes khc-pulse-kf {
        0%, 100% { box-shadow: 0 0 0 0 rgba(79,70,229,0.18); }
        50% { box-shadow: 0 0 0 6px rgba(79,70,229,0); }
      }

      .khc-foil {
        background-image: repeating-linear-gradient(115deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 8px);
        mix-blend-mode: overlay;
        pointer-events: none;
      }
      .khc-sheen {
        background: linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 32%, transparent 68%, rgba(255,255,255,0.12) 100%);
        pointer-events: none;
      }
      .khc-holo {
        background: linear-gradient(120deg, #ff9a9e, #fecfef, #a1c4fd, #fbc2eb, #ff9a9e);
        background-size: 300% 300%;
        opacity: 0.35;
        mix-blend-mode: color-dodge;
        animation: khc-holo-shift-kf 6s ease-in-out infinite;
        pointer-events: none;
      }
      .khc-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
      .khc-card:hover { transform: translateY(-3px); }
      .khc-pulse { animation: khc-pulse-kf 2.2s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .khc-holo, .khc-pulse, .khc-card { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Badge pack reveal — the FC-Mobile-style "pull" moment
// ---------------------------------------------------------------------------

type Stage = 'idle' | 'anticipation' | 'burst' | 'reveal' | 'revealed';

function BadgePackReveal({ milestone, onClose }: { milestone: number; onClose: () => void }) {
  const rarity = RARITY[rarityForMilestone(milestone)];
  const [stage, setStage] = useState<Stage>('idle');

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const burst = useMemo(
    () =>
      Array.from({ length: 22 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 170;
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist,
          delay: Math.random() * 90,
          size: 4 + Math.random() * 7,
        };
      }),
    [milestone]
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 18 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 300,
        duration: 1400 + Math.random() * 900,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    [milestone]
  );

  useEffect(() => {
    if (stage === 'anticipation') {
      const t = setTimeout(() => setStage('burst'), reducedMotion ? 0 : 850);
      return () => clearTimeout(t);
    }
    if (stage === 'burst') {
      const t = setTimeout(() => setStage('reveal'), reducedMotion ? 0 : 420);
      return () => clearTimeout(t);
    }
    if (stage === 'reveal') {
      const t = setTimeout(() => setStage('revealed'), reducedMotion ? 0 : 750);
      return () => clearTimeout(t);
    }
  }, [stage, reducedMotion]);

  const begin = () => setStage('anticipation');

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-5 overflow-hidden"
      onClick={stage === 'revealed' ? onClose : undefined}
    >
      <BadgeRevealStyles />

      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />

      {/* rotating light rays, present from anticipation onward */}
      {stage !== 'idle' && (
        <div
          className="khb-rays absolute h-[140vmax] w-[140vmax]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${rarity.particle}33 8deg, transparent 16deg, transparent 40deg, ${rarity.particle}33 48deg, transparent 56deg)`,
          }}
        />
      )}

      {/* flash */}
      {stage === 'burst' && (
        <div
          className="khb-flash absolute h-40 w-40 rounded-full"
          style={{ background: `radial-gradient(circle, white 0%, ${rarity.particle} 35%, transparent 70%)` }}
        />
      )}

      {/* particle burst */}
      {(stage === 'burst' || stage === 'reveal') && (
        <div className="absolute h-0 w-0">
          {burst.map((p, i) => (
            <span
              key={i}
              className="khb-particle absolute rounded-sm"
              style={
                {
                  width: p.size,
                  height: p.size,
                  background: rarity.particle,
                  animationDelay: `${p.delay}ms`,
                  '--tx': `${p.tx}px`,
                  '--ty': `${p.ty}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* confetti rain, once revealed */}
      {stage === 'revealed' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="khb-confetti absolute top-[-5%] rounded-[2px]"
              style={
                {
                  left: `${c.left}%`,
                  background: i % 2 === 0 ? rarity.particle : 'white',
                  animationDelay: `${c.delay}ms`,
                  animationDuration: `${c.duration}ms`,
                  '--rot': `${c.rotate}deg`,
                  '--drift': `${c.drift}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        {stage === 'idle' && (
          <button onClick={begin} className="khb-pack-idle group flex flex-col items-center gap-5 focus:outline-none">
            <div className="relative">
              <div className="khb-pack-glow absolute inset-0 rounded-3xl" style={{ boxShadow: `0 0 60px 10px ${rarity.glow}` }} />
              <div className="relative flex h-52 w-40 flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-950 border border-white/10 shadow-2xl transition group-active:scale-95">
                <Sparkles className="h-8 w-8 text-white/70" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Badge unlocked</p>
              </div>
            </div>
            <p className="text-xs font-bold text-white/80">Tap to reveal</p>
          </button>
        )}

        {stage === 'anticipation' && (
          <div className="khb-shake flex h-52 w-40 flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-950 border border-white/10 shadow-2xl">
            <Sparkles className="h-8 w-8 text-white/80" />
          </div>
        )}

        {(stage === 'burst' || stage === 'reveal' || stage === 'revealed') && (
          <div className="flex flex-col items-center gap-5" style={{ perspective: '1000px' }}>
            {stage !== 'burst' && (
              <div
                className={`khb-card-reveal relative flex h-56 w-40 flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br ${rarity.gradient} ring-4 ${rarity.ring} shadow-2xl overflow-hidden`}
              >
                <div className="khb-foil absolute inset-0" />
                {rarity.holo && <div className="khb-holo absolute inset-0" />}
                <div className="khb-shine absolute inset-0" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40">
                  <rarity.icon className="h-9 w-9 text-white drop-shadow-lg" />
                </div>
                {stage === 'revealed' && (
                  <div className="relative flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3 w-3 ${i < starsForMilestone(milestone) ? 'fill-white text-white' : 'text-white/25'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {stage === 'revealed' && (
              <div className="khb-fade-up flex flex-col items-center gap-1.5">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${rarity.chip}`}>
                  {rarity.label} badge
                </span>
                <h2 className="text-2xl font-black text-white mt-1">{badgeName(milestone)}</h2>
                <p className="text-xs text-white/60 max-w-[26rem] leading-relaxed">
                  You reached day {milestone}.{' '}
                  {milestone >= 20 ? 'You’re prestiging — a new card lands every 5 days from here.' : 'Keep creating to unlock the next one.'}
                </p>
                <button
                  onClick={onClose}
                  className="khb-fade-up-delay mt-4 w-full rounded-2xl bg-white py-3 text-xs font-bold text-slate-900 transition active:scale-[0.98]"
                >
                  Keep studying
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BadgeRevealStyles() {
  return (
    <style>{`
      @keyframes khb-shake-kf {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        20% { transform: translate(-3px, 1px) rotate(-1.5deg); }
        40% { transform: translate(3px, -1px) rotate(1.5deg); }
        60% { transform: translate(-2px, 2px) rotate(-1deg); }
        80% { transform: translate(2px, -2px) rotate(1deg); }
      }
      @keyframes khb-glow-pulse-kf {
        0%, 100% { opacity: 0.55; transform: scale(0.96); }
        50% { opacity: 1; transform: scale(1.05); }
      }
      @keyframes khb-rays-spin-kf {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes khb-flash-kf {
        0% { transform: scale(0.2); opacity: 0; }
        30% { opacity: 1; }
        100% { transform: scale(5.5); opacity: 0; }
      }
      @keyframes khb-particle-kf {
        0% { transform: translate(0, 0) scale(1); opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
      }
      @keyframes khb-card-reveal-kf {
        0% { transform: rotateY(-110deg) scale(0.55); opacity: 0; }
        55% { transform: rotateY(12deg) scale(1.06); opacity: 1; }
        75% { transform: rotateY(-6deg) scale(0.98); }
        100% { transform: rotateY(0deg) scale(1); opacity: 1; }
      }
      @keyframes khb-shine-kf {
        0%, 40% { transform: translateX(-120%) skewX(-20deg); }
        100% { transform: translateX(160%) skewX(-20deg); }
      }
      @keyframes khb-fade-up-kf {
        from { transform: translateY(14px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes khb-confetti-kf {
        0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(105vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
      }
      @keyframes khb-holo-shift-kf {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }

      .khb-foil {
        background-image: repeating-linear-gradient(115deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 8px);
        mix-blend-mode: overlay;
      }
      .khb-holo {
        background: linear-gradient(120deg, #ff9a9e, #fecfef, #a1c4fd, #fbc2eb, #ff9a9e);
        background-size: 300% 300%;
        opacity: 0.35;
        mix-blend-mode: color-dodge;
        animation: khb-holo-shift-kf 6s ease-in-out infinite;
      }
      .khb-pack-glow { animation: khb-glow-pulse-kf 2.2s ease-in-out infinite; }
      .khb-rays { animation: khb-rays-spin-kf 18s linear infinite; }
      .khb-shake { animation: khb-shake-kf 0.85s ease-in-out; }
      .khb-flash { animation: khb-flash-kf 0.42s ease-out forwards; }
      .khb-particle { animation: khb-particle-kf 0.9s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
      .khb-card-reveal { animation: khb-card-reveal-kf 0.75s cubic-bezier(0.34, 1.2, 0.4, 1) both; transform-style: preserve-3d; }
      .khb-shine { animation: khb-shine-kf 1.6s ease-in-out 0.6s 2; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%); }
      .khb-fade-up { animation: khb-fade-up-kf 0.5s ease-out both; }
      .khb-fade-up-delay { animation: khb-fade-up-kf 0.5s ease-out 0.15s both; }
      .khb-confetti { width: 6px; height: 10px; animation-name: khb-confetti-kf; animation-timing-function: ease-in; animation-fill-mode: forwards; }

      @media (prefers-reduced-motion: reduce) {
        .khb-pack-glow, .khb-rays, .khb-shake, .khb-flash, .khb-particle,
        .khb-card-reveal, .khb-shine, .khb-fade-up, .khb-fade-up-delay, .khb-confetti, .khb-holo {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
        }
      }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Tool grid
// ---------------------------------------------------------------------------

function ToolCard({
  icon: Icon,
  label,
  hint,
  accent,
  onClick,
}: {
  icon: any;
  label: string;
  hint: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md hover:border-transparent active:translate-y-0 active:scale-[0.97]"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{hint}</p>
      </div>
      <ArrowRight className="absolute right-3.5 top-3.5 h-3.5 w-3.5 text-slate-300 dark:text-slate-700 transition group-hover:text-slate-400 group-hover:translate-x-0.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recent list
// ---------------------------------------------------------------------------

function historyIcon(type: HistoryItem['type']) {
  if (type === 'quiz') return FileText;
  if (type === 'summary') return Brain;
  return Activity;
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function RecentRow({ item, onClick }: { item: HistoryItem; onClick: () => void }) {
  const Icon = historyIcon(item.type);
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 hover:border-focus-primary/50 hover:shadow-sm transition text-left active:scale-[0.99]"
    >
      <div className="w-9 h-9 rounded-xl bg-focus-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-focus-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.title}</p>
        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3" /> {formatRelativeTime(item.createdAt)}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
}

function EmptyRecent({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-3">
      <div className="w-10 h-10 mx-auto rounded-xl bg-focus-primary/10 flex items-center justify-center">
        <FileText className="w-5 h-5 text-focus-primary" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Nothing here yet. Build your first quiz or summary to start your streak.
      </p>
      <button onClick={onCreate} className="text-xs font-bold text-focus-primary">
        Create your first quiz
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History detail modal (unchanged behavior — print/export + read-only views)
// ---------------------------------------------------------------------------

function drawQuizPdf(pdf: jsPDF, data: QuizData) {
  let y = 20;
  pdf.setFontSize(16);
  pdf.text(data.title, 15, y);
  y += 10;
  pdf.setFontSize(11);
  data.questions.forEach((q, i) => {
    if (y > 270) {
      pdf.addPage();
      y = 20;
    }
    const lines = pdf.splitTextToSize(`${i + 1}. ${q.question}`, 180);
    pdf.text(lines, 15, y);
    y += lines.length * 6 + 2;
    if (q.type === 'multiple-choice' && q.options) {
      q.options.forEach((opt, oi) => {
        pdf.text(`   ${String.fromCharCode(65 + oi)}. ${opt}`, 15, y);
        y += 6;
      });
    } else {
      pdf.text('   Answer: _______________________________', 15, y);
      y += 6;
    }
    y += 4;
  });
}

function drawSummaryPdf(pdf: jsPDF, data: SummaryData) {
  let y = 20;
  const ensureSpace = (needed: number) => {
    if (y + needed > 280) {
      pdf.addPage();
      y = 20;
    }
  };

  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(data.title, 180);
  pdf.text(titleLines, 15, y);
  y += titleLines.length * 8 + 4;

  pdf.setFontSize(11);
  const overviewLines = pdf.splitTextToSize(data.overview, 180);
  ensureSpace(overviewLines.length * 6);
  pdf.text(overviewLines, 15, y);
  y += overviewLines.length * 6 + 8;

  ensureSpace(10);
  pdf.setFontSize(13);
  pdf.text('Key Points', 15, y);
  y += 8;
  pdf.setFontSize(11);
  data.keyPoints.forEach((kp) => {
    const lines = pdf.splitTextToSize(`•  ${kp}`, 175);
    ensureSpace(lines.length * 6);
    pdf.text(lines, 15, y);
    y += lines.length * 6 + 2;
  });

  if (data.glossary?.length > 0) {
    y += 4;
    ensureSpace(10);
    pdf.setFontSize(13);
    pdf.text('Glossary', 15, y);
    y += 8;
    pdf.setFontSize(11);
    data.glossary.forEach((g) => {
      const lines = pdf.splitTextToSize(`${g.term}: ${g.definition}`, 175);
      ensureSpace(lines.length * 6);
      pdf.text(lines, 15, y);
      y += lines.length * 6 + 2;
    });
  }
}

function HistoryDetailModal({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const isPrintable = item.type === 'quiz' || item.type === 'summary';

  const exportPdf = () => {
    const pdf = new jsPDF();
    if (item.type === 'quiz') drawQuizPdf(pdf, item.data as QuizData);
    else if (item.type === 'summary') drawSummaryPdf(pdf, item.data as SummaryData);
    else return;
    pdf.save(`${item.title.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-950 overflow-y-auto print:static print:inset-auto print:overflow-visible">
      <div className="max-w-md mx-auto min-h-screen px-5 pt-6 pb-10">
        <div className="flex items-center justify-between gap-3 mb-5 print:hidden">
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
          {isPrintable && (
            <button
              onClick={exportPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-focus-primary transition"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          )}
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {item.type === 'quiz' ? 'Quiz' : item.type === 'summary' ? 'Summary' : 'Diagram'}
          </p>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{item.title}</h2>
        </div>

        {item.type === 'quiz' && <QuizDetail data={item.data as QuizData} />}
        {item.type === 'summary' && <SummaryDetail data={item.data as SummaryData} />}
        {item.type === 'visualization' && <VisualizationDetail data={item.data as VisualizationResponse} />}
      </div>
    </div>
  );
}

function QuizDetail({ data }: { data: QuizData }) {
  return (
    <div className="space-y-3">
      {data.questions.map((q, i) => (
        <div key={i} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">{i + 1}. {q.question}</p>
          <p className="text-[11px] text-focus-sage-dark dark:text-focus-sage font-semibold flex items-start gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {q.correctAnswer}
          </p>
          {q.explanation && <p className="text-[11px] text-slate-400 mt-1 italic">{q.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

function SummaryDetail({ data }: { data: SummaryData }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{data.overview}</p>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Key points</p>
        {data.keyPoints.map((kp, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-focus-primary mt-1.5 shrink-0" />
            <span>{kp}</span>
          </div>
        ))}
      </div>
      {data.glossary?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Glossary</p>
          {data.glossary.map((g, i) => (
            <div key={i} className="text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100">{g.term}: </span>
              <span className="text-slate-500 dark:text-slate-400">{g.definition}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisualizationDetail({ data }: { data: VisualizationResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
        {data.type}{data.subject ? ` · ${data.subject}` : ''}
      </p>
      {data.steps.map((s, i) => (
        <div key={i} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{i + 1}. {s.label}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.explanation}</p>
        </div>
      ))}
    </div>
  );
}
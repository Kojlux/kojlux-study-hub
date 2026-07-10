import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Camera, Trash, Sparkles, Printer, Award, FileText, 
  CheckCircle, XCircle, RefreshCw, ChevronRight, HelpCircle, 
  AlertCircle, BookOpen, Clock, Check, RefreshCcw, Download, Eye,
  Sun, Moon, Save, History, Lightbulb, BookOpenCheck, ArrowLeft, Menu, Brain,
  User as UserIcon, UserCheck, Play, Pause, Activity, Compass, LogOut, TrendingUp, Home,
  Video, Plus, Search, Info, CheckSquare, Music, Volume2, VolumeX, Smartphone, Link2,
  Bookmark, Heart, Bell, Layers
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { 
  GlossaryItem, SummaryData, QuizQuestion, QuizData, 
  QuestionEvaluation, EvaluationResult, HistoryItem, VisualizationResponse 
} from './types';
import VisualizerScreen from './components/VisualizerScreen';
import { auth, uploadBase64File, createVideoPost } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Auth from './components/Auth';

const formatDisplayUsername = (video: any, currentEmail?: string, currentUsername?: string) => {
  if (!video) return 'Mentor';
  if (video.postedByUsername && video.postedByUsername.trim()) {
    return video.postedByUsername.trim();
  }
  if (currentEmail && currentUsername && video.postedBy && video.postedBy.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
    return currentUsername.trim();
  }
  const emailOrName = video.postedBy || 'Mentor';
  if (emailOrName.includes('@')) {
    return emailOrName.split('@')[0];
  }
  return emailOrName;
};

interface ReelPlayerProps {
  video: any;
  isActive: boolean;
  onOpenSummary: (id: string) => void;
  onOpenLink: (url: string) => void;
  onDelete: (id: string) => void;
  profileEmail: string;
  profileUsername: string;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
}

function ReelPlayer({ video, isActive, onOpenSummary, onOpenLink, onDelete, profileEmail, profileUsername, isSaved, onToggleSave }: ReelPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [expandedSummary, setExpandedSummary] = useState(false);

  // User Engagement: Track watch time in seconds and report to backend
  useEffect(() => {
    if (!isActive) return;
    
    let accumulatedTime = 0;
    const interval = setInterval(() => {
      accumulatedTime += 5;
      fetch('/api/videos/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id, watchTimeSeconds: 5 })
      }).catch(err => console.error("Failed to report watch time", err));
    }, 5000);

    const startTime = Date.now();

    return () => {
      clearInterval(interval);
      const sessionElapsedMs = Date.now() - startTime;
      const sessionElapsedSec = Math.floor(sessionElapsedMs / 1000);
      const remainingSec = sessionElapsedSec - accumulatedTime;
      if (remainingSec >= 1) {
        fetch('/api/videos/engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id, watchTimeSeconds: remainingSec })
        }).catch(err => console.error("Failed to report watch time", err));
      }
    };
  }, [isActive, video.id]);

  // Sync background study beats audio playback with player state
  useEffect(() => {
    const activeAudioTrack = video.audioTrack 
      ? (CURATED_AUDIO_TRACKS.find((t) => t.id === video.audioTrack.id) || video.audioTrack) 
      : null;

    if (isActive && playing && activeAudioTrack?.url) {
      if (!audioRef.current) {
        audioRef.current = new Audio(activeAudioTrack.url);
        audioRef.current.loop = true;
      } else if (audioRef.current.src !== activeAudioTrack.url) {
        audioRef.current.pause();
        audioRef.current = new Audio(activeAudioTrack.url);
        audioRef.current.loop = true;
      }

      if (!isMuted) {
        audioRef.current.volume = 1.0;
        audioRef.current.play().catch(err => {
          console.log("Audio playback deferred or blocked by browser:", err);
        });
      } else {
        audioRef.current.volume = 0;
        audioRef.current.pause();
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [isActive, playing, video.audioTrack, isMuted]);

  // Prevent primary uploaded video audio track from clashing with selected study beats
  useEffect(() => {
    if (videoRef.current) {
      if (video.audioTrack) {
        videoRef.current.muted = true;
      } else {
        videoRef.current.muted = isMuted;
      }
    }
  }, [video.audioTrack, playing, isActive, isMuted]);

  // Set up timer loop if this is a static image being converted to video loop
  useEffect(() => {
    if (video.isStaticImage) {
      const d = video.staticDuration || 5;
      setDuration(d);
      if (isActive && playing) {
        const interval = setInterval(() => {
          setCurrentTime(prev => {
            const next = prev + 0.1;
            if (next >= d) {
              return 0;
            }
            return next;
          });
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, [isActive, playing, video.isStaticImage, video.staticDuration]);

  useEffect(() => {
    if (!video.isStaticImage && videoRef.current) {
      if (isActive) {
        videoRef.current.play().catch(err => {
          console.log('Autoplay deferred:', err);
        });
        setPlaying(true);
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
    }
  }, [isActive, video.isStaticImage]);

  const togglePlay = () => {
    if (video.isStaticImage) {
      setPlaying(!playing);
    } else if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
        setPlaying(false);
      } else {
        videoRef.current.play().catch(err => console.log(err));
        setPlaying(true);
      }
    }
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec === Infinity) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (!video.isStaticImage && videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const isBase64 = video.videoUrl && (
    video.videoUrl.startsWith('data:video/') || 
    video.videoUrl.startsWith('data:image/') ||
    video.videoUrl.match(/\.(mp4|webm|mov|ogg|png|jpg|jpeg|gif|webp)/i) || 
    !video.videoUrl.includes('youtube.com')
  );

  let youtubeUrl = video.videoUrl;
  const isYouTube = video.videoUrl && (video.videoUrl.includes('youtube.com') || video.videoUrl.includes('youtu.be'));
  if (isYouTube) {
    const hasParams = youtubeUrl.includes('?');
    youtubeUrl = hasParams 
      ? `${youtubeUrl}&controls=1&modestbranding=1&rel=0` 
      : `${youtubeUrl}?controls=1&modestbranding=1&rel=0`;
    
    if (isActive) {
      youtubeUrl += `&autoplay=1&mute=1`;
    }
  }

  return (
    <div className="w-full h-full relative bg-black flex items-center justify-center overflow-hidden">
      {video.isStaticImage ? (
        <div onClick={togglePlay} className="w-full h-full cursor-pointer flex items-center justify-center bg-slate-950">
          <img
            src={video.videoUrl}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
          {video.audioTrack && (
            <div className="absolute top-16 left-4 bg-indigo-600/90 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md backdrop-blur-xs z-20 animate-fade-in">
              <Volume2 className="w-3 h-3 animate-pulse" />
              <span>Study Audio: {video.audioTrack.title}</span>
            </div>
          )}
        </div>
      ) : isBase64 ? (
        <div className="w-full h-full relative">
          <video
            ref={videoRef}
            src={video.videoUrl}
            className="w-full h-full object-cover cursor-pointer"
            loop
            playsInline
            muted={isMuted || !!video.audioTrack}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onClick={togglePlay}
          />
          {video.audioTrack && (
            <div className="absolute top-16 left-4 bg-indigo-600/90 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md backdrop-blur-xs z-20 animate-fade-in">
              <Volume2 className="w-3 h-3 animate-pulse" />
              <span>Study Audio: {video.audioTrack.title}</span>
            </div>
          )}
        </div>
      ) : (
        <iframe
          src={youtubeUrl}
          title={video.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover pointer-events-auto"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* Play/Pause Overlay Indicator for direct files */}
      {isBase64 && !playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none z-20">
          <div className="p-4 rounded-full bg-black/70 text-white shadow-xl">
            <Play className="w-6 h-6 fill-white text-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Vignette Gradients for text protection */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent pointer-events-none z-10" />

      {/* Peer Profile Node avatar */}
      <div className="absolute top-4 left-[104px] z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md p-1.5 px-3 rounded-full border border-white/15 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[8.5px] font-black tracking-widest text-emerald-300 uppercase">Classroom Verified</span>
        </div>
      </div>

      {/* Floating Action list on right */}
      <div className="absolute right-4 bottom-24 z-20 flex flex-col items-center gap-4.5">
        <div className="w-10 h-10 rounded-full bg-indigo-600 border-2 border-white/30 flex items-center justify-center text-white text-xs font-black drop-shadow shadow-md">
          {(formatDisplayUsername(video, profileEmail, profileUsername) || 'S').charAt(0).toUpperCase()}
        </div>

        {/* Floating Speaker Mute Toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
            className={`p-2.5 rounded-full border border-white/10 shadow active:scale-90 transition duration-150 ${
              isMuted ? 'bg-black/65 text-slate-400' : 'bg-indigo-600 text-white'
            }`}
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-white" />}
          </button>
          <span className="text-[9px] font-extrabold text-white drop-shadow">
            {isMuted ? "Muted" : "Sound"}
          </span>
        </div>

        {/* Info/Summary Toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenSummary(video.id); }}
            className="p-2.5 rounded-full bg-black/60 text-white hover:bg-slate-900 border border-white/10 shadow active:scale-90 transition duration-150"
            title="Summary Detail"
          >
            <Info className="w-4 h-4 text-white" />
          </button>
          <span className="text-[9px] font-extrabold text-white drop-shadow">Summary</span>
        </div>

        {/* Bookmark / Save for later button */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSave(video.id); }}
            className={`p-2.5 rounded-full border border-white/10 shadow active:scale-90 transition duration-150 ${
              isSaved ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-black/60 text-white hover:bg-slate-900'
            }`}
            title={isSaved ? "Saved to Library" : "Save for later"}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-white text-white' : 'text-white'}`} />
          </button>
          <span className="text-[9px] font-extrabold text-white drop-shadow">
            {isSaved ? "Saved" : "Save"}
          </span>
        </div>

        {/* Compass link button */}
        {video.externalLink && (
          <div className="flex flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenLink(video.externalLink); }}
              className="p-2.5 rounded-full bg-black/60 text-white hover:bg-slate-900 border border-white/10 shadow active:scale-90 transition duration-150"
              title="Open External Resource"
            >
              <Compass className="w-4 h-4 text-emerald-400" />
            </button>
            <span className="text-[9px] font-extrabold text-white drop-shadow">Link</span>
          </div>
        )}


      </div>

      {/* Bottom Title Overlay Card */}
      <div className="absolute left-4 bottom-6 right-16 z-20 text-white text-left max-w-[85%] pointer-events-auto">
        <span className="text-[10px] font-extrabold text-indigo-300 block tracking-wide">
          @{formatDisplayUsername(video, profileEmail, profileUsername)}
        </span>
        <h3 className="text-sm font-black drop-shadow-md text-white tracking-wide leading-tight line-clamp-2 mt-0.5">
          {video.title}
        </h3>
        <p 
          onClick={() => setExpandedSummary(!expandedSummary)}
          className={`text-[11px] text-slate-200 mt-1 drop-shadow-sm font-medium leading-normal cursor-pointer select-none hover:text-white transition duration-150 ${
            expandedSummary ? '' : 'line-clamp-2'
          }`}
          title="Click to toggle full summary"
        >
          {video.summary}
          {video.summary && video.summary.length > 60 && (
            <span className="text-indigo-300 font-bold ml-1.5 hover:underline whitespace-nowrap">
              {expandedSummary ? ' [Show Less]' : ' [...Read More]'}
            </span>
          )}
        </p>

        {/* If YouTube, display description as paragraph and clickable watch link */}
        {!isBase64 && (
          <div className="mt-2.5 bg-slate-900/90 border border-slate-800/80 backdrop-blur-md p-3 rounded-xl shadow-lg space-y-1.5">
            <p className="text-[9.5px] font-bold text-indigo-300 uppercase tracking-widest leading-none">YouTube Video Resource</p>
            <div className="flex flex-col gap-1">
              <a
                href={video.videoUrl.replace('/embed/', '/watch?v=')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-350 hover:underline cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                <span>Click to watch on YouTube</span>
              </a>
              {video.externalLink && (
                <a
                  href={video.externalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-indigo-350 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-300" />
                  <span className="truncate">Reference: {video.externalLink}</span>
                </a>
              )}
            </div>
          </div>
        )}

        <span className="text-[9px] text-slate-400 block tracking-wider uppercase font-extrabold mt-1">
          {video.createdAt ? video.createdAt.split(' ')[0] : 'Just Now'}
        </span>

        {/* Interactive seeker track line for direct file videos */}
        {isBase64 && duration > 0 && (
          <div className="mt-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg">
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all duration-150"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CURATED_AUDIO_TRACKS = [
  { id: 'lofi-1', title: 'Deep Work Session', category: 'Lo-Fi Study Beats', duration: '3:15', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'lofi-2', title: 'Late Night Library', category: 'Lo-Fi Study Beats', duration: '2:45', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'ambient-1', title: 'Binaural Theta Waves', category: 'Ambient Focus', duration: '5:00', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'ambient-2', title: 'Rain in the Lecture Hall', category: 'Ambient Focus', duration: '4:20', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'classical-1', title: 'Chopin Nocturne Op. 9 No. 2', category: 'Classical Instrumental', duration: '4:30', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'classical-2', title: 'Mozart Study Playlist', category: 'Classical Instrumental', duration: '3:50', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'educational-1', title: 'Mitosis Lecture Intro Hook', category: 'Trending Educational', duration: '0:30', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'educational-2', title: 'Periodic Table mnemonic rhythm', category: 'Trending Educational', duration: '1:15', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
];

export default function App() {
    const [currentUserSession, setCurrentUserSession] = useState<User | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string>('');
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // This automatically watches if a user is logged in or logged out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUserSession(firebaseUser);
        setCurrentEmail(firebaseUser.email || '');
        // Turns clement@gmail.com into a clean username like 'clement'
        setCurrentUsername(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
      } else {
        setCurrentUserSession(null);
        setCurrentEmail('');
        setCurrentUsername('');
      }
    });
    return () => unsubscribe();
  }, []);

  

  // Appearance & Core settings
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('kojlux_dark_mode') === 'true';
  });

  // bottom navigation bar state: 'home' | 'create' | 'visualizer' | 'watch' | 'profile'
  const [activeNavTab, setActiveNavTab] = useState<'home' | 'create' | 'visualizer' | 'watch' | 'profile'>('create');

  // Interactive mobile video editing states
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(15);
  const [activeEditingTab, setActiveEditingTab] = useState<'trim' | 'aspect' | 'cover'>('trim');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [selectedCoverFrame, setSelectedCoverFrame] = useState<number>(0);

  // Audio integration states
  const [showAudioModal, setShowAudioModal] = useState<boolean>(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<{ id: string; title: string; category: string; duration: string; url?: string } | null>(null);
  const [audioSearchQuery, setAudioSearchQuery] = useState<string>('');
  const [previewPlaying, setPreviewPlaying] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Static image converter states
  const [isStaticImageMode, setIsStaticImageMode] = useState<boolean>(false);
  const [staticDuration, setStaticDuration] = useState<number>(5);

  // Unified history list
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => {
    const raw = localStorage.getItem('kojlux_saved_work');
    return raw ? JSON.parse(raw) : [];
  });

  // User Profile configuration
  const [profileEmail, setProfileEmail] = useState<string>(() => {
    return localStorage.getItem('kojlux_user_email') || '';
  });
  const [profileUsername, setProfileUsername] = useState<string>(() => {
    return localStorage.getItem('kojlux_user_username') || '';
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return !!localStorage.getItem('kojlux_user_email');
  });
  const [syncingProfile, setSyncingProfile] = useState<boolean>(false);

  // Saved videos tracking states
  const [savedVideoIds, setSavedVideoIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('kojlux_saved_videos');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showSavedOnly, setShowSavedOnly] = useState<boolean>(false);

  // Uniquely tracks the scrolling feed session to prevent video duplication
  const [sessionId, setSessionId] = useState<string>(() => {
    return 'sess-' + Math.random().toString(36).substring(2, 15);
  });

  // Grade level personalization state
  const [gradeLevel, setGradeLevel] = useState<string>(() => {
    return localStorage.getItem('kojlux_grade_level') || 'High School';
  });

  const handleUpdateGradeLevel = async (newLevel: string) => {
    setGradeLevel(newLevel);
    localStorage.setItem('kojlux_grade_level', newLevel);
    
    // If logged in, sync with server profile database
    if (isLoggedIn && profileEmail) {
      try {
        await fetch('/api/auth/profile/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: profileEmail, gradeLevel: newLevel })
        });
      } catch (err) {
        console.error('Failed to sync profile grade level:', err);
      }
    }
  };

  // Username/Password authentication and registration state variables
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [loginIdentifier, setLoginIdentifier] = useState<string>('');
  const [registerGradeLevel, setRegisterGradeLevel] = useState<string>('High School');

  // Loaded Visualization holder state
  const [activeLoadedVisualization, setActiveLoadedVisualization] = useState<{
    vizPrompt: string;
    vizResponse: VisualizationResponse;
  } | null>(null);

  // Home Screen Nav tab inside the phone mockup: 'create' | 'history' (Deprecated, we use activeNavTab now but keeping hook reference safe)
  const [homeTab, setHomeTab] = useState<'create' | 'history'>('create');
  const [showFullHistory, setShowFullHistory] = useState<boolean>(false);
  const [createSubTab, setCreateSubTab] = useState<'quiz' | 'summarizer'>('quiz');

  // Parameters
  const [image, setImage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [quizType, setQuizType] = useState<'multiple-choice' | 'short-answer'>('multiple-choice');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  
  // App views & state
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Print state mode: 'blank' | 'evaluated'
  const [printMode, setPrintMode] = useState<'blank' | 'evaluated'>('blank');
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<any[]>([
    {
      id: 'notif-1',
      title: 'Daily Quiz Challenge',
      message: 'Create a Chemistry or Biology quiz today and score 100% to boost your stats!',
      read: false,
      action: { tab: 'create', subTab: 'quiz' }
    },
    {
      id: 'notif-2',
      title: '💡 Study Tip of the Day',
      message: 'Spacing out your study sessions increases long-term retention by up to 50%!',
      read: false
    },
    {
      id: 'notif-3',
      title: 'Daily Streak Active',
      message: 'You are on a 3-day active study streak. Keep the learning fire burning!',
      read: false
    }
  ]);

  // Long press / hover state for displaying full MCQ options
  const [heldOption, setHeldOption] = useState<{ questionId: number; optionIndex: number } | null>(null);

  // Summarizer states
  const [summaryImage, setSummaryImage] = useState<string | null>(null);
  const [summaryTextInput, setSummaryTextInput] = useState<string>('');
  const [detailLevel, setDetailLevel] = useState<'concise' | 'standard' | 'thorough'>('standard');
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summarizerCameraActive, setSummarizerCameraActive] = useState<boolean>(false);

  // Camera settings
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'quiz' | 'summary'>('quiz');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Drag and drop settings
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Splash screen display
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Watch Education Videos states
  const [videos, setVideos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingVideos, setLoadingVideos] = useState<boolean>(false);
  const [showSummaryForVideoId, setShowSummaryForVideoId] = useState<string | null>(null);
  const [activePlayingVideoId, setActivePlayingVideoId] = useState<string | null>(null);
  const [showDiscoverPage, setShowDiscoverPage] = useState<boolean>(false);

  // Video Search Bar toggle
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Custom input states to post a video
  const [showPostModal, setShowPostModal] = useState<boolean>(false);
  const [newVideoTitle, setNewVideoTitle] = useState<string>('');
  const [newVideoSummary, setNewVideoSummary] = useState<string>('');
  const [newVideoUrl, setNewVideoUrl] = useState<string>('');
  const [newVideoExtLink, setNewVideoExtLink] = useState<string>('');
  const [newVideoMode, setNewVideoMode] = useState<'file' | 'link'>('file');
  const [newVideoBase64, setNewVideoBase64] = useState<string>('');
  const [newVideoFileName, setNewVideoFileName] = useState<string>('');
  const [newVideoAgreed, setNewVideoAgreed] = useState<boolean>(false);
  const [postingVideo, setPostingVideo] = useState<boolean>(false);
  const [pendingExternalLink, setPendingExternalLink] = useState<string | null>(null);

  // Likes tracking state (stored in local memory, initialized from client cache)
  const [likedVideoIds, setLikedVideoIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('kojlux_liked_videos');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleVideoLike = (videoId: string) => {
    setLikedVideoIds(prev => {
      const updated = { ...prev, [videoId]: !prev[videoId] };
      localStorage.setItem('kojlux_liked_videos', JSON.stringify(updated));
      return updated;
    });
  };

  const togglePreviewAudio = () => {
    if (!selectedAudioTrack || !selectedAudioTrack.url) return;
    if (previewPlaying) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewPlaying(false);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio(selectedAudioTrack.url);
        previewAudioRef.current.loop = true;
      } else if (previewAudioRef.current.src !== selectedAudioTrack.url) {
        previewAudioRef.current.pause();
        previewAudioRef.current = new Audio(selectedAudioTrack.url);
        previewAudioRef.current.loop = true;
      }
      previewAudioRef.current.play().catch(err => console.log("Audio deferred:", err));
      setPreviewPlaying(true);
    }
  };

  // Clean up preview audio on unmount or when modal closes
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPreviewPlaying(false);
    };
  }, [showPostModal]);

  // If selected audio track changes, stop existing preview
  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
    }
  }, [selectedAudioTrack]);

  const fetchSavedVideoIds = async () => {
    if (!profileEmail) return;
    try {
      const res = await fetch(`/api/videos/saved?email=${encodeURIComponent(profileEmail)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.savedIds) {
          const map: Record<string, boolean> = {};
          data.savedIds.forEach((id: string) => { map[id] = true; });
          setSavedVideoIds(map);
          localStorage.setItem('kojlux_saved_videos', JSON.stringify(map));
        }
      }
    } catch (err) {
      console.error("Failed to load saved videos:", err);
    }
  };

  const toggleSaveVideo = async (videoId: string) => {
    const isSaved = !!savedVideoIds[videoId];
    const updated = { ...savedVideoIds, [videoId]: !isSaved };
    setSavedVideoIds(updated);
    localStorage.setItem('kojlux_saved_videos', JSON.stringify(updated));

    if (isLoggedIn && profileEmail) {
      try {
        const res = await fetch('/api/videos/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: profileEmail, videoId, saved: !isSaved })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.savedVideoIds) {
            const map: Record<string, boolean> = {};
            data.savedVideoIds.forEach((id: string) => { map[id] = true; });
            setSavedVideoIds(map);
            localStorage.setItem('kojlux_saved_videos', JSON.stringify(map));
          }
        }
      } catch (err) {
         console.error("Failed to sync bookmark:", err);
      }
    }
  };

  const fetchVideos = async (append = false, forceSessionId?: string, forceEmail?: string, forceGradeLevel?: string) => {
    if (!append) {
      setLoadingVideos(true);
    }
    try {
      const activeSess = forceSessionId || sessionId;
      const activeEmail = forceEmail !== undefined ? forceEmail : profileEmail;
      const activeGrade = forceGradeLevel !== undefined ? forceGradeLevel : gradeLevel;
      const res = await fetch(`/api/videos/feed?sessionId=${activeSess}&email=${encodeURIComponent(activeEmail)}&gradeLevel=${encodeURIComponent(activeGrade)}&_t=${Date.now()}`);
      const data = await res.json();
      if (res.ok && data.videos) {
        if (append) {
          setVideos(prev => {
            const existingIds = new Set(prev.map(v => v.id));
            const uniqueNew = data.videos.filter((v: any) => !existingIds.has(v.id));
            return [...prev, ...uniqueNew];
          });
        } else {
          setVideos(data.videos);
          if (data.videos.length > 0 && !activePlayingVideoId) {
            setActivePlayingVideoId(data.videos[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleRefreshFeed = async () => {
    const newSessionId = 'sess-' + Math.random().toString(36).substring(2, 15);
    setSessionId(newSessionId);
    setLoadingVideos(true);
    try {
      const res = await fetch(`/api/videos/feed?sessionId=${newSessionId}&email=${encodeURIComponent(profileEmail)}&gradeLevel=${encodeURIComponent(gradeLevel)}&_t=${Date.now()}`);
      const data = await res.json();
      if (res.ok && data.videos) {
        setVideos(data.videos);
        if (data.videos.length > 0) {
          setActivePlayingVideoId(data.videos[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to refresh feed:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    try {
      const res = await fetch('/api/videos/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setVideos(prev => {
          const updated = prev.filter(v => v.id !== videoId);
          if (activePlayingVideoId === videoId) {
            if (updated.length > 0) {
              setActivePlayingVideoId(updated[0].id);
            } else {
              setActivePlayingVideoId(null);
            }
          }
          return updated;
        });
        setSaveToast("Video permanently deleted!");
        setTimeout(() => setSaveToast(null), 3000);
      } else {
        setErrorMsg(data.error || "Failed to delete video.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("An error occurred while deleting your video.");
    }
  };

  const handleFeedScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const itemHeight = container.clientHeight || 1;
    const activeIdx = Math.round(scrollTop / itemHeight);
    
    // Filter videos inside scroll
    const query = searchQuery.toLowerCase().trim();
    const currentFiltered = videos.filter(v => {
      if (!query) return true;
      return (v.title || '').toLowerCase().includes(query) || 
             (v.summary || '').toLowerCase().includes(query);
    });

    if (currentFiltered[activeIdx] && activePlayingVideoId !== currentFiltered[activeIdx].id) {
      setActivePlayingVideoId(currentFiltered[activeIdx].id);
    }

    // Infinite Feed Loop: load more algorithmic recommendations before reaching the absolute end
    if (scrollHeight - scrollTop - itemHeight < itemHeight * 1.5 && !loadingVideos) {
      fetchVideos(true);
    }
  };

  // Welcome screen splash timeout: auto-hide after 1.7 seconds
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 1700);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (activeNavTab === 'watch') {
      fetchVideos();
    }
  }, [activeNavTab]);

  const handlePostVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoTitle.trim()) {
      setErrorMsg("Please specify what your video teaches.");
      return;
    }
    if (!newVideoSummary.trim()) {
      setErrorMsg("Please provide a short summary explaining the video.");
      return;
    }

    let finalVideoUrl = '';
    if (newVideoMode === 'file') {
      if (!newVideoBase64) {
        setErrorMsg("Please select or record a video/image file first.");
        return;
      }
      finalVideoUrl = newVideoBase64;
    } else {
      if (!newVideoUrl.trim()) {
        setErrorMsg("Please supply a valid YouTube link.");
        return;
      }
      finalVideoUrl = newVideoUrl.trim();
    }

    if (!newVideoAgreed) {
      setErrorMsg("You must agree that this video consists only of learning content.");
      return;
    }

    setPostingVideo(true);
    try {
      let uploadedUrl = finalVideoUrl;

      if (newVideoMode === 'file') {
        try {
          const dest = `videos/${Date.now()}_${newVideoFileName || 'upload'}`;
          uploadedUrl = await uploadBase64File(newVideoBase64, dest);
        } catch (err) {
          console.error(err);
          setErrorMsg("Upload to Firebase Storage failed.");
          setPostingVideo(false);
          return;
        }
      }

      const postMeta = {
        title: newVideoTitle,
        summary: newVideoSummary,
        videoUrl: uploadedUrl,
        postedBy: profileEmail || 'Anonymous Mentor',
        postedByUsername: profileUsername || '',
        agreed: newVideoAgreed,
        externalLink: newVideoExtLink,
        isStaticImage: isStaticImageMode,
        staticDuration: staticDuration,
        audioTrack: selectedAudioTrack,
        createdAt: new Date().toLocaleString()
      } as any;

      const docId = await createVideoPost(postMeta);
      const videoObj = { id: docId, ...postMeta };

      setVideos(prev => [videoObj, ...prev]);
      setNewVideoTitle('');
      setNewVideoSummary('');
      setNewVideoUrl('');
      setNewVideoExtLink('');
      setNewVideoBase64('');
      setNewVideoFileName('');
      setNewVideoAgreed(false);
      setIsStaticImageMode(false);
      setStaticDuration(5);
      setSelectedAudioTrack(null);
      setShowPostModal(false);
      setSaveToast("Listed educational video successfully!");
      setTimeout(() => setSaveToast(null), 3500);
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not save video to Firebase.");
    } finally {
      setPostingVideo(false);
    }
  };

  const filteredVideos = (videos || []).filter((video: any) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (video.title || '').toLowerCase().includes(q) || 
      (video.summary || '').toLowerCase().includes(q)
    );
  });

  // Time state for the mockup phone status bar
  const [currentTime, setCurrentTime] = useState<string>('09:41');

  // Synced local storage effects
  useEffect(() => {
    localStorage.setItem('kojlux_dark_mode', darkMode ? 'true' : 'false');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('kojlux_saved_work', JSON.stringify(historyItems));
  }, [historyItems]);

  useEffect(() => {
    if (isLoggedIn && profileEmail) {
      fetchSavedVideoIds();
    } else {
      try {
        const cached = localStorage.getItem('kojlux_saved_videos');
        if (cached) {
          setSavedVideoIds(JSON.parse(cached));
        } else {
          setSavedVideoIds({});
        }
      } catch {
        setSavedVideoIds({});
      }
    }
  }, [profileEmail, isLoggedIn]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes();
      const strMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
      const strHours = hours < 10 ? `0${hours}` : `${hours}`;
      setCurrentTime(`${strHours}:${strMins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Set default answers list when new quiz arrives
  useEffect(() => {
    if (quizData) {
      // prefill empty questions map if it has not been loaded with previous answers from history
      const initial: Record<number, string> = {};
      quizData.questions.forEach(q => {
        if (userAnswers[q.id] === undefined) {
          initial[q.id] = '';
        } else {
          initial[q.id] = userAnswers[q.id];
        }
      });
      setUserAnswers(prev => ({ ...initial, ...prev }));
    }
  }, [quizData]);

  // Handle Drag/Drop processes
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Kindly choose an image file (PNG, JPG, WebP) of your notes or paper syllabus material.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Turn on camera for snapshots
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError("Camera access was not granted or is unavailable on this system.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCameraForType = async (target: 'quiz' | 'summary') => {
    setCameraTarget(target);
    await startCamera();
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        if (cameraTarget === 'summary') {
          setSummaryImage(dataUrl);
        } else {
          setImage(dataUrl);
        }
        stopCamera();
      }
    }
  };

  // Fetch / Generate quiz from Gemini API proxy
  const handleGenerateQuiz = async () => {
    if (!image && !textInput.trim()) {
      setErrorMsg("Please upload an image snapshot, snap with camera, or paste notes text first!");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setEvaluation(null);

    const messages = [
      "Analyzing note structure with Gemini computer vision...",
      "Extracting study diagrams & central concepts...",
      "Structuring requested question density...",
      "Translating formulas and key terms...",
      "Applying Kojlux pedagogic algorithms...",
      "Formulating study worksheet models..."
    ];

    let currentMsgIndex = 0;
    setLoadingMessage(messages[0]);
    
    const msgInterval = setInterval(() => {
      currentMsgIndex = (currentMsgIndex + 1) % messages.length;
      setLoadingMessage(messages[currentMsgIndex]);
    }, 2000);

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image,
          text: textInput,
          count: questionCount,
          type: quizType,
          difficulty: difficulty
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "The server could not produce the quiz questions.");
      }

      setQuizData(data);
      
      // Auto-save generated quiz immediately to Kojlux Study History
      const newQuizRecord: HistoryItem = {
        id: Date.now().toString(),
        itemType: 'quiz',
        title: data.title,
        subject: data.subject,
        savedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        difficulty: difficulty,
        quizType: quizType,
        questions: data.questions,
        userAnswers: {},
        evaluation: null
      };

      setHistoryItems(prev => {
        const updated = [newQuizRecord, ...prev];
        syncHistoryToCloud(updated, profileEmail);
        return updated;
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to generate your quiz schema. Try another photo or write simpler text notes.");
    } finally {
      clearInterval(msgInterval);
      setLoading(false);
    }
  };

  // Score answers via Gemini evaluation proxy
  const handleEvaluateQuiz = async () => {
    if (!quizData) return;
    
    // Check missing answers
    const unansweredCount = quizData.questions.filter(q => !userAnswers[q.id]?.trim()).length;
    if (unansweredCount > 0) {
      setSaveToast(`Grading. You left ${unansweredCount} questions unanswered.`);
    }

    setIsEvaluating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/evaluate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questions: quizData.questions,
          userAnswers
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || " grading calculation service failed.");
      }

      setEvaluation(data);
      
      // Auto-save evaluated score outcomes back to Kojlux Study History registry & sync
      setHistoryItems(prev => {
        const updated = prev.map(item => {
          if (item.itemType === 'quiz' && item.title === quizData.title) {
            return {
              ...item,
              userAnswers: userAnswers,
              evaluation: data
            };
          }
          return item;
        });
        syncHistoryToCloud(updated, profileEmail);
        return updated;
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Unable to score your assessment online right now.");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Cloud multi-device synchronizer helper
  const syncHistoryToCloud = async (items: HistoryItem[], userEmail: string) => {
    if (!userEmail) return;
    try {
      await fetch('/api/history/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          history: items
        })
      });
    } catch (err) {
      console.error('Failed to back up progress:', err);
    }
  };

  // Load selected element from Kojlux unified history list
  const handleLoadHistoryItem = (item: HistoryItem) => {
    if (item.itemType === 'quiz') {
      setQuizData({
        title: item.title,
        subject: item.subject,
        questions: item.questions || []
      });
      setUserAnswers(item.userAnswers || {});
      setEvaluation(item.evaluation || null);
      setDifficulty(item.difficulty || 'medium');
      setQuizType(item.quizType || 'multiple-choice');
      setCreateSubTab('quiz');
      setActiveNavTab('create');
      setSaveToast(`Loaded Quiz: ${item.title}`);
    } else if (item.itemType === 'summary') {
      setSummaryData(item.summaryData || null);
      setDetailLevel(item.detailLevel || 'standard');
      setCreateSubTab('summarizer');
      setActiveNavTab('create');
      setSaveToast(`Loaded Summary: ${item.title}`);
    } else if (item.itemType === 'visualization') {
      setActiveLoadedVisualization({
        vizPrompt: item.vizPrompt || '',
        vizResponse: item.vizResponse!
      });
      setActiveNavTab('visualizer');
      setSaveToast(`Loaded Visualization: ${item.title}`);
    }
    setTimeout(() => setSaveToast(null), 2500);
  };

  // Delete history item with cloud synchronization backup cascade
  const handleDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistoryItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      syncHistoryToCloud(updated, profileEmail);
      return updated;
    });
    setSaveToast("Study history item deleted permanently.");
  };

  const handleProfileLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim()) {
      alert("Please enter your username or email.");
      return;
    }
    if (!authPassword) {
      alert("Please enter your password.");
      return;
    }
    setSyncingProfile(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          loginIdentifier: loginIdentifier.trim(), 
          password: authPassword 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setIsLoggedIn(true);
        setProfileEmail(data.email);
        setProfileUsername(data.username);
        localStorage.setItem('kojlux_user_email', data.email);
        localStorage.setItem('kojlux_user_username', data.username);
        
        const newSess = 'sess-' + Math.random().toString(36).substring(2, 15);
        setSessionId(newSess);
        fetchVideos(false, newSess, data.email, data.gradeLevel || gradeLevel);
        
        if (data.gradeLevel) {
          setGradeLevel(data.gradeLevel);
          localStorage.setItem('kojlux_grade_level', data.gradeLevel);
        }
        
        if (data.history && data.history.length > 0) {
          setHistoryItems(prev => {
            const merged = [...data.history];
            prev.forEach(localItem => {
              if (!merged.some(m => m.id === localItem.id)) {
                merged.push(localItem);
              }
            });
            syncHistoryToCloud(merged, data.email);
            return merged;
          });
          setSaveToast("Logged in and synced data!");
        } else {
          syncHistoryToCloud(historyItems, data.email);
          setSaveToast("Welcome back! Device backed up.");
        }
        // clear login fields
        setLoginIdentifier('');
        setAuthPassword('');
      } else {
        alert(data.error || "Failed to sign in. Verify credentials.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to sync your profile online. Kindly check server endpoints.");
    } finally {
      setSyncingProfile(false);
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  const handleProfileRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim()) {
      alert("Please enter a username.");
      return;
    }
    if (!authEmail.trim() || !authEmail.includes('@')) {
      alert("Please enter a valid email address.");
      return;
    }
    if (!authPassword || authPassword.length < 4) {
      alert("Password must be at least 4 characters.");
      return;
    }
    setSyncingProfile(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: authUsername.trim(),
          email: authEmail.trim(),
          password: authPassword,
          gradeLevel: registerGradeLevel
        })
      });
      const data = await res.json();
      if (res.ok) {
        setIsLoggedIn(true);
        setProfileEmail(data.email);
        setProfileUsername(data.username);
        localStorage.setItem('kojlux_user_email', data.email);
        localStorage.setItem('kojlux_user_username', data.username);
        
        const newSess = 'sess-' + Math.random().toString(36).substring(2, 15);
        setSessionId(newSess);
        fetchVideos(false, newSess, data.email, data.gradeLevel || gradeLevel);
        
        if (data.gradeLevel) {
          setGradeLevel(data.gradeLevel);
          localStorage.setItem('kojlux_grade_level', data.gradeLevel);
        }
        
        // Sync any offline items created
        syncHistoryToCloud(historyItems, data.email);
        setSaveToast("Account created successfully!");
        setIsRegisterMode(false);
        setAuthUsername('');
        setAuthEmail('');
        setAuthPassword('');
      } else {
        alert(data.error || "Failed to register account.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to register. Kindly check server endpoints.");
    } finally {
      setSyncingProfile(false);
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  const handleProfileLogout = () => {
    setIsLoggedIn(false);
    setProfileEmail('');
    setProfileUsername('');
    localStorage.removeItem('kojlux_user_email');
    localStorage.removeItem('kojlux_user_username');
    
    const newSess = 'sess-' + Math.random().toString(36).substring(2, 15);
    setSessionId(newSess);
    fetchVideos(false, newSess, '', gradeLevel);
    
    setSaveToast("Logged out successfully.");
    setTimeout(() => setSaveToast(null), 2500);
  };

  const handleSaveVisualizationHistory = (newRecord: HistoryItem) => {
    setHistoryItems(prev => {
      const updated = [newRecord, ...prev];
      syncHistoryToCloud(updated, profileEmail);
      return updated;
    });
    setSaveToast("Saved simulation graph to history registry!");
    setTimeout(() => setSaveToast(null), 2500);
  };

  // Trigger browser print
  const handlePrintDocument = (mode: 'blank' | 'evaluated') => {
    downloadQuizPDF(mode);
  };

  const downloadQuizPDF = (mode: 'blank' | 'evaluated') => {
    if (!quizData) return;
    
    const doc = new jsPDF();
    let y = 20;
    
    // Branding Header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229); // indigo-600
    doc.text("LEARN WITH KOJLUX STUDY ASSISTANT", 20, y);
    y += 8;
    
    // Quiz Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42); // slate-900
    const wrappedTitle = doc.splitTextToSize(quizData.title, 170);
    doc.text(wrappedTitle, 20, y);
    y += (wrappedTitle.length * 6) + 2;
    
    // Meta Rows
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Subject: ${quizData.subject}   |   Difficulty: ${difficulty.toUpperCase()}   |   Questions Count: ${quizData.questions.length}`, 20, y);
    y += 5;
    doc.text(`Generated on: ${new Date().toLocaleDateString()} via Kojlux study engine`, 20, y);
    
    if (mode === 'evaluated' && evaluation) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(`Scored Evaluation: ${evaluation.summary.overallPercentage}% Accuracy Code`, 20, y);
    }
    
    y += 6;
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.line(20, y, 190, y);
    y += 10;
    
    // Student info fields if blank
    if (mode === 'blank') {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("Student Name: ___________________________", 20, y);
      doc.text("Date / Class: ___________________________", 110, y);
      y += 12;
    }
    
    // Loop through questions
    quizData.questions.forEach((q, qIndex) => {
      // Check space remaining to prevent overflow
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      
      const evaluationInfo = evaluation?.questionEvaluations.find(e => e.id === q.id);
      const isCorrect = evaluationInfo?.isCorrect;
      const userAnswer = userAnswers[q.id] || "";
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      
      // Wrap question text
      const wrappedQuestion = doc.splitTextToSize(`${qIndex + 1}. ${q.question}`, 170);
      doc.text(wrappedQuestion, 20, y);
      y += (wrappedQuestion.length * 5.5) + 2;
      
      if (q.type === 'multiple-choice' && q.options) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        q.options.forEach((opt, oIdx) => {
          if (y > 265) {
            doc.addPage();
            y = 20;
          }
          const optionLabel = String.fromCharCode(65 + oIdx);
          
          let optionText = `[  ]  ${optionLabel}. ${opt}`;
          
          if (mode === 'evaluated') {
            const isUserSelection = userAnswer === optionLabel;
            const isCorrectSelection = q.correctAnswer === optionLabel;
            if (isUserSelection && isCorrectSelection) {
              optionText = `[X]  ${optionLabel}. ${opt}  (Correct ✓)`;
              doc.setTextColor(16, 185, 129);
              doc.setFont("helvetica", "bold");
            } else if (isUserSelection) {
              optionText = `[X]  ${optionLabel}. ${opt}  (Your Choice - Incorrect ✗)`;
              doc.setTextColor(239, 68, 68);
              doc.setFont("helvetica", "bold");
            } else if (isCorrectSelection) {
              optionText = `[  ]  ${optionLabel}. ${opt}  (Correct Option •)`;
              doc.setTextColor(16, 185, 129);
              doc.setFont("helvetica", "bold");
            } else {
              doc.setTextColor(100, 116, 139);
              doc.setFont("helvetica", "normal");
            }
          } else {
            doc.setTextColor(51, 65, 85);
          }
          
          const wrappedOption = doc.splitTextToSize(optionText, 160);
          doc.text(wrappedOption, 28, y);
          y += (wrappedOption.length * 4.5) + 1.5;
        });
        
        y += 1.5;
        // Print explanation if evaluated
        if (mode === 'evaluated' && q.explanation) {
          if (y > 265) {
            doc.addPage();
            y = 20;
          }
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          const wrappedTip = doc.splitTextToSize(`Explanation: ${q.explanation}`, 160);
          doc.text(wrappedTip, 28, y);
          y += (wrappedTip.length * 4.5) + 2.5;
        }
      } else if (q.type === 'short-answer') {
        if (mode === 'evaluated') {
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          
          const wrappedUserStr = doc.splitTextToSize(`Your Answer: ${userAnswer || "Left Blank"}`, 165);
          doc.text(wrappedUserStr, 25, y);
          y += (wrappedUserStr.length * 4.5) + 1.5;
          
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          const wrappedModelStr = doc.splitTextToSize(`Tutor Reference Key: ${evaluationInfo?.modelAnswer || ""}`, 165);
          doc.text(wrappedModelStr, 25, y);
          y += (wrappedModelStr.length * 4.5) + 1.5;
          
          doc.setTextColor(79, 70, 229);
          doc.setFont("helvetica", "italic");
          const wrappedFeedbackStr = doc.splitTextToSize(`Score Coach (${evaluationInfo?.score}%): ${evaluationInfo?.feedback || ""}`, 165);
          doc.text(wrappedFeedbackStr, 25, y);
          y += (wrappedFeedbackStr.length * 4.5) + 2.5;
        } else {
          // Provide lines for pencil answers
          y += 3;
          doc.setDrawColor(226, 232, 240);
          doc.line(25, y, 185, y);
          y += 6;
          doc.line(25, y, 185, y);
          y += 6;
          doc.line(25, y, 185, y);
          y += 4;
        }
      }
      y += 2.5;
    });
    
    // Advice Section at End if Evaluated
    if (mode === 'evaluated' && evaluation) {
      if (y > 210) {
        doc.addPage();
        y = 20;
      }
      y += 4;
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(0.5);
      doc.line(20, y, 190, y);
      y += 6;
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("TUTOR PEDAGOGIC COACH REPORT", 20, y);
      y += 6;
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const wrappedFeedback = doc.splitTextToSize(evaluation.summary.tutorAdvice, 170);
      doc.text(wrappedFeedback, 20, y);
      y += (wrappedFeedback.length * 5) + 4;
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Recommended Review Topics: ${evaluation.summary.focusTopics.join(", ")}`, 20, y);
    }
    
    doc.save(`${quizData.title.toLowerCase().replace(/\s+/g, '_')}_quiz.pdf`);
  };

  const downloadSummaryPDF = () => {
    if (!summaryData) return;
    const doc = new jsPDF();
    let y = 20;
    
    // Header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text("LEARN WITH KOJLUX STUDY INSIGHTS", 20, y);
    y += 8;
    
    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const wrappedTitle = doc.splitTextToSize(summaryData.title, 170);
    doc.text(wrappedTitle, 20, y);
    y += (wrappedTitle.length * 6) + 2;
    
    // Meta
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Subject: ${summaryData.subject}   |   Format: KOJLUX STUDY SHEET   |   Style: ${detailLevel.toUpperCase()}`, 20, y);
    y += 5;
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, y);
    
    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(20, y, 190, y);
    y += 10;
    
    // Main Idea
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("Core Central Thesis / Main Idea", 20, y);
    y += 5;
    
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const wrappedMain = doc.splitTextToSize(summaryData.mainIdea, 170);
    doc.text(wrappedMain, 20, y);
    y += (wrappedMain.length * 4.8) + 7;
    
    // Key Takeaways
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("Key Takeaways & Conceptual Lessons", 20, y);
    y += 5;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    
    summaryData.keyTakeaways.forEach((takeaway) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      const bulletText = `•  ${takeaway}`;
      const wrappedBullet = doc.splitTextToSize(bulletText, 165);
      doc.text(wrappedBullet, 24, y);
      y += (wrappedBullet.length * 4.5) + 1.5;
    });
    
    y += 4;
    
    // Key Glossary Terms
    if (summaryData.glossary && summaryData.glossary.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Glossary & Technical Formulations", 20, y);
      y += 5;
      
      summaryData.glossary.forEach((item) => {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`${item.term}: `, 24, y);
        
        // Let's print definition
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const wrappedDefinition = doc.splitTextToSize(item.definition, 130);
        doc.text(wrappedDefinition, 55, y);
        y += (wrappedDefinition.length * 4.5) + 1.5;
      });
      y += 3;
    }
    
    // Comprehensive Outline Summation
    if (summaryData.comprehensiveSummary) {
      if (y > 230) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Comprehensive Study Guide Summation", 20, y);
      y += 5;
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const wrappedComp = doc.splitTextToSize(summaryData.comprehensiveSummary, 170);
      doc.text(wrappedComp, 20, y);
      y += (wrappedComp.length * 4.8) + 6;
    }
    
    // Footer Branding
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(20, y, 190, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(148, 163, 184);
    doc.text("Learn with Kojlux Summary Engine • Downloaded Study Companion", 20, y);
    
    doc.save(`${summaryData.title.toLowerCase().replace(/\s+/g, '_')}_summary.pdf`);
  };

  const handleGenerateSummary = async () => {
    if (!summaryImage && !summaryTextInput.trim()) {
      setErrorMsg("Please upload an image snapshot, snap with camera, or paste notes text first!");
      return;
    }

    setIsSummarizing(true);
    setErrorMsg(null);

    const messages = [
      "Gemini analyzing study notes formatting...",
      "Extracting critical dates, names, and formulas...",
      "Synthesizing central thesis concepts...",
      "Structuring key takeaways outline...",
      "Compiling definition dictionary items..."
    ];

    let currentMsgIndex = 0;
    setLoadingMessage(messages[0]);
    
    const msgInterval = setInterval(() => {
      currentMsgIndex = (currentMsgIndex + 1) % messages.length;
      setLoadingMessage(messages[currentMsgIndex]);
    }, 2000);

    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: summaryImage,
          text: summaryTextInput,
          detailLevel: detailLevel
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "The server summary service was unable to process the notes.");
      }

      setSummaryData(data);

      // Auto-save generated summary to Kojlux Study History
      const newSummaryRecord: HistoryItem = {
        id: Date.now().toString(),
        itemType: 'summary',
        title: data.title,
        subject: data.subject,
        savedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        summaryData: data,
        detailLevel: detailLevel
      };

      setHistoryItems(prev => {
        const updated = [newSummaryRecord, ...prev];
        syncHistoryToCloud(updated, profileEmail);
        return updated;
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to generate your study summary sheet. Try another notes snapshot.");
    } finally {
      clearInterval(msgInterval);
      setIsSummarizing(false);
    }
  };

  const clearInputs = () => {
    setImage(null);
    setTextInput('');
    setQuizData(null);
    setEvaluation(null);
    setUserAnswers({});
    setActiveNavTab('create');
  };

  const clearSummaryInputs = () => {
    setSummaryImage(null);
    setSummaryTextInput('');
    setSummaryData(null);
  };

  // Show splash screen overlay
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-indigo-900 via-slate-900 to-black flex flex-col items-center justify-center">
        <div className="text-center animate-fade-in">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">KOJLUX</h1>
          <p className="text-indigo-300 font-semibold">Study Hub</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-slate-800 font-sans mt-0 flex flex-col justify-start transition-all duration-300 ${
      (activeNavTab === 'watch' && !showDiscoverPage) ? 'p-0' : 'p-4 pt-0 md:p-6 md:pt-0 pb-24'
    } ${
      (activeNavTab === 'watch' && !showDiscoverPage) ? 'bg-black text-white' : (darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#F0F4F8]')
    }`}>
      
      {/* ================= PRINT WINDOW CHASSIS (HIDDEN IN SECURE WEB VIEW) ================= */}
      {quizData && (
        <div className="hidden print:block print-only-wrapper w-full bg-white p-8 text-black my-0 mx-auto">
          <div className="flex justify-between items-start border-b-2 border-slate-300 pb-4 mb-5">
            <div>
              <span className="text-xs font-bold text-indigo-700 tracking-[0.2em] uppercase">LEARN WITH KOJLUX</span>
              <h1 className="text-3xl font-serif italic text-slate-900 mt-1">{quizData.title}</h1>
              <span className="text-xs text-slate-500 font-medium block mt-1">
                Subject Focus: {quizData.subject} • Level: <strong className="capitalize">{difficulty}</strong>
              </span>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="border border-slate-300 px-3 py-1 rounded bg-slate-50 font-mono text-slate-600 font-bold text-[9px] uppercase">
                ID: Kojlux-{(quizData.questions.length * 153).toString(16).toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Generated: {new Date().toLocaleDateString()}</span>
              {evaluation && printMode === 'evaluated' && (
                <span className="text-emerald-600 font-bold text-sm mt-1">{evaluation.summary.overallPercentage}% Score Passed</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-4 mb-4 border-b border-dashed border-slate-300">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Student Username:</label>
              <div className="h-6 border-b border-slate-400 w-full"></div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Date & Signature:</label>
              <div className="h-6 border-b border-slate-400 w-full"></div>
            </div>
          </div>

          <div className="space-y-6">
            {quizData.questions.map((q, idx) => {
              const specGrade = evaluation?.questionEvaluations.find(e => e.id === q.id);
              const isCorrectAnswer = specGrade?.isCorrect;
              const savedUserAns = userAnswers[q.id] || '';
              
              return (
                <div key={q.id} className="space-y-2 avoid-break pb-1">
                  <p className="font-semibold text-sm text-slate-950">
                    {idx + 1}. {q.question}
                  </p>
                  
                  {q.type === 'multiple-choice' && q.options && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pl-6">
                      {q.options.map((opt, oIdx) => {
                        const letter = String.fromCharCode(65 + oIdx); // A, B, C, D
                        const optionSelected = savedUserAns === letter;
                        const correctMark = q.correctAnswer === letter;
                        
                        return (
                          <div key={oIdx} className="text-xs flex items-center gap-2">
                            {printMode === 'evaluated' ? (
                              <span className={`inline-block w-4 h-4 rounded text-center leading-3 font-bold border ${
                                correctMark 
                                  ? 'bg-emerald-100 border-emerald-400 text-emerald-800' 
                                  : optionSelected 
                                    ? 'bg-rose-100 border-rose-450 text-rose-800' 
                                    : 'border-slate-350'
                              }`}>
                                {optionSelected ? '✓' : correctMark ? '•' : ''}
                              </span>
                            ) : (
                              <span className="inline-block w-4 h-4 border border-slate-450 rounded-sm"></span>
                            )}
                            <span className="text-slate-900">
                              <span className="font-semibold">{letter}.</span> {opt}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'short-answer' && (
                    <div className="pl-4 space-y-1">
                      {printMode === 'evaluated' ? (
                        <div className="space-y-1 bg-slate-50 p-2 rounded text-xs">
                          <p className="text-[11px] text-slate-600">
                            <strong>Your Answer:</strong> {savedUserAns || "(Left Blank)"}
                          </p>
                          <p className="text-[11px] text-emerald-800 font-semibold">
                            <strong>Solution Key:</strong> {specGrade?.modelAnswer}
                          </p>
                          <p className="text-[10px] text-slate-500 italic">
                            <strong>Feedback ({specGrade?.score || 0}%):</strong> {specGrade?.feedback}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 py-1">
                          <div className="border-b border-dashed border-slate-300 h-5"></div>
                          <div className="border-b border-dashed border-slate-300 h-5"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {printMode === 'evaluated' && q.type === 'multiple-choice' && q.explanation && (
                    <p className="text-[10px] text-slate-500 italic pl-6 pt-0.5">
                      <strong>Tutor Explanation:</strong> {q.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Include AI Tutor advice results at bottom if printing evaluated worksheet */}
          {printMode === 'evaluated' && evaluation && (
            <div className="mt-8 pt-4 border-t border-slate-300 space-y-2 bg-indigo-50/50 p-4 rounded-xl">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-widest">TutorFocus Review Advice Outline:</h4>
              </div>
              <p className="text-xs text-slate-700 leading-normal mb-2">
                {evaluation.summary.tutorAdvice}
              </p>
              <div className="text-xs text-slate-600 block">
                <strong>Targeted study areas:</strong> {evaluation.summary.focusTopics.join(', ')}
              </div>
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>Learn With Kojlux Exam Engine • Complete Offline Study Guide</span>
            <span>https://ai.studio/build/kojlux</span>
          </div>
        </div>
      )}

      {/* ================= MAIN APPLICATION INTERFACES ================= */}
      <div className={`mx-auto w-full flex-1 flex flex-col justify-start print:hidden ${
        (activeNavTab === 'watch' && !showDiscoverPage) ? 'max-w-full gap-0 pb-0 pt-0' : 'max-w-7xl gap-3 pb-24 pt-0'
      }`}>
        
        {/* Upper Brand / Menu dropdown wrapper */}
        {!(activeNavTab === 'watch' && !showDiscoverPage) && (
          <div className="flex justify-between items-center border-b border-slate-200/50 dark:border-slate-800 pb-2 mb-1 mt-0 relative">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-[0.15em] text-indigo-600 dark:text-indigo-455 select-none bg-transparent">KOJLUX STUDY HUB</span>
            </div>
            
            <div className="relative">
              <button 
                type="button" 
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  // Mark notifications as read when opening
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                }}
                className="relative flex items-center justify-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850 hover:scale-105 transition shadow-sm"
                id="notifications-trigger-btn"
                title="Notifications"
              >
                <svg viewBox="0 0 260 260" xmlns="http://w3.org" className="w-6 h-6 text-indigo-600 dark:text-indigo-400">
  <defs>
    <linearGradient id="markGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#6366F1"/>
      <stop offset="100%" stopColor="#4338CA"/>
    </linearGradient>
    <linearGradient id="playGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#FFFFFF"/>
      <stop offset="100%" stopColor="#E0E7FF"/>
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="220" height="220" rx="52" fill="url(#markGrad)"/>
  <g transform="translate(60, 78)">
    <path d="M70 0 C48 -6 22 -6 0 4 L0 118 C22 108 48 108 70 116 Z" fill="#FFFFFF" opacity="0.95"/>
    <path d="M70 0 C92 -6 118 -6 140 4 L140 118 C118 108 92 108 70 116 Z" fill="#FFFFFF" opacity="0.95"/>
    <path d="M12 22 C28 16 48 16 62 22" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
    <path d="M12 46 C28 40 48 40 62 46" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
    <path d="M12 70 C28 64 44 64 56 68" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
    <path d="M78 22 C94 16 114 16 128 22" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
    <path d="M78 46 C94 40 114 40 128 46" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
    <path d="M84 70 C98 64 112 64 122 68" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
  </g>
  <circle cx="196" cy="196" r="34" fill="url(#playGrad)"/>
  <circle cx="196" cy="196" r="34" fill="none" stroke="#4338CA" strokeWidth="4" opacity="0.15"/>
  <path d="M186 180 L212 196 L186 212 Z" fill="#4338CA"/>
  <g transform="translate(198, 46)">
    <path d="M0 -16 L5 -5 L16 0 L5 5 L0 16 L-5 5 L-16 0 L-5 -5 Z" fill="#FFFFFF" opacity="0.9"/>
  </g>
</svg>

                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>
              
              {/* Custom Interactive Notifications List Dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-4 shrink-0 transition text-left animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-850 mb-3">
                    <span className="text-[10px] font-extrabold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">Classroom Alerts</span>
                    <button 
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-[10px] text-slate-400 text-center py-4">No notifications yet.</p>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-150 dark:border-slate-800/60 flex flex-col gap-1 text-left relative">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[10.5px] font-black text-slate-800 dark:text-white leading-tight">
                              {notif.title}
                            </span>
                            {!notif.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-snug">
                            {notif.message}
                          </p>
                          {notif.action && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveNavTab(notif.action.tab);
                                if (notif.action.subTab) {
                                  setCreateSubTab(notif.action.subTab);
                                }
                                setNotificationsOpen(false);
                              }}
                              className="mt-1.5 self-start text-[9px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-lg transition shadow-3xs"
                            >
                              Go to feature
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`w-full mx-auto mt-0 flex flex-col items-stretch flex-1 ${
          (activeNavTab === 'watch' && !showDiscoverPage) ? 'max-w-full px-0' : 'max-w-7xl px-2'
        }`}>
          
          {/* ================= MAIN APPLICATION CARD ================= */}
          <div className={`w-full h-full relative overflow-visible flex flex-col justify-between flex-1 transition-all p-0 ${
            (activeNavTab === 'watch' && !showDiscoverPage) ? 'gap-0 bg-black' : 'gap-6 bg-[#F0F4F8] dark:bg-slate-950'
          }`}>
              
              {/* Inner App Container & Native Views Router */}
              <div className={`flex-1 flex flex-col justify-start relative transition-colors ${
                (activeNavTab === 'watch' && !showDiscoverPage) ? 'p-0' : 'p-2'
              }`}>
                
                {/* Embedded camera handler */}
                {cameraActive ? (
                  <div className="absolute inset-0 bg-black z-50 flex flex-col justify-between p-4">
                    <div className="flex justify-between items-center text-white">
                      <span className="text-xs font-semibold">Kojlux Note Lens Active</span>
                      <button 
                        onClick={stopCamera} 
                        className="p-1 px-3 bg-slate-800 text-slate-200 rounded-full text-xs hover:bg-slate-700 font-bold"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="flex-1 bg-slate-900 my-4 rounded-xl overflow-hidden flex items-center justify-center relative border border-slate-800">
                      <video 
                        ref={videoRef} 
                        className="w-full h-full object-cover" 
                        playsInline
                        muted
                      />
                      {cameraError && (
                        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center">
                          <AlertCircle className="w-9 h-9 text-red-500 mb-2" />
                          <p className="text-white text-xs font-semibold">{cameraError}</p>
                          <button 
                            onClick={stopCamera} 
                            className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold"
                          >
                            Return Back
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center items-center">
                      <button 
                        onClick={capturePhoto}
                        disabled={!!cameraError}
                        className="w-16 h-16 rounded-full bg-white border-4 border-slate-350 flex items-center justify-center active:scale-95 disabled:opacity-50"
                      >
                        <span className="w-10 h-10 rounded-full bg-red-600 block"></span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Intelligent AI Generation Loader */}
                {loading && (
                  <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-40 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-slate-900/50 border border-indigo-100 dark:border-slate-800 flex items-center justify-center mb-4">
                      <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 tracking-wider uppercase block mb-1">KOJLUX GENERATING</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analyzing study material...</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-3 animate-pulse max-w-[240px] leading-relaxed">
                      {loadingMessage}
                    </p>
                    <div className="mt-8 flex gap-1 justify-center w-24">
                      <span className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '200ms' }}></span>
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '400ms' }}></span>
                    </div>
                  </div>
                )}

                {/* Active Quiz Utility header */}
                {quizData && (
                  <header className="flex justify-end items-center mb-4 border-b border-slate-100 dark:border-slate-850 pb-3">
                    <div className="flex gap-1.5 ml-auto">
                      <button 
                        type="button"
                        onClick={clearInputs}
                        className="p-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 text-[10px] font-bold transition flex items-center gap-1.5"
                      >
                        <RefreshCcw className="w-3 h-3" /> Create New Quiz
                      </button>
                    </div>
                  </header>
                )}

                {/* APPLICATION SCREENS INTERACTIVE ROUTER */}

                {/* APPLICATION SCREENS INTERACTIVE ROUTER */}

                {/* TAB 1: HOME CONTROLLER */}
                {activeNavTab === 'home' && (() => {
                  const displayName = profileUsername || (profileEmail ? profileEmail.split('@')[0] : 'Scholar');
                  const recentItems = historyItems.slice(0, 2);

                  return (
                    <div className="flex-1 flex flex-col gap-5 animate-fade-in text-left">
                      {/* 1. Personalized Welcome Header */}
                      <div className="flex justify-between items-center bg-transparent">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Welcome Back</span>
                          <span className="text-xl font-bold text-slate-800 dark:text-white block mt-0.5">
                            {displayName}
                          </span>
                        </div>
                       
                      </div>

                      {/* 2. Central Quick Actions Grid */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block pl-0.5">Quick Actions</span>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Card 1: Quiz Builder */}
                          <div
                            onClick={() => {
                              setActiveNavTab('create');
                              setCreateSubTab('quiz');
                            }}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between min-h-[110px]"
                          >
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/60 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                              <BookOpenCheck className="w-4.5 h-4.5" />
                            </div>
                            <div className="mt-3">
                              <h3 className="text-xs font-bold text-slate-800 dark:text-white">New Quiz Builder</h3>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">Upload notes to auto-generate tests</p>
                            </div>
                          </div>

                          {/* Card 2: Concept Visualizer */}
                          <div
                            onClick={() => setActiveNavTab('visualizer')}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between min-h-[110px]"
                          >
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100/60 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                              <Compass className="w-4.5 h-4.5" />
                            </div>
                            <div className="mt-3">
                              <h3 className="text-xs font-bold text-slate-800 dark:text-white">Concept Visualizer</h3>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">Animate math & physics concepts</p>
                            </div>
                          </div>

                          {/* Card 3: Watch Feed */}
                          <div
                            onClick={() => setActiveNavTab('watch')}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between min-h-[110px]"
                          >
                            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100/60 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
                              <Video className="w-4.5 h-4.5" />
                            </div>
                            <div className="mt-3">
                              <h3 className="text-xs font-bold text-slate-800 dark:text-white">Explore Watch Feed</h3>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">Scroll short educational video reels</p>
                            </div>
                          </div>

                          {/* Card 4: Notes Summarizer */}
                          <div
                            onClick={() => {
                              setActiveNavTab('create');
                              setCreateSubTab('summarizer');
                            }}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between min-h-[110px]"
                          >
                            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100/60 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                              <FileText className="w-4.5 h-4.5" />
                            </div>
                            <div className="mt-3">
                              <h3 className="text-xs font-bold text-slate-800 dark:text-white">Notes Summarizer</h3>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">Compile study sheets & glossary cards</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 2.5 Recent Reels Horizontal Scroll */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block pl-0.5">Trending Classroom Reels</span>
                        <div className="flex overflow-x-auto gap-3.5 pb-2.5 scrollbar-none snap-x -mx-1 px-1">
                          {(() => {
                            const firstFour = videos.slice(0, 4);
                            
                            return(
                             
                              <>
                                {firstFour.map((video) => {
                                  return (
                                    <div
                                      key={video.id}
                                      onClick={() => {
                                        setActiveNavTab('watch');
                                        setShowDiscoverPage(false);
                                        setActivePlayingVideoId(video.id);
                                      }}
                                      className="w-[140px] h-[190px] rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-950 border border-slate-200/20 dark:border-slate-800 shadow-sm relative flex-shrink-0 snap-start overflow-hidden hover:scale-[1.03] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between p-3.5 text-left"
                                    >
                                      {/* Gradient Overlay for backdrop */}
                                      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                                      
                                      {/* Badge */}
                                      <div className="z-10 bg-indigo-600/95 text-white text-[8.5px] font-bold px-2 py-0.5 rounded-md self-start">
                                        {video.targetGradeLevel || video.gradeLevel || 'Study'}
                                      </div>
                                      
                                      {/* Play Icon */}
                                      <div className="z-10 w-9 h-9 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center text-white border border-white/35 mx-auto self-center shadow-xs">
                                        <Play className="w-4.5 h-4.5 fill-white text-white ml-0.5" />
                                      </div>
                                      
                                      {/* Title & Creator */}
                                      <div className="z-10 mt-auto">
                                        <h4 className="text-[10px] font-bold text-white line-clamp-2 leading-snug drop-shadow-md">
                                          {video.title}
                                        </h4>
                                        <p className="text-[8.5px] text-slate-300 font-mono mt-1 opacity-90 truncate">
                                          @{video.postedByUsername || 'Tutor'}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                {/* 5. "Click to watch more" Card */}
                                <div
                                  onClick={() => {
                                    setActiveNavTab('watch');
                                    setShowDiscoverPage(true);
                                  }}
                                  className="w-[140px] h-[190px] rounded-2xl border-2 border-dashed border-indigo-200/60 dark:border-slate-800 bg-indigo-50/10 dark:bg-slate-950/20 flex-shrink-0 snap-start flex flex-col items-center justify-center text-center p-4 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-slate-900/30 transition-all duration-250 cursor-pointer"
                                >
                                  <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-slate-900 border border-indigo-200 dark:border-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2">
                                    <Compass className="w-4.5 h-4.5" />
                                  </div>
                                  <span className="text-[10.5px] font-extrabold text-indigo-750 dark:text-indigo-300 leading-snug">Click to watch more</span>
                                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 mt-1">Search peer reels</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 3. Minimized "Recent Activity" Section */}
                      <div className="space-y-2.5 flex-1 flex flex-col">
                        <div className="flex justify-between items-center pl-0.5">
                          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent Activity</span>
                          {historyItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowFullHistory(true)}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                            >
                              View Full History
                            </button>
                          )}
                        </div>

                        {historyItems.length === 0 ? (
                          <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/40 dark:border-slate-800/80">
                            <History className="w-8 h-8 opacity-20 mb-2 text-indigo-500" />
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none">No recent activity found</p>
                            <p className="text-[9px] text-slate-400 max-w-[200px] mt-1">Generate a quiz or create study sheets to log records.</p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {recentItems.map(item => (
                              <div
                                key={item.id}
                                onClick={() => handleLoadHistoryItem(item)}
                                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/55 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.005] transition-all cursor-pointer flex justify-between items-start gap-3"
                              >
                                <div className="flex-1 truncate">
                                  <div className="flex justify-between items-start gap-2 mb-1">
                                    <span className={`text-[8px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full ${
                                      item.itemType === 'quiz'
                                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400'
                                        : item.itemType === 'summary'
                                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                    }`}>
                                      {item.itemType}
                                    </span>
                                  </div>
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate leading-tight mt-1">
                                    {item.title}
                                  </p>

                                  {item.itemType === 'quiz' && (
                                    <div className="mt-1 space-y-0.5 text-[10px] text-slate-400">
                                      <p>
                                        {item.questions?.length} Questions • {item.quizType === 'multiple-choice' ? 'MCQs' : 'Short answers'}
                                      </p>
                                      {item.evaluation ? (
                                        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                                          ✓ Scored {item.evaluation.summary.overallPercentage}% Accuracy
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-500 flex items-center gap-1">
                                          Self-Practice Worksheet
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {item.itemType === 'summary' && (
                                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold mt-1">
                                      ✓ Active study outline summary ({item.detailLevel})
                                    </p>
                                  )}

                                  {item.itemType === 'visualization' && (
                                    <p className="text-[9.5px] font-mono text-emerald-600 dark:text-emerald-400 block truncate mt-1">
                                      "{item.vizPrompt}"
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHistoryItem(e, item.id);
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 self-start shadow-3xs"
                                  title="Delete history item"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 4. Complete Study History Modal */}
                      {showFullHistory && (
                        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-sm w-full rounded-2xl p-5 text-left shadow-2xl flex flex-col max-h-[80vh] relative animate-fade-in">
                            {/* Top-Right Close Button */}
                            <button
                              type="button"
                              onClick={() => setShowFullHistory(false)}
                              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="Close history"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5 pr-6 mb-3">
                              <History className="w-4 h-4 text-indigo-500" />
                              <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-0.5">Study History Logs</h4>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                              {historyItems.map(item => (
                                <div
                                  key={item.id}
                                  onClick={() => {
                                    handleLoadHistoryItem(item);
                                    setShowFullHistory(false);
                                  }}
                                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 shadow-3xs hover:shadow-2xs hover:scale-[1.01] transition-all cursor-pointer flex justify-between items-start gap-3"
                                >
                                  <div className="flex-1 truncate">
                                    <div className="flex justify-between items-start gap-2 mb-1">
                                      <span className={`text-[8px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                                        item.itemType === 'quiz'
                                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400'
                                          : item.itemType === 'summary'
                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-455'
                                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                      }`}>
                                        {item.itemType}
                                      </span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-850 dark:text-slate-100 block truncate leading-tight mt-1">
                                      {item.title}
                                    </p>

                                    {item.itemType === 'quiz' && (
                                      <div className="mt-1 space-y-0.5 text-[9px] text-slate-400">
                                        <p>
                                          {item.questions?.length} Qs • {item.quizType === 'multiple-choice' ? 'MCQs' : 'Short answers'}
                                        </p>
                                        {item.evaluation ? (
                                          <span className="text-[8.5px] font-bold text-emerald-600 dark:text-emerald-400 block">
                                            ✓ Scored {item.evaluation.summary.overallPercentage}% Accuracy
                                          </span>
                                        ) : (
                                          <span className="text-[8.5px] font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1">
                                            Practice worksheet
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {item.itemType === 'summary' && (
                                      <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold mt-1">
                                        ✓ Study summary ({item.detailLevel})
                                      </p>
                                    )}

                                    {item.itemType === 'visualization' && (
                                      <p className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 block truncate mt-1">
                                        "{item.vizPrompt}"
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteHistoryItem(e, item.id);
                                    }}
                                    className="p-1 rounded-lg border border-slate-200/50 dark:border-slate-800 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 self-start shadow-3xs"
                                    title="Delete item"
                                  >
                                    <Trash className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* TAB 3: VISUALIZER PLATFORM */}
                {activeNavTab === 'visualizer' && (
                  <div className="flex-1 flex flex-col gap-3 animate-fade-in">
                    <VisualizerScreen
                      darkMode={darkMode}
                      loadedVisualization={activeLoadedVisualization}
                      onSaveHistory={handleSaveVisualizationHistory}
                    />
                  </div>
                )}

                {/* TAB 5: WATCH PORTAL */}
                {activeNavTab === 'watch' && (
                  <div className={`flex-1 flex flex-col animate-fade-in text-left ${
                    showDiscoverPage ? 'gap-4 p-4 md:p-6' : 'gap-0 p-0 m-0 w-full h-full'
                  }`}>
                    {showDiscoverPage ? (
                      /* SEARCH DISCOVER PAGE (INSTAGRAM GRID STYLE) */
                      <div className="flex-1 flex flex-col gap-4 animate-fade-in">
                        {/* Header Area: No AI Conversational bar, strictly simple input search filter */}
                        <div className="flex items-center gap-3 bg-indigo-50/40 dark:bg-slate-900/45 border border-indigo-100/50 dark:border-slate-805 p-3.5 rounded-2xl">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDiscoverPage(false);
                              setSearchQuery('');
                            }}
                            className="p-2 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 transition flex items-center gap-1.5"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Feed</span>
                          </button>

                          <div className="flex-1 relative">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Type to filter educational reels..."
                              className="w-full text-xs font-bold p-2.5 pl-8.5 rounded-xl border border-indigo-150 dark:border-slate-800 bg-white dark:bg-slate-950 text-indigo-950 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 duration-200"
                            />
                            <Search className="absolute left-2.5 top-3 w-3.5 h-3.5 text-slate-400" />
                            {searchQuery && (
                              <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-550 font-extrabold"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Interactive Tab Selector: Explore vs Bookmarks */}
                        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl self-start">
                          <button
                            type="button"
                            onClick={() => setShowSavedOnly(false)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition flex items-center gap-1.5 ${
                              !showSavedOnly 
                                ? 'bg-indigo-600 text-white shadow' 
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>All Reels</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSavedOnly(true)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition flex items-center gap-1.5 ${
                              showSavedOnly 
                                ? 'bg-indigo-600 text-white shadow' 
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Saved Library</span>
                          </button>
                        </div>

                        {/* Asymmetrical Instagram-style Masonry Grid */}
                        {loadingVideos ? (
                          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                            <p className="text-xs font-bold font-mono">Loading classroom network index...</p>
                          </div>
                        ) : (() => {
                          const query = searchQuery.toLowerCase().trim();
                          const discoverVideos = videos.filter(v => {
                            // Filter by saved if enabled
                            if (showSavedOnly && !savedVideoIds[v.id]) return false;

                            if (!query) return true;
                            return (
                              (v.title || '').toLowerCase().includes(query) ||
                              (v.summary || '').toLowerCase().includes(query) ||
                              (v.postedBy || '').toLowerCase().includes(query)
                            );
                          });

                          if (discoverVideos.length === 0) {
                            return (
                              <div className="flex-1 flex flex-col items-center justify-center p-8 py-16 text-center bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-150 dark:border-slate-850">
                                <Video className="w-10 h-10 opacity-35 mb-3 text-slate-400" />
                                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">No matches found</h4>
                                <p className="text-[11px] text-slate-450 mt-1 max-w-xs leading-normal">
                                  No peer posted videos fit "{searchQuery}". Try a different math or science topic!
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4 overflow-y-auto max-h-[550px] pr-1 scrollbar-thin">
                              {/* Each video card has subtle white borders */}
                              {discoverVideos.map((video) => {
                                const isStaticImg = video.isStaticImage || (video.videoUrl && (
                                  video.videoUrl.startsWith('data:image/') ||
                                  video.videoUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)
                                ));

                                const isBase64Video = video.videoUrl && (
                                  video.videoUrl.startsWith('data:video/') || 
                                  video.videoUrl.match(/\.(mp4|webm|mov|ogg)/i) || 
                                  (!video.videoUrl.includes('youtube.com') && !isStaticImg)
                                );

                                const isIllustrativeImg = isStaticImg && (
                                  video.videoUrl.includes('book') || 
                                  video.videoUrl.includes('dreamstime') || 
                                  video.videoUrl.includes('illustration') ||
                                  video.videoUrl.includes('logo') ||
                                  video.videoUrl.includes('icon') ||
                                  (video.title || '').toLowerCase().includes('book') || 
                                  (video.title || '').toLowerCase().includes('logo') ||
                                  (video.summary || '').toLowerCase().includes('book')
                                );

                                let ytThumb = "";
                                if (!isStaticImg && !isBase64Video && video.videoUrl) {
                                  let ytId = null;
                                  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                                  const match = video.videoUrl.match(regExp);
                                  if (match && match[2] && match[2].length === 11) {
                                    ytId = match[2];
                                  } else {
                                    const shortsMatch = video.videoUrl.match(/shorts\/([^?\/]+)/);
                                    if (shortsMatch) {
                                      ytId = shortsMatch[1];
                                    }
                                  }
                                  if (ytId) {
                                    ytThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                                  }
                                }

                                return (
                                  <div
                                    key={video.id}
                                    onClick={() => {
                                      setActivePlayingVideoId(video.id);
                                      setShowDiscoverPage(false);
                                      setTimeout(() => {
                                        const el = document.getElementById(`video-card-${video.id}`);
                                        if (el) {
                                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                      }, 150);
                                    }}
                                    className="relative group rounded-2xl overflow-hidden cursor-pointer bg-slate-900 dark:bg-slate-950 border border-white border-opacity-20 dark:border-white dark:border-opacity-15 hover:border-indigo-400 hover:scale-[1.02] active:scale-[0.98] shadow-xs hover:shadow-md transition-all duration-300 aspect-[2/3] w-full"
                                  >
                                    {/* Default minimal skeleton placeholder */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 dark:bg-slate-950 text-slate-500/70 z-0">
                                      <Play className="w-5 h-5 text-slate-500/60 fill-slate-500/10" />
                                    </div>

                                    {/* Media Player / Background Cover Layer */}
                                    <div className="absolute inset-0 w-full h-full z-10">
                                      {isIllustrativeImg ? (
                                        <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa] dark:bg-slate-900 p-4">
                                          <img
                                            src={video.videoUrl}
                                            alt={video.title}
                                            referrerPolicy="no-referrer"
                                            className="max-w-[90%] max-h-[90%] object-contain rounded-lg transition-transform duration-300 group-hover:scale-105"
                                          />
                                        </div>
                                      ) : isStaticImg ? (
                                        <img
                                          src={video.videoUrl}
                                          alt={video.title}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                      ) : isBase64Video ? (
                                        <video
                                          src={video.videoUrl}
                                          muted
                                          preload="metadata"
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                      ) : ytThumb ? (
                                        <img
                                          src={ytThumb}
                                          alt={video.title}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 dark:bg-slate-950 text-slate-500">
                                          <Play className="w-5 h-5 text-slate-500/65" />
                                        </div>
                                      )}
                                    </div>

                                    {/* Premium Bottom Details Overlaid on a Dark Protecting Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent flex flex-col justify-end p-3 text-left z-20 transition-all duration-300">
                                      <span className="text-[9.5px] font-extrabold text-indigo-300 uppercase tracking-wider block">
                                        @{formatDisplayUsername(video, profileEmail, profileUsername)}
                                      </span>
                                      <p className="text-[11px] font-black text-white leading-tight mt-0.5 line-clamp-2 drop-shadow-xs group-hover:text-indigo-200 transition">
                                        {video.title}
                                      </p>
                                    </div>

                                    {/* Media Platform Indicator Badge */}
                                    <div className="absolute top-2.5 right-2.5 bg-black/55 backdrop-blur-md p-1 px-1.5 rounded-md text-[8px] font-black text-white uppercase tracking-widest pointer-events-none z-25">
                                      {(isBase64Video || isStaticImg) ? 'Reel' : 'YouTube'}
                                    </div>

                                    {/* Hover Play Button Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-35">
                                      <div className="p-2.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/25 text-white scale-90 group-hover:scale-100 transition-transform duration-300 shadow">
                                        <Play className="w-4 h-4 fill-white" />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      /* SHORT-FORM VIDEO FEED (YOUTUBE SHORTS STYLE) - TRULY FULL SCREEN */
                      <div className="w-full h-screen md:h-[100dvh] bg-black relative flex flex-col overflow-hidden">
                        {/* Immersive YouTube Shorts Cinematic Stage */}
                        <div className="w-full h-full bg-black relative overflow-hidden">
                          
                          {/* OVERLAY PERSISTENT BACK BUTTON ON LEFT */}
                          <div className="absolute top-4 left-4 z-35 flex items-center">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveNavTab('home');
                              }}
                              className="p-2.5 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/85 border border-white/10 shadow-lg hover:scale-105 active:scale-95 transition flex items-center gap-1.5"
                              title="Return to home view"
                            >
                              <ArrowLeft className="w-4 h-4 text-white" />
                              <span className="text-[11px] font-semibold tracking-wide pr-1">Back</span>
                            </button>
                          </div>

                          {/* OVERLAY PERSISTENT HEADER ACTIONS ON RIGHT */}
                          <div className="absolute top-4 right-4 z-35 flex items-center gap-2">
                            {/* Cache-busting explicit Sync/Refresh button to pull posts in real-time */}
                            <button
                              type="button"
                              onClick={() => handleRefreshFeed()}
                              className="p-2.5 rounded-full bg-black/60 text-white hover:bg-slate-900 border border-white/10 shadow hover:scale-105 active:scale-95 transition"
                              title="Sync classroom database"
                            >
                              <RefreshCw className={`w-4 h-4 text-white ${loadingVideos ? 'animate-spin text-indigo-400' : ''}`} />
                            </button>

                            {/* Persistent Search Icon (magnifying glass) */}
                            <button
                              type="button"
                              onClick={() => setShowDiscoverPage(true)}
                              className="p-2.5 rounded-full bg-black/60 text-white hover:bg-slate-900 border border-white/10 shadow hover:scale-105 active:scale-95 transition"
                              title="Open Discover lectures page"
                            >
                              <Search className="w-4 h-4 text-white" />
                            </button>

                            {/* Plus button to upload and publish a post */}
                            <button
                              type="button"
                              onClick={() => {
                                if (!isLoggedIn) {
                                  setActiveNavTab('profile');
                                  setErrorMsg("You must be signed in or signed up to publish a learning Reel. Please log in or register below.");
                                } else {
                                  setShowPostModal(true);
                                }
                              }}
                              className="p-2.5 rounded-full bg-indigo-650 text-white hover:bg-indigo-700 border border-white/10 shadow hover:scale-105 active:scale-95 transition"
                              title="Publish educational video lesson"
                            >
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          </div>

                          {/* Smooth Snapping Feed Scroller */}
                          {loadingVideos && videos.length === 0 ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400 bg-black">
                              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                              <p className="text-xs font-bold font-mono text-slate-400">Loading classroom streams...</p>
                            </div>
                          ) : videos.length === 0 ? (
                            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-white">
                              <Video className="w-12 h-12 opacity-35 mb-3 text-slate-500 animate-bounce" />
                              <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest">Feed is vacant</h4>
                              <p className="text-xs text-slate-500 mt-2 max-w-xs leading-normal">
                                No educational peer videos are loaded. Click the "+" icon at the top right to share the first video lessons!
                              </p>
                            </div>
                          ) : (() => {
                            const query = searchQuery.toLowerCase().trim();
                            const filteredVideos = videos.filter(v => {
                              if (!query) return true;
                              return (
                                (v.title || '').toLowerCase().includes(query) ||
                                (v.summary || '').toLowerCase().includes(query)
                              );
                            });

                            if (filteredVideos.length === 0) {
                              return (
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-white">
                                  <Video className="w-10 h-10 opacity-40 mb-3 text-slate-500" />
                                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">No matching results</h4>
                                  <p className="text-xs text-slate-500 mt-1.5">
                                    No matches found. Clear search filter or try alternate keywords.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="mt-4 px-3.5 py-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-800"
                                  >
                                    Reset Query
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div
                                className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none scroll-smooth"
                                onScroll={handleFeedScroll}
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                              >
                                {filteredVideos.map((video) => (
                                  <div
                                    id={`video-card-${video.id}`}
                                    key={video.id}
                                    className="w-full h-full snap-start snap-always shrink-0 relative bg-black"
                                  >
                                    <ReelPlayer
                                      video={video}
                                      isActive={activePlayingVideoId === video.id}
                                      onOpenSummary={(id) => setShowSummaryForVideoId(id)}
                                      onOpenLink={(link) => setPendingExternalLink(link)}
                                      onDelete={(id) => handleDeleteVideo(id)}
                                      profileEmail={profileEmail}
                                      profileUsername={profileUsername}
                                      isSaved={!!savedVideoIds[video.id]}
                                      onToggleSave={toggleSaveVideo}
                                    />
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* POST A VIDEO MODAL OVERLAY */}
                    {showPostModal && (
                      <div className="fixed inset-0 z-[55] bg-white dark:bg-slate-950 flex flex-col h-[100dvh] w-screen overflow-y-auto">
                        <div className="w-full max-w-2xl mx-auto flex flex-col min-h-full p-6 space-y-6">
                          
                          {/* Beautiful Native Header */}
                          <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850">
                            <div className="flex items-center gap-2">
                              <Video className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                              <h3 className="text-sm font-semibold text-slate-850 dark:text-white">Create Educational Video</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowPostModal(false);
                                setNewVideoBase64('');
                                setNewVideoFileName('');
                                setIsStaticImageMode(false);
                                setSelectedAudioTrack(null);
                              }}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold p-1 text-sm cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>

                          {/* POST REELS ENTRY SOURCE TOGGLE BUTTON BAR */}
                          <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => { setNewVideoMode('file'); setNewVideoUrl(''); }}
                              className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                newVideoMode === 'file' 
                                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold' 
                                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                              }`}
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Upload Phone Video / Image</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setNewVideoMode('link'); setNewVideoBase64(''); setNewVideoFileName(''); setIsStaticImageMode(false); }}
                              className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                newVideoMode === 'link' 
                                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold' 
                                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                              }`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>YouTube Link</span>
                            </button>
                          </div>

                          <form onSubmit={handlePostVideo} className="space-y-5">
                            <div className="space-y-1">
                              <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Video Title</label>
                              <input
                                type="text"
                                required
                                placeholder="What mathematical, biological or study concept is solved?"
                                value={newVideoTitle}
                                onChange={(e) => setNewVideoTitle(e.target.value)}
                                className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-black dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                              />
                            </div>

                            {/* Dynamically display appropriate payload selector based on mode toggle input */}
                            {newVideoMode === 'file' ? (
                              <div className="space-y-4">
                                <div className="space-y-1">
                                  <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Select Video File from Phone</label>
                                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50 dark:bg-slate-950 text-center relative hover:bg-slate-100/50 dark:hover:bg-slate-900/50 transition duration-200 cursor-pointer">
                                    <input
                                      type="file"
                                      required={!newVideoBase64}
                                      accept="video/*,image/*"
                                      className="absolute inset-0 opacity-0 cursor-pointer z-30"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          setNewVideoFileName(file.name);
                                          const isImg = file.type.startsWith('image/');
                                          setIsStaticImageMode(isImg);
                                          const reader = new FileReader();
                                          reader.onload = () => {
                                            if (typeof reader.result === 'string') {
                                              setNewVideoBase64(reader.result);
                                            }
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                    <Upload className="w-8 h-8 text-indigo-500 mx-auto opacity-70 mb-2" />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">
                                      {newVideoFileName ? (
                                        <span className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
                                          <Check className="w-4 h-4 shrink-0 animate-bounce" />
                                          <span>Chosen: {newVideoFileName}</span>
                                        </span>
                                      ) : (
                                        "Tap to select video or static image file"
                                      )}
                                    </span>
                                    <span className="text-[9.5px] text-slate-400 block mt-1">Supports MP4, MOV, PNG, JPG, WEBP (Max 80MB)</span>
                                  </div>
                                </div>

                                {/* PREVIEW AND INTEGRATED VIDEO EDITING SUITE */}
                                {newVideoBase64 && (
                                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 space-y-4">
                                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">File Preview & Editing Suite</div>
                                    
                                    <div className="relative max-w-xs mx-auto bg-black rounded-xl overflow-hidden shadow-md" style={{ aspectRatio: selectedAspectRatio === '9:16' ? '9/16' : selectedAspectRatio === '1:1' ? '1/1' : '16/9' }}>
                                      {isStaticImageMode ? (
                                        <img src={newVideoBase64} className="w-full h-full object-contain" />
                                      ) : (
                                        <video src={newVideoBase64} className="w-full h-full object-cover" controls />
                                      )}
                                      
                                      {/* Audio Indicator Overlay */}
                                      {selectedAudioTrack && (
                                        <div className="absolute top-2 left-2 bg-indigo-600/90 text-white text-[9px] font-medium px-2 py-1 rounded-lg flex items-center gap-1 shadow backdrop-blur-xs">
                                          <Volume2 className="w-2.5 h-2.5 animate-pulse" />
                                          <span>{selectedAudioTrack.title}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* TOOLING CONTROL TABS */}
                                    <div className="flex border-b border-slate-200 dark:border-slate-800 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setActiveEditingTab('trim')}
                                        className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                                          activeEditingTab === 'trim' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-450'
                                        }`}
                                      >
                                        Trim
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setActiveEditingTab('aspect')}
                                        className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                                          activeEditingTab === 'aspect' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-450'
                                        }`}
                                      >
                                        Aspect Ratio
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setActiveEditingTab('cover')}
                                        className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                                          activeEditingTab === 'cover' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-450'
                                        }`}
                                      >
                                        Cover Frame
                                      </button>
                                    </div>

                                    {/* TAB CONTENTS */}
                                    {activeEditingTab === 'trim' && (
                                      <div className="space-y-3 py-1">
                                        <div className="flex justify-between text-[11px] text-[#4A4A4A] dark:text-slate-300 font-bold font-mono">
                                          <span>Start: {trimStart}s</span>
                                          <span>End: {trimEnd}s</span>
                                        </div>
                                        {/* Horizontal Trimmer Timeline with sliding handles */}
                                        <div className="relative h-6 bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center px-1">
                                          <div 
                                            className="absolute h-full bg-indigo-500/20 border-x-2 border-indigo-600"
                                            style={{ 
                                              left: `${(trimStart / 30) * 100}%`, 
                                              width: `${((trimEnd - trimStart) / 30) * 100}%` 
                                            }}
                                          />
                                          <input
                                            type="range"
                                            min={0}
                                            max={30}
                                            step={0.5}
                                            value={trimStart}
                                            onChange={(e) => setTrimStart(Math.min(parseFloat(e.target.value), trimEnd - 0.5))}
                                            className="absolute inset-x-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                                          />
                                          <input
                                            type="range"
                                            min={0}
                                            max={30}
                                            step={0.5}
                                            value={trimEnd}
                                            onChange={(e) => setTrimEnd(Math.max(parseFloat(e.target.value), trimStart + 0.5))}
                                            className="absolute inset-x-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                                          />
                                          <div className="w-full flex justify-between relative pointer-events-none text-[10px] text-slate-600 dark:text-slate-300 font-mono px-1">
                                            <span>0s</span>
                                            <span>15s</span>
                                            <span>30s</span>
                                          </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400">Drag handles on single-track timeline representing video length to crop video feed.</p>
                                      </div>
                                    )}

                                    {activeEditingTab === 'aspect' && (
                                      <div className="flex justify-center gap-3 py-1">
                                        {['9:16', '1:1', '16:9'].map((ratio) => (
                                          <button
                                            type="button"
                                            key={ratio}
                                            onClick={() => setSelectedAspectRatio(ratio as any)}
                                            className={`px-4 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                              selectedAspectRatio === ratio 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow' 
                                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                                            }`}
                                          >
                                            {ratio}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {activeEditingTab === 'cover' && (
                                      <div className="space-y-2 py-1">
                                        <label className="text-[11px] text-[#4A4A4A] dark:text-slate-300 font-bold font-mono flex justify-between">
                                          <span>Selected Cover Frame: {selectedCoverFrame}s</span>
                                        </label>
                                        <input
                                          type="range"
                                          min={trimStart}
                                          max={trimEnd}
                                          step={0.5}
                                          value={selectedCoverFrame}
                                          onChange={(e) => setSelectedCoverFrame(parseFloat(e.target.value))}
                                          className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">Select poster frame screen capture representing this lesson on student feeds.</p>
                                      </div>
                                    )}

                                    {/* STATIC IMAGE CONVERTER DURATION CONTROL */}
                                    {isStaticImageMode && (
                                      <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl border border-indigo-100/50 dark:border-indigo-900/40 space-y-2">
                                        <label className="text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300 block">Static Frame Duration</label>
                                        <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-full max-w-[200px]">
                                          {[5, 10, 15].map((sec) => (
                                            <button
                                              type="button"
                                              key={sec}
                                              onClick={() => setStaticDuration(sec)}
                                              className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                                                staticDuration === sec 
                                                  ? 'bg-indigo-600 text-white shadow' 
                                                  : 'text-slate-550 dark:text-slate-400 hover:text-slate-705'
                                              }`}
                                            >
                                              {sec}s
                                            </button>
                                          ))}
                                        </div>
                                        <p className="text-[10px] text-slate-400">This textbook photo or handwritten notes will loop continuously as a {staticDuration}s video.</p>
                                      </div>
                                    )}

                                    {/* OPTION FOR ORIGINAL AUDIO VS BACKGROUND STUDY MUSIC */}
                                    {!isStaticImageMode && (
                                      <div className="p-3 bg-indigo-50/30 dark:bg-slate-950/40 border border-indigo-100/40 dark:border-slate-800 rounded-xl space-y-2 text-left">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Reel Sound Option</span>
                                        <div className="flex gap-4">
                                          <label className="flex-1 flex items-center gap-2 cursor-pointer p-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <input
                                              type="radio"
                                              name="videoAudioOption"
                                              checked={!selectedAudioTrack}
                                              onChange={() => setSelectedAudioTrack(null)}
                                              className="text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>Keep Original Sound</span>
                                          </label>
                                          <label className="flex-1 flex items-center gap-2 cursor-pointer p-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <input
                                              type="radio"
                                              name="videoAudioOption"
                                              checked={!!selectedAudioTrack}
                                              onChange={() => {
                                                if (!selectedAudioTrack) {
                                                  setSelectedAudioTrack(CURATED_AUDIO_TRACKS[0]);
                                                }
                                              }}
                                              className="text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>Background Study Beats</span>
                                          </label>
                                        </div>
                                      </div>
                                    )}

                                    {/* AUDIO ATTACHMENT CONTROLLER SECTION */}
                                    {(isStaticImageMode || !!selectedAudioTrack) && (
                                      <div className="bg-slate-100/65 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/40 dark:border-slate-800/80 space-y-2 animate-fade-in">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Music className="w-4 h-4 text-indigo-600 shrink-0" />
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                              {selectedAudioTrack ? `Audio: ${selectedAudioTrack.title}` : 'No study beats attached'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {selectedAudioTrack && (
                                              <button
                                                type="button"
                                                onClick={togglePreviewAudio}
                                                className="p-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                                                title={previewPlaying ? "Pause preview" : "Play preview"}
                                              >
                                                {previewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => setShowAudioModal(true)}
                                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold transition shrink-0 shadow-sm cursor-pointer"
                                            >
                                              {selectedAudioTrack ? 'Change Audio' : 'Attach Audio'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Video Link / YouTube URL</label>
                                <input
                                  type="url"
                                  required={newVideoMode === 'link'}
                                  placeholder="e.g. https://www.youtube.com/watch?v=WUvTyaaNkzM"
                                  value={newVideoUrl}
                                  onChange={(e) => setNewVideoUrl(e.target.value)}
                                  className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-black dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                                />
                                <p className="text-[9px] text-slate-400 mt-0.5 pl-0.5">Your link is auto-embeded seamlessly inside the Reels container player slot.</p>
                              </div>
                            )}

                            <div className="space-y-1">
                              <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Brief Educational Summary</label>
                              <textarea
                                required
                                rows={3}
                                placeholder="Details the mathematical rules, scientific logic, structures or definitions this mini-Reel teaches..."
                                value={newVideoSummary}
                                onChange={(e) => setNewVideoSummary(e.target.value)}
                                className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-black dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition duration-200 resize-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Reference Link (Optional)</label>
                              <input
                                type="url"
                                placeholder="e.g. https://instagram.com/reels/abc or website link where post leads"
                                value={newVideoExtLink}
                                onChange={(e) => setNewVideoExtLink(e.target.value)}
                                className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-black dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                              />
                              <p className="text-[9.5px] text-slate-400 mt-1 pl-0.5">Viewers will see a clickable compass link to navigate to this original content.</p>
                            </div>

                            {/* Terms of Agreement Checkbox */}
                            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-850 flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                id="certifyAcademicCheckbox"
                                required
                                checked={newVideoAgreed}
                                onChange={(e) => setNewVideoAgreed(e.target.checked)}
                                className="w-3.5 h-3.5 rounded text-indigo-600 bg-white border-slate-350 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                              />
                              <label htmlFor="certifyAcademicCheckbox" className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400 font-extrabold cursor-pointer select-none">
                                I solemnly agree and certify that this video consists <span className="text-indigo-650 dark:text-indigo-400 underline">exclusively of learning / academic content</span> and is fully free of inappropriate, offensive, or bad stuff.
                              </label>
                            </div>

                            <div className="flex gap-2.5 pt-4">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowPostModal(false);
                                  setNewVideoBase64('');
                                  setNewVideoFileName('');
                                  setIsStaticImageMode(false);
                                  setSelectedAudioTrack(null);
                                }}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition text-center cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={postingVideo}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition text-center flex items-center justify-center gap-1.5 shadow cursor-pointer"
                              >
                                {postingVideo ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Syncing...</span>
                                  </>
                                ) : (
                                  <span>Done</span>
                                )}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* INDIVIDUAL VIDEO SUMMARY MODAL DETAIL */}
                    {showSummaryForVideoId && (() => {
                      const activeSummarizedVideo = videos.find(v => v.id === showSummaryForVideoId);
                      if (!activeSummarizedVideo) return null;
                      return (
                        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-sm w-full rounded-2xl p-5 text-left shadow-2xl space-y-3.5 animate-fade-in relative">
                            {/* Top-Right Close Button */}
                            <button
                              type="button"
                              onClick={() => setShowSummaryForVideoId(null)}
                              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="Close summary"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5 pr-6">
                              <Info className="w-4 h-4 text-indigo-500" />
                              <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-0.5">Lecture Summary & Explanation</h4>
                            </div>

                            <div className="space-y-2">
                              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-snug">
                                {activeSummarizedVideo.title}
                              </h3>
                              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[220px] overflow-y-auto font-medium">
                                {activeSummarizedVideo.summary}
                              </p>
                            </div>

                            <div className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold pl-1">
                              Posted by @{formatDisplayUsername(activeSummarizedVideo, profileEmail, profileUsername)} on {activeSummarizedVideo.createdAt}
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowSummaryForVideoId(null)}
                              className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition text-center flex items-center justify-center gap-1.5 shadow"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              <span>Go Back</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* LEAVING THE APP CONFIRMATION DIALOG */}
                    {pendingExternalLink && (
                      <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-sm w-full rounded-2xl p-5 text-left shadow-2xl space-y-3.5 animate-fade-in">
                          <div className="flex items-center gap-1.5 text-amber-605">
                            <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />
                            <h4 className="text-xs font-black uppercase tracking-widest pl-0.5">Leaving Classroom App</h4>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-semibold">
                              You are leaving our application to visit an external link shared by a peer.
                            </p>
                            <p className="text-[11px] text-slate-500 bg-slate-105 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 truncate font-mono">
                              {pendingExternalLink}
                            </p>
                            <p className="text-[10px] text-slate-450 leading-normal">
                              KOJLUX STUDY HUB is not responsible for external content. Please browse safely.
                            </p>
                          </div>

                          <div className="flex gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setPendingExternalLink(null)}
                              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition text-center"
                            >
                              Go Back
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                window.open(pendingExternalLink, '_blank', 'noopener,noreferrer');
                                setPendingExternalLink(null);
                              }}
                              className="flex-1 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition text-center"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AUDIO TRACKS BOTTOM SHEET MODAL */}
                    {showAudioModal && (
                      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-end justify-center animate-fade-in">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl p-5 text-left shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <Music className="w-4 h-4 text-indigo-650 dark:text-indigo-400" />
                              <h3 className="text-xs font-bold text-slate-805 dark:text-white uppercase tracking-wider">Academic Audio Tracks</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAudioModal(false)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold p-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Search Input Bar */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-405" />
                            <input
                              type="text"
                              placeholder="Search academic tracks..."
                              value={audioSearchQuery}
                              onChange={(e) => setAudioSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition duration-200"
                            />
                          </div>

                          {/* Curated Categories & List */}
                          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {["Lo-Fi Study Beats", "Ambient Focus", "Classical Instrumental", "Trending Educational"].map((category) => {
                              const filteredTracks = CURATED_AUDIO_TRACKS.filter(t => 
                                t.category === category && 
                                (t.title.toLowerCase().includes(audioSearchQuery.toLowerCase()) || 
                                 t.category.toLowerCase().includes(audioSearchQuery.toLowerCase()))
                              );

                              if (filteredTracks.length === 0) return null;

                              return (
                                <div key={category} className="space-y-1.5">
                                  <h4 className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider pl-1">{category}</h4>
                                  <div className="space-y-1">
                                    {filteredTracks.map((track) => {
                                      const isSelected = selectedAudioTrack?.id === track.id;
                                      return (
                                        <button
                                          key={track.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedAudioTrack(track);
                                            setShowAudioModal(false);
                                          }}
                                          className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all border cursor-pointer ${
                                            isSelected 
                                              ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200' 
                                              : 'bg-slate-50 border-slate-100 dark:bg-slate-950/40 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            {/* micro waveform icon */}
                                            <div className="flex items-end gap-0.5 h-3.5 w-3.5 shrink-0">
                                              <span className={`w-0.5 rounded-full bg-indigo-500 ${isSelected ? 'animate-pulse' : 'h-1.5'}`} style={{ height: isSelected ? '100%' : '50%' }} />
                                              <span className={`w-0.5 rounded-full bg-indigo-500 ${isSelected ? 'animate-pulse font-bold' : 'h-2.5'}`} style={{ height: isSelected ? '80%' : '100%' }} />
                                              <span className={`w-0.5 rounded-full bg-indigo-500 ${isSelected ? 'animate-pulse' : 'h-2'}`} style={{ height: isSelected ? '60%' : '75%' }} />
                                            </div>
                                            <span className="text-xs font-medium truncate">{track.title}</span>
                                          </div>
                                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">{track.duration}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {CURATED_AUDIO_TRACKS.filter(t => 
                              t.title.toLowerCase().includes(audioSearchQuery.toLowerCase()) || 
                              t.category.toLowerCase().includes(audioSearchQuery.toLowerCase())
                            ).length === 0 && (
                              <div className="py-8 text-center text-xs text-slate-400">
                                No academic tracks found.
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAudioTrack(null);
                                setShowAudioModal(false);
                              }}
                              className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition text-center cursor-pointer"
                            >
                              Remove Attached Audio
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PROFILE PLATFORM & SERVER LOGIN BACKUP */}
                {activeNavTab === 'profile' && (
                  <div className="flex-1 flex flex-col gap-4 animate-fade-in text-left">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-none">Kojlux Study Profile</h2>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Synchronize your studies and evaluations seamlessly across all of your academic devices with cloud persistence</p>
                    </div>

                    {!isLoggedIn ? (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-150 dark:border-slate-850 overflow-hidden">
                        {/* Tab Switcher */}
                        <div className="grid grid-cols-2 border-b border-slate-100 dark:border-slate-800 text-center">
                          <button
                            type="button"
                            onClick={() => setIsRegisterMode(false)}
                            className={`py-3 text-xs font-extrabold cursor-pointer transition-all ${
                              !isRegisterMode 
                                ? 'bg-indigo-50/50 text-indigo-600 border-b-2 border-indigo-600 dark:bg-indigo-950/20' 
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-450'
                            }`}
                          >
                            Sign In
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsRegisterMode(true)}
                            className={`py-3 text-xs font-extrabold cursor-pointer transition-all ${
                              isRegisterMode 
                                ? 'bg-indigo-50/50 text-indigo-600 border-b-2 border-indigo-600 dark:bg-indigo-950/20' 
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-450'
                            }`}
                          >
                            Register
                          </button>
                        </div>

                        {!isRegisterMode ? (
                          <form onSubmit={handleProfileLogin} className="p-5 space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Username or Email</label>
                              <input
                                type="text"
                                required
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150"
                                placeholder="Enter username or email"
                                value={loginIdentifier}
                                onChange={(e) => setLoginIdentifier(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Password</label>
                              <input
                                type="password"
                                required
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150"
                                placeholder="Enter password"
                                value={authPassword}
                                onChange={(e) => setAuthPassword(e.target.value)}
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={syncingProfile}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wide transition shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {syncingProfile ? 'Signing In...' : 'Sign In'}
                            </button>
                          </form>
                        ) : (
                          <form onSubmit={handleProfileRegister} className="p-5 space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Username</label>
                              <input
                                type="text"
                                required
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150"
                                placeholder="Choose a username"
                                value={authUsername}
                                onChange={(e) => setAuthUsername(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Academic Email</label>
                              <input
                                type="email"
                                required
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150"
                                placeholder="academic@school.edu"
                                value={authEmail}
                                onChange={(e) => setAuthEmail(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Password</label>
                              <input
                                type="password"
                                required
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150"
                                placeholder="At least 4 characters"
                                value={authPassword}
                                onChange={(e) => setAuthPassword(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Grade / Understanding Level</label>
                              <select
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-white outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition duration-150 cursor-pointer"
                                value={registerGradeLevel}
                                onChange={(e) => setRegisterGradeLevel(e.target.value)}
                              >
                                <option value="Elementary School">Elementary School</option>
                                <option value="Middle School">Middle School</option>
                                <option value="High School">High School</option>
                                <option value="College">College</option>
                                <option value="Lifelong Learner">Lifelong Learner</option>
                              </select>
                            </div>

                            <button
                              type="submit"
                              disabled={syncingProfile}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wide transition shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {syncingProfile ? 'Creating Account...' : 'Register Account'}
                            </button>
                          </form>
                        )}
                        
                        <p className="text-[10px] text-slate-500 text-center pb-4 px-4 leading-normal">
                          Log in to synchronize device data and share educational reels across classrooms instantly.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 flex-grow flex flex-col justify-start">
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-[8.5px] uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-semibold">Cloud Synced Profile</span>
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-1.5 block truncate max-w-[200px]">@{profileUsername || 'username'}</span>
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block truncate max-w-[200px]">{profileEmail}</span>
                          </div>
                          <button
                            onClick={handleProfileLogout}
                            className="p-2 bg-rose-50 text-rose-600 dark:bg-rose-955/40 dark:text-rose-400 hover:scale-105 rounded-xl text-[10px] font-semibold transition flex items-center gap-1.5 border-0 shadow-xs cursor-pointer"
                            title="Log out from this device"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Log Out</span>
                          </button>
                        </div>

                        {/* Real-time stats */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-500 block pl-1">Courseware Stats</span>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-center shadow-sm border-0">
                              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 block leading-none">{historyItems.filter(h => h.itemType === 'quiz').length}</span>
                              <span className="text-[8px] font-semibold text-slate-400 mt-1 block leading-none">Quizzes</span>
                            </div>
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-center shadow-sm border-0">
                              <span className="text-base font-bold text-rose-600 dark:text-rose-455 block leading-none">{historyItems.filter(h => h.itemType === 'summary').length}</span>
                              <span className="text-[8px] font-semibold text-slate-400 mt-1 block leading-none">Summaries</span>
                            </div>
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-center shadow-sm border-0">
                              <span className="text-base font-bold text-emerald-600 dark:text-emerald-450 block leading-none">{historyItems.filter(h => h.itemType === 'visualization').length}</span>
                              <span className="text-[8px] font-semibold text-slate-400 mt-1 block leading-none">Simulations</span>
                            </div>
                          </div>
                        </div>

                        {/* My Published Reels */}
                        <div className="space-y-2 flex-1 flex flex-col min-h-0">
                          <span className="text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 block pl-1 uppercase">My Published Reels ({videos.filter(v => v.postedBy === profileEmail).length})</span>
                          {videos.filter(v => v.postedBy === profileEmail).length === 0 ? (
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl text-center border border-dashed border-slate-200 dark:border-slate-800">
                              <p className="text-[10.5px] text-slate-500">You haven't published any educational reels yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin">
                              {videos.filter(v => v.postedBy === profileEmail).map(video => (
                                <div key={video.id} className="p-2.5 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-between shadow-xs border border-slate-100 dark:border-slate-800 animate-fade-in">
                                  <div className="flex-1 min-w-0 pr-3 text-left">
                                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 truncate leading-snug">{video.title}</h4>
                                    <span className="text-[9px] font-medium text-slate-400 block mt-0.5">{video.createdAt || 'Shared lesson'}</span>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteVideo(video.id)}
                                    className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition cursor-pointer shrink-0 border-0"
                                    title="Delete this reel"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-auto p-3.5 bg-white dark:bg-slate-900 rounded-2xl flex items-center gap-2 shadow-sm border-0">
                          <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                          <p className="text-[10px] text-slate-550 leading-relaxed font-semibold">Automatic cloud backup registry handles data sync dynamically after quiz score completion.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: CREATE PORTAL (If neither quiz nor summary is actively loaded to keep workspace clutter-free) */}
                {activeNavTab === 'create' && !quizData && (
                  <div className="flex-1 flex flex-col gap-3.5 animate-fade-in">
                    
                    {/* Persistent Side-by-side Dashboard Toggle Controls */}
                    <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl mb-1 border border-slate-200/10 dark:border-slate-700/35 shadow-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setCreateSubTab('quiz');
                          clearSummaryInputs();
                        }}
                        className={`py-2 text-[11px] font-extrabold rounded-xl flex items-center justify-center gap-1.5 transition duration-200 ${
                          createSubTab === 'quiz'
                            ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-sm font-black'
                            : 'text-slate-550 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 font-extrabold'
                        }`}
                      >
                        <Brain className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400" />
                        Quiz Maker
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateSubTab('summarizer');
                          clearInputs();
                        }}
                        className={`py-2 text-[11px] font-extrabold rounded-xl flex items-center justify-center gap-1.5 transition duration-200 ${
                          createSubTab === 'summarizer'
                            ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-sm font-black'
                            : 'text-slate-550 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 font-extrabold'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                        Notes Summarizer
                      </button>
                    </div>

                    {createSubTab === 'quiz' ? (
                      <div className="flex-1 flex flex-col gap-4 animate-fade-in text-left">
                        <div className="space-y-0.5 select-none">
                          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Instant Quiz Maker</h2>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Generate test templates by uploading notes images or typing materials</p>
                        </div>

                        {/* Interactive Drag Drop or Snap Upload Panel */}
                        <div 
                          onDragEnter={handleDrag}
                          onDragOver={handleDrag}
                          onDragLeave={handleDrag}
                          onDrop={handleDrop}
                          className={`relative min-h-[140px] border border-dashed rounded-2xl p-4 flex flex-col items-center justify-center transition-all cursor-pointer ${
                            dragActive 
                              ? "border-indigo-600 bg-indigo-50/50 dark:bg-slate-900/50" 
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-950/50 shadow-2xs"
                          }`}
                        >
                          {image ? (
                            <div className="w-full h-full flex flex-col justify-between items-center relative">
                              <img 
                                src={image} 
                                alt="Notes snippet" 
                                className="w-full max-h-[100px] object-cover rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 mb-2" 
                              />
                              <div className="absolute top-1 right-1">
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setImage(null); }}
                                  className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm transition"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Image Snapshot Loaded
                              </span>
                            </div>
                          ) : (
                            <div className="text-center flex flex-col items-center gap-2 p-2 bg-slate-50/40 dark:bg-slate-950/40 rounded-xl w-full">
                              <Upload className="w-8 h-8 text-indigo-500 mb-1" />
                              <span className="text-xs font-semibold text-slate-805 dark:text-slate-200">Upload or Snap Study Material</span>
                              <span className="text-[10px] text-slate-500 block max-w-[280px] mx-auto leading-relaxed">
                                Click Browse Files to select an existing picture, or Take Photo to snap a picture using your camera.
                              </span>

                              <div className="flex gap-2.5 mt-2">
                                <label className="p-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs">
                                  Browse Files
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleFileChange} 
                                  />
                                </label>
                                <button 
                                  type="button"
                                  onClick={startCamera}
                                  className="p-2 px-4 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
                                >
                                  <Camera className="w-3.5 h-3.5" /> Take Photo
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Paste Supplemental notes */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-slate-500">
                            Or Type/Paste Study Context
                          </label>
                          <textarea
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder="Manually paste or write any formula, scientific text notes, or definitions to extract quiz questions from..."
                            className="w-full h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-755 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 resize-none transition-all"
                          />
                        </div>

                        {/* Quiz customize params pills */}
                        <div className="space-y-3 pt-1">
                          
                          {/* Choose Question density */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-semibold text-slate-500">
                                Question Count
                              </label>
                              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">{questionCount} Qs</span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                                {[3, 5, 8, 12].map(cnt => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    onClick={() => setQuestionCount(cnt)}
                                    className={`py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                                      questionCount === cnt
                                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                    }`}
                                  >
                                    {cnt} Qs
                                  </button>
                                ))}
                              </div>
                              
                              <div className="flex items-center justify-between gap-2 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-xl">
                                <span className="text-[10px] text-slate-500 font-semibold pl-1.5">Custom Question Count</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="40"
                                  value={questionCount || ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setQuestionCount(isNaN(val) ? 0 : val);
                                  }}
                                  onBlur={() => {
                                    if (!questionCount || questionCount <= 0) {
                                      setQuestionCount(5);
                                    }
                                  }}
                                  className="w-16 h-7 text-center rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/50 dark:border-slate-800 focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Exercise style */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500">
                              Exercise Format
                            </label>
                            <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                              <button
                                type="button"
                                onClick={() => setQuizType('multiple-choice')}
                                className={`py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 text-center ${
                                  quizType === 'multiple-choice'
                                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                }`}
                              >
                                Multiple Choice
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuizType('short-answer')}
                                className={`py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 text-center ${
                                  quizType === 'short-answer'
                                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                }`}
                              >
                                Short Answer
                              </button>
                            </div>
                          </div>

                          {/* Difficulty Level Option */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500">
                              Difficulty Level
                            </label>
                            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                              {(['easy', 'medium', 'hard'] as const).map(diff => (
                                <button
                                  key={diff}
                                  type="button"
                                  onClick={() => setDifficulty(diff)}
                                  className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-150 ${
                                    difficulty === diff
                                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                  }`}
                                >
                                  {diff}
                                </button>
                              ))}
                            </div>
                          </div>

                        </div>

                        {/* Submit Action */}
                        <button 
                          onClick={handleGenerateQuiz}
                          className="mt-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Create Quiz
                        </button>
                      </div>
                    ) : (
                      /* SUMMARIZER SUBTAB VIEW */
                          <div className="flex-1 flex flex-col gap-3.5 animate-fade-in">
                            
                            {/* Intelligent AI Summarizer Loader */}
                            {isSummarizing && (
                              <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-40 flex flex-col items-center justify-center p-6 text-center rounded-2xl">
                                <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-slate-900/50 border border-indigo-100 dark:border-slate-800 flex items-center justify-center mb-4">
                                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                                </div>
                                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 tracking-wider uppercase block mb-1">SUMMARIZING NOTES</span>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Processing study sheets...</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-450 mt-3 animate-pulse max-w-[240px] leading-relaxed">
                                  {loadingMessage}
                                </p>
                                <div className="mt-8 flex gap-1 justify-center w-24">
                                  <span className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '200ms' }}></span>
                                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '400ms' }}></span>
                                </div>
                              </div>
                            )}

                            {/* Active Summary Utility header */}
                            {summaryData && (
                              <header className="flex justify-end items-center mb-4 border-b border-slate-100 dark:border-slate-850 pb-3">
                                <div className="flex gap-1.5 ml-auto">
                                  <button 
                                    type="button"
                                    onClick={clearSummaryInputs}
                                    className="p-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 text-[10px] font-bold transition flex items-center gap-1.5"
                                  >
                                    <RefreshCcw className="w-3 h-3" /> New Summary
                                  </button>
                                </div>
                              </header>
                            )}

                            {/* ROUTER FOR SUMMARIZER PANEL */}
                            {!summaryData ? (
                              <div className="flex-grow flex flex-col gap-3.5">
                                <div className="space-y-0.5">
                                  <h2 className="text-base font-extrabold text-slate-800 dark:text-white leading-tight">Instant Summarizer</h2>
                                  <p className="text-[11px] text-slate-400">Generate structured study summaries, concise reviews, and key definition sheets instantly</p>
                                </div>

                                {/* Summary file snapshot upload */}
                                <div className="relative min-h-[140px] border-2 border-dashed rounded-2xl p-3 flex flex-col items-center justify-center transition-all cursor-pointer border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-105 dark:hover:bg-slate-850">
                                  {summaryImage ? (
                                    <div className="w-full h-full flex flex-col justify-between items-center relative">
                                      <img 
                                        src={summaryImage} 
                                        alt="Study material overview snapshot" 
                                        className="w-full max-h-[100px] object-cover rounded-xl shadow-sm border border-slate-250 dark:border-slate-800 mb-2" 
                                      />
                                      <div className="absolute top-1 right-1">
                                        <button 
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setSummaryImage(null); }}
                                          className="p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow transition"
                                        >
                                          <Trash className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        <CheckCircle className="w-3.5 h-3.5" /> Summary Image Selected
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="text-center flex flex-col items-center gap-1.5 p-2 bg-slate-100/40 dark:bg-slate-855/40 rounded-xl w-full">
                                      <Upload className="w-7 h-7 text-indigo-500 mb-1" />
                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Upload Summary Study Material</span>
                                      <span className="text-[10px] text-slate-450 block max-w-[280px] mx-auto leading-normal">
                                        Click Browse Files to choose a paper photo or screenshot, or click Take Picture to snap with camera
                                      </span>

                                      <div className="flex gap-2.5 mt-2.5">
                                        <label className="p-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs">
                                          Browse Files
                                          <input 
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*" 
                                            onChange={(e) => {
                                              if (e.target.files && e.target.files[0]) {
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                  if (event.target?.result) {
                                                    setSummaryImage(event.target.result as string);
                                                  }
                                                };
                                                reader.readAsDataURL(e.target.files[0]);
                                              }
                                            }} 
                                          />
                                        </label>
                                        <button 
                                          type="button"
                                          onClick={() => startCameraForType('summary')}
                                          className="p-1.5 px-3.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-[#D1D5DB] dark:border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                        >
                                          <Camera className="w-[11px] h-[11px]" /> Take Picture
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Supplemental text context input */}
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                                    Or Paste Study Context:
                                  </label>
                                  <textarea
                                    value={summaryTextInput}
                                    onChange={(e) => setSummaryTextInput(e.target.value)}
                                    placeholder="Paste scientific passages, homework sheets or notes to summarize..."
                                    className="w-full h-14 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 p-2 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none transition"
                                  />
                                </div>

                                {/* Detail Level parameters */}
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                    Summary Density Style
                                  </label>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {(['concise', 'standard', 'thorough'] as const).map(lev => (
                                      <button
                                        key={lev}
                                        type="button"
                                        onClick={() => setDetailLevel(lev)}
                                        className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${
                                          detailLevel === lev
                                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                            : "bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        {lev}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Summarize Action Button */}
                                <button 
                                  onClick={handleGenerateSummary}
                                  className="mt-auto w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" /> Summarize Material
                                </button>

                              </div>
                            ) : (
                              /* Summarized result view with gorgeous details and PDF download */
                              <div className="flex-grow flex flex-col gap-3">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[9px]">
                                    <button 
                                      onClick={() => setSummaryData(null)}
                                      className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                    >
                                      <ArrowLeft className="w-2.5 h-2.5" /> Return to Inputs
                                    </button>
                                    <span className="font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                      {detailLevel} Summary Format
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[9px] uppercase font-bold tracking-wider">
                                      {summaryData.subject}
                                    </span>
                                  </div>
                                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-white leading-tight">
                                    {summaryData.title}
                                  </h3>
                                </div>

                                {/* Summary Main idea scrollable */}
                                <div className="flex-grow overflow-y-auto space-y-4 max-h-[300px] pr-1">
                                  
                                  {/* Main Idea statement */}
                                  <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-slate-850/50 border border-indigo-100 dark:border-slate-800">
                                    <div className="flex items-center gap-1.5 mb-1 bg-indigo-100 dark:bg-slate-800 py-0.5 px-1.5 rounded-md w-fit">
                                      <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      <span className="text-[10px] font-bold text-indigo-950 dark:text-indigo-300 uppercase tracking-wider">Core Lesson Main Idea</span>
                                    </div>
                                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-serif italic">
                                      "{summaryData.mainIdea}"
                                    </p>
                                  </div>

                                  {/* Key Takeaways list */}
                                  <div className="space-y-2">
                                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Key Takeaways &amp; Conceptual Lessons</h4>
                                    <div className="space-y-1.5 pl-1">
                                      {summaryData.keyTakeaways.map((takeaway, tkIdx) => (
                                        <div key={tkIdx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2 leading-relaxed">
                                          <span className="text-indigo-600 dark:text-indigo-400 font-extrabold shrink-0 mt-0.5">▪</span>
                                          <span>{takeaway}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Glossary Technical Words Grid */}
                                  {summaryData.glossary && summaryData.glossary.length > 0 && (
                                    <div className="space-y-2 border-t border-slate-100 dark:border-slate-850 pt-3">
                                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Glossary &amp; Technical Terms</h4>
                                      <div className="grid grid-cols-1 gap-2">
                                        {summaryData.glossary.map((gitem, gIdx) => (
                                          <div key={gIdx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col gap-0.5 leading-normal">
                                            <span className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400 font-mono block">
                                              {gitem.term}
                                            </span>
                                            <span className="text-xs text-slate-600 dark:text-slate-300">
                                              {gitem.definition}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Full Outline Breakdown text */}
                                  {summaryData.comprehensiveSummary && (
                                    <div className="space-y-2 border-t border-slate-100 dark:border-slate-850 pt-3">
                                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Detailed Study Summation</h4>
                                      <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-100/50 dark:bg-slate-855/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                        {summaryData.comprehensiveSummary}
                                      </div>
                                    </div>
                                  )}

                                </div>

                                {/* Summary Export controls */}
                                <div className="bg-indigo-50/50 dark:bg-slate-850/80 p-3 rounded-2xl border border-indigo-100/50 dark:border-slate-800 space-y-2 mt-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Summary Export Companion</span>
                                  
                                  <button
                                    type="button"
                                    onClick={downloadSummaryPDF}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                    title="Download the summary as a beautiful structured PDF study sheet to review anytime"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-white" />
                                    <span>Download &amp; Print Summary PDF</span>
                                  </button>
                                  
                                  <div className="flex justify-between items-center text-[9px] text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                                    <span className="truncate">Unit: {summaryData.title.slice(0, 24)}...</span>
                                    <span className="capitalize">{detailLevel} Format style</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setSummaryData(null)}
                                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm border border-slate-200/80 dark:border-slate-700 mt-1"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                  <span>Go Back to Inputs</span>
                                </button>

                              </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {/* Screen B: PRACTICE QUIZ INTERACTIVE INSIDE MOBILE VIEW */}
                {activeNavTab === 'create' && quizData && (
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    
                    {/* Header parameters info */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px]">
                        <button 
                          onClick={clearInputs}
                          className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <ArrowLeft className="w-2.5 h-2.5" /> Start Screen
                        </button>
                        <span className="font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {difficulty} level
                        </span>
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-800 dark:text-white leading-tight">
                        {quizData.title}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        {evaluation ? "Exam Grade Scored below!" : "Solve the questions here or Print physically first!"}
                      </p>
                    </div>

                    {/* Quick Hint for option holding */}
                    {quizData.questions.some(q => q.type === 'multiple-choice') && (
                      <div className="bg-indigo-50 dark:bg-slate-800/60 p-2.5 py-2 rounded-xl border border-indigo-100 dark:border-slate-705/80 flex items-center gap-2 text-[10px] text-indigo-850 dark:text-indigo-200 animate-fade-in">
                        <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span><strong>Tip:</strong> Press &amp; hold (or hover) any option cut off to see the full answer in a popup!</span>
                      </div>
                    )}

                    {/* Scrollable listing inside active workspace */}
                    <div className="flex-grow overflow-y-auto space-y-3 max-h-[340px] pr-1">
                      {quizData.questions.map((q, idx) => {
                        const isGraded = evaluation !== null;
                        const specGrade = evaluation?.questionEvaluations.find(e => e.id === q.id);
                        
                        return (
                          <div 
                            key={q.id} 
                            className={`p-3 rounded-xl border transition duration-300 ${
                              isGraded 
                                ? specGrade?.isCorrect 
                                  ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900" 
                                  : "bg-rose-50/70 dark:bg-rose-950/20 border-rose-250 dark:border-rose-900"
                                : "bg-white dark:bg-slate-850 border-slate-150 dark:border-slate-800"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1 mb-1.5">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Q{idx + 1}.</span>
                              <span className="text-[8px] uppercase font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">
                                {q.type === 'multiple-choice' ? 'MCQ' : 'Short Answer'}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-slate-850 dark:text-slate-205 mb-2 leading-relaxed">
                              {q.question}
                            </p>

                            {/* Multiple Choice answer interactives */}
                            {q.type === 'multiple-choice' && q.options && (
                              <div className="space-y-1">
                                {q.options.map((opt, oIdx) => {
                                  const label = String.fromCharCode(65 + oIdx); // A, B, C, D
                                  const isSelected = userAnswers[q.id] === label;
                                  const isOptionCorrect = q.correctAnswer === label;
                                  const isCurrentlyHeld = heldOption?.questionId === q.id && heldOption?.optionIndex === oIdx;
                                  
                                  return (
                                    <button
                                      key={oIdx}
                                      disabled={isGraded}
                                      onClick={() => {
                                        setUserAnswers(prev => ({
                                          ...prev,
                                          [q.id]: label
                                        }));
                                      }}
                                      onMouseEnter={() => setHeldOption({ questionId: q.id, optionIndex: oIdx })}
                                      onMouseLeave={() => setHeldOption(null)}
                                      onTouchStart={() => setHeldOption({ questionId: q.id, optionIndex: oIdx })}
                                      onTouchEnd={() => setHeldOption(null)}
                                      onTouchCancel={() => setHeldOption(null)}
                                      title={opt}
                                      className={`w-full text-left p-1.5 px-2 rounded-lg text-xs flex items-center gap-2 border transition relative ${
                                        isGraded
                                          ? isOptionCorrect
                                            ? "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-slate-800 text-emerald-800 dark:text-emerald-300 font-bold"
                                            : isSelected
                                              ? "bg-rose-100 dark:bg-rose-950 border-rose-350 dark:border-slate-800 text-rose-800 dark:text-rose-300"
                                              : "bg-slate-50 dark:bg-slate-850 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500"
                                          : isSelected
                                            ? "bg-indigo-50 dark:bg-slate-800 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-semibold"
                                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850"
                                      }`}
                                    >
                                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border transition shrink-0 ${
                                        isSelected 
                                          ? "bg-indigo-600 text-white border-indigo-600" 
                                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                                      }`}>
                                        {label}
                                      </span>
                                      <span className="flex-1 truncate">{opt}</span>
                                      
                                      {isGraded && isOptionCorrect && (
                                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 ml-auto shrink-0" />
                                      )}

                                      {/* Beautiful absolute interactive tooltip */}
                                      {isCurrentlyHeld && (
                                        <div className="absolute left-0 bottom-full mb-2 w-full bg-slate-900 dark:bg-slate-950 border border-slate-700/80 text-slate-100 p-2.5 rounded-xl shadow-2xl z-50 animate-fade-in text-xs leading-normal font-medium pointer-events-none">
                                          <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase text-[9px] mb-1 pb-1 border-b border-slate-800">
                                            <Eye className="w-3 h-3 text-indigo-400 shrink-0" />
                                            <span>Full Choice {label}:</span>
                                          </div>
                                          <span className="block whitespace-normal break-words py-0.5">{opt}</span>
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Short Answer text inputs */}
                            {q.type === 'short-answer' && (
                              <div className="space-y-1.5">
                                {isGraded ? (
                                  <div className="space-y-1.5 text-[11px]">
                                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded text-slate-700 dark:text-slate-300 italic">
                                      Your response: <span className="font-medium">{userAnswers[q.id] || "(Left Blank)"}</span>
                                    </div>
                                    <div className="bg-emerald-50 dark:bg-slate-900/60 p-2 rounded text-emerald-800 dark:text-emerald-400">
                                      <strong>Tutor Model Key:</strong> {specGrade?.modelAnswer}
                                    </div>
                                    <div className="bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded text-indigo-800 dark:text-indigo-400">
                                      <strong>Coach Advice ({specGrade?.score}%):</strong> {specGrade?.feedback}
                                    </div>
                                  </div>
                                ) : (
                                  <textarea
                                    value={userAnswers[q.id] || ''}
                                    onChange={(e) => {
                                      setUserAnswers(prev => ({
                                        ...prev,
                                        [q.id]: e.target.value
                                      }));
                                    }}
                                    placeholder="Write your study answer explanation here..."
                                    className="w-full text-xs p-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[50px] resize-none"
                                  />
                                )}
                              </div>
                            )}

                            {isGraded && q.type === 'multiple-choice' && specGrade && (
                              <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 flex items-start gap-1">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">Concept Tip:</span>
                                <span>{q.explanation}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Interactive AI tutoring Focus notes shown after results are given */}
                    {evaluation && (
                      <div className="bg-slate-900 text-white rounded-xl p-3 border border-slate-800 space-y-2 text-left animate-fade-in">
                        
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-400" />
                          <div>
                            <span className="text-[8px] text-indigo-300 uppercase tracking-widest font-bold block">STUDY FOCUS ADVICE</span>
                            <span className="text-xs font-bold text-slate-100">
                              Based on your scored {evaluation.summary.overallPercentage}% accuracy:
                            </span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-300 leading-normal">
                          {evaluation.summary.tutorAdvice}
                        </p>

                        <div className="pt-1.5 border-t border-slate-800 flex flex-wrap gap-1">
                          <span className="text-[8px] font-bold text-indigo-400 block w-full">FOCUS SUBJECT KEYWORDS:</span>
                          {evaluation.summary.focusTopics.map((topic, tIdx) => (
                            <span key={tIdx} className="text-[9px] bg-slate-800 text-indigo-200 px-1.5 py-0.5 rounded-md">
                              • {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Persistent Study Utilities: Print & Save for Later (Visible Before & After Eval) */}
                    <div className="bg-indigo-50/50 dark:bg-slate-850/80 p-3 rounded-2xl border border-indigo-100/50 dark:border-slate-800 space-y-2 mt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Study Tools & Export</span>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('blank')}
                          className="w-full py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-755 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                          title="Print clean questions with lines to answer in pencil"
                        >
                          <Printer className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Print Worksheet</span>
                        </button>
                      </div>

                      {evaluation && (
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('evaluated')}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm animate-fade-in"
                          title="Print results page with correct answers marked by Tutor Coach"
                        >
                          <Printer className="w-3.5 h-3.5 text-white" />
                          <span>Print Graded Evaluation & Answers</span>
                        </button>
                      )}

                      <div className="flex justify-between items-center text-[9px] text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                        <span className="truncate">Unit: {quizData.title.slice(0, 24)}...</span>
                        <span className="capitalize">{difficulty} • {quizType.replace('-', ' ')}</span>
                      </div>
                    </div>

                    {/* Grading / Evaluation Submission Control */}
                    <div className="space-y-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">

                      {!evaluation ? (
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={handleEvaluateQuiz}
                            disabled={isEvaluating}
                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {isEvaluating ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Grading answers with Tutor Coach...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" /> Submit & score answers
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={clearInputs}
                            className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black tracking-wide transition text-center flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700"
                          >
                            <ArrowLeft className="w-3 h-3" /> Go Back to Start
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => {
                              // restart custom quiz answers session
                              const empty: Record<number, string> = {};
                              quizData?.questions.forEach(q => { empty[q.id] = ''; });
                              setUserAnswers(empty);
                              setEvaluation(null);
                            }}
                            className="py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-bold transition text-center"
                          >
                            Clear answers
                          </button>
                          <button
                            onClick={clearInputs}
                            className="py-2 bg-indigo-100 dark:bg-indigo-950/40 hover:bg-indigo-250 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold transition text-center"
                          >
                            New Material
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Bottom Navigation Bar */}
                {!(activeNavTab === 'watch' && !showDiscoverPage) && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl border border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2 md:gap-4 max-w-[95vw]">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavTab('home');
                        setActiveLoadedVisualization(null);
                      }}
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full transition-all duration-200 relative ${
                        activeNavTab === 'home' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold' 
                          : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      style={{ width: '48px', height: '48px' }}
                      title="Home"
                    >
                      <Home className={`w-4.5 h-4.5 transition-transform duration-200 ${
                        activeNavTab === 'home' ? 'scale-110' : ''
                      }`} />
                      <span className="text-[8px] font-black tracking-tight uppercase mt-0.5 leading-none">
                        Home
                      </span>
                      {activeNavTab === 'home' && (
                        <span className="absolute bottom-1 w-2.5 h-[2px] bg-indigo-600 dark:bg-indigo-400 rounded-full" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavTab('create');
                        setActiveLoadedVisualization(null);
                      }}
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full transition-all duration-200 relative ${
                        activeNavTab === 'create' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold' 
                          : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      style={{ width: '48px', height: '48px' }}
                      title="Create"
                    >
                      <Sparkles className={`w-4.5 h-4.5 transition-transform duration-200 ${
                        activeNavTab === 'create' ? 'scale-110' : ''
                      }`} />
                      <span className="text-[8px] font-black tracking-tight uppercase mt-0.5 leading-none">
                        Create
                      </span>
                      {activeNavTab === 'create' && (
                        <span className="absolute bottom-1 w-2.5 h-[2px] bg-indigo-600 dark:bg-indigo-400 rounded-full" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavTab('visualizer');
                      }}
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full transition-all duration-200 relative ${
                        activeNavTab === 'visualizer' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-455 font-extrabold' 
                          : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      style={{ width: '48px', height: '48px' }}
                      title="Visualizer"
                    >
                      <Activity className={`w-4.5 h-4.5 transition-transform duration-200 ${
                        activeNavTab === 'visualizer' ? 'scale-110' : ''
                      }`} />
                      <span className="text-[8px] font-black tracking-tight uppercase mt-0.5 leading-none">
                        Visual
                      </span>
                      {activeNavTab === 'visualizer' && (
                        <span className="absolute bottom-1 w-2.5 h-[2px] bg-indigo-600 dark:bg-indigo-405 rounded-full" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavTab('watch');
                        setActiveLoadedVisualization(null);
                      }}
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full transition-all duration-200 relative ${
                        activeNavTab === 'watch' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold' 
                          : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      style={{ width: '48px', height: '48px' }}
                      title="Watch"
                    >
                      <Video className={`w-4.5 h-4.5 transition-transform duration-200 ${
                        activeNavTab === 'watch' ? 'scale-110' : ''
                      }`} />
                      <span className="text-[8px] font-black tracking-tight uppercase mt-0.5 leading-none">
                        Watch
                      </span>
                      {activeNavTab === 'watch' && (
                        <span className="absolute bottom-1 w-2.5 h-[2px] bg-indigo-600 dark:bg-indigo-400 rounded-full" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavTab('profile');
                        setActiveLoadedVisualization(null);
                      }}
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full transition-all duration-200 relative ${
                        activeNavTab === 'profile' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold' 
                          : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      style={{ width: '48px', height: '48px' }}
                      title="Profile"
                    >
                      <UserIcon className={`w-4.5 h-4.5 transition-transform duration-200 ${
                        activeNavTab === 'profile' ? 'scale-110' : ''
                      }`} />
                      <span className="text-[8px] font-black tracking-tight uppercase mt-0.5 leading-none">
                        Profile
                      </span>
                      {activeNavTab === 'profile' && (
                        <span className="absolute bottom-1 w-2.5 h-[2px] bg-indigo-600 dark:bg-indigo-405 rounded-full" />
                      )}
                    </button>
                  </div>
                )}

              </div>

            </div>

          </div>

        </div>



      {/* Global alert notifications */}
      {errorMsg && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-xl flex items-start gap-3 max-w-sm transition animate-bounce">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-xs text-rose-850 block">Note Lens Error</span>
            <p className="text-[11px] text-rose-700 leading-normal">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600 text-xs font-bold ml-auto shrink-0 bg-rose-100 p-1 rounded-md">✕</button>
        </div>
      )}

      {saveToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-indigo-900 text-white rounded-2xl p-4 shadow-xl flex items-center gap-3 max-w-sm border border-indigo-700 transition animate-fade-in animate-bounce">
          <BookOpenCheck className="w-5 h-5 text-indigo-400" />
          <div>
            <span className="font-bold text-xs block">Study Space Updated</span>
            <p className="text-[11px] text-indigo-200 leading-normal">{saveToast}</p>
          </div>
          <button onClick={() => setSaveToast(null)} className="text-indigo-400 hover:text-white text-xs font-bold ml-auto shrink-0 bg-indigo-850 p-1 rounded-md">✕</button>
        </div>
      )}

      {/* Footer removed per user instructions */}
    </div>
  );
}

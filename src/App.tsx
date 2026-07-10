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
    return emailOrName.split('@');
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

export function ReelPlayer({ video, isActive, onOpenSummary, onOpenLink, onDelete, profileEmail, profileUsername, isSaved, onToggleSave }: ReelPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [expandedSummary, setExpandedSummary] = useState(false);

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

  useEffect(() => {
    const activeAudioTrack = video.audioTrack ? (CURATED_AUDIO_TRACKS.find((t) => t.id === video.audioTrack.id) || video.audioTrack) : null;
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
        audioRef.current.play().catch(err => console.log("Audio deferred:", err));
      } else {
        audioRef.current.volume = 0;
        audioRef.current.pause();
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    return () => { if (audioRef.current) audioRef.current.pause(); };
  }, [isActive, playing, video.audioTrack, isMuted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = video.audioTrack ? true : isMuted;
    }
  }, [video.audioTrack, playing, isActive, isMuted]);

  useEffect(() => {
    if (video.isStaticImage) {
      const d = video.staticDuration || 5;
      setDuration(d);
      if (isActive && playing) {
        const interval = setInterval(() => {
          setCurrentTime(prev => {
            const next = prev + 0.1;
            return next >= d ? 0 : next;
          });
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, [isActive, playing, video.isStaticImage, video.staticDuration]);

  useEffect(() => {
    if (!video.isStaticImage && videoRef.current) {
      if (isActive) {
        videoRef.current.play().catch(err => console.log('Autoplay deferred:', err));
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

  const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };
  const handleDurationChange = () => { if (videoRef.current) setDuration(videoRef.current.duration); };

  const CURATED_AUDIO_TRACKS: any[] = [];
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const loading = false;
  const loadingMessage = "";
  const quizData = null;
    return (
    <div className="w-full h-full relative bg-black flex items-center justify-center overflow-hidden">
      {video.isStaticImage ? (
        <div onClick={togglePlay} className="w-full h-full cursor-pointer flex items-center justify-center bg-slate-950">
          <img src={video.videoUrl} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
        </div>
      ) : (
        <div className="w-full h-full relative">
          <video ref={videoRef} src={video.videoUrl} className="w-full h-full object-contain" onClick={togglePlay} onTimeUpdate={handleTimeUpdate} onDurationChange={handleDurationChange} loop playsInline />
        </div>
      )}

      <header className="absolute top-0 left-0 right-0 flex justify-between items-center p-4 bg-gradient-to-b from-black/60 to-transparent z-10">
        <h1 className="text-white font-bold tracking-wide text-lg">KOJLUX STUDY HUB</h1>
        
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }}
            className="relative flex items-center justify-center p-2 rounded text-white"
            id="notifications-trigger-btn"
            title="Notifications"
          >
            <svg viewBox="0 0 260 260" xmlns="http://w3.org" className="w-6 h-6">
              <defs>
                <linearGradient id="mGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6366F1"/><stop offset="100%" stopColor="#4338CA"/></linearGradient>
                <linearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFFFFF"/><stop offset="100%" stopColor="#E0E7FF"/></linearGradient>
              </defs>
              <rect x="20" y="20" width="220" height="220" rx="52" fill="url(#mGrad)"/>
              <g transform="translate(60, 78)">
                <path d="M70 0 C48 -6 22 -6 0 4 L0 118 C22 108 48 108 70 116 Z" fill="#FFFFFF" opacity="0.95"/>
                <path d="M70 0 C92 -6 118 -6 140 4 L140 118 C118 108 92 108 70 116 Z" fill="#FFFFFF" opacity="0.95"/>
                <path d="M12 22 C28 16 48 16 62 22 M12 46 C28 40 48 40 62 46 M12 70 C28 64 44 64 56 68" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
                <path d="M78 22 C94 16 114 16 128 22 M78 46 C94 40 114 40 128 46 M84 70 C98 64 112 64 122 68" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
              </g>
              <circle cx="196" cy="196" r="34" fill="url(#pGrad)"/>
              <circle cx="196" cy="196" r="34" fill="none" stroke="#4338CA" strokeWidth="4" opacity="0.15"/>
              <path d="M186 180 L212 196 L186 212 Z" fill="#4338CA"/>
              <g transform="translate(198, 46)"><path d="M0 -16 L5 -5 L16 0 L5 5 L0 16 L-5 5 L-16 0 L-5 -5 Z" fill="#FFFFFF" opacity="0.9"/></g>
            </svg>
            {notifications.some(n => !n.read) && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 shadow-xl rounded-lg p-2 border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">Notifications</span>
                <button onClick={() => setNotificationsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">Close</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {loading && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-40 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-slate-900 border border-indigo-100 flex items-center justify-center"><RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" /></div>
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 tracking-wider uppercase mt-4">Analyzing study material...</span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 animate-pulse max-w-[240px] text-center">{loadingMessage}</p>
        </div>
      )}

      {quizData && (
        <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 text-white p-4 rounded-xl backdrop-blur-sm">
          <header className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2"><h4 className="font-bold text-sm">Study Flash Quiz</h4></header>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <ReelPlayer 
        video={{ id: "demo-1", videoUrl: "https://unsplash.com", isStaticImage: true, staticDuration: 10 }}
        isActive={true} onOpenSummary={() => {}} onOpenLink={() => {}} onDelete={() => {}} profileEmail="scholar@kojlux.edu" profileUsername="Scholar" isSaved={false} onToggleSave={() => {}}
      />
    </div>
  );
}


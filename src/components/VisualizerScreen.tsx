import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, ArrowLeft, ArrowRight, RotateCcw, 
  Sparkles, Search, Compass, Lightbulb, Info, Activity, Grid
} from 'lucide-react';
import { VisualizationResponse, HistoryItem } from '../types';

interface VisualizerProps {
  darkMode: boolean;
  onSaveHistory: (newRecord: HistoryItem) => void;
  loadedVisualization?: {
    vizPrompt: string;
    vizResponse: VisualizationResponse;
  } | null;
  gradeLevel?: string;
  onGradeLevelChange?: (newLevel: string) => void;
}

const DEMO_PRESETS = [
  { label: "Solar Eclipse simulation", query: "How does solar eclipse happen" },
  { label: "Photosynthesis cycle", query: "How does photosynthesis happen" },
  { label: "Solve Quadratic equations", query: "Solve: x^2 - 5x + 6 = 0" },
  { label: "Plot algebraic Functions", query: "Graph: y = -2x + 4" }
];

export default function VisualizerScreen({ 
  darkMode, 
  onSaveHistory, 
  loadedVisualization, 
  gradeLevel = 'High School',
  onGradeLevelChange
}: VisualizerProps) {
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Simulation player states
  const [vizData, setVizData] = useState<VisualizationResponse | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Restore state if a visualizer history is loaded
  useEffect(() => {
    if (loadedVisualization) {
      setVizData(loadedVisualization.vizResponse);
      setQuery(loadedVisualization.vizPrompt);
      setCurrentStep(0);
      setIsPlaying(false);
    }
  }, [loadedVisualization]);

  // Animation player timer loop
  useEffect(() => {
    if (isPlaying && vizData) {
      playTimerRef.current = setTimeout(() => {
        if (currentStep < vizData.steps.length - 1) {
          setCurrentStep(prev => prev + 1);
        } else {
          setCurrentStep(0); // Loop back
        }
      }, 4000);
    }
    return () => {
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current);
      }
    };
  }, [isPlaying, currentStep, vizData]);

  const handleGenerate = async (searchPrompt: string) => {
    if (!searchPrompt.trim()) return;
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentStep(0);

    try {
      const res = await fetch('/api/generate-visualization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: searchPrompt, gradeLevel })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Visualization service failed to compile steps.');
      }
      setVizData(data);
      
      // Auto-save visualization to local and cloud history
      const newHistoryRecord: HistoryItem = {
        id: Date.now().toString(),
        itemType: 'visualization',
        title: data.title || `Visualizing ${searchPrompt}`,
        subject: `Interactive ${data.type === 'graph' ? 'Plotter' : data.type === 'math' ? 'Equation' : 'Animation'}`,
        savedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        vizPrompt: searchPrompt,
        vizResponse: data
      };
      
      onSaveHistory(newHistoryRecord);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unable to build visualization model. Please try a different query.');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (q: string) => {
    setQuery(q);
    handleGenerate(q);
  };

  const nextStep = () => {
    if (vizData && currentStep < vizData.steps.length - 1) {
      setIsPlaying(false);
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (vizData && currentStep > 0) {
      setIsPlaying(false);
      setCurrentStep(prev => prev - 1);
    }
  };

  const restartPlayer = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  // GRAPH HELPER MATH PLOTTER
  const renderGraphWidget = () => {
    if (!vizData?.graphConfig) return null;
    const { xMin, xMax, yMin, yMax, points, equation } = vizData.graphConfig;

    const width = 300;
    const height = 200;

    // Coordinate conversion scales to SVG coordinates
    const scaleX = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
    const scaleY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;

    const xZero = scaleX(0);
    const yZero = scaleY(0);

    // Draw grid ticks
    const verticalGridTicks = [];
    for (let x = xMin; x <= xMax; x += (xMax - xMin) / 10) {
      verticalGridTicks.push(x);
    }

    const horizontalGridTicks = [];
    for (let y = yMin; y <= yMax; y += (yMax - yMin) / 10) {
      horizontalGridTicks.push(y);
    }

    // Sort to trace line paths properly
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    const pathString = sortedPoints.reduce((acc, p, idx) => {
      const sx = scaleX(p.x);
      const sy = scaleY(p.y);
      if (isNaN(sx) || isNaN(sy)) return acc;
      return `${acc} ${idx === 0 ? 'M' : 'L'} ${sx} ${sy}`;
    }, '');

    return (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="relative w-full aspect-[3/2] max-w-md bg-white dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-2 flex items-center justify-center overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            {/* Grid network lines */}
            {verticalGridTicks.map((tick, i) => (
              <line
                key={`v-${i}`}
                x1={scaleX(tick)}
                y1={0}
                x2={scaleX(tick)}
                y2={height}
                stroke={darkMode ? '#1e293b' : '#f1f5f9'}
                strokeWidth={1}
              />
            ))}
            {horizontalGridTicks.map((tick, i) => (
              <line
                key={`h-${i}`}
                x1={0}
                y1={scaleY(tick)}
                x2={width}
                y2={scaleY(tick)}
                stroke={darkMode ? '#1e293b' : '#f1f5f9'}
                strokeWidth={1}
              />
            ))}

            {/* X-axis coordinate line */}
            <line
              x1={0}
              y1={yZero}
              x2={width}
              y2={yZero}
              stroke={darkMode ? '#64748b' : '#94a3b8'}
              strokeWidth={1.5}
            />
            {/* Y-axis coordinate line */}
            <line
              x1={xZero}
              y1={0}
              x2={xZero}
              y2={height}
              stroke={darkMode ? '#64748b' : '#94a3b8'}
              strokeWidth={1.5}
            />

            {/* Draw curve path equation lines */}
            {pathString && (
              <path
                d={pathString}
                fill="none"
                stroke="#6366f1"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-[dash_2s_ease-out]"
              />
            )}

            {/* Coordinate Node Dots with labels */}
            {points.map((p, i) => {
              const sx = scaleX(p.x);
              const sy = scaleY(p.y);
              if (isNaN(sx) || isNaN(sy)) return null;
              return (
                <g key={`pt-${i}`} className="group cursor-pointer">
                  <circle
                    cx={sx}
                    cy={sy}
                    r={3.5}
                    fill={p.label ? '#10b981' : '#4f46e5'}
                    className="hover:r-5 transition-all"
                  />
                  {p.label && (
                    <text
                      x={sx}
                      y={sy - 7}
                      fill="#10b981"
                      textAnchor="middle"
                      className="text-[8px] font-extrabold font-sans"
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Axis limit notations */}
            <text x={4} y={yZero - 4} fill="#64748b" className="text-[7px] font-mono select-none">y={yMax}</text>
            <text x={4} y={height - 4} fill="#64748b" className="text-[7px] font-mono select-none">y={yMin}</text>
            <text x={width - 25} y={yZero + 9} fill="#64748b" className="text-[7px] font-mono select-none">x={xMax}</text>
            <text x={4} y={yZero + 9} fill="#64748b" className="text-[7px] font-mono select-none">x={xMin}</text>
          </svg>
        </div>
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-xl text-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-widest leading-none">Mathematical Plotter Function</span>
          <span className="text-sm font-extrabold font-mono text-indigo-600 dark:text-indigo-400 mt-1 block">{equation || 'Function line plot'}</span>
        </div>
      </div>
    );
  };

  // ANIMATION WHITEBOARD RENDERER (SVG)
  const renderAnimationWidget = () => {
    if (!vizData) return null;
    const currentStepData = vizData.steps[currentStep];
    const shapes = currentStepData?.visualElements?.shapes || [];

    return (
      <div className="w-full flex flex-col items-center">
        <div className="relative w-full aspect-[3/2] max-w-sm bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-2 flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 300 200" className="w-full h-full">
            {/* Arrow endmarker def */}
            <defs>
              <marker
                id="marker-arrow"
                viewBox="0 0 10 10"
                refX="4"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
              </marker>
            </defs>

            {/* Shapes dynamic rendering with transitions */}
            {shapes.map((shape, idx) => {
              const key = `shape-${idx}-${shape.type}`;
              if (shape.type === 'circle') {
                return (
                  <g key={key}>
                    <circle
                      cx={shape.cx}
                      cy={shape.cy}
                      r={shape.r}
                      fill={shape.color}
                      className="transition-all duration-1000 ease-in-out opacity-90"
                    />
                    {shape.label && (
                      <text
                        x={shape.cx}
                        y={(shape.cy || 0) + (shape.r || 0) + 12}
                        fill={darkMode ? '#f1f5f9' : '#0f172a'}
                        textAnchor="middle"
                        className="text-[9.5px] font-extrabold select-none transition-all duration-1000 [text-shadow:_0_1px_1px_rgba(255,255,255,0.7)] dark:[text-shadow:_0_1px_2px_rgba(0,0,0,0.8)]"
                      >
                        {shape.label}
                      </text>
                    )}
                  </g>
                );
              }

              if (shape.type === 'rect') {
                return (
                  <g key={key}>
                    <rect
                      x={shape.x}
                      y={shape.y}
                      width={shape.width}
                      height={shape.height}
                      fill={shape.color}
                      rx={6}
                      className="transition-all duration-1000 ease-in-out opacity-95"
                    />
                    {shape.label && (
                      <text
                        x={(shape.x || 0) + (shape.width || 0) / 2}
                        y={(shape.y || 0) + (shape.height || 0) / 2 + 3}
                        fill="#ffffff"
                        textAnchor="middle"
                        className="text-[8.5px] font-black select-none transition-all duration-1000 [text-shadow:_0_1px_2px_rgba(0,0,0,0.95),_0_0_1px_rgba(0,0,0,0.95)]"
                      >
                        {shape.label}
                      </text>
                    )}
                  </g>
                );
              }

              if (shape.type === 'line') {
                return (
                  <line
                    key={key}
                    x1={shape.x1}
                    y1={shape.y1}
                    x2={shape.x2}
                    y2={shape.y2}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth || 3}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-in-out"
                  />
                );
              }

              if (shape.type === 'arrow') {
                return (
                  <g key={key}>
                    <line
                      x1={shape.x1}
                      y1={shape.y1}
                      x2={shape.x2}
                      y2={shape.y2}
                      stroke={shape.color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      markerEnd="url(#marker-arrow)"
                      className="transition-all duration-1000 ease-in-out"
                    />
                    {shape.label && (
                      <text
                        x={((shape.x1 || 0) + (shape.x2 || 0)) / 2}
                        y={((shape.y1 || 0) + (shape.y2 || 0)) / 2 - 6}
                        fill={darkMode ? '#cbd5e1' : '#475569'}
                        textAnchor="middle"
                        className="text-[7.5px] font-extrabold italic select-none"
                      >
                        {shape.label}
                      </text>
                    )}
                  </g>
                );
              }

              if (shape.type === 'text') {
                return (
                  <text
                    key={key}
                    x={shape.x}
                    y={shape.y}
                    fill={shape.color}
                    className="text-[9.5px] font-bold font-mono transition-all duration-1000 select-none"
                  >
                    {shape.text || shape.label}
                  </text>
                );
              }

              return null;
            })}
          </svg>
        </div>
      </div>
    );
  };

  // MATH SOLVING WHITEBOARD CARDS
  const renderMathWidget = () => {
    if (!vizData) return null;
    const currentStepData = vizData.steps[currentStep];
    const highlightData = currentStepData?.visualElements?.mathHighlight;

    if (!highlightData) return null;

    return (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="w-full max-w-sm aspect-[3/2] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden">
          {/* Subtle math graph grid pattern overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#ddd_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-35 pointer-events-none" />
          
          <div className="relative z-10 space-y-4">
            <span className="text-[10px] tracking-widest font-bold text-indigo-500 uppercase block">Active Formula Matrix</span>
            
            <div className="py-2.5 px-4 bg-indigo-50/50 dark:bg-slate-900 border border-indigo-100/50 dark:border-slate-800 rounded-2xl inline-block shadow-xs">
              <span className="text-xl md:text-2xl font-black font-mono tracking-wide text-slate-850 dark:text-slate-150 inline-block py-1">
                {highlightData.expression}
              </span>
            </div>

            {highlightData.highlight && (
              <div className="flex gap-1 justify-center items-center">
                <span className="text-[10px] text-slate-400">Operation focus:</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 font-mono text-[10px] font-extrabold animate-pulse">
                  {highlightData.highlight}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="w-full max-w-sm flex items-start gap-2.5 bg-indigo-50/40 dark:bg-slate-900/50 p-3 rounded-2xl border border-indigo-100/20 dark:border-slate-800/60 mt-1">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-left">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-600 dark:text-indigo-400 block mb-0.5">Rule / Logic Rationale</span>
            <p className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-relaxed font-sans font-medium">{highlightData.note}</p>
          </div>
        </div>
      </div>
    );
  };

  const currentStepData = vizData?.steps[currentStep];

  return (
    <div className="flex-1 flex flex-col gap-4 animate-fade-in text-left h-full">
      {(vizData || loading) && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Compass className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
              Concept Visualizer
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Type math puzzles, physical sciences, or graphed equations to construct step animations
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center p-6 text-center bg-slate-50/50 dark:bg-slate-900/20 rounded-3xl border border-slate-150 dark:border-slate-850/80">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-indigo-600 animate-pulse" />
          </div>
          <span className="text-[10px] tracking-widest font-extrabold text-indigo-600 dark:text-indigo-400 uppercase">Constructing Visual Model</span>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Applying math engines &amp; geometric coordinate rendering...</p>
          <p className="text-[10px] text-slate-400 mt-3 animate-pulse max-w-xs block leading-relaxed">Gemini is plotting shape matrices, axes intervals, and chronological education stages...</p>
        </div>
      ) : vizData ? (
        // ACTIVE SIMULATOR PLAYER BOARD
        <div className="flex-grow flex flex-col gap-4">
          
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2.5">
            <div>
              <span className={`text-[8px] tracking-wider uppercase font-extrabold px-2 py-0.5 rounded-full ${
                vizData.type === 'graph' 
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-450' 
                  : vizData.type === 'math' 
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-450'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-450'
              }`}>
                {vizData.type === 'graph' ? 'Coordinate Plotter' : vizData.type === 'math' ? 'Equation steps' : 'Physics/Science Loop'}
              </span>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mt-1 leading-tight">{vizData.title}</h3>
            </div>
            
            <button
              onClick={() => { setVizData(null); }}
              className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-300 transition"
            >
              Reset
            </button>
          </div>

          {/* Whiteboard widgets */}
          {vizData.type === 'graph' && renderGraphWidget()}
          {vizData.type === 'animation' && renderAnimationWidget()}
          {vizData.type === 'math' && renderMathWidget()}

          {/* Chronological steps narrative deck */}
          {currentStepData && (
            <div className="rounded-2xl p-4 bg-slate-100/40 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 flex-grow flex flex-col gap-2">
              <div className="flex justify-between items-center bg-white dark:bg-slate-850 px-3 py-1 rounded-xl shadow-xs border border-slate-200/10">
                <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none">
                  Step {currentStep + 1} of {vizData.steps.length}
                </span>
                <span className="text-[10.5px] font-extrabold text-slate-800 dark:text-white leading-none">
                  {currentStepData.label}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans font-medium text-left">
                {currentStepData.explanation}
              </p>
            </div>
          )}

          {/* Simulation player timeline controls bar */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-850 p-2.5 rounded-2xl border border-slate-200/20 dark:border-slate-800">
            <button
              onClick={restartPlayer}
              title="Restart"
              className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-500 transition"
              disabled={currentStep === 0}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={prevStep}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                disabled={currentStep === 0}
                title="Previous frame"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition animate-pulse"
                title={isPlaying ? "Pause simulation loop" : "Auto-play simulation steps"}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              </button>

              <button
                onClick={nextStep}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                disabled={currentStep === vizData.steps.length - 1}
                title="Next frame"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper dots indicator */}
            <div className="flex gap-1">
              {vizData.steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setIsPlaying(false); setCurrentStep(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentStep 
                      ? 'bg-indigo-650 w-3.5' 
                      : 'bg-slate-350 dark:bg-slate-600 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          </div>

        </div>
      ) : (
        // DASHBOARD INITIAL SEARCH STATE - ChatGPT/Claude-like premium interface
        <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full gap-8 py-8 md:py-12 animate-fade-in text-left">
          
          {/* Hero Header Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
                Concept Visualizer
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed pl-1">
              Type math puzzles, physical sciences, or graphed equations to construct step animations.
            </p>
          </div>

          {/* Central Action Zone (The Input Bar & Grade Selector) */}
          <div className="space-y-4">
            {/* Live Grade Level Toggle Selector */}
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-805/80">
              <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5 pl-0.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Tailor to Grade / Understanding Level:
              </span>
              <select
                value={gradeLevel}
                onChange={(e) => onGradeLevelChange && onGradeLevelChange(e.target.value)}
                className="bg-white dark:bg-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 transition cursor-pointer shadow-xs"
              >
                <option value="Elementary School">Elementary School (Simple Terms)</option>
                <option value="Middle School">Middle School (Visual Analogies)</option>
                <option value="High School">High School (Standard Curriculum)</option>
                <option value="College">College (Advanced Technical/Rigorous)</option>
                <option value="Lifelong Learner">Lifelong Learner (Intuitive & Professional)</option>
              </select>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleGenerate(query); }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 rounded-2xl flex items-center gap-2 p-3 pr-2 shadow-xs hover:shadow-sm transition-all duration-200"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2.5 px-1.5">
                <Search className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  className="w-full bg-transparent border-none text-sm focus:ring-0 text-slate-800 dark:text-white placeholder-slate-400 p-0 focus:outline-none"
                  placeholder="Ask anything to generate physical system drawings, math formulas breakdowns, or algebraic coordinate axes..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold transition shrink-0 shadow-xs flex items-center justify-center"
                disabled={loading || !query.trim()}
                title="Generate simulation"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {error && (
              <div className="p-3.5 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs rounded-xl font-medium border border-red-200/50 dark:border-red-900/50 flex items-center gap-2 animate-fade-in">
                <Info className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Suggested Presets Section (The Grid) */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pl-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Suggested Presets</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {DEMO_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePresetClick(p.query)}
                  className="p-4 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-850/50 border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-900 rounded-2xl text-left transition-all duration-200 shadow-xs hover:shadow-sm flex items-start gap-3 group relative"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 flex items-center justify-center shrink-0 text-indigo-500 dark:text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-amber-400 transition-colors">
                      {p.label}
                    </h4>
                    <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate font-normal leading-tight">
                      "{p.query}"
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
        </div>
      )}

      {/* INPUT FORM SITUATED AT EXPLICIT BOTTOM (ONLY SHOW WHEN RESULT IS ACTIVE) */}
      {vizData && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleGenerate(query); }}
          className="mt-auto bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-2 rounded-2xl flex items-center gap-1.5 focus-within:border-indigo-500 shadow-sm"
        >
          <div className="flex-1 min-w-0 flex items-center gap-2 px-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-none text-xs focus:ring-0 text-slate-800 dark:text-white placeholder-slate-400 p-1 focus:outline-none"
              placeholder="Ask anything to generate physical system drawings, math formulas breakdowns, or algebraic coordinate axes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs shrink-0 transition"
            disabled={loading || !query.trim()}
          >
            Generate
          </button>
        </form>
      )}
    </div>
  );
}

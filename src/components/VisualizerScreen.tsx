import { GoogleGenAI } from '@google/genai';
import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, ArrowLeft, ArrowRight, RotateCcw,
  Sparkles, Compass, Lightbulb, Activity,
  MessageCircle, Send, Bot, User as UserIcon
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
  // Reports failures up to App.tsx's global blocking error modal instead of
  // rendering a raw/local error block inside this screen. App.tsx only ever
  // surfaces this on the Visualizer/Create/Profile screens.
  onError?: (message: string) => void;
}

// One turn of the unified visualizer chat. A turn from the assistant is either a
// plain explanation ("text") or the delivery of a freshly built visualization
// ("visualization"), which also becomes the panel's active content.
interface VisualizerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text' | 'visualization';
  text?: string;
  vizResponse?: VisualizationResponse;
  vizPrompt?: string;
}

// Key rotation: tries the primary key first, and if the request fails (rate limit,
// transient error, etc.) automatically retries with the rotation (fallback) key.
async function generateContentWithFallback(apiKeys: (string | undefined)[], requestConfig: any) {
  let lastError: unknown = null;
  for (const apiKey of apiKeys) {
    if (!apiKey) continue;
    try {
      const ai = new GoogleGenAI({ apiKey });
      return await ai.models.generateContent(requestConfig);
    } catch (err) {
      console.error('Gemini request failed on this key, trying next key if available:', err);
      lastError = err;
    }
  }
  throw lastError ?? new Error('No valid Gemini API key configured.');
}

const DEMO_PRESETS = [
  { label: "Solar eclipse simulation", query: "How does a solar eclipse happen" },
  { label: "Photosynthesis cycle", query: "How does photosynthesis happen" },
  { label: "Solve a quadratic equation", query: "Solve: x^2 - 5x + 6 = 0" },
  { label: "Plot an algebraic function", query: "Graph: y = -2x + 4" }
];

export default function VisualizerScreen({
  darkMode,
  onSaveHistory,
  loadedVisualization,
  gradeLevel = 'High School',
  onGradeLevelChange,
  onError
}: VisualizerProps) {
  // Unified chat thread — every user request (whether it's the first prompt or a
  // follow-up) flows through the same conversation and the same composer.
  const [messages, setMessages] = useState<VisualizerChatMessage[]>([]);
  const [composerValue, setComposerValue] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // The visualization currently shown in the right-hand (or toggled) panel.
  const [vizData, setVizData] = useState<VisualizationResponse | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile-only toggle between the chat and the visualization panel — desktop
  // shows both side by side, so this only matters below the md breakpoint.
  const [mobileView, setMobileView] = useState<'chat' | 'visualization'>('chat');

  // Reports a failure to the app-wide blocking error modal (falls back to console
  // logging only if no handler was supplied by the parent).
  const reportError = (message: string) => {
    if (onError) {
      onError(message);
    } else {
      console.error(message);
    }
  };

  // Restore state if a visualizer history item is loaded from elsewhere in the app
  useEffect(() => {
    if (loadedVisualization) {
      setVizData(loadedVisualization.vizResponse);
      setCurrentStep(0);
      setIsPlaying(false);
      setMessages([
        { id: 'loaded-user', role: 'user', kind: 'text', text: loadedVisualization.vizPrompt },
        {
          id: 'loaded-assistant',
          role: 'assistant',
          kind: 'visualization',
          text: `Reloaded "${loadedVisualization.vizResponse.title}" from your history.`,
          vizResponse: loadedVisualization.vizResponse,
          vizPrompt: loadedVisualization.vizPrompt
        }
      ]);
      setMobileView('visualization');
    }
  }, [loadedVisualization]);

  // Auto-scroll the chat to the latest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

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

  // Sends one turn of the unified chat. A single Gemini call — using the same
  // client/key pattern as every other AI call in App.tsx (Quiz, Quiz grading,
  // Summarizer) — decides, from conversational context, whether this turn should
  // build a brand-new visualization or just answer as a follow-up about the one
  // already on screen. This replaces the old dead '/api/generate-visualization'
  // proxy call entirely.
  const handleSend = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    const userMsg: VisualizerChatMessage = { id: `u-${Date.now()}`, role: 'user', kind: 'text', text: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setComposerValue('');
    setSending(true);

    try {
      const activeVizContext = vizData
        ? `The student currently has this visualization loaded on screen — title: "${vizData.title}", type: "${vizData.type}". Its steps: ${vizData.steps.map((s, i) => `(${i + 1}) ${s.label} — ${s.explanation}`).join(' ')}`
        : 'No visualization is currently loaded on screen.';

      // Schema mirrors VisualizationResponse / VizStep / SVGShape / MathHighlight /
      // GraphConfig exactly as defined in types.ts, so a "visualization" turn
      // never fails to satisfy what the renderers below expect.
      const systemInstruction = `You are Kojlux's AI concept visualizer and tutor, in a continuous chat with a "${gradeLevel}" level student.
${activeVizContext}
For every message the student sends, choose exactly one response type:
- "visualization": the student is asking you to build, show, graph, solve, or animate a NEW concept, equation, or system — including asking for something different than what's currently loaded.
- "text": the student is asking a follow-up or clarifying question about the visualization CURRENTLY on screen (e.g. "why does that happen", "explain step 2 more simply", "give a real-world example"). Do not rebuild the visualization for these — just explain, in plain conversational language appropriate for their level.
Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this TypeScript shape:
{
  "responseType": "visualization" | "text",
  "textReply": string,
  "visualization": {
    "title": string,
    "type": "animation" | "math" | "graph",
    "steps": [
      {
        "label": string,
        "explanation": string,
        "visualElements": {
          "shapes": [ { "type": "circle" | "rect" | "line" | "arrow" | "text", "cx": number, "cy": number, "r": number, "x": number, "y": number, "width": number, "height": number, "x1": number, "y1": number, "x2": number, "y2": number, "color": string, "label": string, "text": string, "strokeWidth": number } ],
          "mathHighlight": { "expression": string, "highlight": string, "note": string }
        }
      }
    ],
    "graphConfig": {
      "equation": string,
      "xMin": number, "xMax": number, "yMin": number, "yMax": number,
      "points": [ { "x": number, "y": number, "label": string } ]
    }
  }
}
Rules:
- "textReply" is always included: a short (1-3 sentence) reply, even when responseType is "visualization" (e.g. "Here's how photosynthesis works, step by step.").
- Include the top-level "visualization" key ONLY when responseType is "visualization" — omit it entirely for "text".
- Within "visualization": include 3-6 steps that build on each other; shape coordinates sit within a 300x200 canvas; include "visualElements.shapes" only for type "animation" and "visualElements.mathHighlight" only for type "math" (omit the other); include "graphConfig" only when type is "graph".
- Never invent extra top-level fields.`;

      const contents = [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: JSON.stringify({ responseType: 'text', textReply: 'Understood — ready to help.' }) }] },
        ...updatedMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.kind === 'visualization' ? (m.text || `Generated visualization: ${m.vizResponse?.title}`) : (m.text || '') }]
        }))
      ];

      const response = await generateContentWithFallback(
        [import.meta.env.VITE_VISUALIZER_KEY, import.meta.env.VITE_VISUALIZER_KEY_ROTATION],
        {
          model: 'gemini-3.5-flash-lite',
          contents,
          config: {
            responseMimeType: 'application/json'
          }
        }
      );

      const resultText = response.text;
      if (!resultText) {
        throw new Error('Gemini returned an empty response.');
      }

      const parsed = JSON.parse(resultText);

      if (parsed.responseType === 'visualization' && parsed.visualization) {
        const vizResponse = parsed.visualization as VisualizationResponse;
        setVizData(vizResponse);
        setCurrentStep(0);
        setIsPlaying(false);
        setMobileView('visualization');

        const assistantMsg: VisualizerChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          kind: 'visualization',
          text: parsed.textReply || `Here's "${vizResponse.title}".`,
          vizResponse,
          vizPrompt: trimmed
        };
        setMessages(prev => [...prev, assistantMsg]);

        onSaveHistory({
          id: Date.now().toString(),
          itemType: 'visualization',
          title: vizResponse.title || `Visualizing ${trimmed}`,
          subject: `Interactive ${vizResponse.type === 'graph' ? 'Plotter' : vizResponse.type === 'math' ? 'Equation' : 'Animation'}`,
          savedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          vizPrompt: trimmed,
          vizResponse
        });
      } else {
        const assistantMsg: VisualizerChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          kind: 'text',
          text: parsed.textReply || "Noted."
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      // Full technical detail stays in the console for debugging; the user only
      // ever sees a clean, standardized message — never a raw error string.
      console.error('Gemini visualizer chat error:', err);
      reportError('An error occurred. Please try again.');
      // Roll back the optimistic user message on failure so it isn't stranded unanswered
      setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  // Clears the whole conversation and the active visualization, starting fresh.
  const handleNewConversation = () => {
    setMessages([]);
    setVizData(null);
    setCurrentStep(0);
    setIsPlaying(false);
    setMobileView('chat');
  };

  // Loads a past visualization message back into the active panel (e.g. after
  // scrolling up to an earlier turn in the conversation).
  const handleOpenVizMessage = (msg: VisualizerChatMessage) => {
    if (!msg.vizResponse) return;
    setVizData(msg.vizResponse);
    setCurrentStep(0);
    setIsPlaying(false);
    setMobileView('visualization');
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
    <div className="flex-1 flex flex-col gap-3 animate-fade-in text-left h-full min-h-[640px]">
      {/* Mobile-only toggle tabs — desktop shows chat and visualization side by side */}
      <div className="md:hidden flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition ${
            mobileView === 'chat'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => vizData && setMobileView('visualization')}
          disabled={!vizData}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-35 ${
            mobileView === 'visualization'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Visualization
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0">

        {/* ===================== CHAT PANE ===================== */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[400px] lg:w-[440px] md:shrink-0 min-h-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden`}>

          {/* Chat header */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider leading-none">Concept Visualizer</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">AI chat &amp; simulations</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewConversation}
                title="Start a new conversation"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                New
              </button>
            )}
          </div>

          {/* Grade level selector */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Level:</span>
            <select
              value={gradeLevel}
              onChange={(e) => onGradeLevelChange && onGradeLevelChange(e.target.value)}
              className="flex-1 min-w-0 bg-white dark:bg-slate-900 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 transition cursor-pointer"
            >
              <option value="Elementary School">Elementary School</option>
              <option value="Middle School">Middle School</option>
              <option value="High School">High School</option>
              <option value="College">College</option>
              <option value="Lifelong Learner">Lifelong Learner</option>
            </select>
          </div>

          {/* Message thread */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center gap-6 py-4">
                <div className="text-center space-y-1.5 px-2">
                  <MessageCircle className="w-7 h-7 text-indigo-300 dark:text-indigo-800 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ask for a concept to visualize</p>
                  <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-relaxed">
                    Describe a science process, a math problem, or an equation to graph. Ask follow-up questions any time after.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9.5px] font-bold tracking-wider text-slate-400 uppercase pl-1">Try one of these</span>
                  {DEMO_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(p.query)}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-850/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-2xl text-left transition flex items-start gap-2.5 group"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[11.5px] font-bold text-slate-700 dark:text-slate-200 block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {p.label}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">"{p.query}"</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-slate-800 dark:bg-slate-700 text-white'
                      : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900'
                  }`}>
                    {msg.role === 'user' ? <UserIcon className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>

                  <div className={`max-w-[80%] space-y-1.5 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                    <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>

                    {msg.kind === 'visualization' && msg.vizResponse && (
                      <button
                        type="button"
                        onClick={() => handleOpenVizMessage(msg)}
                        className={`w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left border transition ${
                          vizData === msg.vizResponse
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Compass className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 block truncate">{msg.vizResponse.title}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider">{msg.vizResponse.type}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-350 dark:text-slate-600 shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
                  <Activity className="w-3 h-3 animate-pulse" />
                </div>
                <div className="rounded-2xl rounded-tl-sm px-3 py-2 bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(composerValue); }}
            className="shrink-0 flex items-center gap-2 p-3 border-t border-slate-100 dark:border-slate-800"
          >
            <input
              type="text"
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              placeholder={vizData ? "Ask a follow-up, or request a new visualization..." : "Describe a concept to visualize..."}
              className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !composerValue.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* ===================== VISUALIZATION PANE ===================== */}
        <div className={`${mobileView === 'visualization' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0 bg-slate-50/60 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 rounded-3xl overflow-hidden`}>
          {vizData ? (
            <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-850 pb-2.5 shrink-0">
                <div className="min-w-0">
                  <span className={`text-[8px] tracking-wider uppercase font-extrabold px-2 py-0.5 rounded-full inline-block ${
                    vizData.type === 'graph'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-450'
                      : vizData.type === 'math'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-450'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-450'
                  }`}>
                    {vizData.type === 'graph' ? 'Coordinate Plotter' : vizData.type === 'math' ? 'Equation Steps' : 'Physics/Science Loop'}
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mt-1 leading-tight truncate">{vizData.title}</h3>
                </div>

                <button
                  onClick={() => { setVizData(null); setMobileView('chat'); }}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-300 transition shrink-0"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                {vizData.type === 'graph' && renderGraphWidget()}
                {vizData.type === 'animation' && renderAnimationWidget()}
                {vizData.type === 'math' && renderMathWidget()}
              </div>

              {/* Chronological steps narrative deck */}
              {currentStepData && (
                <div className="rounded-2xl p-4 bg-white/60 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 shrink-0">
                  <div className="flex justify-between items-center bg-white dark:bg-slate-850 px-3 py-1 rounded-xl shadow-xs border border-slate-200/10 mb-2">
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
              <div className="flex items-center justify-between bg-white dark:bg-slate-850 p-2.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shrink-0">
                <button
                  onClick={restartPlayer}
                  title="Restart"
                  className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-500 transition"
                  disabled={currentStep === 0}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={prevStep}
                    className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                    disabled={currentStep === 0}
                    title="Previous frame"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                    title={isPlaying ? "Pause simulation loop" : "Auto-play simulation steps"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                  </button>

                  <button
                    onClick={nextStep}
                    className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
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
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                <Compass className="w-6 h-6 text-slate-300 dark:text-slate-700" />
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No visualization loaded</p>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-600 max-w-[220px] leading-relaxed">
                Ask a question in the chat and your interactive visualization will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
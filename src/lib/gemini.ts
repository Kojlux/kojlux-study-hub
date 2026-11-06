import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';
import { StudyFileKind } from '../types';
import {
  getKojluxResponseSchema,
  type KojluxGenerationMode,
  validateKojluxPayload,
} from '../../shared/kojluxSchema';

// Tries the primary key first; on failure (rate limit, transient error, etc.)
// automatically retries with the rotation/fallback key. Never put a literal
// key string here — every key is read from Vite env vars (see _env), which
// keeps secrets out of the bundled source that ships to the browser.
export async function generateContentWithFallback(
  apiKeys: (string | undefined)[],
  requestConfig: any,
  orchestratorFallback?: { mode: KojluxGenerationMode; subject: string; topic: string }
): Promise<GenerateContentResponse | { text?: string }> {
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
  if (orchestratorFallback) {
    try {
      const callOrchestrator = httpsCallable<
        { mode: KojluxGenerationMode; subject: string; topic: string; contents: unknown },
        { text: string }
      >(getFunctions(app), 'generateKojluxContent');
      const result = await callOrchestrator({
        ...orchestratorFallback,
        contents: requestConfig.contents,
      });
      return result.data;
    } catch (err) {
      console.error('Kojlux orchestration fallback failed after feature key rotation was exhausted:', err);
      throw err;
    }
  }
  throw lastError ?? new Error('No valid Gemini API key configured.');
}

// Feature pools keep each feature's own keys first, then use the shared
// legacy keys as fallbacks. Environment-variable names stay unchanged.
const SHARED_KEY_ROTATION_FALLBACKS = [
  import.meta.env.VITE_VISUALIZER_KEY,
  import.meta.env.VITE_VISUALIZER_KEY_ROTATION,
];

export const GEMINI_KEYS = {
  quiz: [
    import.meta.env.VITE_QUIZ_GENERATOR_KEY,
    import.meta.env.VITE_QUIZ_GENERATOR_KEY_ROTATION,
    import.meta.env.VITE_QUIZ_GENERATOR_KEY_ROTATION_2,
    ...SHARED_KEY_ROTATION_FALLBACKS,
  ],
  summarizer: [
    import.meta.env.VITE_SUMMARIZER_KEY,
    import.meta.env.VITE_SUMMARIZER_KEY_ROTATION,
    import.meta.env.VITE_SUMMARIZER_KEY_ROTATION_2,
    ...SHARED_KEY_ROTATION_FALLBACKS,
  ],
  // New: powers Recall Coach's self-explanation grading and Concept Linker's
  // dual-coding questions. Add VITE_RECALL_COACH_KEY (and, optionally, a
  // _ROTATION fallback) to your _env file with the key you provided.
  recallCoach: [import.meta.env.VITE_RECALL_COACH_KEY, import.meta.env.VITE_RECALL_COACH_KEY_ROTATION],
};

// Strips markdown code-fences some Gemini responses wrap JSON in, then parses.
// The SDK types response.text as `string | undefined` (it's undefined if the
// call returned no text part, e.g. blocked content), so this accepts that and
// throws a clear error instead of letting `undefined` reach JSON.parse.
export function parseJsonResponse<T>(rawText: string | undefined): T {
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }
  const cleaned = rawText.replace(/```json\s*|\s*```/g, '').trim();
  return JSON.parse(cleaned) as T;
}

export function parseKojluxResponse<T>(rawText: string | undefined, mode: KojluxGenerationMode): T {
  const parsed = parseJsonResponse<unknown>(rawText);
  validateKojluxPayload(parsed, mode);
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Study file ingestion (images, PDFs, video)
// ---------------------------------------------------------------------------
// Quiz Builder and Notes Summarizer accept more than photos now. gemini-3.6-
// flash reads images, PDFs, and video all the same way — as an inlineData
// part on the quiz or summarizer call itself — so there's no
// separate analysis pass for any file kind, and no second AI job involved in
// getting a file's content in front of the model. Recall Coach (below) is
// reserved for its own job: grading self-explanations, the Concept Linker,
// and — see AiCoach.tsx — building flashcards out of a batch of Recents.

// Accept attribute shared by every "add study material" file input.
export const STUDY_FILE_ACCEPT = 'image/*,application/pdf,video/*';

export function classifyStudyFile(file: File): StudyFileKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}
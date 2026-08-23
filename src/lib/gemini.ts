import { GoogleGenAI } from '@google/genai';

// Tries the primary key first; on failure (rate limit, transient error, etc.)
// automatically retries with the rotation/fallback key. Never put a literal
// key string here — every key is read from Vite env vars (see _env), which
// keeps secrets out of the bundled source that ships to the browser.
export async function generateContentWithFallback(
  apiKeys: (string | undefined)[],
  requestConfig: any
) {
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

// One key pool per feature, mirroring the existing VITE_VISUALIZER_KEY /
// VITE_QUIZ_GENERATOR_KEY pattern already used elsewhere in this app.
export const GEMINI_KEYS = {
  quiz: [import.meta.env.VITE_QUIZ_GENERATOR_KEY, import.meta.env.VITE_QUIZ_GENERATOR_KEY_ROTATION],
  summarizer: [import.meta.env.VITE_SUMMARIZER_KEY, import.meta.env.VITE_SUMMARIZER_KEY_ROTATION],
  visualizer: [import.meta.env.VITE_VISUALIZER_KEY, import.meta.env.VITE_VISUALIZER_KEY_ROTATION],
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
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Key rotation: each task has a primary key and a rotation (fallback) key.
// If a primary key is missing, rate-limited, or errors out, we automatically
// retry the same request with the next key in the chain.
const GEMINI_KEY_CHAIN: string[] = [
  process.env.GEMINI_API_KEY,
  process.env.VITE_QUIZ_GENERATOR_KEY,
  process.env.VITE_QUIZ_GENERATOR_KEY_ROTATION,
  process.env.VITE_VISUALIZER_KEY,
  process.env.VITE_VISUALIZER_KEY_ROTATION,
  process.env.VITE_CHAT_KEY,
  process.env.VITE_SUMMARIZER_KEY,
  process.env.VITE_SUMMARIZER_KEY_ROTATION,
].filter((key): key is string => !!key);

if (GEMINI_KEY_CHAIN.length === 0) {
  console.warn("⚠️ Warning: No Gemini API Key detected in environment variables.");
}

// Tries each key in GEMINI_KEY_CHAIN in order until one succeeds. This is what
// gives us the primary -> rotation fallback behavior on rate limits/errors.
async function generateContentWithFallback(requestConfig: any) {
  let lastError: unknown = null;
  for (const apiKey of GEMINI_KEY_CHAIN) {
    try {
      const client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      return await client.models.generateContent(requestConfig);
    } catch (err) {
      console.error('Gemini request failed on this key, trying next key if available:', err);
      lastError = err;
    }
  }
  throw lastError ?? new Error('No valid Gemini API key configured.');
}

async function main() {
  const app = express();
  
  // Set express limits to handle high-resolution photo and educational video uploads
  app.use(express.json({ limit: '80mb' }));
  app.use(express.urlencoded({ limit: '80mb', extended: true }));

  // API Route: Generate Quiz from Image or Text
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { image, text, count, type, difficulty } = req.body;
      if (!image && !text) {
        return res.status(400).json({ error: 'Please provide either a study image upload or write / paste some material.' });
      }

      const qCount = parseInt(count, 10) || 5;
      const qType = type || 'multiple-choice';
      const qDifficulty = difficulty || 'medium';

      const contents: any[] = [];

      let prompt = `You are a friendly but highly systematic tutor. Analyze the provided study material carefully. Construct an interactive student quiz that evaluates their deep understanding.
      
Generate exactly ${qCount} questions. 
The requested quiz format is: '${qType}'.
The requested question difficulty level is: '${qDifficulty}' (Easy means simple conceptual checks; Medium is standard analytical and comprehension; Hard is challenging synthesis, advanced application, math-ready equations, or detailed reasoning).

Rules:
1. If type is 'multiple-choice', every single question MUST be multiple-choice. Make sure they have exactly 4 choices (labeled as options: and formatted as readable, interesting choices). The correctAnswer MUST be just the single letter 'A', 'B', 'C', or 'D'.
2. If type is 'short-answer', every question MUST be a short-answer question prompt. The 'options' list should be empty or omitted. The 'correctAnswer' should be a descriptive master answer or comprehensive solution key.
3. Every question must have a helpful 'explanation' that explains why the answer is correct or what concepts are involved.
4. Try to name the quiz title and subject appropriately. Make sure the title is descriptive and matches the topic (e.g. 'Photosynthesis and Energy' or 'World War I Chronology').`;

      if (image) {
        const base64Parts = image.split(',');
        const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const header = base64Parts.length > 1 ? base64Parts[0] : '';
        let mimeType = 'image/jpeg';
        if (header.includes('image/png')) mimeType = 'image/png';
        else if (header.includes('image/webp')) mimeType = 'image/webp';
        else if (header.includes('image/gif')) mimeType = 'image/gif';

        contents.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }

      if (text && text.trim().length > 0) {
        contents.push({
          text: `Provided Study Notes / Text Material:\n${text}`
        });
      }

      contents.push({
        text: prompt
      });

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Descriptive and concise title of the quiz (e.g., 'Anatomy & Physiology: Cells')" },
          subject: { type: Type.STRING, description: "Broad subject category" },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                question: { type: Type.STRING, description: "Clear, academically clear question prompt" },
                type: { type: Type.STRING, description: "either 'multiple-choice' or 'short-answer'" },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "For multiple choice: list of exactly 4 choices. For short answer: leave empty or omit."
                },
                correctAnswer: { type: Type.STRING, description: "For multiple choice: strictly 'A', 'B', 'C', or 'D'. For short answer: detailed reference answer key." },
                explanation: { type: Type.STRING, description: "Brief learning tip explaining the core concept in academic and supportive detail" }
              },
              required: ["id", "question", "type", "correctAnswer", "explanation"]
            }
          }
        },
        required: ["title", "subject", "questions"]
      };

      const result = await generateContentWithFallback({
        model: 'gemini-3.5-flash-lite',
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
        }
      });

      const jsonText = result.text;
      if (!jsonText) {
        return res.status(500).json({ error: 'Did not receive valid response content from AI.' });
      }

      const parsedData = JSON.parse(jsonText.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error('Error generating quiz:', err);
      res.status(500).json({ error: err.message || 'Failed to generate quiz.' });
    }
  });

  // API Route: Generate Study Summary from Image or Text
  app.post('/api/generate-summary', async (req, res) => {
    try {
      const { image, text, detailLevel } = req.body;
      if (!image && !text) {
        return res.status(400).json({ error: 'Please provide either a study image upload or write / paste some material to summarize.' });
      }

      const lengthType = detailLevel || 'standard'; // 'concise' | 'standard' | 'thorough'
      const contents: any[] = [];

      let prompt = `You are a world-class academic tutor and summary specialist. Your task is to compress and study-map the provided source material.
Analyze the provided material thoroughly and produce an clear, structured study summary tailored for high-quality retention.

The length/style of summary should be: '${lengthType}' (Concise means high-level key insights; Standard means solid coverage of both central concepts and key terms; Thorough means fully detailed text explanations and complete term indexing).

Rules:
1. Formulate a beautiful academic title and broad subject class.
2. Draft a 'mainIdea' summarizing the absolute core thesis.
3. Supply 'keyTakeaways' consisting of highly informative bullet points.
4. Extract key definitions or technical terms under 'glossary'.
5. Supply an elegant 'comprehensiveSummary' paragraph detailing important conceptual explanations or formulas.`;

      if (image) {
        const base64Parts = image.split(',');
        const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const header = base64Parts.length > 1 ? base64Parts[0] : '';
        let mimeType = 'image/jpeg';
        if (header.includes('image/png')) mimeType = 'image/png';
        else if (header.includes('image/webp')) mimeType = 'image/webp';
        else if (header.includes('image/gif')) mimeType = 'image/gif';

        contents.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }

      if (text && text.trim().length > 0) {
        contents.push({
          text: `Provided Study Notes / Text Material:\n${text}`
        });
      }

      contents.push({
        text: prompt
      });

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Descriptive and beautiful title of the summary" },
          subject: { type: Type.STRING, description: "Broad subject category" },
          mainIdea: { type: Type.STRING, description: "High-level direct thesis summary of the material" },
          keyTakeaways: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of 4-6 informative, actionable bullet points of key insights and critical pieces of knowledge"
          },
          glossary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: "Technical term, formula, symbol, date, or event name" },
                definition: { type: Type.STRING, description: "Accurate definitions or historical / conceptual explanation" }
              },
              required: ["term", "definition"]
            },
            description: "List of key terms or formulas and their explanations"
          },
          comprehensiveSummary: { type: Type.STRING, description: "A detailed paragraphs overview or structural study guide summary" }
        },
        required: ["title", "subject", "mainIdea", "keyTakeaways", "glossary", "comprehensiveSummary"]
      };

      const result = await generateContentWithFallback({
        model: 'gemini-3.5-flash-lite',
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
        }
      });

      const jsonText = result.text;
      if (!jsonText) {
        return res.status(500).json({ error: 'Did not receive valid summary output from AI.' });
      }

      const parsedData = JSON.parse(jsonText.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error('Error generating summary:', err);
      res.status(500).json({ error: err.message || 'Failed to generate summary.' });
    }
  });

  // API Route: Evaluate user answers using Gemini
  app.post('/api/evaluate-quiz', async (req, res) => {
    try {
      const { questions, userAnswers } = req.body;
      if (!questions || !userAnswers) {
        return res.status(400).json({ error: 'Missing quiz questions or user input answers.' });
      }


      const evaluationPrompt = `You are a supportive, high-quality, and positive AI tutor.
Review the following quiz questions along with the user's answers.
Grade them accurately.

Quiz Questions & Answer Keys:
${JSON.stringify(questions, null, 2)}

User's Answers (mapped by question ID as key):
${JSON.stringify(userAnswers, null, 2)}

Guidelines:
1. For multiple-choice questions, verify if their answered letter (e.g., 'A', 'B', 'C', 'D') is correct.
2. For short-answer questions, grade them semantically on a scale of 0 to 100 based on accuracy and scientific completeness, and write a compact, supportive sentence of feedback. If score >= 70, set isCorrect = true, otherwise false.
3. Compute and compile general feedback and overall percentage.
4. Also, identify which specific topics/concepts the student struggled with or would benefit from focusing on. Provide 2 to 4 bullet points of exact "focus topics", plus structured warm "tutor advice". If they got 100%, congratulate them with advanced topics to explore next!`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          questionEvaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "Question ID" },
                isCorrect: { type: Type.BOOLEAN, description: "Whether correct (For multiple choice: exact match. For short answer: score of 70% or higher)" },
                score: { type: Type.INTEGER, description: "Scored scale from 0 to 100" },
                feedback: { type: Type.STRING, description: "Encouraging, helpful tip pointing out what was correct and any missing details" },
                modelAnswer: { type: Type.STRING, description: "The correct/suggested answer key" }
              },
              required: ["id", "isCorrect", "score", "feedback", "modelAnswer"]
            }
          },
          summary: {
            type: Type.OBJECT,
            properties: {
              overallPercentage: { type: Type.INTEGER, description: "Overall quiz percentage score (0 to 100)" },
              passedCount: { type: Type.INTEGER, description: "Count of correct/passed questions" },
              totalQuestions: { type: Type.INTEGER, description: "Total questions" },
              generalFeedback: { type: Type.STRING, description: "Overall evaluation summary with high encouragement and precise review tips" },
              focusTopics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of 2-4 critical study concepts or scientific topics they need to focus on based on their results."
              },
              tutorAdvice: {
                type: Type.STRING,
                description: "Warm, supportive paragraph of advice with specific studying directions and custom focus tips."
              }
            },
            required: ["overallPercentage", "passedCount", "totalQuestions", "generalFeedback", "focusTopics", "tutorAdvice"]
          }
        },
        required: ["questionEvaluations", "summary"]
      };

      const result = await generateContentWithFallback({
        model: 'gemini-3.5-flash-lite',
        contents: evaluationPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
        }
      });

      const jsonText = result.text;
      if (!jsonText) {
        return res.status(500).json({ error: 'Failed to grade answers.' });
      }

      const parsedResult = JSON.parse(jsonText.trim());
      res.json(parsedResult);
    } catch (err: any) {
      console.error('Evaluation failed:', err);
      res.status(500).json({ error: err.message || 'Failed to evaluate quiz.' });
    }
  });

  // Simple File-Based Multi-device Sync Database for history records
  const HISTORY_FILE_PATH = path.join(process.cwd(), 'users_history.json');
  let historyStore: Record<string, any[]> = {};

  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const raw = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
      historyStore = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading users_history.json:', err);
  }

  const saveHistoryToDisk = () => {
    try {
      fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(historyStore, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write history store to disk:', err);
    }
  };

  const USERS_FILE_PATH = path.join(process.cwd(), 'users.json');
  let usersStore: Record<string, any> = {};

  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const raw = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
      usersStore = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading users.json:', err);
  }

  const saveUsersToDisk = () => {
    try {
      fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(usersStore, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write users database:', err);
    }
  };

  // API Route: Sign-In with Username or Email and password
  app.post('/api/auth/login', (req, res) => {
    try {
      const { loginIdentifier, password } = req.body;
      if (!loginIdentifier || !loginIdentifier.trim()) {
        return res.status(400).json({ error: 'Please enter your username or email.' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Please enter your password.' });
      }

      const cleanIdentifier = loginIdentifier.trim().toLowerCase();
      const user = usersStore[cleanIdentifier];

      if (!user) {
        return res.status(400).json({ error: 'Account not found. Please register first.' });
      }

      if (user.password !== password) {
        return res.status(400).json({ error: 'Incorrect password.' });
      }

      const cleanEmail = user.email;

      // Auto-initialize history empty list if not exists
      if (!historyStore[cleanEmail]) {
        historyStore[cleanEmail] = [];
        saveHistoryToDisk();
      }

      res.json({
        username: user.username,
        email: cleanEmail,
        gradeLevel: user.gradeLevel || 'High School',
        history: historyStore[cleanEmail]
      });
    } catch (err: any) {
      console.error('Auth login failed:', err);
      res.status(500).json({ error: 'Failed to sign in. Please verify your credentials.' });
    }
  });

  // API Route: Update user profile fields (like grade level)
  app.post('/api/auth/profile/update', (req, res) => {
    try {
      const { email, gradeLevel } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Missing user email.' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const user = usersStore[cleanEmail];
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Update gradeLevel in the database
      user.gradeLevel = gradeLevel || 'High School';
      
      // Update both mapping points if username is distinct
      const cleanUsername = user.username.trim().toLowerCase();
      if (usersStore[cleanUsername]) {
        usersStore[cleanUsername].gradeLevel = user.gradeLevel;
      }
      
      saveUsersToDisk();

      res.json({
        success: true,
        username: user.username,
        email: user.email,
        gradeLevel: user.gradeLevel
      });
    } catch (err: any) {
      console.error('Profile update failed:', err);
      res.status(500).json({ error: 'Failed to update study profile.' });
    }
  });

  // API Route: Register a new account with Username, Email and password
  app.post('/api/auth/register', (req, res) => {
    try {
      const { username, email, password, gradeLevel } = req.body;
      if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Please enter a username.' });
      }
      if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid academic or personal email address.' });
      }
      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().toLowerCase();

      if (usersStore[cleanEmail] || usersStore[cleanUsername]) {
        return res.status(400).json({ error: 'Username or email already registered.' });
      }

      const newUser = {
        username: username.trim(),
        email: cleanEmail,
        password: password,
        gradeLevel: gradeLevel || 'High School'
      };

      // Store in users db (mapping both by clean email and clean username for fast search)
      usersStore[cleanEmail] = newUser;
      usersStore[cleanUsername] = newUser;
      saveUsersToDisk();

      // Auto-initialize history empty list if not exists
      if (!historyStore[cleanEmail]) {
        historyStore[cleanEmail] = [];
        saveHistoryToDisk();
      }

      res.json({
        username: newUser.username,
        email: newUser.email,
        gradeLevel: newUser.gradeLevel,
        history: historyStore[cleanEmail]
      });
    } catch (err: any) {
      console.error('Auth register failed:', err);
      res.status(500).json({ error: 'Failed to register. Please check inputs.' });
    }
  });

  // API Route: Synchronize local history records to the server
  app.post('/api/history/sync', (req, res) => {
    try {
      const { email, history } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Login email required to sync progress.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      historyStore[cleanEmail] = Array.isArray(history) ? history : [];
      saveHistoryToDisk();

      res.json({ success: true, count: historyStore[cleanEmail].length });
    } catch (err: any) {
      console.error('History sync failed:', err);
      res.status(500).json({ error: 'Could not back up history records to your online study profile.' });
    }
  });

  // API Route: Fetch saved history for an email (fallback sync)
  app.get('/api/history/fetch', (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email query parameter is required.' });
      }
      const cleanEmail = email.trim().toLowerCase();
      res.json({
        history: historyStore[cleanEmail] || []
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to sync with device history.' });
    }
  });

  // Serve Single-Page React Application
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Integrate Vite as a dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    // Fallback index.html transformation in dev
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[StudyFlow AI] Fullstack server running at http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
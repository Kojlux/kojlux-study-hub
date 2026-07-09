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

// Lazy initialization of Gemini
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined. Please add it to Settings > Secrets in AI Studio.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
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

      const ai = getGeminiClient();
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

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
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
      const ai = getGeminiClient();
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

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
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

      const ai = getGeminiClient();

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

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
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

  // File-Based Persistence for Posted Educational Videos
  const VIDEOS_FILE_PATH = path.join(process.cwd(), 'posted_videos.json');
  let videosStore: any[] = [];
  const defaultVideos: any[] = [];

  // File-Based Persistence for Video Engagement & Watch Times
  const ENGAGEMENT_FILE_PATH = path.join(process.cwd(), 'video_engagement.json');
  let engagementStore: Record<string, { watchTime: number; views: number; saves: number }> = {};
  try {
    if (fs.existsSync(ENGAGEMENT_FILE_PATH)) {
      const raw = fs.readFileSync(ENGAGEMENT_FILE_PATH, 'utf-8');
      engagementStore = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading video_engagement.json:', err);
  }

  const saveEngagementToDisk = () => {
    try {
      fs.writeFileSync(ENGAGEMENT_FILE_PATH, JSON.stringify(engagementStore, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write engagement store:', err);
    }
  };

  // File-Based Persistence for User Bookmarks/Saves
  const SAVES_FILE_PATH = path.join(process.cwd(), 'user_saves.json');
  let savesStore: Record<string, string[]> = {};
  try {
    if (fs.existsSync(SAVES_FILE_PATH)) {
      const raw = fs.readFileSync(SAVES_FILE_PATH, 'utf-8');
      savesStore = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading user_saves.json:', err);
  }

  const saveSavesToDisk = () => {
    try {
      fs.writeFileSync(SAVES_FILE_PATH, JSON.stringify(savesStore, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write user saves store:', err);
    }
  };

  // In-Memory Session Tracking to prevent duplicates during scrolling
  const sessionsStore: Record<string, string[]> = {};

  const loadVideosFromDisk = (): any[] => {
    try {
      if (fs.existsSync(VIDEOS_FILE_PATH)) {
        const raw = fs.readFileSync(VIDEOS_FILE_PATH, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error loading posted_videos.json:', err);
    }
    return [];
  };

  const saveVideosToDisk = (videos: any[]) => {
    try {
      fs.writeFileSync(VIDEOS_FILE_PATH, JSON.stringify(videos, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write videos database:', err);
    }
  };

  // Initial load
  videosStore = loadVideosFromDisk();

  // API Route: Get algorithmic personalized feed (Instagram Reels Style)
  app.get('/api/videos/feed', (req, res) => {
    try {
      const sessionId = (req.query.sessionId as string) || 'default-session';
      const limit = parseInt(req.query.limit as string) || 12;
      const allVideos = loadVideosFromDisk();

      // Retrieve user's selected grade level
      const queryGradeLevel = req.query.gradeLevel as string;
      let userGradeLevel = queryGradeLevel || 'High School';
      const email = req.query.email as string;
      if (email && !queryGradeLevel) {
        const cleanEmail = email.trim().toLowerCase();
        if (usersStore[cleanEmail] && usersStore[cleanEmail].gradeLevel) {
          userGradeLevel = usersStore[cleanEmail].gradeLevel;
        }
      }

      // Decorate with usernames
      const decorated = allVideos.map(video => {
        let username = video.postedByUsername || '';
        if (!username && video.postedBy) {
          const cleanEmail = video.postedBy.trim().toLowerCase();
          if (usersStore[cleanEmail] && usersStore[cleanEmail].username) {
            username = usersStore[cleanEmail].username;
          }
        }
        return {
          ...video,
          postedByUsername: username
        };
      });

      if (decorated.length === 0) {
        return res.json({ videos: [] });
      }

      // Session Tracking: Prevent duplicates by filtering already seen video IDs
      if (!sessionsStore[sessionId]) {
        sessionsStore[sessionId] = [];
      }
      
      let unseenVideos = decorated.filter(v => !sessionsStore[sessionId].includes(v.id));

      // If all videos in the system have been seen, reset session list to avoid blank states
      if (unseenVideos.length === 0) {
        sessionsStore[sessionId] = [];
        unseenVideos = decorated;
      }

      // Split into Cold-Start (New) vs Established Pools
      const coldStartPool: any[] = [];
      const establishedPool: any[] = [];

      unseenVideos.forEach(v => {
        const engagement = engagementStore[v.id] || { watchTime: 0, views: 0 };
        // Cold-start videos: less than 15s total watch time or 0 views/plays
        if (engagement.watchTime < 15 || engagement.views === 0) {
          coldStartPool.push(v);
        } else {
          establishedPool.push(v);
        }
      });

      // Rank established pool by watch time descending (with a minor random perturbation)
      // Boost the score significantly (+40) if the video target grade level matches the user's active grade level
      const rankedEstablished = establishedPool
        .map(v => {
          const engagement = engagementStore[v.id] || { watchTime: 0 };
          // Random factor ensures feed is organic, dynamic, and keeps scrolling fresh
          const randPerturb = Math.random() * 8; 
          let score = engagement.watchTime + randPerturb;

          // Add a significant bonus if the video matches the user's grade level
          const videoLevel = v.targetGradeLevel || 'High School';
          if (videoLevel.toLowerCase() === userGradeLevel.toLowerCase()) {
            score += 40.0;
          }

          return { video: v, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(item => item.video);

      // Shuffle cold-start pool, prioritizing those that match the user's selected grade level
      const shuffledColdStart = [...coldStartPool].sort((a, b) => {
        const aLevel = a.targetGradeLevel || 'High School';
        const bLevel = b.targetGradeLevel || 'High School';
        const aMatch = aLevel.toLowerCase() === userGradeLevel.toLowerCase();
        const bMatch = bLevel.toLowerCase() === userGradeLevel.toLowerCase();
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return Math.random() - 0.5;
      });

      const finalFeed: any[] = [];
      let estIndex = 0;
      let coldIndex = 0;

      // Interleave cold-start/new videos occasionally (e.g. 20% injection rate or every 5th item)
      for (let i = 0; i < Math.min(unseenVideos.length, limit); i++) {
        // Cold-start injection mechanism: slips brand-new videos in occasionally
        const isColdStartSlot = i % 5 === 4 || i === 1; // Inject early and periodically
        if (isColdStartSlot && coldIndex < shuffledColdStart.length) {
          finalFeed.push(shuffledColdStart[coldIndex]);
          coldIndex++;
        } else if (estIndex < rankedEstablished.length) {
          finalFeed.push(rankedEstablished[estIndex]);
          estIndex++;
        } else if (coldIndex < shuffledColdStart.length) {
          // Fallback if no established left
          finalFeed.push(shuffledColdStart[coldIndex]);
          coldIndex++;
        } else {
          break;
        }
      }

      // Track served video IDs in session history to guarantee zero scrolling duplicates
      sessionsStore[sessionId].push(...finalFeed.map(v => v.id));

      res.json({ videos: finalFeed });
    } catch (err) {
      console.error('Failed to generate algorithmic feed:', err);
      res.status(500).json({ error: 'Failed to generate your personalized learning feed.' });
    }
  });

  // API Route: Record User Engagement (Watch Time / Interaction metrics)
  app.post('/api/videos/engagement', (req, res) => {
    try {
      const { videoId, watchTimeSeconds } = req.body;
      if (!videoId) {
        return res.status(400).json({ error: 'Missing video identifier.' });
      }

      if (!engagementStore[videoId]) {
        engagementStore[videoId] = { watchTime: 0, views: 0, saves: 0 };
      }

      const watchSec = Number(watchTimeSeconds) || 0;
      engagementStore[videoId].watchTime += watchSec;
      
      // If we recorded some watch time, increment views/traction
      if (watchSec > 0) {
        engagementStore[videoId].views += 1;
      }

      saveEngagementToDisk();
      res.json({ success: true, engagement: engagementStore[videoId] });
    } catch (err) {
      console.error('Engagement record failure:', err);
      res.status(500).json({ error: 'Failed to record watch time.' });
    }
  });

  // API Route: Save / bookmark a video for later viewing
  app.post('/api/videos/save', (req, res) => {
    try {
      const { email, videoId, saved } = req.body;
      if (!email || !videoId) {
        return res.status(400).json({ error: 'Missing user email or video identifier.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!savesStore[cleanEmail]) {
        savesStore[cleanEmail] = [];
      }

      if (saved) {
        if (!savesStore[cleanEmail].includes(videoId)) {
          savesStore[cleanEmail].push(videoId);
        }
        // Increment saved metrics
        if (!engagementStore[videoId]) {
          engagementStore[videoId] = { watchTime: 0, views: 0, saves: 0 };
        }
        engagementStore[videoId].saves += 1;
      } else {
        savesStore[cleanEmail] = savesStore[cleanEmail].filter(id => id !== videoId);
      }

      saveSavesToDisk();
      saveEngagementToDisk();

      res.json({ success: true, savedVideoIds: savesStore[cleanEmail] });
    } catch (err) {
      console.error('Failed to bookmark video:', err);
      res.status(500).json({ error: 'Failed to save video.' });
    }
  });

  // API Route: Get saved video IDs for an email
  app.get('/api/videos/saved', (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: 'Email parameter is required.' });
      }
      const cleanEmail = email.trim().toLowerCase();
      res.json({ savedIds: savesStore[cleanEmail] || [] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load saved videos list.' });
    }
  });

  // API Route: Get all posted videos
  app.get('/api/videos', (req, res) => {
    try {
      const currentVideos = loadVideosFromDisk();
      const updated = currentVideos.map(video => {
        let username = video.postedByUsername || '';
        if (!username && video.postedBy) {
          const cleanEmail = video.postedBy.trim().toLowerCase();
          if (usersStore[cleanEmail] && usersStore[cleanEmail].username) {
            username = usersStore[cleanEmail].username;
          }
        }
        return {
          ...video,
          postedByUsername: username
        };
      });
      res.json({ videos: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch educational videos store.' });
    }
  });

  // API Route: Post new educational video
  app.post('/api/videos/post', (req, res) => {
    try {
      const { title, summary, videoUrl, postedBy, postedByUsername, agreed, externalLink, isStaticImage, staticDuration, audioTrack, targetGradeLevel } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Please specify what the video teaches (the Title).' });
      }
      if (!summary || !summary.trim()) {
        return res.status(400).json({ error: 'Please provide a clear summary explaining your educational video.' });
      }
      if (!videoUrl || !videoUrl.trim()) {
        return res.status(400).json({ error: 'Please supply a video link to post.' });
      }
      if (!agreed) {
        return res.status(400).json({ error: 'You must check the agreement box verifying this includes only learning content.' });
      }

      // Convert normal YouTube links to embed format so standard iframe plays it successfully
      let finalEmbedUrl = videoUrl.trim();
      try {
        const ytRegexp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = finalEmbedUrl.match(ytRegexp);
        if (match && match[1]) {
          finalEmbedUrl = `https://www.youtube.com/embed/${match[1]}`;
        } else if (!finalEmbedUrl.includes('/embed/') && finalEmbedUrl.includes('youtube.com')) {
          const parts = finalEmbedUrl.split('v=');
          if (parts[1]) {
            const vid = parts[1].split('&')[0];
            finalEmbedUrl = `https://www.youtube.com/embed/${vid}`;
          }
        }
      } catch (parseErr) {
        console.error('Failed to parse youtube url:', parseErr);
      }

      let finalPostedByUsername = (postedByUsername && postedByUsername.trim()) ? postedByUsername.trim() : '';
      if (!finalPostedByUsername && postedBy) {
        const cleanEmail = postedBy.trim().toLowerCase();
        if (usersStore[cleanEmail] && usersStore[cleanEmail].username) {
          finalPostedByUsername = usersStore[cleanEmail].username;
        }
      }

      const newVideo = {
        id: 'user-' + Date.now().toString(),
        title: title.trim(),
        summary: summary.trim(),
        videoUrl: finalEmbedUrl,
        externalLink: externalLink ? externalLink.trim() : '',
        postedBy: (postedBy && postedBy.trim()) ? postedBy.trim() : 'Anonymous Scholar',
        postedByUsername: finalPostedByUsername,
        createdAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isStaticImage: !!isStaticImage,
        staticDuration: staticDuration || 5,
        audioTrack: audioTrack || null,
        targetGradeLevel: targetGradeLevel || 'High School'
      };

      const currentVideos = loadVideosFromDisk();
      const updatedVideos = [newVideo, ...currentVideos];
      saveVideosToDisk(updatedVideos);

      res.json({ success: true, video: newVideo });
    } catch (err: any) {
      console.error('Failed to save posted video:', err);
      res.status(500).json({ error: 'Internal server error while saving video.' });
    }
  });

  // API Route: Delete video (permissive in sandbox mode so users can always clean up their feed)
  app.post('/api/videos/delete', (req, res) => {
    try {
      const { videoId } = req.body;
      if (!videoId) {
        return res.status(400).json({ error: 'Please specify which video to delete.' });
      }
      
      const currentVideos = loadVideosFromDisk();
      const targetVideo = currentVideos.find(v => v.id === videoId);
      if (!targetVideo) {
        return res.status(404).json({ error: 'Video not found.' });
      }
      
      const updatedVideos = currentVideos.filter(v => v.id !== videoId);
      saveVideosToDisk(updatedVideos);

      res.json({ success: true, message: 'Video permanently deleted successfully.' });
    } catch (err) {
      console.error('Failed to delete video:', err);
      res.status(500).json({ error: 'Internal server error while removing video.' });
    }
  });

  // API Route: Generate Visualization steps (explaining astronomical, biological, physical concepts, math solutions, or graph-work)
  app.post('/api/generate-visualization', async (req, res) => {
    try {
      const { prompt, gradeLevel } = req.body;
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Please enter a study concept, mathematical problem, or coordinate graph function.' });
      }

      const userGradeLevel = gradeLevel || 'High School';
      const ai = getGeminiClient();
      
      const vizPrompt = `You are a world-class academic simulation and educational visual specialist.
Analyze the user's inquiry: "${prompt}" for a student at the **${userGradeLevel}** understanding/grade level.

Your mission is to map out an interactive, beautiful step-by-step visual solution or educational animation that helps the student perfectly visualize the concept.
The explanations, graphics, mathematics, and level of detail MUST be tailored to the understanding level of a **${userGradeLevel}** student (explain simply with basic terms for Elementary School, and use rigorous mathematical/scientific formulas and terminology for College level).

First, classify the type of inquiry into one of three visualizer types:
Type A: 'animation' - For astronomical, physical, chemical, historical, or biological concepts (e.g. Solar Eclipse, Photosynthesis, Water Cycle, cell division). You will provide coordinates for geometric objects that represent physical entities (like the Sun, Earth, Moon, molecules, leaves, nuclei) transitioning smoothly from frame to frame.
Type B: 'math' - For step-by-step arithmetic, algebraic, or calculus solving procedures where equations are broken down chronologically with specific parts highlighted.
Type C: 'graph' - For explicit coordinate graphing (e.g. y = x^2, y = sin(x), plotting straight lines, or intersections).

Requirements:
1. Formulate a beautiful academic title for the visualization.
2. If class is 'animation', design exactly 3 to 5 chronological animation frames inside a logical standard canvas grid of 300x200 space (e.g., center at 150, 100). Position circular or rectangular physical entities and set labels so that they look highly professional, explanatory, and beautifully colored.
   - **CRITICAL LABELING RULE**: Every single physical object, particle, shape, or rectangle in your animation MUST have a clear, descriptive, short 'label' property defined (e.g. "Nucleus", "Proton", "H2O Molecule", "Sun", "Leaf"). Do NOT leave shapes unlabeled or with blank labels. If an object is discussed in the explanation, it MUST be labeled in the visualizer shapes.
3. If class is 'math', create 3 to 6 step-by-step numerical/algebraic cards demonstrating operations, showing active highlights, and highlighting mathematical properties (e.g. commutative property, distributing, etc.) with brief supporting notes.
4. If class is 'graph', compute exactly 10 to 20 coordinate points (with correct x & y coordinate numbers) and supply reasonable grid min/max boundaries so we can plot an elegant SVG curved mapping on screen.

Let your explanations be incredibly friendly, clear, supportive, and motivating. Use language and vocabulary perfectly suited for a **${userGradeLevel}** student.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Descriptive science lesson or math solution title" },
          type: { type: Type.STRING, description: "Must be exactly one of 'animation', 'math', or 'graph'" },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "Title of this visual phase (e.g. 'Aligning of orbits', 'Combine like coefficients')" },
                explanation: { type: Type.STRING, description: "Intuitive, high-quality, friendly tutorial paragraph of explanation" },
                visualElements: {
                  type: Type.OBJECT,
                  properties: {
                    shapes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: { type: Type.STRING, description: "Must be exactly 'circle', 'rect', 'line', 'arrow', or 'text'" },
                          cx: { type: Type.INTEGER, description: "X center of circle on a 300x200 canvas" },
                          cy: { type: Type.INTEGER, description: "Y center of circle on a 300x200 canvas" },
                          r: { type: Type.INTEGER, description: "radius of circle" },
                          x: { type: Type.INTEGER, description: "X position for rectangle or text alignment" },
                          y: { type: Type.INTEGER, description: "Y position for rectangle or text alignment" },
                          width: { type: Type.INTEGER, description: "width of rectangle" },
                          height: { type: Type.INTEGER, description: "height of rectangle" },
                          x1: { type: Type.INTEGER, description: "Line or arrow beginning X point" },
                          y1: { type: Type.INTEGER, description: "Line or arrow beginning Y point" },
                          x2: { type: Type.INTEGER, description: "Line or arrow ending X point" },
                          y2: { type: Type.INTEGER, description: "Line or arrow ending Y point" },
                          color: { type: Type.STRING, description: "Styling color hex (e.g. '#3b82f6', '#f59e0b', '#ef4444', '#10b981')" },
                          label: { type: Type.STRING, description: "Short labels overlay text printed on or next to the element" },
                          text: { type: Type.STRING, description: "Complete message displayed for 'text' shape types" }
                        },
                        required: ["type", "color"]
                      },
                      description: "List of SVG graphic outlines rendering the educational scene"
                    },
                    mathHighlight: {
                      type: Type.OBJECT,
                      properties: {
                        expression: { type: Type.STRING, description: "Algebraic line printed at this stage" },
                        highlight: { type: Type.STRING, description: "Specific characters or section of formula to glow or draw red bounds around" },
                        note: { type: Type.STRING, description: "Specific algebraic rule or rationale outline for this change" }
                      },
                      required: ["expression", "note"]
                    }
                  }
                }
              },
              required: ["label", "explanation"]
            },
            description: "Animated sequence frames or math solving steps"
          },
          graphConfig: {
            type: Type.OBJECT,
            properties: {
              equation: { type: Type.STRING, description: "Formula plotted on graph (e.g. y = x^2)" },
              xMin: { type: Type.INTEGER, description: "Lower boundary of coordinate grid" },
              xMax: { type: Type.INTEGER, description: "Upper boundary of coordinate grid" },
              yMin: { type: Type.INTEGER, description: "Lower vertical coordinate boundary" },
              yMax: { type: Type.INTEGER, description: "Upper vertical coordinate boundary" },
              points: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER, description: "Coordinate horizontal point value" },
                    y: { type: Type.NUMBER, description: "Coordinate vertical point value" },
                    label: { type: Type.STRING, description: "Optional critical tag (e.g. Y-intercept)" }
                  },
                  required: ["x", "y"]
                }
              }
            }
          }
        },
        required: ["title", "type", "steps"]
      };

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { text: vizPrompt }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema,
        }
      });

      const textOutput = result.text;
      if (!textOutput) {
        return res.status(500).json({ error: 'Failed to extract visualization steps from AI.' });
      }

      res.json(JSON.parse(textOutput.trim()));
    } catch (err: any) {
      console.error('Visualization failed:', err);
      res.status(500).json({ error: err.message || 'The tutor simulation visualizer failed.' });
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

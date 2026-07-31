import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, Modality, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for base64 audio streams
app.use(express.json({ limit: '50mb' }));

// Initialize Gemini Client
function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[Warning] GEMINI_API_KEY is missing in environment variables or .env file!');
  } else if (!apiKey.startsWith('AIzaSy')) {
    console.warn('[Warning] GEMINI_API_KEY does not start with "AIzaSy". Google Gemini API keys usually start with "AIzaSy". Please check your .env file!');
  }
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper: Convert raw PCM 24kHz mono buffer to standard WAV buffer
function createWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);

  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Map to track temporary model quota cooldowns (modelName -> expiry timestamp)
const modelCooldowns = new Map<string, number>();

function isModelInCooldown(modelName: string): boolean {
  const expiry = modelCooldowns.get(modelName);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelCooldowns.delete(modelName);
    return false;
  }
  return true;
}

function setModelCooldown(modelName: string, cooldownMs = 45000) {
  modelCooldowns.set(modelName, Date.now() + cooldownMs);
}

// Candidate model variants for text/multimodal translation analysis
const ANALYSIS_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

// Helper: Call Gemini generateContent with automatic fallback to secondary model variants on quota/rate limit error
async function generateContentWithFallback(params: {
  models: string[];
  contents: any;
  config?: any;
}) {
  let lastError: any = null;

  // Prioritize active models not currently in rate-limit cooldown
  const activeModels = params.models.filter((m) => !isModelInCooldown(m));
  const candidateModels = activeModels.length > 0 ? activeModels : params.models;

  for (const modelName of candidateModels) {
    try {
      const currentConfig = { ...params.config };
      // Thinking level parameter is ONLY supported on Gemini 3 series models
      if (!modelName.startsWith('gemini-3')) {
        delete currentConfig.thinkingConfig;
      }

      console.log(`[Gemini API] Executing request using model variant: ${modelName}`);
      const ai = getAiClient();
      const result = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: currentConfig,
      });

      return { result, modelUsed: modelName };
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isTemporaryOutage =
        errMsg.includes('429') ||
        errMsg.includes('503') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('high demand') ||
        errMsg.toLowerCase().includes('unavailable') ||
        errMsg.toLowerCase().includes('overloaded');

      if (isTemporaryOutage) {
        setModelCooldown(modelName, 60000);
        console.warn(`[Gemini API] Temporary limit/high demand on '${modelName}'. Placed in 60s cooldown. Switching to fallback model...`);
      } else {
        console.warn(`[Gemini API] Model variant '${modelName}' failed (${errMsg.slice(0, 100)}). Switching to fallback model...`);
      }
    }
  }
  throw lastError || new Error('All model variants exhausted.');
}

// Helper: Synthesize text into high quality TTS audio using Gemini TTS with fallback variants
async function generateSyntheticSpeech(text: string, voiceName = 'Kore'): Promise<string | null> {
  const validVoices = ['Kore', 'Zephyr', 'Puck', 'Fenrir', 'Charon'];
  const chosenVoice = validVoices.includes(voiceName) ? voiceName : 'Kore';

  // Candidate variants for audio synthesis
  const ttsModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  const ttsPromise = (async () => {
    for (const modelName of ttsModels) {
      if (isModelInCooldown(modelName)) {
        continue;
      }

      try {
        const ai = getAiClient();
        const ttsResponse = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        });

        const rawBase64Pcm = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (rawBase64Pcm) {
          const pcmBuffer = Buffer.from(rawBase64Pcm, 'base64');
          const wavBuffer = createWavBuffer(pcmBuffer, 24000, 1, 16);
          return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
        }
      } catch (err: any) {
        setModelCooldown(modelName, 60000);
        console.warn(`[Gemini TTS] Quota limit or failure on '${modelName}'. Client will use Web Speech API fallback.`);
      }
    }
    return null;
  })();

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

  return Promise.race([ttsPromise, timeoutPromise]);
}

// API Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint: Detect audio language, transcribe audio, translate text, and synthesize TTS
app.post('/api/translate-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', sourceLanguageHint, targetLanguage = 'English', voiceName = 'Kore', speaker = 'A' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Clean base64 header if present
    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0],
        data: cleanBase64,
      },
    };

    const promptPart = {
      text: `Transcribe this spoken audio accurately and translate it into "${targetLanguage}"${sourceLanguageHint ? ` (the spoken language is likely ${sourceLanguageHint})` : ''}.
JSON Schema:
{
  "detectedLanguage": "Spoken language name",
  "detectedLanguageCode": "2-letter ISO code",
  "originalText": "Transcription in spoken language",
  "translatedText": "Translation in ${targetLanguage}",
  "pronunciationGuide": "Phonetic guide or empty string",
  "confidence": 0.98
}`,
    };

    // Fast analysis with low thinking latency + automatic model fallback on quota limit
    const { result: analysisResult } = await generateContentWithFallback({
      models: ANALYSIS_MODELS,
      contents: { parts: [audioPart, promptPart] },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            detectedLanguageCode: { type: Type.STRING },
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
            pronunciationGuide: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['detectedLanguage', 'detectedLanguageCode', 'originalText', 'translatedText'],
        },
      },
    });

    const parsedData = JSON.parse(analysisResult.text || '{}');

    // Synthesize target language translation into speech
    let audioOutputUrl: string | null = null;
    if (parsedData.translatedText) {
      audioOutputUrl = await generateSyntheticSpeech(parsedData.translatedText, voiceName);
    }

    res.json({
      success: true,
      detectedLanguage: parsedData.detectedLanguage || 'Unknown',
      detectedLanguageCode: parsedData.detectedLanguageCode || 'en',
      originalText: parsedData.originalText || '',
      translatedText: parsedData.translatedText || '',
      pronunciationGuide: parsedData.pronunciationGuide || '',
      confidence: parsedData.confidence ?? 0.98,
      audioBase64: audioOutputUrl,
      speaker,
      targetLanguage,
      voiceName,
    });
  } catch (error: any) {
    console.error('Error in /api/translate-audio:', error);
    res.status(500).json({
      error: 'Failed to process audio translation',
      details: error.message || String(error),
    });
  }
});

// Endpoint: Translate typed text + synthesize TTS voice
app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, sourceLanguage = 'Auto-Detect', targetLanguage = 'Spanish', voiceName = 'Kore', speaker = 'A' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    const prompt = `Translate text to ${targetLanguage} (Source constraint: ${sourceLanguage}).
JSON Schema:
{
  "detectedLanguage": "Source language name",
  "detectedLanguageCode": "2-letter code",
  "originalText": "${text.replace(/"/g, '\\"')}",
  "translatedText": "Translation in ${targetLanguage}",
  "pronunciationGuide": "Phonetic guide or empty string",
  "confidence": 0.99
}`;

    const { result: translationResult } = await generateContentWithFallback({
      models: ANALYSIS_MODELS,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            detectedLanguageCode: { type: Type.STRING },
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
            pronunciationGuide: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['detectedLanguage', 'detectedLanguageCode', 'originalText', 'translatedText'],
        },
      },
    });

    const parsedData = JSON.parse(translationResult.text || '{}');

    // Synthesize target language translation into speech
    let audioOutputUrl: string | null = null;
    if (parsedData.translatedText) {
      audioOutputUrl = await generateSyntheticSpeech(parsedData.translatedText, voiceName);
    }

    res.json({
      success: true,
      detectedLanguage: parsedData.detectedLanguage || 'English',
      detectedLanguageCode: parsedData.detectedLanguageCode || 'en',
      originalText: text,
      translatedText: parsedData.translatedText || '',
      pronunciationGuide: parsedData.pronunciationGuide || '',
      confidence: parsedData.confidence ?? 0.99,
      audioBase64: audioOutputUrl,
      speaker,
      targetLanguage,
      voiceName,
    });
  } catch (error: any) {
    console.error('Error in /api/translate-text:', error);
    res.status(500).json({
      error: 'Failed to process text translation',
      details: error.message || String(error),
    });
  }
});

// Endpoint: Standalone TTS re-synthesis
app.post('/api/synthesize-tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    const audioOutputUrl = await generateSyntheticSpeech(text, voiceName);
    res.json({ success: true, audioBase64: audioOutputUrl });
  } catch (error: any) {
    console.error('Error in /api/synthesize-tts:', error);
    res.status(500).json({ error: 'TTS synthesis failed', details: error.message });
  }
});

// Endpoint: Interactive Text Conversation with AI in Target Language
app.post('/api/converse-ai', async (req, res) => {
  try {
    const {
      userMessage,
      primaryLanguage = 'English',
      targetAiLanguage = 'Russian',
      persona = 'Friendly Conversation Partner',
      history = [],
      voiceName = 'Kore',
    } = req.body;

    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'userMessage is required' });
    }

    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .map((h: any) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`)
          .join('\n')
      : '';

    const prompt = `You are a conversational AI partner speaking in ${targetAiLanguage}. The user's primary language is ${primaryLanguage}.
Persona: ${persona}.

Recent Conversation History:
${formattedHistory || '(No previous messages)'}

Current User Message (${primaryLanguage}): "${userMessage.replace(/"/g, '\\"')}"

Instructions:
1. Generate an engaging, natural response in ${targetAiLanguage} ("aiResponseTargetLang") appropriate for your persona.
2. Translate your response into ${primaryLanguage} ("aiResponsePrimaryLang").
3. Translate the user's message into ${targetAiLanguage} ("userMessageTranslation") so the user can learn how to express it in ${targetAiLanguage}.
4. Provide a phonetic / pronunciation guide ("pronunciationGuide") for your response in ${targetAiLanguage}.
5. Optionally provide a short, helpful 1-sentence grammar or vocabulary tip ("culturalNote").

Return JSON schema:
{
  "aiResponseTargetLang": "Response in ${targetAiLanguage}",
  "aiResponsePrimaryLang": "Translation in ${primaryLanguage}",
  "userMessageTranslation": "User message translated to ${targetAiLanguage}",
  "pronunciationGuide": "Phonetic guide",
  "culturalNote": "Optional 1-sentence tip"
}`;

    const { result: aiResult } = await generateContentWithFallback({
      models: ANALYSIS_MODELS,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiResponseTargetLang: { type: Type.STRING },
            aiResponsePrimaryLang: { type: Type.STRING },
            userMessageTranslation: { type: Type.STRING },
            pronunciationGuide: { type: Type.STRING },
            culturalNote: { type: Type.STRING },
          },
          required: ['aiResponseTargetLang', 'aiResponsePrimaryLang', 'userMessageTranslation'],
        },
      },
    });

    const parsedData = JSON.parse(aiResult.text || '{}');

    // Synthesize TTS audio for the AI's target language reply
    let audioOutputUrl: string | null = null;
    if (parsedData.aiResponseTargetLang) {
      audioOutputUrl = await generateSyntheticSpeech(parsedData.aiResponseTargetLang, voiceName);
    }

    res.json({
      success: true,
      userOriginalText: userMessage,
      userTranslationInTargetLang: parsedData.userMessageTranslation || '',
      aiResponseTargetLang: parsedData.aiResponseTargetLang || '',
      aiResponsePrimaryLang: parsedData.aiResponsePrimaryLang || '',
      pronunciationGuide: parsedData.pronunciationGuide || '',
      culturalNote: parsedData.culturalNote || '',
      audioBase64: audioOutputUrl,
    });
  } catch (error: any) {
    console.error('Error in /api/converse-ai:', error);
    res.status(500).json({
      error: 'Failed to process AI conversation turn',
      details: error.message || String(error),
    });
  }
});

// Endpoint: Interactive Voice Audio Conversation with AI in Target Language
app.post('/api/converse-ai-audio', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType = 'audio/webm',
      primaryLanguage = 'English',
      targetAiLanguage = 'Russian',
      persona = 'Friendly Conversation Partner',
      history = [],
      voiceName = 'Kore',
    } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio base64 is required' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0],
        data: cleanBase64,
      },
    };

    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .map((h: any) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`)
          .join('\n')
      : '';

    const promptPart = {
      text: `Listen to this spoken audio from the user. The user's primary language is ${primaryLanguage}.
You are an interactive AI conversation partner speaking in ${targetAiLanguage}. Persona: ${persona}.

Recent Conversation History:
${formattedHistory || '(No previous messages)'}

Task:
1. Transcribe what the user said in the audio ("userOriginalText").
2. Translate the user's spoken words into ${targetAiLanguage} ("userTranslationInTargetLang").
3. Generate a natural, conversational reply in ${targetAiLanguage} ("aiResponseTargetLang").
4. Translate your reply into ${primaryLanguage} ("aiResponsePrimaryLang").
5. Provide a phonetic pronunciation guide for your reply ("pronunciationGuide").
6. Provide a short 1-sentence learning/cultural tip ("culturalNote").

Return JSON schema:
{
  "userOriginalText": "Transcription of user audio",
  "userTranslationInTargetLang": "Translation of user message into ${targetAiLanguage}",
  "aiResponseTargetLang": "AI reply in ${targetAiLanguage}",
  "aiResponsePrimaryLang": "Translation of AI reply in ${primaryLanguage}",
  "pronunciationGuide": "Phonetic guide",
  "culturalNote": "Optional 1-sentence tip"
}`,
    };

    const { result: aiResult } = await generateContentWithFallback({
      models: ANALYSIS_MODELS,
      contents: { parts: [audioPart, promptPart] },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            userOriginalText: { type: Type.STRING },
            userTranslationInTargetLang: { type: Type.STRING },
            aiResponseTargetLang: { type: Type.STRING },
            aiResponsePrimaryLang: { type: Type.STRING },
            pronunciationGuide: { type: Type.STRING },
            culturalNote: { type: Type.STRING },
          },
          required: ['userOriginalText', 'userTranslationInTargetLang', 'aiResponseTargetLang', 'aiResponsePrimaryLang'],
        },
      },
    });

    const parsedData = JSON.parse(aiResult.text || '{}');

    // Synthesize TTS audio for the AI's target language reply
    let audioOutputUrl: string | null = null;
    if (parsedData.aiResponseTargetLang) {
      audioOutputUrl = await generateSyntheticSpeech(parsedData.aiResponseTargetLang, voiceName);
    }

    res.json({
      success: true,
      userOriginalText: parsedData.userOriginalText || 'Spoken audio message',
      userTranslationInTargetLang: parsedData.userTranslationInTargetLang || '',
      aiResponseTargetLang: parsedData.aiResponseTargetLang || '',
      aiResponsePrimaryLang: parsedData.aiResponsePrimaryLang || '',
      pronunciationGuide: parsedData.pronunciationGuide || '',
      culturalNote: parsedData.culturalNote || '',
      audioBase64: audioOutputUrl,
    });
  } catch (error: any) {
    console.error('Error in /api/converse-ai-audio:', error);
    res.status(500).json({
      error: 'Failed to process AI audio conversation turn',
      details: error.message || String(error),
    });
  }
});


// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxTranslate AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

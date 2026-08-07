export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface TranslationItem {
  id: string;
  timestamp: number;
  speaker: 'A' | 'B';
  speakerName: string;
  detectedLanguage: string;
  detectedLanguageCode: string;
  originalText: string;
  translatedText: string;
  pronunciationGuide?: string;
  targetLanguage: string;
  audioBase64?: string;
  voiceName: string;
  status: 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  timestamp: number;
  userOriginalText?: string;
  userTranslationInTargetLang?: string;
  userPronunciationGuide?: string;
  aiResponseTargetLang?: string;
  aiResponsePrimaryLang?: string;
  pronunciationGuide?: string;
  culturalNote?: string;
  audioBase64?: string;
  status?: 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export type SyntheticVoice = 'Kore' | 'Zephyr' | 'Puck' | 'Fenrir' | 'Charon';

export interface VoiceOption {
  id: SyntheticVoice;
  name: string;
  gender: string;
  description: string;
}


import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Send,
  ArrowRightLeft,
  Bot,
  User,
  Volume2,
  Trash2,
  Download,
  Copy,
  Check,
  Sparkles,
  Lightbulb,
  FastForward,
  AlertCircle,
} from 'lucide-react';
import { ChatMessage } from '../types';
import { LanguageSelector } from './LanguageSelector';
import { AudioVisualizer } from './AudioVisualizer';
import { speakTranslation } from '../utils/speech';

interface ConverseWithAIProps {
  autoPlay: boolean;
}

const GREETINGS_BY_LANG: Record<
  string,
  { target: string; primary: string; pronunciation?: string; tip?: string }
> = {
  Spanish: {
    target: '¡Hola! ¿Cómo estás? ¿De qué te gustaría hablar hoy?',
    primary: 'Hello! How are you? What would you like to talk about today?',
    pronunciation: '¡Oh-lah! ¿Koh-moh ess-tahs?',
    tip: 'Tip: "¡Hola!" is a warm, casual greeting used universally across Spanish-speaking countries.',
  },
  French: {
    target: 'Bonjour ! Comment allez-vous aujourd\'hui ?',
    primary: 'Hello! How are you doing today?',
    pronunciation: 'Bohn-zhoor! Koh-mahn tah-lay vooz oh-zhoor-dwee?',
    tip: 'Tip: "Bonjour" is a classic greeting for both formal and friendly conversation.',
  },
  German: {
    target: 'Hallo! Wie geht es dir heute?',
    primary: 'Hello! How are you today?',
    pronunciation: 'Hah-loh! Vee gayt es deer hoy-teh?',
    tip: 'Tip: "Wie geht es dir?" is informal and friendly.',
  },
  Russian: {
    target: 'Привет! Как твои дела сегодня?',
    primary: 'Hello! How are you today?',
    pronunciation: 'Privet! Kak tvoi dela segodnya?',
    tip: 'Tip: "Привет" (Privet) is an informal, friendly greeting.',
  },
  Japanese: {
    target: 'こんにちは！今日はどんなことについて話しましょうか？',
    primary: 'Hello! What shall we talk about today?',
    pronunciation: 'Konnichiwa! Kyou wa donna koto ni tsuite hanashimashou ka?',
    tip: 'Tip: "こんにちは" (Konnichiwa) is a standard friendly daytime greeting.',
  },
  Chinese: {
    target: '你好！今天你想聊些什么？',
    primary: 'Hello! What would you like to chat about today?',
    pronunciation: 'Nǐ hǎo! Jīntiān nǐ xiǎng liáo xiē shénme?',
    tip: 'Tip: "你好" (Nǐ hǎo) literally means "you good".',
  },
  Italian: {
    target: 'Ciao! Come stai oggi?',
    primary: 'Hello! How are you today?',
    pronunciation: 'Chow! Koh-meh stahy oh-jee?',
    tip: 'Tip: "Ciao" is friendly and casual.',
  },
  Portuguese: {
    target: 'Olá! Como você está hoje?',
    primary: 'Hello! How are you today?',
    pronunciation: 'Oh-lah! Koh-moh voh-seh ess-tah oy-zheh?',
    tip: 'Tip: "Olá" is friendly and widely used in Brazil and Portugal.',
  },
  Korean: {
    target: '안녕하세요! 오늘 기분이 어떠신가요?',
    primary: 'Hello! How are you feeling today?',
    pronunciation: 'Annyeonghaseyo! Oneul gibuni eotteosingayo?',
    tip: 'Tip: "안녕하세요" (Annyeonghaseyo) is a polite greeting used every day.',
  },
};

function getWelcomeMessage(aiLangName: string, userLangName: string): ChatMessage {
  const preset = GREETINGS_BY_LANG[aiLangName];
  if (preset) {
    return {
      id: `welcome-${Date.now()}`,
      sender: 'ai',
      timestamp: Date.now(),
      aiResponseTargetLang: preset.target,
      aiResponsePrimaryLang: preset.primary,
      pronunciationGuide: preset.pronunciation,
      culturalNote: preset.tip,
      status: 'done',
    };
  }
  return {
    id: `welcome-${Date.now()}`,
    sender: 'ai',
    timestamp: Date.now(),
    aiResponseTargetLang: `Hello! I am your conversation partner in ${aiLangName}. What shall we talk about?`,
    aiResponsePrimaryLang: `Hello! I am your conversation partner in ${aiLangName}. What shall we talk about?`,
    status: 'done',
  };
}

export const ConverseWithAI: React.FC<ConverseWithAIProps> = ({ autoPlay }) => {
  // Primary User Language & Target AI Language state
  const [userLang, setUserLang] = useState({ name: 'English', code: 'en' });
  const [aiLang, setAiLang] = useState({ name: 'Spanish', code: 'es' });

  const [messages, setMessages] = useState<ChatMessage[]>([
    getWelcomeMessage('Spanish', 'English'),
  ]);

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  // Audio recording & playback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeSpeechController = useRef<{ stop: () => void } | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Automatically update the initial greeting when target AI language or primary user language changes if no user messages exist yet
  useEffect(() => {
    setMessages((prev) => {
      const hasUserMessages = prev.some((m) => m.sender === 'user');
      if (!hasUserMessages) {
        return [getWelcomeMessage(aiLang.name, userLang.name)];
      }
      return prev;
    });
  }, [aiLang.name, userLang.name]);

  // Clear chat history function
  const handleClearChat = () => {
    if (activeSpeechController.current) {
      activeSpeechController.current.stop();
      setPlayingMsgId(null);
    }
    setMessages([getWelcomeMessage(aiLang.name, userLang.name)]);
    setInputText('');
  };

  // Toggle playback speed (1.0x -> 0.75x -> 0.5x -> 1.0x)
  const togglePlaybackSpeed = () => {
    setPlaybackSpeed((prev) => (prev === 1.0 ? 0.75 : prev === 0.75 ? 0.5 : 1.0));
  };

  // Play audio for a specific AI message
  const handlePlayMessageAudio = (
    msgId: string,
    text: string,
    langName: string,
    audioBase64?: string | null
  ) => {
    if (playingMsgId === msgId && activeSpeechController.current) {
      activeSpeechController.current.stop();
      setPlayingMsgId(null);
      return;
    }

    if (activeSpeechController.current) {
      activeSpeechController.current.stop();
    }

    setPlayingMsgId(msgId);
    activeSpeechController.current = speakTranslation(
      text,
      langName,
      audioBase64,
      playbackSpeed,
      () => {
        setPlayingMsgId(null);
      }
    );
  };

  // Export chat transcript function
  const handleExportChat = () => {
    if (messages.length === 0) return;

    let transcriptText = `VoxTranslate AI - "Converse With AI" Chat Log - ${new Date().toLocaleString()}\n`;
    transcriptText += `User Primary Language: ${userLang.name} | Target AI Language: ${aiLang.name}\n\n`;

    messages.forEach((msg) => {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      if (msg.sender === 'user') {
        transcriptText += `[${timeStr}] User (${userLang.name}): ${msg.userOriginalText || ''}\n`;
        if (msg.userTranslationInTargetLang) {
          transcriptText += `Translation (${aiLang.name}): ${msg.userTranslationInTargetLang}\n`;
        }
      } else {
        transcriptText += `[${timeStr}] AI Partner (${aiLang.name}): ${msg.aiResponseTargetLang || ''}\n`;
        if (msg.aiResponsePrimaryLang) {
          transcriptText += `Translation (${userLang.name}): ${msg.aiResponsePrimaryLang}\n`;
        }
        if (msg.pronunciationGuide) {
          transcriptText += `Pronunciation: ${msg.pronunciationGuide}\n`;
        }
        if (msg.culturalNote) {
          transcriptText += `Note: ${msg.culturalNote}\n`;
        }
      }
      transcriptText += `--------------------------------------------------\n`;
    });

    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `converse-ai-chatlog-${Date.now()}.txt`;
    link.click();
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Swap User & AI Languages
  const handleSwapLanguages = () => {
    const temp = { ...userLang };
    setUserLang(aiLang);
    setAiLang(temp);
  };

  // Start Mic Recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Microphone access is required for voice conversation. Please check browser permissions.');
    }
  };

  // Stop Mic Recording & Process Voice Input
  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    setIsRecording(false);
    const mediaRecorder = mediaRecorderRef.current;

    mediaRecorder.onstop = async () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size < 500) {
        return;
      }

      // Read audio blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        await sendVoiceTurn(base64Audio);
      };
    };

    mediaRecorder.stop();
  };

  // Send Voice Turn to Backend
  const sendVoiceTurn = async (audioBase64: string) => {
    setIsProcessing(true);

    const tempMsgId = `msg-${Date.now()}`;
    const userMsgPlaceholder: ChatMessage = {
      id: tempMsgId,
      sender: 'user',
      timestamp: Date.now(),
      userOriginalText: '🎙️ Processing voice input...',
      status: 'processing',
    };

    setMessages((prev) => [...prev, userMsgPlaceholder]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Voice processing timeout'), 45000);

    try {
      // Build conversation history format for prompt context
      const historyContext = messages
        .filter((m) => m.status === 'done')
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          text: m.sender === 'user' ? m.userOriginalText || '' : m.aiResponseTargetLang || '',
        }));

      const res = await fetch('/api/converse-ai-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          audioBase64,
          mimeType: 'audio/webm',
          primaryLanguage: userLang.name,
          targetAiLanguage: aiLang.name,
          persona: 'Casual Friend',
          history: historyContext,
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        const updatedUserMsg: ChatMessage = {
          id: tempMsgId,
          sender: 'user',
          timestamp: Date.now(),
          userOriginalText: data.userOriginalText,
          userTranslationInTargetLang: data.userTranslationInTargetLang,
          userPronunciationGuide: data.userPronunciationGuide,
          status: 'done',
        };

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          timestamp: Date.now(),
          aiResponseTargetLang: data.aiResponseTargetLang,
          aiResponsePrimaryLang: data.aiResponsePrimaryLang,
          pronunciationGuide: data.pronunciationGuide,
          culturalNote: data.culturalNote,
          audioBase64: data.audioBase64,
          status: 'done',
        };

        setMessages((prev) => prev.map((m) => (m.id === tempMsgId ? updatedUserMsg : m)).concat(aiMsg));

        // Auto-play AI response audio if autoPlay enabled
        if (autoPlay && data.aiResponseTargetLang) {
          speakTranslation(data.aiResponseTargetLang, aiLang.name, data.audioBase64);
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsgId
              ? {
                  ...m,
                  status: 'error',
                  errorMessage: data.error || data.details || 'Failed to process voice input',
                }
              : m
          )
        );
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(err);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMsgId
            ? {
                ...m,
                status: 'error',
                errorMessage: isTimeout
                  ? 'Request timed out waiting for AI response. Please try again.'
                  : 'Network connection issue during AI voice conversation.',
              }
            : m
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Send Text Message to Backend
  const handleSendText = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isProcessing) return;

    setInputText('');
    setIsProcessing(true);

    const tempMsgId = `msg-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempMsgId,
      sender: 'user',
      timestamp: Date.now(),
      userOriginalText: textToSend,
      status: 'done',
    };

    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Text processing timeout'), 45000);

    try {
      const historyContext = messages
        .filter((m) => m.status === 'done')
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          text: m.sender === 'user' ? m.userOriginalText || '' : m.aiResponseTargetLang || '',
        }));

      const res = await fetch('/api/converse-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userMessage: textToSend,
          primaryLanguage: userLang.name,
          targetAiLanguage: aiLang.name,
          persona: 'Casual Friend',
          history: historyContext,
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        // Update user message with translation in target language
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsgId
              ? {
                  ...m,
                  userTranslationInTargetLang: data.userTranslationInTargetLang,
                  userPronunciationGuide: data.userPronunciationGuide,
                }
              : m
          )
        );

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          timestamp: Date.now(),
          aiResponseTargetLang: data.aiResponseTargetLang,
          aiResponsePrimaryLang: data.aiResponsePrimaryLang,
          pronunciationGuide: data.pronunciationGuide,
          culturalNote: data.culturalNote,
          audioBase64: data.audioBase64,
          status: 'done',
        };

        setMessages((prev) => [...prev, aiMsg]);

        // Auto-play AI response audio if autoPlay enabled
        if (autoPlay && data.aiResponseTargetLang) {
          speakTranslation(data.aiResponseTargetLang, aiLang.name, data.audioBase64);
        }
      } else {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'ai',
          timestamp: Date.now(),
          status: 'error',
          errorMessage: data.error || data.details || 'Failed to generate AI response',
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(err);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        timestamp: Date.now(),
        status: 'error',
        errorMessage: isTimeout
          ? 'Timeout error: AI failed to reply within 8 seconds. Please try again.'
          : 'Server connection error during AI conversation.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Configuration Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 mb-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* User Language & AI Language Pickers */}
          <div className="flex items-center space-x-2 w-full justify-between sm:justify-start">
            <div className="flex-1 sm:w-56">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Your Language
              </span>
              <LanguageSelector
                id="user-language"
                value={userLang.name}
                onChange={(name, code) => setUserLang({ name, code })}
              />
            </div>

            <button
              onClick={handleSwapLanguages}
              title="Swap Languages"
              className="mt-4 p-2.5 rounded-full border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors shadow-xs flex-shrink-0"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 sm:w-56">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Target AI Language
              </span>
              <LanguageSelector
                id="target-ai-language"
                value={aiLang.name}
                onChange={(name, code) => setAiLang({ name, code })}
              />
            </div>
          </div>

          {/* Action Buttons: Speed, Export & Clear Chat */}
          <div className="flex items-center space-x-2 justify-end w-full sm:w-auto">
            <button
              onClick={togglePlaybackSpeed}
              title="Change voice speed (1x, 0.75x, 0.5x)"
              className="flex items-center space-x-1 px-3 py-2 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 shadow-2xs"
            >
              <FastForward className="w-3.5 h-3.5 text-indigo-600" />
              <span>{playbackSpeed}x Speed</span>
            </button>

            <button
              onClick={handleExportChat}
              disabled={messages.length === 0}
              title="Export conversation transcript"
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 shadow-2xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Export Chat</span>
            </button>

            <button
              onClick={handleClearChat}
              title="Clear Conversation History"
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-slate-200 hover:border-red-200 shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Clear Chat</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chat Messages Feed Area */}
      <div className="flex-1 bg-slate-50/70 border border-slate-200 rounded-2xl p-4 sm:p-6 overflow-y-auto space-y-4 mb-4 shadow-inner">
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex flex-col items-end">
                <div className="flex items-start space-x-2 max-w-[85%] sm:max-w-[75%] flex-row-reverse space-x-reverse">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold shadow-xs flex-shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>

                  <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-xs px-4 py-3 shadow-sm">
                    <p className="text-sm font-medium">{msg.userOriginalText}</p>

                    {msg.userTranslationInTargetLang && (
                      <div className="mt-2 pt-2 border-t border-indigo-400/40 text-xs text-indigo-100 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-200 flex-shrink-0" />
                            <span>
                              <strong className="font-semibold text-white">{aiLang.name}:</strong>{' '}
                              {msg.userTranslationInTargetLang}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handlePlayMessageAudio(
                                  `${msg.id}-user-trans`,
                                  msg.userTranslationInTargetLang!,
                                  aiLang.name
                                )
                              }
                              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                playingMsgId === `${msg.id}-user-trans`
                                  ? 'bg-amber-400 text-slate-900 shadow-xs font-semibold'
                                  : 'bg-indigo-500/80 hover:bg-indigo-400 text-indigo-100 hover:text-white border border-indigo-400/50'
                              }`}
                              title={`Listen to ${aiLang.name} translation`}
                            >
                              <Volume2 className={`w-3 h-3 ${playingMsgId === `${msg.id}-user-trans` ? 'animate-bounce' : ''}`} />
                              <span>{playingMsgId === `${msg.id}-user-trans` ? 'Stop' : 'Listen'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={togglePlaybackSpeed}
                              className="px-2 py-0.5 bg-indigo-500/80 hover:bg-indigo-400 text-indigo-100 rounded-md text-[11px] font-mono border border-indigo-400/50 transition-colors flex items-center space-x-1"
                              title="Voice playback speed (1x, 0.75x, 0.5x)"
                            >
                              <FastForward className="w-3 h-3 text-indigo-200" />
                              <span>{playbackSpeed}x</span>
                            </button>
                          </div>
                        </div>

                        {msg.userPronunciationGuide && (
                          <div className="text-[11px] italic text-indigo-100/95 font-mono bg-indigo-700/60 px-2.5 py-1 rounded-md border border-indigo-400/40 shadow-xs">
                            Pronunciation: {msg.userPronunciationGuide}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.status === 'processing' && (
                      <div className="flex items-center space-x-1.5 mt-1 text-xs text-indigo-200 animate-pulse">
                        <FastForward className="w-3.5 h-3.5" />
                        <span>Processing voice...</span>
                      </div>
                    )}

                    {msg.status === 'error' && (
                      <div className="flex items-center space-x-1.5 mt-2 text-xs text-rose-100 bg-rose-500/30 p-2 rounded-lg border border-rose-400/40">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-200" />
                        <span>{msg.errorMessage || 'Processing timed out or failed.'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          } else {
            // AI Message
            return (
              <div key={msg.id} className="flex items-start space-x-3 max-w-[90%] sm:max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold shadow-md flex-shrink-0 mt-1">
                  <Bot className="w-4.5 h-4.5" />
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs p-4 shadow-xs space-y-2.5 w-full">
                  {/* AI Main Response in Target Language */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-0.5">
                        AI ({aiLang.name})
                      </div>
                      <p className="text-base font-semibold text-slate-900 leading-snug">
                        {msg.aiResponseTargetLang}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0 pt-1">
                      {msg.aiResponseTargetLang && (
                        <button
                          onClick={() =>
                            handlePlayMessageAudio(
                              msg.id,
                              msg.aiResponseTargetLang!,
                              aiLang.name,
                              msg.audioBase64
                            )
                          }
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            playingMsgId === msg.id
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-600 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                          title="Listen to speech"
                        >
                          <Volume2 className={`w-3.5 h-3.5 ${playingMsgId === msg.id ? 'animate-bounce' : ''}`} />
                          <span>{playingMsgId === msg.id ? 'Stop' : 'Listen'}</span>
                        </button>
                      )}

                      {msg.aiResponseTargetLang && (
                        <button
                          onClick={togglePlaybackSpeed}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono border border-slate-200/80 transition-colors flex items-center space-x-1"
                          title="Voice playback speed (1x, 0.75x, 0.5x)"
                        >
                          <FastForward className="w-3 h-3 text-indigo-600" />
                          <span>{playbackSpeed}x</span>
                        </button>
                      )}

                      {msg.aiResponseTargetLang && (
                        <button
                          onClick={() => copyToClipboard(msg.aiResponseTargetLang!, msg.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Copy text"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Phonetic Pronunciation Guide */}
                  {msg.pronunciationGuide && (
                    <div className="text-xs italic text-slate-500 font-mono bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                      Pronunciation: {msg.pronunciationGuide}
                    </div>
                  )}

                  {/* Primary Language Translation */}
                  {msg.aiResponsePrimaryLang && (
                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-start space-x-1.5">
                      <span className="font-semibold text-slate-700">{userLang.name}:</span>
                      <span>{msg.aiResponsePrimaryLang}</span>
                    </div>
                  )}

                  {/* Cultural or Grammar Note */}
                  {msg.culturalNote && (
                    <div className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-2 text-xs text-amber-800 flex items-start space-x-2">
                      <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>{msg.culturalNote}</span>
                    </div>
                  )}

                  {msg.status === 'error' && (
                    <div className="flex items-center space-x-1.5 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{msg.errorMessage || 'Failed to generate AI response.'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          }
        })}

        {/* AI Typing Indicator */}
        {isProcessing && (
          <div className="flex items-center space-x-3 max-w-[80%]">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs text-xs font-medium text-slate-500 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
              <span>AI is thinking and composing voice in {aiLang.name}...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Floating Audio Visualizer Modal Overlay */}
      <AudioVisualizer
        isRecording={isRecording}
        onStop={stopRecording}
        speakerName={`your voice (${userLang.name})`}
        stream={mediaStream}
      />

      {/* User Input & Microphone Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-md flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isRecording) {
              stopRecording();
            } else {
              handleSendText();
            }
          }}
          className="flex items-center space-x-2"
        >
          {/* Mic Recording Toggle */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            title={isRecording ? 'Stop and translate' : 'Hold/Click to speak voice message'}
            className={`p-3 rounded-xl transition-all border flex-shrink-0 disabled:opacity-50 ${
              isRecording
                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 animate-pulse shadow-md shadow-rose-500/20'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isRecording
                ? `Recording... click Stop & Translate in popup or tap Mic`
                : `Say something in ${userLang.name} to AI (${aiLang.name})...`
            }
            disabled={isProcessing || isRecording}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400 disabled:opacity-60"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!inputText.trim() && !isRecording) || isProcessing}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <span>{isRecording ? 'Stop' : 'Send'}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

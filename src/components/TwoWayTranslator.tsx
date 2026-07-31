import React, { useState, useRef } from 'react';
import { Mic, ArrowRightLeft, Send, Trash2, Download, Sparkles, Volume2, AlertCircle } from 'lucide-react';
import { TranslationItem } from '../types';
import { LanguageSelector } from './LanguageSelector';
import { ConversationBubble } from './ConversationBubble';
import { AudioVisualizer } from './AudioVisualizer';
import { speakTranslation } from '../utils/speech';

interface TwoWayTranslatorProps {
  autoPlay: boolean;
}

export const TwoWayTranslator: React.FC<TwoWayTranslatorProps> = ({ autoPlay }) => {
  // Speaker A & B Language state
  const [langA, setLangA] = useState({ name: 'English', code: 'en' });
  const [langB, setLangB] = useState({ name: 'Spanish', code: 'es' });

  // Conversation turns state
  const [items, setItems] = useState<TranslationItem[]>([]);
  const [textInput, setTextInput] = useState('');
  const [activeSpeakerForText, setActiveSpeakerForText] = useState<'A' | 'B'>('A');

  // Recording State
  const [activeRecordingSpeaker, setActiveRecordingSpeaker] = useState<'A' | 'B' | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Swap languages
  const handleSwapLanguages = () => {
    const temp = { ...langA };
    setLangA(langB);
    setLangB(temp);
  };

  // Start Mic Recording for Speaker A or B
  const startRecording = async (speaker: 'A' | 'B') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setActiveRecordingSpeaker(speaker);
    } catch (err: any) {
      console.error('Microphone access denied or error:', err);
      alert('Microphone access is required for real-time speech translation. Please check browser permissions.');
    }
  };

  // Stop Mic Recording & Send Audio to Gemini Server API
  const stopRecording = () => {
    if (!mediaRecorderRef.current || activeRecordingSpeaker === null) return;

    const speaker = activeRecordingSpeaker;
    const currentMediaRecorder = mediaRecorderRef.current;

    currentMediaRecorder.onstop = async () => {
      // Clean up audio tracks
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }
      setActiveRecordingSpeaker(null);

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size < 500) {
        console.warn('Audio clip too short');
        return;
      }

      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;

        // Create pending placeholder item in timeline
        const targetLang = speaker === 'A' ? langB.name : langA.name;
        const sourceLangHint = speaker === 'A' ? langA.name : langB.name;
        const speakerName = speaker === 'A' ? `Speaker A (${langA.name})` : `Speaker B (${langB.name})`;

        const newItemId = `turn-${Date.now()}`;
        const newItem: TranslationItem = {
          id: newItemId,
          timestamp: Date.now(),
          speaker,
          speakerName,
          detectedLanguage: 'Detecting...',
          detectedLanguageCode: '',
          originalText: '',
          translatedText: '',
          targetLanguage: targetLang,
          voiceName: 'Kore',
          status: 'processing',
        };

        setItems((prev) => [...prev, newItem]);
        setIsProcessing(true);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
          const response = await fetch('/api/translate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              audioBase64: base64Audio,
              mimeType: 'audio/webm',
              sourceLanguageHint: sourceLangHint,
              targetLanguage: targetLang,
              speaker,
            }),
          });

          clearTimeout(timeoutId);
          const data = await response.json();

          if (data.success) {
            setItems((prev) =>
              prev.map((it) =>
                it.id === newItemId
                  ? {
                      ...it,
                      detectedLanguage: data.detectedLanguage,
                      detectedLanguageCode: data.detectedLanguageCode,
                      originalText: data.originalText,
                      translatedText: data.translatedText,
                      pronunciationGuide: data.pronunciationGuide,
                      audioBase64: data.audioBase64,
                      status: 'done',
                    }
                  : it
              )
            );

            // Auto-play synthetic voice output if autoPlay enabled
            if (autoPlay) {
              speakTranslation(data.translatedText, targetLang, data.audioBase64);
            }
          } else {
            setItems((prev) =>
              prev.map((it) =>
                it.id === newItemId
                  ? {
                      ...it,
                      status: 'error',
                      errorMessage: data.details || data.error || 'Could not process audio translation',
                    }
                  : it
              )
            );
          }
        } catch (error: any) {
          clearTimeout(timeoutId);
          console.error('API call error:', error);
          const isTimeout = error.name === 'AbortError' || error.message?.includes('aborted');
          setItems((prev) =>
            prev.map((it) =>
              it.id === newItemId
                ? {
                    ...it,
                    status: 'error',
                    errorMessage: isTimeout
                      ? 'Timeout error: Audio processing took longer than 8 seconds. Please try again.'
                      : 'Server connection error during audio translation.',
                  }
                : it
            )
          );
        } finally {
          setIsProcessing(false);
        }
      };
    };

    currentMediaRecorder.stop();
  };

  // Handle Typed Text Translation Submission
  const handleSendText = async () => {
    if (!textInput.trim() || isProcessing) return;

    const speaker = activeSpeakerForText;
    const textToTranslate = textInput.trim();
    setTextInput('');

    const sourceLang = speaker === 'A' ? langA.name : langB.name;
    const targetLang = speaker === 'A' ? langB.name : langA.name;
    const speakerName = speaker === 'A' ? `Speaker A (${langA.name})` : `Speaker B (${langB.name})`;

    const newItemId = `turn-${Date.now()}`;
    const newItem: TranslationItem = {
      id: newItemId,
      timestamp: Date.now(),
      speaker,
      speakerName,
      detectedLanguage: sourceLang,
      detectedLanguageCode: '',
      originalText: textToTranslate,
      translatedText: '',
      targetLanguage: targetLang,
      voiceName: 'Kore',
      status: 'processing',
    };

    setItems((prev) => [...prev, newItem]);
    setIsProcessing(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: textToTranslate,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          speaker,
        }),
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === newItemId
              ? {
                  ...it,
                  detectedLanguage: data.detectedLanguage,
                  detectedLanguageCode: data.detectedLanguageCode,
                  originalText: data.originalText,
                  translatedText: data.translatedText,
                  pronunciationGuide: data.pronunciationGuide,
                  audioBase64: data.audioBase64,
                  status: 'done',
                }
              : it
          )
        );

        if (autoPlay) {
          speakTranslation(data.translatedText, targetLang, data.audioBase64);
        }
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === newItemId
              ? {
                  ...it,
                  status: 'error',
                  errorMessage: data.details || data.error || 'Failed to translate typed text',
                }
              : it
          )
        );
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('Error translating typed text:', e);
      const isTimeout = e.name === 'AbortError' || e.message?.includes('aborted');
      setItems((prev) =>
        prev.map((it) =>
          it.id === newItemId
            ? {
                ...it,
                status: 'error',
                errorMessage: isTimeout
                  ? 'Timeout error: Text processing took longer than 8 seconds. Please try again.'
                  : 'Server connection error during text translation.',
              }
            : it
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = () => {
    setItems([]);
  };

  const handleExportTranscript = () => {
    if (items.length === 0) return;

    let transcriptText = `VoxTranslate AI Conversation Log - ${new Date().toLocaleString()}\n`;
    transcriptText += `Speaker A Language: ${langA.name} | Speaker B Language: ${langB.name}\n\n`;

    items.forEach((item, index) => {
      transcriptText += `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.speakerName}\n`;
      transcriptText += `Original (${item.detectedLanguage}): ${item.originalText}\n`;
      transcriptText += `Translation (${item.targetLanguage}): ${item.translatedText}\n`;
      if (item.pronunciationGuide) transcriptText += `Phonetic: ${item.pronunciationGuide}\n`;
      transcriptText += `--------------------------------------------------\n`;
    });

    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voxtranslate-transcript-${Date.now()}.txt`;
    link.click();
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-5xl mx-auto px-4 py-4 justify-between">
      {/* Top Header: Language Configuration Dock */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
          {/* Speaker A Language */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
              Primary Speaker Language
            </label>
            <LanguageSelector
              id="speaker-a-lang"
              value={langA.name}
              onChange={(name, code) => setLangA({ name, code })}
            />
          </div>

          {/* Swap Languages Button */}
          <div className="md:col-span-1 flex justify-center py-1">
            <button
              id="swap-languages-btn"
              onClick={handleSwapLanguages}
              className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-all hover:scale-105 active:scale-95 shadow-xs"
              title="Swap Speaker Languages"
            >
              <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
            </button>
          </div>

          {/* Speaker B Language */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Target Speaker Language
            </label>
            <LanguageSelector
              id="speaker-b-lang"
              value={langB.name}
              onChange={(name, code) => setLangB({ name, code })}
            />
          </div>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 overflow-y-auto mb-4 relative shadow-sm min-h-[300px]">
        {items.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center py-12 px-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600 shadow-xs">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Start Real-Time Interpretation</h2>
            <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
              Tap either <strong className="text-indigo-600 font-semibold">{langA.name}</strong> or{' '}
              <strong className="text-emerald-600 font-semibold">{langB.name}</strong> below to begin. Gemini AI automatically transcribes, translates, and speaks output back.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full text-left">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">{langA.name}</span>
                <p className="text-slate-600">Speaks into Mic → Auto-translated & spoken in {langB.name}.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block mb-1">{langB.name}</span>
                <p className="text-slate-600">Speaks into Mic → Auto-translated & spoken in {langA.name}.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Conversation Log ({items.length})
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportTranscript}
                  className="flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-full border border-slate-200 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handleClearHistory}
                  className="flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs rounded-full border border-slate-200 hover:border-rose-200 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {items.map((item) => (
              <ConversationBubble key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Visualizer Floating Overlay */}
      <AudioVisualizer
        isRecording={activeRecordingSpeaker !== null}
        onStop={stopRecording}
        speakerName={activeRecordingSpeaker === 'A' ? `Speaker A (${langA.name})` : `Speaker B (${langB.name})`}
        stream={mediaStream}
      />

      {/* Bottom Dual Speaker Mic Dock & Type Input */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Microphone Controls */}
        <div className="grid grid-cols-2 gap-4">
          {/* Speaker A Button */}
          <div className="relative flex flex-col items-center">
            <button
              id="mic-speaker-a-btn"
              onClick={() => {
                if (activeRecordingSpeaker === 'A') {
                  stopRecording();
                } else {
                  startRecording('A');
                }
              }}
              disabled={activeRecordingSpeaker === 'B' || isProcessing}
              className={`w-full py-4 px-4 rounded-xl border transition-all flex flex-col items-center justify-center space-y-2 ${
                activeRecordingSpeaker === 'A'
                  ? 'bg-rose-600 text-white border-rose-500 animate-pulse shadow-md shadow-rose-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-md shadow-indigo-600/20 active:scale-95'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                <Mic className={`w-5 h-5 ${activeRecordingSpeaker === 'A' ? 'animate-bounce' : ''}`} />
              </div>
              <span className="text-xs font-semibold tracking-wider uppercase">
                {activeRecordingSpeaker === 'A' ? 'Listening...' : `Speak ${langA.name}`}
              </span>
            </button>
          </div>

          {/* Speaker B Button */}
          <div className="relative flex flex-col items-center">
            <button
              id="mic-speaker-b-btn"
              onClick={() => {
                if (activeRecordingSpeaker === 'B') {
                  stopRecording();
                } else {
                  startRecording('B');
                }
              }}
              disabled={activeRecordingSpeaker === 'A' || isProcessing}
              className={`w-full py-4 px-4 rounded-xl border transition-all flex flex-col items-center justify-center space-y-2 ${
                activeRecordingSpeaker === 'B'
                  ? 'bg-rose-600 text-white border-rose-500 animate-pulse shadow-md shadow-rose-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 shadow-md shadow-slate-900/10 active:scale-95'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Mic className={`w-5 h-5 text-emerald-400 ${activeRecordingSpeaker === 'B' ? 'animate-bounce' : ''}`} />
              </div>
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400">
                {activeRecordingSpeaker === 'B' ? 'Listening...' : `Speak ${langB.name}`}
              </span>
            </button>
          </div>
        </div>

        {/* Text Input Alternate Drawer */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveSpeakerForText('A')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeSpeakerForText === 'A'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              For A
            </button>
            <button
              onClick={() => setActiveSpeakerForText('B')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activeSpeakerForText === 'B'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              For B
            </button>
          </div>

          <input
            type="text"
            placeholder={`Or type text for Speaker ${activeSpeakerForText}...`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendText();
            }}
            disabled={isProcessing}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
          />

          <button
            onClick={handleSendText}
            disabled={!textInput.trim() || isProcessing}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded-xl shadow-md transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Status bar details from theme */}
        <div className="flex justify-center gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold">Auto-Detect</span> ON
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold">Voice Synthesis</span> HD NATURAL
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold">Latency</span> ~120ms
          </div>
        </div>
      </div>
    </div>
  );
};

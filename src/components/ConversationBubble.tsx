import React, { useState, useRef } from 'react';
import { Volume2, Copy, Check, Sparkles, RefreshCw, Download, FastForward } from 'lucide-react';
import { TranslationItem } from '../types';
import { speakTranslation } from '../utils/speech';

interface ConversationBubbleProps {
  item: TranslationItem;
}

export const ConversationBubble: React.FC<ConversationBubbleProps> = ({
  item,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedTranslation, setCopiedTranslation] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const activeSpeechController = useRef<{ stop: () => void } | null>(null);

  const isSpeakerA = item.speaker === 'A';

  const handlePlayAudio = () => {
    if (isPlaying && activeSpeechController.current) {
      activeSpeechController.current.stop();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    activeSpeechController.current = speakTranslation(
      item.translatedText,
      item.targetLanguage,
      item.audioBase64,
      playbackSpeed,
      () => {
        setIsPlaying(false);
      }
    );
  };

  const togglePlaybackSpeed = () => {
    const nextSpeed = playbackSpeed === 1.0 ? 0.75 : playbackSpeed === 0.75 ? 0.5 : 1.0;
    setPlaybackSpeed(nextSpeed);
  };

  const handleCopy = (text: string, isOriginal: boolean) => {
    navigator.clipboard.writeText(text);
    if (isOriginal) {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    } else {
      setCopiedTranslation(true);
      setTimeout(() => setCopiedTranslation(false), 2000);
    }
  };

  return (
    <div
      id={`conversation-turn-${item.id}`}
      className={`flex flex-col my-3 transition-all ${
        isSpeakerA ? 'items-start pl-0 pr-2 sm:pr-12' : 'items-end pr-0 pl-2 sm:pl-12'
      }`}
    >
      {/* Header Badge */}
      <div className={`flex items-center space-x-2 mb-1.5 px-1 ${isSpeakerA ? 'flex-row' : 'flex-row-reverse space-x-reverse'}`}>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            isSpeakerA ? 'text-indigo-600' : 'text-emerald-600'
          }`}
        >
          {item.speakerName} ({item.detectedLanguage || 'Auto'})
        </span>

        <span className="text-[10px] text-slate-400 font-mono">
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Main Card */}
      <div
        className={`w-full max-w-2xl rounded-2xl p-4 sm:p-5 border shadow-sm relative overflow-hidden transition-all ${
          isSpeakerA
            ? 'rounded-bl-none bg-slate-50 border-slate-200/90 text-slate-900'
            : 'rounded-br-none bg-indigo-50/70 border-indigo-200/90 text-slate-900'
        }`}
      >
        {/* Processing State */}
        {item.status === 'processing' && (
          <div className="flex items-center space-x-3 text-indigo-700 py-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-xs sm:text-sm font-medium animate-pulse">
              Analyzing spoken audio & synthesizing translation voice...
            </span>
          </div>
        )}

        {/* Error State */}
        {item.status === 'error' && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">
            {item.errorMessage || 'Failed to analyze or translate spoken audio.'}
          </div>
        )}

        {/* Done State */}
        {item.status === 'done' && (
          <div className="space-y-2.5 sm:space-y-3">
            {/* Original Spoken Text */}
            <div className="border-b border-slate-200/60 pb-2">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="text-slate-600 text-xs italic font-medium">
                  "{item.originalText}"
                </span>
                <button
                  onClick={() => handleCopy(item.originalText, true)}
                  className="text-slate-400 hover:text-slate-700 transition-colors ml-2"
                  title="Copy original text"
                >
                  {copiedOriginal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Translated Output */}
            <div>
              <div className="flex items-center justify-between text-xs text-indigo-700 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Target: {item.targetLanguage}
                </span>
                <button
                  onClick={() => handleCopy(item.translatedText, false)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy translation text"
                >
                  {copiedTranslation ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <p className="text-base sm:text-xl md:text-2xl font-normal text-slate-900 leading-relaxed">
                {item.translatedText}
              </p>

              {/* Phonetic Pronunciation Guide if available */}
              {item.pronunciationGuide && (
                <div className="mt-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg p-2 text-xs text-amber-900 flex items-center justify-between">
                  <div>
                    <span className="text-amber-800/80 mr-1.5 font-sans font-semibold text-[11px]">Phonetic:</span>
                    <span className="font-mono tracking-wide text-xs">{item.pronunciationGuide}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Audio Controls Bar */}
            <div className="pt-2.5 flex items-center justify-between bg-slate-100/70 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-3 sm:p-3.5 px-4 sm:px-5 border-t border-slate-200/60">
              <div className="flex items-center space-x-2">
                {/* Play/Pause Synthetic Voice */}
                <button
                  onClick={handlePlayAudio}
                  className={`flex items-center space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-full font-medium text-xs transition-all shadow-xs ${
                    isPlaying
                      ? 'bg-amber-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                  }`}
                >
                  <Volume2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isPlaying ? 'animate-bounce' : ''}`} />
                  <span>{isPlaying ? 'Playing...' : 'Play Voice'}</span>
                </button>

                {/* Playback speed toggle */}
                <button
                  onClick={togglePlaybackSpeed}
                  className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-[11px] font-mono border border-slate-200 shadow-xs"
                  title="Change voice playback speed"
                >
                  <FastForward className="w-3 h-3 text-indigo-600" />
                  <span>{playbackSpeed}x</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span className="hidden sm:inline text-[11px] text-slate-500">
                  Audio: {item.audioBase64 ? 'HD Speech' : 'Web Speech'}
                </span>
                {/* Download audio if base64 available */}
                {item.audioBase64 && (
                  <a
                    href={item.audioBase64}
                    download={`translation-${item.id}.wav`}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
                    title="Download audio file"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

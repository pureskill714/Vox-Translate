import { SUPPORTED_LANGUAGES } from '../data/languages';

export function getLanguageCode(langNameOrCode?: string): string {
  if (!langNameOrCode) return 'en-US';
  const nameLower = langNameOrCode.toLowerCase();
  const found = SUPPORTED_LANGUAGES.find(
    (l) =>
      l.name.toLowerCase() === nameLower ||
      l.code.toLowerCase() === nameLower ||
      nameLower.includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(nameLower)
  );
  if (found && found.code !== 'auto') {
    const codeMap: Record<string, string> = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ja: 'ja-JP',
      zh: 'zh-CN',
      ko: 'ko-KR',
      it: 'it-IT',
      pt: 'pt-BR',
      hi: 'hi-IN',
      ar: 'ar-SA',
      ru: 'ru-RU',
      nl: 'nl-NL',
      tr: 'tr-TR',
      vi: 'vi-VN',
      th: 'th-TH',
      pl: 'pl-PL',
      id: 'id-ID',
      sv: 'sv-SE',
      tl: 'fil-PH',
      uk: 'uk-UA',
      el: 'el-GR',
      he: 'he-IL',
      cs: 'cs-CZ',
      ro: 'ro-RO',
      sw: 'sw-KE',
      ms: 'ms-MY',
      hu: 'hu-HU',
      fi: 'fi-FI',
      da: 'da-DK',
      no: 'no-NO',
      bn: 'bn-BD',
    };
    return codeMap[found.code] || found.code;
  }
  return 'en-US';
}

// Global set to prevent Chrome garbage-collecting SpeechSynthesisUtterance during speech
const activeUtterances = new Set<SpeechSynthesisUtterance>();

// Cache voices if already available
let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export function speakWebSpeech(
  text: string,
  targetLanguage?: string,
  rate = 1.0,
  onEnd?: () => void
): { stop: () => void } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return { stop: () => {} };
  }

  // Cancel any currently playing browser speech
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.warn('SpeechSynthesis cancel error:', e);
  }

  const langCode = getLanguageCode(targetLanguage);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  utterance.rate = rate;

  // Find best matching voice from available system voices
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  const langPrefix = langCode.split('-')[0].toLowerCase();
  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(langPrefix));

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  // Add utterance to active set so Chrome GC doesn't abort speech prematurely
  activeUtterances.add(utterance);

  let isDone = false;
  const cleanup = () => {
    if (!isDone) {
      isDone = true;
      activeUtterances.delete(utterance);
      if (onEnd) onEnd();
    }
  };

  utterance.onend = cleanup;
  utterance.onerror = (err) => {
    console.warn('SpeechSynthesis utterance error:', err);
    cleanup();
  };

  // Tiny delay to avoid race condition with speechSynthesis.cancel() in Chrome
  const timerId = setTimeout(() => {
    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis speak call failed:', err);
      cleanup();
    }
  }, 40);

  return {
    stop: () => {
      clearTimeout(timerId);
      activeUtterances.delete(utterance);
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
      cleanup();
    },
  };
}

export function speakTranslation(
  text: string,
  targetLanguage?: string,
  audioBase64?: string | null,
  rate = 1.0,
  onEnd?: () => void
): { stop: () => void } {
  let webSpeechController: { stop: () => void } | null = null;
  let audioObj: HTMLAudioElement | null = null;

  if (audioBase64) {
    try {
      const audio = new Audio(audioBase64);
      audioObj = audio;
      audio.playbackRate = rate;

      let hasEnded = false;
      const handleEnd = () => {
        if (!hasEnded) {
          hasEnded = true;
          if (onEnd) onEnd();
        }
      };

      audio.onended = handleEnd;

      audio.onerror = () => {
        if (!hasEnded) {
          webSpeechController = speakWebSpeech(text, targetLanguage, rate, onEnd);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio play failed, falling back to WebSpeech:', err);
          if (!hasEnded) {
            webSpeechController = speakWebSpeech(text, targetLanguage, rate, onEnd);
          }
        });
      }

      return {
        stop: () => {
          if (audioObj) {
            audioObj.pause();
            audioObj.currentTime = 0;
          }
          if (webSpeechController) {
            webSpeechController.stop();
          }
        },
      };
    } catch (err) {
      console.warn('Audio construction failed, falling back to WebSpeech:', err);
    }
  }

  return speakWebSpeech(text, targetLanguage, rate, onEnd);
}


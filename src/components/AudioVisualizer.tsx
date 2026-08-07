import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Radio } from 'lucide-react';

interface AudioVisualizerProps {
  isRecording: boolean;
  onStop: () => void;
  speakerName?: string;
  stream: MediaStream | null;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isRecording,
  onStop,
  speakerName = 'Speaker',
  stream,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Timer
  useEffect(() => {
    let timer: any = null;
    if (isRecording) {
      setRecordingSeconds(0);
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  // Canvas visualizer
  useEffect(() => {
    if (!isRecording || !stream || !canvasRef.current) return;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const draw = () => {
        if (!ctx || !canvas) return;
        animationFrameRef.current = requestAnimationFrame(draw);

        analyser?.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

          // Gradient color for audio bars
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#3b82f6');
          gradient.addColorStop(0.5, '#6366f1');
          gradient.addColorStop(1, '#a855f7');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight - 2, barWidth - 3, barHeight + 2, [4, 4, 0, 0]);
          ctx.fill();

          x += barWidth + 2;
        }
      };

      draw();
    } catch (e) {
      console.error('Audio visualizer error:', e);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (source) source.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
    };
  }, [isRecording, stream]);

  if (!isRecording) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div id="recording-visualizer-card" className="fixed bottom-20 sm:bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-[94vw] max-w-md bg-white/95 border border-indigo-200 rounded-2xl p-3.5 sm:p-5 shadow-2xl backdrop-blur-xl ring-1 ring-slate-900/5 animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span className="text-xs font-semibold text-indigo-700 tracking-[0.15em] uppercase">
            Listening for {speakerName}...
          </span>
        </div>
        <span className="font-mono text-xs text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
          {formatTime(recordingSeconds)}
        </span>
      </div>

      {/* Canvas frequency bars */}
      <div className="bg-slate-50 rounded-xl p-2 mb-3 border border-slate-200 flex items-center justify-center h-16">
        <canvas ref={canvasRef} width={320} height={48} className="w-full h-12" />
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-slate-500 font-medium">
          Speak clearly...
        </p>

        <button
          id="stop-recording-btn"
          onClick={onStop}
          className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-full shadow-md shadow-rose-500/20 transition-all transform active:scale-95"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Stop & Translate</span>
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { Volume2, MessageSquare, Bot } from 'lucide-react';

interface HeaderProps {
  activeTab: 'two-way' | 'converse';
  setActiveTab: (tab: 'two-way' | 'converse') => void;
  autoPlay: boolean;
  setAutoPlay: (auto: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  autoPlay,
  setAutoPlay,
}) => {
  return (
    <header id="app-header" className="bg-white/90 border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Volume2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 font-sans">
                  VoxTranslate <span className="text-indigo-600">AI</span>
                </h1>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  System Ready
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav id="nav-tabs" className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              id="tab-two-way"
              onClick={() => setActiveTab('two-way')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'two-way'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Two-Way Conversation</span>
            </button>
            <button
              id="tab-converse"
              onClick={() => setActiveTab('converse')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'converse'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Converse With AI</span>
            </button>
          </nav>

          {/* Controls Right */}
          <div className="flex items-center space-x-3">
            {/* Auto Playback Switch */}
            <button
              id="toggle-autoplay-btn"
              onClick={() => setAutoPlay(!autoPlay)}
              title={autoPlay ? 'Auto-play speech enabled' : 'Auto-play speech disabled'}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                autoPlay
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{autoPlay ? 'Auto Voice: ON' : 'Auto Voice: OFF'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-200">
          <button
            id="mobile-tab-two-way"
            onClick={() => setActiveTab('two-way')}
            className={`flex flex-col items-center space-y-1 text-[11px] py-1 px-4 rounded-lg ${
              activeTab === 'two-way' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Two-Way</span>
          </button>
          <button
            id="mobile-tab-converse"
            onClick={() => setActiveTab('converse')}
            className={`flex flex-col items-center space-y-1 text-[11px] py-1 px-4 rounded-lg ${
              activeTab === 'converse' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Converse</span>
          </button>
        </div>
      </div>
    </header>
  );
};


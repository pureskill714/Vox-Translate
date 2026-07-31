import React, { useState } from 'react';
import { Header } from './components/Header';
import { TwoWayTranslator } from './components/TwoWayTranslator';
import { ConverseWithAI } from './components/ConverseWithAI';

export default function App() {
  const [activeTab, setActiveTab] = useState<'two-way' | 'converse'>('two-way');
  const [autoPlay, setAutoPlay] = useState<boolean>(true);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Navbar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        autoPlay={autoPlay}
        setAutoPlay={setAutoPlay}
      />

      {/* Main View Area */}
      <main className="flex-1">
        <div className={activeTab === 'two-way' ? 'block' : 'hidden'}>
          <TwoWayTranslator autoPlay={autoPlay} />
        </div>

        <div className={activeTab === 'converse' ? 'block' : 'hidden'}>
          <ConverseWithAI autoPlay={autoPlay} />
        </div>
      </main>
    </div>
  );
}


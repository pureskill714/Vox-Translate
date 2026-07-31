import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, Sparkles } from 'lucide-react';
import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface LanguageSelectorProps {
  id?: string;
  value: string;
  onChange: (langName: string, langCode: string) => void;
  allowAutoDetect?: boolean;
  label?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  id = 'lang-selector',
  value,
  onChange,
  allowAutoDetect = true,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredLanguages = SUPPORTED_LANGUAGES.filter((lang) => {
    if (!allowAutoDetect && lang.code === 'auto') return false;
    const term = searchTerm.toLowerCase();
    return (
      lang.name.toLowerCase().includes(term) ||
      lang.nativeName.toLowerCase().includes(term) ||
      lang.code.toLowerCase().includes(term)
    );
  });

  const selectedLang = SUPPORTED_LANGUAGES.find((l) => l.name === value || l.code === value) || {
    code: 'en',
    name: value || 'English',
    nativeName: value || 'English',
    flag: '🌐',
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div id={id} ref={dropdownRef} className="relative w-full">
      {label && <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left text-sm text-slate-900 font-medium shadow-xs transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <div className="flex items-center space-x-2.5 truncate">
          <span className="text-lg leading-none">{selectedLang.flag}</span>
          <span className="truncate">{selectedLang.name}</span>
          {selectedLang.code === 'auto' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-sans uppercase tracking-wider font-semibold">
              Auto
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 flex flex-col ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95">
          {/* Search box */}
          <div className="p-2 border-b border-slate-100 bg-white sticky top-0 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search language..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>
          </div>

          {/* Quick select chips */}
          <div className="px-2 py-1.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap gap-1">
            {SUPPORTED_LANGUAGES.filter((l) => ['en', 'es', 'fr', 'de', 'ja', 'zh'].includes(l.code)).map((quick) => (
              <button
                key={quick.code}
                onClick={() => {
                  onChange(quick.name, quick.code);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 transition-colors shadow-2xs"
              >
                {quick.flag} {quick.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Language list */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 p-1">
            {filteredLanguages.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No matching language found</div>
            ) : (
              filteredLanguages.map((lang) => {
                const isSelected = selectedLang.code === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onChange(lang.name, lang.code);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span className="text-base">{lang.flag}</span>
                      <span className="font-medium">{lang.name}</span>
                      <span className="text-[11px] text-slate-400">({lang.nativeName})</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

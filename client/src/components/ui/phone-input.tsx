import React, { useState, useEffect, useRef } from 'react';

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

const COUNTRY_CODES = [
  { code: '+234', country: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+1', country: 'US', name: 'United States', flag: '🇺🇸' },
  { code: '+44', country: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+233', country: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: '+254', country: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: '+27', country: 'ZA', name: 'South Africa', flag: '🇿🇦' },
];

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '803 123 4567',
}) => {
  // Parse initial prefix and number
  const detectPrefixAndNumber = (fullVal: string) => {
    const cleanVal = fullVal || '';
    const matched = COUNTRY_CODES.find((c) => cleanVal.startsWith(c.code));
    if (matched) {
      return {
        prefix: matched.code,
        number: cleanVal.slice(matched.code.length),
      };
    }
    // Default to +234
    return { prefix: '+234', number: cleanVal };
  };

  const initial = detectPrefixAndNumber(value);
  const [selectedPrefix, setSelectedPrefix] = useState(initial.prefix);
  const [localNumber, setLocalNumber] = useState(initial.number);
  const [isOpen, setIsOpen] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync state if value prop changes externally
  useEffect(() => {
    const updated = detectPrefixAndNumber(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPrefix(updated.prefix);
    setLocalNumber(updated.number);
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPrefix = (prefix: string) => {
    setSelectedPrefix(prefix);
    setIsOpen(false);
    
    // Strip leading 0 from local number if prefix is selected
    let cleanedNum = localNumber;
    if (cleanedNum.startsWith('0')) {
      cleanedNum = cleanedNum.slice(1);
    }
    onChange(prefix + cleanedNum);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let num = e.target.value.replace(/\D/g, ''); // only digits
    // Strip leading 0
    if (num.startsWith('0')) {
      num = num.slice(1);
    }
    setLocalNumber(num);
    onChange(selectedPrefix + num);
  };

  const currentCountry = COUNTRY_CODES.find((c) => c.code === selectedPrefix) || COUNTRY_CODES[0];

  return (
    <div className="flex rounded-xl border border-[#c4c5d7]/40 bg-white focus-within:border-[#0037b0] focus-within:ring-1 focus-within:ring-[#0037b0] overflow-visible transition-all duration-200 relative">
      {/* Dropdown Container */}
      <div className="relative shrink-0 flex" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="h-11 px-3 bg-slate-50/60 hover:bg-slate-50 border-r border-[#c4c5d7]/30 flex items-center gap-1.5 select-none cursor-pointer text-xs font-bold text-slate-700 outline-none rounded-l-xl transition-colors shrink-0"
        >
          <span className="text-sm select-none shrink-0">{currentCountry.flag}</span>
          <span className="shrink-0">{currentCountry.code}</span>
          <span className="text-[9px] text-slate-400 ml-0.5 select-none">▼</span>
        </button>

        {isOpen && (
          <div className="absolute top-12 left-0 w-52 rounded-xl border border-[#c4c5d7]/20 bg-white/95 backdrop-blur-md p-1.5 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] z-[999] text-left animate-in fade-in slide-in-from-top-1 duration-150">
            {COUNTRY_CODES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleSelectPrefix(c.code)}
                className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors flex items-center gap-2 border-0 bg-transparent cursor-pointer font-semibold"
              >
                <span className="text-sm shrink-0 select-none">{c.flag}</span>
                <span className="flex-1 font-bold text-slate-700 hover:text-[#0037b0] truncate">{c.name}</span>
                <span className="text-[10px] text-slate-400 font-extrabold shrink-0">{c.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input Field */}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        value={localNumber}
        onChange={handleNumberChange}
        autoComplete="off"
        className="flex-1 h-11 px-4 text-[16px] sm:text-xs outline-none border-0 font-semibold text-slate-700 bg-transparent placeholder-slate-400 rounded-r-xl"
      />
    </div>
  );
};



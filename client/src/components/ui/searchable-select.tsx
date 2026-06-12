import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";

export interface SelectOption {
  id: string;
  label: string;
}

export interface SelectGroup {
  group: string;
  items: SelectOption[];
}

export interface SearchableSelectProps {
  id?: string;
  options: (SelectOption | SelectGroup)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  error,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  // Find currently selected option label
  const getSelectedLabel = () => {
    for (const opt of options) {
      if ("group" in opt) {
        const found = opt.items.find((item) => item.id === value);
        if (found) return found.label;
      } else {
        if (opt.id === value) return opt.label;
      }
    }
    return "";
  };

  const selectedLabel = getSelectedLabel();

  // Helper to check if an option is a group
  const isGroup = (option: SelectOption | SelectGroup): option is SelectGroup => {
    return "group" in option;
  };

  // Filter options based on search query
  const filteredOptions = options
    .map((opt) => {
      if (isGroup(opt)) {
        const filteredItems = opt.items.filter((item) =>
          item.label.toLowerCase().includes(search.toLowerCase())
        );
        return { ...opt, items: filteredItems };
      } else {
        return opt.label.toLowerCase().includes(search.toLowerCase()) ? opt : null;
      }
    })
    .filter((opt): opt is SelectOption | SelectGroup => {
      if (opt === null) return false;
      if (isGroup(opt)) return opt.items.length > 0;
      return true;
    });

  const hasOptions = filteredOptions.length > 0;

  return (
    <div ref={containerRef} className={cn("w-full relative", className)} id={id}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full h-11 px-4 text-xs bg-white rounded-xl border outline-none font-semibold text-slate-700 cursor-pointer flex items-center justify-between transition-all select-none",
          isOpen ? "border-[#0037b0] ring-2 ring-[#0037b0]/10" : "border-[#c4c5d7]/40 hover:border-[#c4c5d7]/80",
          error && "border-rose-500 focus:ring-rose-500/10",
          disabled && "opacity-50 cursor-not-allowed bg-slate-50"
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-slate-400 font-medium")}>
          {selectedLabel || placeholder}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-255",
            isOpen && "rotate-180 text-[#0037b0]"
          )}
          strokeWidth={1.5}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[9995] bg-white border border-[#c4c5d7]/20 rounded-xl shadow-[0_12px_32px_rgba(0,55,176,0.08)] overflow-hidden flex flex-col max-h-64 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Header */}
          <div className="sticky top-0 bg-white p-2 border-b border-[#eef4ff]/50 flex items-center gap-2 shrink-0">
            <HugeiconsIcon
              icon={Search01Icon}
              className="h-3.5 w-3.5 text-slate-400 ml-2"
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 text-[16px] sm:text-xs font-semibold text-slate-700 outline-none border-0 p-0 bg-transparent placeholder-slate-400 focus:ring-0 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1 py-1">
            {hasOptions ? (
              filteredOptions.map((opt, groupIdx) => {
                if (isGroup(opt)) {
                  return (
                    <div key={`group-${groupIdx}`}>
                      <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 select-none">
                        {opt.group}
                      </div>
                      {opt.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onChange(item.id);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "w-full px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors cursor-pointer select-none text-left flex items-center justify-between border-0 bg-transparent",
                            value === item.id && "bg-[#eef4ff]/60 text-[#0037b0]"
                          )}
                        >
                          <span>{item.label}</span>
                          {value === item.id && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0]" />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                } else {
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors cursor-pointer select-none text-left flex items-center justify-between border-0 bg-transparent",
                        value === opt.id && "bg-[#eef4ff]/60 text-[#0037b0]"
                      )}
                    >
                      <span>{opt.label}</span>
                      {value === opt.id && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0037b0]" />
                      )}
                    </button>
                  );
                }
              })
            ) : (
              <div className="px-4 py-6 text-center text-xs font-medium text-slate-400 italic">
                No results found
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600 font-semibold">{error}</p>}
    </div>
  );
}

import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore } from '@/stores/theme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className={cn("flex rounded-xl bg-slate-100 dark:bg-slate-900/50 p-1 border border-slate-200/40 dark:border-slate-800/40 select-none", className)}>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all duration-200 cursor-pointer min-h-[32px] px-2",
          theme === 'light'
            ? "bg-white text-[#0037b0] shadow-[0_2px_8px_rgba(0,55,176,0.06)]"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        )}
      >
        <Sun className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">Light</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all duration-200 cursor-pointer min-h-[32px] px-2",
          theme === 'dark'
            ? "bg-white dark:bg-slate-800 text-[#0037b0] dark:text-[#3b82f6] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        )}
      >
        <Moon className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">Dark</span>
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all duration-200 cursor-pointer min-h-[32px] px-2",
          theme === 'system'
            ? "bg-white dark:bg-slate-800 text-[#0037b0] dark:text-[#3b82f6] shadow-[0_2px_8px_rgba(0,55,176,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        )}
      >
        <Monitor className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">System</span>
      </button>
    </div>
  )
}

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Month-grid calendar.                                                       */
/* Pure presentation + selection — no booking logic, no API calls.            */
/* Visual cues:                                                               */
/*   • day-of-week headers (SUN MON TUE …) at the top                         */
/*   • days outside the visible month       → hidden empty cells              */
/*   • days before `minDate`                → muted, not clickable            */
/*   • days in `availableDates`             → indigo (primary) bg             */
/*   • the currently `selected` day         → solid foreground / inverse text */
/*   • today's date                         → ring around the cell            */
/* -------------------------------------------------------------------------- */

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a, b) { return a.toDateString() === b.toDateString(); }

/**
 * @param {object} props
 * @param {Date}            [props.selected]       - currently selected date
 * @param {(d: Date) => void} props.onSelect       - tap on an enabled day
 * @param {Set<string>}     [props.availableDates] - day keys (toDateString) with available slots
 * @param {Date}            [props.minDate]        - earliest selectable day; defaults to today
 */
export default function MonthCalendar({
  selected,
  onSelect,
  availableDates = new Set(),
  minDate,
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const floor = startOfDay(minDate || today);

  // The grid pivots around a `viewMonth` state — defaults to the selected
  // day's month if provided, otherwise the floor (= current month).
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = selected ? new Date(selected) : floor;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  const monthLabel = viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDayOfWeek = viewMonth.getDay();
  const daysInMonth = new Date(
    viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0
  ).getDate();

  const canGoBack = (() => {
    const prev = new Date(viewMonth);
    prev.setMonth(prev.getMonth() - 1);
    // Allow back nav only while the previous month still contains a selectable day.
    return new Date(prev.getFullYear(), prev.getMonth() + 1, 0) >= floor;
  })();

  const goPrev = () => {
    if (!canGoBack) return;
    setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  };
  const goNext = () => {
    setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  };

  return (
    <div className="w-full">
      {/* Header: prev / month / next */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium text-foreground">{monthLabel}</p>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next month"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid: 7 columns, weekday headers + day cells */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 px-1 sm:px-4">
        {DAY_NAMES.map((name) => (
          <div
            key={`hdr-${name}`}
            className="h-8 flex items-center justify-center text-[10px] sm:text-xs font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}

        {/* Leading blanks before day 1 */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`blank-${i}`} className="h-9 w-9 sm:h-10 sm:w-10" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1);
          const key = d.toDateString();
          const isPast      = d < floor;
          const isToday     = sameDay(d, today);
          const isSelected  = selected && sameDay(d, selected);
          const isAvailable = availableDates.has(key) && !isPast;
          const isDisabled  = isPast || (availableDates.size > 0 && !isAvailable);

          return (
            <button
              key={key}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect?.(d)}
              aria-label={d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-pressed={isSelected || undefined}
              className={cn(
                'h-9 w-9 sm:h-10 sm:w-10 mx-auto flex items-center justify-center rounded-xl text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                isSelected
                  ? 'bg-foreground text-background'
                  : isAvailable
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : isDisabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-foreground hover:bg-muted',
                isToday && !isSelected && 'ring-1 ring-primary/40'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-md bg-primary" /> Has slots
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-md bg-foreground" /> Selected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-md ring-1 ring-primary/40" /> Today
        </span>
      </div>
    </div>
  );
}

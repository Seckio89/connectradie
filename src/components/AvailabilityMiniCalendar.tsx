import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getBlockedDates } from '../lib/availability';

interface AvailabilityMiniCalendarProps {
  tradieId: string;
  preferredDate?: string | null;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

export default function AvailabilityMiniCalendar({
  tradieId,
  preferredDate,
  selectedDate,
  onSelectDate,
}: AvailabilityMiniCalendarProps) {
  const today = useMemo(() => toDateStr(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());

  // Fetch blocked dates for the visible month
  useEffect(() => {
    if (!tradieId) return;
    let cancelled = false;

    const fetchBlocked = async () => {
      const start = new Date(viewMonth.year, viewMonth.month, 1);
      const end = new Date(viewMonth.year, viewMonth.month + 1, 0);
      try {
        const dates = await getBlockedDates(tradieId, toDateStr(start), toDateStr(end));
        if (!cancelled) setBlockedDates(new Set(dates));
      } catch {
        // non-critical
      }
    };

    fetchBlocked();
    return () => { cancelled = true; };
  }, [tradieId, viewMonth.year, viewMonth.month]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewMonth.year, viewMonth.month, 1);
    const lastDay = new Date(viewMonth.year, viewMonth.month + 1, 0);
    // Monday = 0, Sunday = 6 (ISO weekday)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: Array<{ date: string; day: number; isCurrentMonth: boolean }> = [];

    // Padding days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(viewMonth.year, viewMonth.month, -i);
      days.push({ date: toDateStr(d), day: d.getDate(), isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(viewMonth.year, viewMonth.month, d);
      days.push({ date: toDateStr(date), day: d, isCurrentMonth: true });
    }

    // Padding days to fill last row
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(viewMonth.year, viewMonth.month + 1, i);
        days.push({ date: toDateStr(d), day: d.getDate(), isCurrentMonth: false });
      }
    }

    return days;
  }, [viewMonth.year, viewMonth.month]);

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  const goToPrevMonth = () => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToNextMonth = () => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // Don't allow navigating before current month
  const canGoPrev = viewMonth.year > new Date().getFullYear() ||
    (viewMonth.year === new Date().getFullYear() && viewMonth.month > new Date().getMonth());

  const selectedDateFormatted = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-700">{monthLabel}</span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map(({ date, day, isCurrentMonth }) => {
          const isPast = date < today;
          const isBlocked = blockedDates.has(date);
          const isPreferred = preferredDate ? isSameDay(date, preferredDate) : false;
          const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
          const isDisabled = isPast || isBlocked || !isCurrentMonth;

          let cellClass = 'w-8 h-8 rounded-lg text-xs font-medium flex items-center justify-center transition-colors ';

          if (!isCurrentMonth) {
            cellClass += 'text-gray-200 cursor-default';
          } else if (isSelected) {
            cellClass += 'bg-emerald-500 text-white font-bold cursor-pointer';
          } else if (isPreferred && !isPast && !isBlocked) {
            cellClass += 'bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer hover:bg-amber-200';
          } else if (isPast) {
            cellClass += 'text-gray-300 cursor-default';
          } else if (isBlocked) {
            cellClass += 'text-gray-300 line-through cursor-default';
          } else {
            cellClass += 'text-gray-700 cursor-pointer hover:bg-gray-100';
          }

          return (
            <button
              key={date}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onSelectDate(isSelected ? null : date);
              }}
              className={cellClass}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Selection feedback */}
      {selectedDateFormatted && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          Selected: {selectedDateFormatted}
        </p>
      )}
      {!selectedDate && preferredDate && !blockedDates.has(preferredDate) && preferredDate >= today && (
        <p className="mt-2 text-xs text-amber-600">
          Client&apos;s preferred date highlighted in amber
        </p>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import "react-day-picker/dist/style.css";
import { CalendarDays, ChevronDown } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

export type DreamsDateRange = { from: Date; to: Date };

const PRESETS: { label: string; getValue: () => DreamsDateRange }[] = [
  { label: "Today", getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    label: "Yesterday",
    getValue: () => {
      const d = subDays(new Date(), 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    },
  },
  {
    label: "Last 7 Days",
    getValue: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    label: "Last 30 Days",
    getValue: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    label: "This Month",
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: "Last Month",
    getValue: () => {
      const m = subMonths(new Date(), 1);
      return { from: startOfMonth(m), to: endOfMonth(m) };
    },
  },
];

function formatRangeLabel(range: DreamsDateRange) {
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const sameMonth = sameYear && range.from.getMonth() === range.to.getMonth();
  const sameDay =
    range.from.getFullYear() === range.to.getFullYear() &&
    range.from.getMonth() === range.to.getMonth() &&
    range.from.getDate() === range.to.getDate();

  if (sameDay) {
    return format(range.from, "d MMM yyyy");
  }
  if (sameMonth) {
    return `${format(range.from, "d")} - ${format(range.to, "d MMM yyyy")}`;
  }
  if (sameYear) {
    return `${format(range.from, "d MMM")} - ${format(range.to, "d MMM yyyy")}`;
  }
  return `${format(range.from, "d MMM yyyy")} - ${format(range.to, "d MMM yyyy")}`;
}

export function DreamsDateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DreamsDateRange;
  onChange: (range: DreamsDateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  React.useEffect(() => {
    setDraft({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const next = preset.getValue();
    onChange(next);
    setDraft({ from: next.from, to: next.to });
    setShowCalendar(false);
    setOpen(false);
  };

  const applyCustom = () => {
    if (draft?.from && draft?.to) {
      onChange({ from: startOfDay(draft.from), to: endOfDay(draft.to) });
      setShowCalendar(false);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`dp-date-range-trigger ${className ?? ""}`}
          aria-label="Select date range"
        >
          <CalendarDays size={16} className="dp-date-range-icon" />
          <span className="dp-date-range-label">{formatRangeLabel(value)}</span>
          <ChevronDown size={14} className="dp-date-range-chevron" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dp-date-range-menu w-[min(100vw-2rem,320px)] p-0">
        {!showCalendar ? (
          <div className="py-1">
            {PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.label}
                className="cursor-pointer rounded-none px-4 py-2.5 text-sm"
                onSelect={(e) => {
                  e.preventDefault();
                  applyPreset(preset);
                }}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer rounded-none px-4 py-2.5 text-sm font-medium text-primary"
              onSelect={(e) => {
                e.preventDefault();
                setShowCalendar(true);
              }}
            >
              Custom Range
            </DropdownMenuItem>
          </div>
        ) : (
          <div className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Custom range</p>
            <div className="dp-day-picker-wrap">
              <DayPicker
                mode="range"
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={1}
                defaultMonth={draft?.from ?? new Date()}
                disabled={{ after: new Date() }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1"
                onClick={() => setShowCalendar(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 disabled:opacity-50"
                disabled={!draft?.from || !draft?.to}
                onClick={applyCustom}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function defaultDreamsDateRange(): DreamsDateRange {
  return { from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) };
}

export function isDateInRange(iso: string, range: DreamsDateRange) {
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

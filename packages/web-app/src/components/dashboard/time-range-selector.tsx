"use client";

import { cn } from "@/lib/utils";

const TIME_RANGES = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
] as const;

interface TimeRangeSelectorProps {
  value: number;
  onChange: (minutes: number) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg border bg-card p-1">
      {TIME_RANGES.map((range) => (
        <button
          key={range.minutes}
          onClick={() => onChange(range.minutes)}
          className={cn(
            "px-3 py-1 rounded-md text-sm font-medium transition-colors",
            value === range.minutes
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

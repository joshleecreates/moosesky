"use client";

import { cn } from "@/lib/utils";

interface WordLengthFilterProps {
  minLength: number | null;
  onMinLengthChange: (value: number | null) => void;
}

export function WordLengthFilter({
  minLength,
  onMinLengthChange,
}: WordLengthFilterProps) {
  return (
    <div className="flex gap-1 rounded-lg border bg-card p-1 items-center">
      <label className="text-xs text-muted-foreground px-2 whitespace-nowrap">
        Min length:
      </label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Any"
        value={minLength ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "") {
            onMinLengthChange(null);
          } else {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              onMinLengthChange(num);
            }
          }
        }}
        className={cn(
          "px-3 py-1 rounded-md text-sm font-medium transition-colors w-20 text-center",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          minLength !== null
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
      />
      {minLength !== null && (
        <button
          onClick={() => {
            onMinLengthChange(null);
          }}
          className={cn(
            "px-3 py-1 rounded-md text-sm font-medium transition-colors ml-auto",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          Clear
        </button>
      )}
    </div>
  );
}

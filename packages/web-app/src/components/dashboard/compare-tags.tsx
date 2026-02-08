"use client";

import { X } from "lucide-react";

interface CompareTagsProps {
  words: string[];
  onRemove: (word: string) => void;
}

export function CompareTags({ words, onRemove }: CompareTagsProps) {
  if (words.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {words.map((word) => (
        <span
          key={word}
          className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm"
        >
          {word}
          <button
            onClick={() => onRemove(word)}
            className="rounded-full p-0.5 hover:bg-accent transition-colors"
            aria-label={`Remove ${word}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

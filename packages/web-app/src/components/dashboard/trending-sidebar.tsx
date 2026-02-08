"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TrendingWord {
  word: string;
  total: string;
}

interface TrendingSidebarProps {
  onWordClick: (word: string) => void;
  activeWord?: string;
  minutes?: number;
  minLength?: number | null;
}

export function TrendingSidebar({
  onWordClick,
  activeWord,
  minutes = 5,
  minLength = null,
}: TrendingSidebarProps) {
  const [words, setWords] = useState<TrendingWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrending() {
      try {
        const params = new URLSearchParams({
          minutes: minutes.toString(),
          limit: "15",
        });
        if (minLength !== null) {
          params.append("minLength", minLength.toString());
        }
        const res = await fetch(`/api/trends/top?${params.toString()}`);
        const json = await res.json();
        if (json.success && json.data) {
          setWords(json.data);
        }
      } catch {
        // Fail silently
      } finally {
        setLoading(false);
      }
    }
    fetchTrending();
    const interval = setInterval(fetchTrending, 30000);
    return () => clearInterval(interval);
  }, [minutes, minLength]);

  return (
    <div className="rounded-lg border bg-card p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        Trending (last {minutes}m)
      </h3>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-6 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : words.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No trending data yet. Start the firehose workflow to ingest data.
        </p>
      ) : (
        <div className="space-y-1 flex-1 overflow-y-auto">
          {words.map((item, index) => (
            <button
              key={item.word}
              onClick={() => onWordClick(item.word)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors cursor-pointer",
                "hover:bg-accent",
                activeWord === item.word && "bg-accent font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right">
                  {index + 1}.
                </span>
                <span>{item.word}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {Number(item.total).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

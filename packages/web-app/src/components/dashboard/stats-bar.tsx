"use client";

import { useEffect, useState } from "react";

interface Stats {
  uniqueWords: string;
  totalOccurrences: string;
  earliestData: string;
  latestData: string;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/trends/stats");
        const json = await res.json();
        if (json.success) {
          setStats(json);
        }
      } catch {
        // Stats are optional, fail silently
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-2" />
            <div className="h-6 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "Unique Words",
      value: Number(stats.uniqueWords).toLocaleString(),
    },
    {
      label: "Total Occurrences",
      value: Number(stats.totalOccurrences).toLocaleString(),
    },
    {
      label: "Data Range",
      value: stats.earliestData
        ? `${new Date(stats.earliestData).toLocaleDateString()} - ${new Date(stats.latestData).toLocaleDateString()}`
        : "No data",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="text-xl font-semibold mt-1">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

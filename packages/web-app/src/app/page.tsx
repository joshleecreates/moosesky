"use client";

import { useState, useCallback, useEffect } from "react";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { TrendingSidebar } from "@/components/dashboard/trending-sidebar";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { SearchForm } from "@/components/dashboard/search-form";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { WordLengthFilter } from "@/components/dashboard/word-length-filter";
import { CompareTags } from "@/components/dashboard/compare-tags";

interface ChartDataPoint {
  time: string;
  [word: string]: string | number;
}

export default function Home() {
  const [words, setWords] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState(60); // minutes
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [minLength, setMinLength] = useState<number | null>(3);

  const fetchChartData = useCallback(async (activeWords: string[], minutes: number) => {
    if (activeWords.length === 0) {
      setChartData([]);
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - minutes * 60 * 1000);

      if (activeWords.length === 1) {
        const res = await fetch(
          `/api/trends/search?word=${encodeURIComponent(activeWords[0])}&from=${from.toISOString()}&to=${now.toISOString()}`,
        );
        const json = await res.json();
        if (json.success && json.data) {
          setChartData(
            json.data.map((d: { interval: string; count: string }) => ({
              time: d.interval,
              [activeWords[0]]: Number(d.count),
            })),
          );
        }
      } else {
        const res = await fetch(
          `/api/trends/compare?words=${activeWords.map(encodeURIComponent).join(",")}&from=${from.toISOString()}&to=${now.toISOString()}`,
        );
        const json = await res.json();
        if (json.success && json.data) {
          // Merge all word data into a single timeline
          const timeMap = new Map<string, ChartDataPoint>();
          for (const word of activeWords) {
            const wordData = json.data[word] || [];
            for (const d of wordData) {
              const existing: ChartDataPoint = timeMap.get(d.interval) || { time: d.interval };
              existing[word] = Number(d.count);
              timeMap.set(d.interval, existing);
            }
          }
          const merged = Array.from(timeMap.values()).sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
          );
          setChartData(merged);
        }
      }
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when words or time range change
  useEffect(() => {
    fetchChartData(words, timeRange);
  }, [words, timeRange, fetchChartData]);

  function handleSearch(word: string) {
    setWords([word]);
  }

  function handleCompare(word: string) {
    if (!words.includes(word)) {
      setWords((prev) => [...prev, word]);
    }
  }

  function handleRemoveWord(word: string) {
    setWords((prev) => prev.filter((w) => w !== word));
  }

  function handleTrendingClick(word: string) {
    if (words.length === 0) {
      setWords([word]);
    } else {
      // If only one word, replace it; if comparing, add it
      if (words.length === 1) {
        setWords([word]);
      } else {
        handleCompare(word);
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen">
      <StatsBar />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 flex-1">
        <div className="flex flex-col gap-4">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <WordLengthFilter
            minLength={minLength}
            onMinLengthChange={setMinLength}
          />
          <TrendingSidebar
            onWordClick={handleTrendingClick}
            activeWord={words.length === 1 ? words[0] : undefined}
            minutes={timeRange}
            minLength={minLength}
          />
        </div>
        <div className="flex flex-col gap-4">
          <SearchForm
            onSearch={handleSearch}
            onCompare={handleCompare}
            currentWords={words}
          />
          <CompareTags words={words} onRemove={handleRemoveWord} />
          <TrendChart data={chartData} words={words} loading={loading} />
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Chart color palette matching the design system's chart variables
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface ChartDataPoint {
  time: string;
  [word: string]: string | number;
}

interface TrendChartProps {
  data: ChartDataPoint[];
  words: string[];
  loading?: boolean;
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TrendChart({ data, words, loading }: TrendChartProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4 h-80 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading chart data...
        </p>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 h-80 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Search for a word or click a trending word to see its trend over time.
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 h-80 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No data found for the selected word(s) in this time range.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            stroke="var(--muted-foreground)"
            fontSize={12}
          />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--card-foreground)",
            }}
            labelFormatter={formatTime}
          />
          {words.length > 1 && <Legend />}
          {words.map((word, index) => (
            <Line
              key={word}
              type="monotone"
              dataKey={word}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

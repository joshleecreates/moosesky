import express from "express";
import {
  WebApp,
  getMooseUtils,
  MooseCache,
} from "@514labs/moose-lib";
import { WordTrendsMV } from "../views/wordTrends";

const app = express();

// Format date for ClickHouse (YYYY-MM-DD HH:MM:SS format)
function formatDateForCH(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[Trends API] ${req.method} ${req.url}`);
  next();
});

// CORS middleware for dashboard
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/**
 * GET /health - Health check
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bluesky-trends-api",
  });
});

/**
 * GET /search - Search for word trends over time
 * Query params:
 *   - word: The word to search for (required)
 *   - from: Start timestamp (optional, defaults to 1 hour ago)
 *   - to: End timestamp (optional, defaults to now)
 */
app.get("/search", async (req, res) => {
  const { client, sql } = await getMooseUtils();
  const word = (req.query.word as string)?.toLowerCase();

  if (!word) {
    return res.status(400).json({ error: "word parameter is required" });
  }

  // Default time range: last hour
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 60 * 60 * 1000);
  const from = req.query.from
    ? new Date(req.query.from as string)
    : defaultFrom;
  const to = req.query.to ? new Date(req.query.to as string) : now;

  try {
    // Check cache first
    const cache = await MooseCache.get();
    const cacheKey = `trends:search:${word}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await cache.get<any[]>(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, data: cached });
    }

    const query = sql`
      SELECT
        ${WordTrendsMV.targetTable.columns.interval} as interval,
        ${WordTrendsMV.targetTable.columns.totalCount} as count
      FROM ${WordTrendsMV.targetTable}
      WHERE ${WordTrendsMV.targetTable.columns.word} = ${word}
        AND ${WordTrendsMV.targetTable.columns.interval} >= ${formatDateForCH(from)}
        AND ${WordTrendsMV.targetTable.columns.interval} <= ${formatDateForCH(to)}
      ORDER BY ${WordTrendsMV.targetTable.columns.interval} ASC
    `;

    const result = await client.query.execute(query);
    const data = await result.json();

    // Cache for 30 seconds
    await cache.set(cacheKey, data, 30);

    res.json({ success: true, word, from, to, data });
  } catch (error) {
    console.error("[Trends API] Search error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /top - Get top trending words
 * Query params:
 *   - minutes: Time window in minutes (optional, defaults to 5)
 *   - limit: Number of words to return (optional, defaults to 20)
 */
app.get("/top", async (req, res) => {
  const { client, sql } = await getMooseUtils();
  const minutes = parseInt(req.query.minutes as string) || 5;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    // Check cache first
    const cache = await MooseCache.get();
    const cacheKey = `trends:top:${minutes}:${limit}`;
    const cached = await cache.get<any[]>(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, data: cached });
    }

    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    const query = sql`
      SELECT
        ${WordTrendsMV.targetTable.columns.word} as word,
        sum(${WordTrendsMV.targetTable.columns.totalCount}) as total
      FROM ${WordTrendsMV.targetTable}
      WHERE ${WordTrendsMV.targetTable.columns.interval} >= ${formatDateForCH(cutoff)}
      GROUP BY ${WordTrendsMV.targetTable.columns.word}
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const result = await client.query.execute(query);
    const data = await result.json();

    // Cache for 15 seconds for top trending
    await cache.set(cacheKey, data, 15);

    res.json({ success: true, minutes, limit, data });
  } catch (error) {
    console.error("[Trends API] Top error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /compare - Compare multiple words over time
 * Query params:
 *   - words: Comma-separated list of words (required)
 *   - from: Start timestamp (optional, defaults to 1 hour ago)
 *   - to: End timestamp (optional, defaults to now)
 */
app.get("/compare", async (req, res) => {
  const { client, sql } = await getMooseUtils();
  const wordsParam = req.query.words as string;

  if (!wordsParam) {
    return res.status(400).json({ error: "words parameter is required" });
  }

  const words = wordsParam
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return res.status(400).json({ error: "At least one word is required" });
  }

  if (words.length > 10) {
    return res.status(400).json({ error: "Maximum 10 words allowed" });
  }

  // Default time range: last hour
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 60 * 60 * 1000);
  const from = req.query.from
    ? new Date(req.query.from as string)
    : defaultFrom;
  const to = req.query.to ? new Date(req.query.to as string) : now;

  try {
    // Check cache first
    const cache = await MooseCache.get();
    const cacheKey = `trends:compare:${words.join(",")}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, ...cached });
    }

    // Query each word separately for clarity
    const results: Record<string, any[]> = {};

    for (const word of words) {
      const query = sql`
        SELECT
          ${WordTrendsMV.targetTable.columns.interval} as interval,
          ${WordTrendsMV.targetTable.columns.totalCount} as count
        FROM ${WordTrendsMV.targetTable}
        WHERE ${WordTrendsMV.targetTable.columns.word} = ${word}
          AND ${WordTrendsMV.targetTable.columns.interval} >= ${formatDateForCH(from)}
          AND ${WordTrendsMV.targetTable.columns.interval} <= ${formatDateForCH(to)}
        ORDER BY ${WordTrendsMV.targetTable.columns.interval} ASC
      `;

      const result = await client.query.execute(query);
      results[word] = await result.json();
    }

    const response = { words, from, to, data: results };

    // Cache for 30 seconds
    await cache.set(cacheKey, response, 30);

    res.json({ success: true, ...response });
  } catch (error) {
    console.error("[Trends API] Compare error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /stats - Get overall statistics
 */
app.get("/stats", async (req, res) => {
  const { client, sql } = await getMooseUtils();

  try {
    const cache = await MooseCache.get();
    const cacheKey = "trends:stats";
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, ...cached });
    }

    // Get total unique words and total occurrences
    const statsQuery = sql`
      SELECT
        count(DISTINCT ${WordTrendsMV.targetTable.columns.word}) as uniqueWords,
        sum(${WordTrendsMV.targetTable.columns.totalCount}) as totalOccurrences,
        min(${WordTrendsMV.targetTable.columns.interval}) as earliestData,
        max(${WordTrendsMV.targetTable.columns.interval}) as latestData
      FROM ${WordTrendsMV.targetTable}
    `;

    const result = await client.query.execute(statsQuery);
    const stats = (await result.json())[0] || {};

    // Cache for 60 seconds
    await cache.set(cacheKey, stats, 60);

    res.json({ success: true, ...stats });
  } catch (error) {
    console.error("[Trends API] Stats error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Trends API] Error:", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export const trendsApi = new WebApp("trends", app, {
  mountPath: "/trends",
  metadata: {
    description: "Bluesky word trends API for searching and comparing word usage over time",
  },
});

import { Task, Workflow } from "@514labs/moose-lib";
import { Context } from "@temporalio/activity";
import { createClient } from "redis";
import WebSocket from "ws";
import { BlueskyPost } from "../ingest/bluesky-models";

// JetStream endpoint for Bluesky firehose (JSON format)
const JETSTREAM_BASE_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

// Moose ingest endpoint
const INGEST_URL = "http://localhost:4000/ingest/BlueskyPost";

// Redis key for cursor persistence
const CURSOR_KEY = "bluesky:firehose:cursor";

// Batching configuration
const BATCH_SIZE = 100; // Send posts in batches of 100
const BATCH_INTERVAL_MS = 1000; // Or every 1 second, whichever comes first
const MAX_CONCURRENT_REQUESTS = 5; // Limit concurrent HTTP requests

// Stats tracking
let postsProcessed = 0;
let postsErrored = 0;
let lastStatsTime = Date.now();

// Batch queue
let postBatch: BlueskyPost[] = [];
let batchTimer: NodeJS.Timeout | null = null;
let activeRequests = 0;

// Current cursor (time_us from last message, in microseconds)
let currentCursor: number = 0;

// Redis client for cursor persistence
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({ url: "redis://127.0.0.1:6379" });
    redisClient.on("error", (err) => console.error("[Redis] Error:", err));
    await redisClient.connect();
  }
  return redisClient;
}

async function saveCursor(cursor: number) {
  try {
    const redis = await getRedisClient();
    await redis.set(CURSOR_KEY, cursor.toString());
  } catch (err) {
    console.error("[Firehose] Failed to save cursor:", err);
  }
}

async function loadCursor(): Promise<number> {
  try {
    const redis = await getRedisClient();
    const value = await redis.get(CURSOR_KEY);
    if (value) {
      return parseInt(value, 10);
    }
  } catch (err) {
    console.error("[Firehose] Failed to load cursor:", err);
  }

  // Default to 1 hour ago (JetStream cursor is in microseconds)
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
  const oneHourAgoUs = oneHourAgoMs * 1000;
  console.log(`[Firehose] No cursor found, starting from 1 hour ago`);
  return oneHourAgoUs;
}

/**
 * JetStream message format for post commits
 */
interface JetStreamMessage {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    rev: string;
    operation: string;
    collection: string;
    rkey: string;
    record?: {
      $type: string;
      text: string;
      createdAt: string;
      langs?: string[];
    };
    cid: string;
  };
}

/**
 * Parse JetStream message and extract BlueskyPost
 */
function parseJetStreamMessage(data: string): BlueskyPost | null {
  try {
    const msg: JetStreamMessage = JSON.parse(data);

    if (
      msg.kind !== "commit" ||
      msg.commit?.operation !== "create" ||
      msg.commit?.collection !== "app.bsky.feed.post" ||
      !msg.commit?.record?.text
    ) {
      return null;
    }

    const record = msg.commit.record;
    const serverTimestamp = new Date(msg.time_us / 1000);

    return {
      postId: `at://${msg.did}/app.bsky.feed.post/${msg.commit.rkey}`,
      text: record.text,
      createdAt: serverTimestamp,
      authorDid: msg.did,
    };
  } catch (error) {
    console.error("[Firehose] Failed to parse message:", error);
    return null;
  }
}

/**
 * Send a batch of posts to the Moose ingest endpoint
 */
async function sendBatch(posts: BlueskyPost[]): Promise<void> {
  if (posts.length === 0) return;

  // Wait if too many concurrent requests
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  activeRequests++;
  try {
    // Send posts one at a time but with controlled concurrency
    // Moose ingest endpoint expects single objects
    for (const post of posts) {
      const response = await fetch(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post),
      });

      if (response.ok) {
        postsProcessed++;
      } else {
        postsErrored++;
      }
    }
  } catch (error) {
    console.error("[Firehose] Batch ingest error:", error);
    postsErrored += posts.length;
  } finally {
    activeRequests--;
  }
}

/**
 * Queue a post for batched ingestion
 */
function queuePost(post: BlueskyPost): void {
  postBatch.push(post);

  // Send batch if it reaches the size limit
  if (postBatch.length >= BATCH_SIZE) {
    flushBatch();
  }

  // Start timer for time-based flushing if not already running
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch();
    }, BATCH_INTERVAL_MS);
  }
}

/**
 * Flush the current batch
 */
function flushBatch(): void {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (postBatch.length > 0) {
    const batch = postBatch;
    postBatch = [];
    // Fire and forget - don't await to avoid blocking message processing
    sendBatch(batch);
  }
}

/**
 * Log stats periodically
 */
function logStats() {
  const now = Date.now();
  const elapsed = (now - lastStatsTime) / 1000;

  if (elapsed >= 60) {
    const rate = postsProcessed / elapsed;
    console.log(
      `[Firehose] Stats: ${postsProcessed} posts (${rate.toFixed(1)}/sec), ${postsErrored} errors`
    );
    postsProcessed = 0;
    postsErrored = 0;
    lastStatsTime = now;
  }
}

/**
 * Connect to JetStream and process posts
 * @param cancellationSignal - AbortSignal to handle graceful shutdown
 */
async function connectAndProcess(cancellationSignal: AbortSignal): Promise<"disconnected" | "cancelled"> {
  let url = JETSTREAM_BASE_URL;
  if (currentCursor > 0) {
    url += `&cursor=${currentCursor}`;
    console.log(`[Firehose] Resuming from cursor: ${currentCursor}`);
  }

  return new Promise((resolve) => {
    console.log("[Firehose] Connecting to JetStream...");

    const ws = new WebSocket(url);
    let messageCount = 0;
    let wasCancelled = false;

    // Handle cancellation signal
    const onCancelled = () => {
      console.log("[Firehose] Cancellation received, closing connection...");
      wasCancelled = true;
      ws.close();
    };
    cancellationSignal.addEventListener("abort", onCancelled);

    ws.on("open", () => {
      console.log("[Firehose] Connected to JetStream");
    });

    ws.on("message", (data: WebSocket.Data) => {
      const message = data.toString();

      try {
        const rawMsg = JSON.parse(message);
        if (rawMsg.time_us) {
          const cursor: number = rawMsg.time_us;
          currentCursor = cursor;
          messageCount++;
          if (messageCount % 1000 === 0) {
            saveCursor(cursor);
            logStats();
          }
        }
      } catch {}

      const post = parseJetStreamMessage(message);

      if (post) {
        queuePost(post);
      }
    });

    ws.on("error", (error) => {
      console.error("[Firehose] WebSocket error:", error);
      postsErrored++;
    });

    ws.on("close", async (code, reason) => {
      console.log(`[Firehose] Connection closed: ${code} ${reason.toString()}`);
      cancellationSignal.removeEventListener("abort", onCancelled);

      // Flush any remaining posts in the batch
      flushBatch();

      // Wait for active requests to complete (with timeout)
      const waitStart = Date.now();
      while (activeRequests > 0 && Date.now() - waitStart < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (currentCursor > 0) {
        await saveCursor(currentCursor);
        console.log(`[Firehose] Saved cursor: ${currentCursor}`);
      }
      resolve(wasCancelled ? "cancelled" : "disconnected");
    });

    process.on("SIGINT", () => {
      console.log("[Firehose] Shutting down...");
      ws.close();
    });

    process.on("SIGTERM", () => {
      console.log("[Firehose] Terminating...");
      ws.close();
    });
  });
}

/**
 * Firehose ingestion task with automatic reconnection
 */
export const firehoseTask = new Task<null, void>("firehose-ingest", {
  run: async () => {
    console.log("[Firehose] Starting Bluesky firehose ingestion...");

    // Get cancellation signal from Temporal activity context
    const ctx = Context.current();
    const cancellationSignal = ctx.cancellationSignal;

    currentCursor = await loadCursor();
    console.log(`[Firehose] Starting from cursor: ${currentCursor}`);

    // Reconnection loop - exits on cancellation
    while (!cancellationSignal.aborted) {
      try {
        const result = await connectAndProcess(cancellationSignal);

        if (result === "cancelled") {
          console.log("[Firehose] Activity cancelled, exiting...");
          return;
        }

        console.log("[Firehose] Reconnecting in 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error("[Firehose] Connection failed:", error);

        if (cancellationSignal.aborted) {
          console.log("[Firehose] Activity cancelled during error recovery, exiting...");
          return;
        }

        console.log("[Firehose] Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    console.log("[Firehose] Activity cancelled, exiting...");
  },
  retries: 1,
  timeout: "24h",
});

/**
 * Firehose workflow - runs continuously to ingest posts
 */
export const firehoseWorkflow = new Workflow("firehose", {
  startingTask: firehoseTask,
  retries: 3,
  timeout: "24h",
});

import { Task, Workflow, MooseCache } from "@514labs/moose-lib";
import { Context } from "@temporalio/activity";
import WebSocket from "ws";
import { BlueskyPost, BlueskyPostPipeline } from "../ingest/models";

// JetStream endpoint for Bluesky firehose (JSON format)
const JETSTREAM_BASE_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

// Redis key for cursor persistence
const CURSOR_KEY = "bluesky:firehose:cursor";

// Batching for Kafka efficiency
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 500;
let postBatch: BlueskyPost[] = [];
let batchTimer: NodeJS.Timeout | null = null;

// Stats tracking
let postsProcessed = 0;
let lastStatsTime = Date.now();

// Current cursor (time_us from last message, in microseconds)
let currentCursor: number = 0;

async function saveCursor(cursor: number) {
  try {
    const cache = await MooseCache.get();
    await cache.set(CURSOR_KEY, cursor.toString(), 60 * 60 * 24 * 7); // 7 day TTL
  } catch (err) {
    console.error("[Firehose] Failed to save cursor:", err);
  }
}

async function loadCursor(): Promise<number> {
  try {
    const cache = await MooseCache.get();
    const value = await cache.get<string>(CURSOR_KEY);
    if (value) {
      return parseInt(value, 10);
    }
  } catch (err) {
    console.error("[Firehose] Failed to load cursor:", err);
  }

  // Default to 24 hours ago (JetStream cursor is in microseconds)
  const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const twentyFourHoursAgoUs = twentyFourHoursAgoMs * 1000;
  console.log(`[Firehose] No cursor found, starting from 24 hours ago`);
  return twentyFourHoursAgoUs;
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
 * Log stats periodically
 */
function logStats() {
  const now = Date.now();
  const elapsed = (now - lastStatsTime) / 1000;

  if (elapsed >= 60) {
    const rate = postsProcessed / elapsed;
    console.log(`[Firehose] Stats: ${postsProcessed} posts (${rate.toFixed(1)}/sec)`);
    postsProcessed = 0;
    lastStatsTime = now;
  }
}

/**
 * Flush batch to Kafka
 */
async function flushBatch() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (postBatch.length === 0) return;

  const batch = postBatch;
  postBatch = [];

  try {
    await BlueskyPostPipeline.stream!.send(batch);
    postsProcessed += batch.length;
  } catch (err) {
    console.error("[Firehose] Failed to send batch:", err);
  }
}

/**
 * Queue post for batched sending
 */
function queuePost(post: BlueskyPost) {
  postBatch.push(post);

  if (postBatch.length >= BATCH_SIZE) {
    flushBatch();
  } else if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }
}

/**
 * Connect to JetStream and process posts
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
          currentCursor = rawMsg.time_us;
          messageCount++;
          if (messageCount % 1000 === 0) {
            saveCursor(currentCursor);
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
    });

    ws.on("close", async (code, reason) => {
      console.log(`[Firehose] Connection closed: ${code} ${reason.toString()}`);
      cancellationSignal.removeEventListener("abort", onCancelled);

      // Flush remaining posts
      await flushBatch();

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

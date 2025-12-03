import { Task, Workflow } from "@514labs/moose-lib";
import WebSocket from "ws";
import { BlueskyPost } from "../ingest/bluesky-models";

// JetStream endpoint for Bluesky firehose (JSON format)
const JETSTREAM_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

// Moose ingest endpoint
const INGEST_URL = "http://localhost:4000/ingest/BlueskyPost";

// Stats tracking
let postsProcessed = 0;
let postsErrored = 0;
let lastStatsTime = Date.now();

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

    // Only process create operations for posts
    if (
      msg.kind !== "commit" ||
      msg.commit?.operation !== "create" ||
      msg.commit?.collection !== "app.bsky.feed.post" ||
      !msg.commit?.record?.text
    ) {
      return null;
    }

    const record = msg.commit.record;

    return {
      postId: `at://${msg.did}/app.bsky.feed.post/${msg.commit.rkey}`,
      text: record.text,
      createdAt: new Date(record.createdAt),
      authorDid: msg.did,
    };
  } catch (error) {
    console.error("[Firehose] Failed to parse message:", error);
    return null;
  }
}

/**
 * Post a BlueskyPost to the Moose ingest endpoint
 */
async function ingestPost(post: BlueskyPost): Promise<boolean> {
  try {
    const response = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(post),
    });

    if (!response.ok) {
      console.error(
        `[Firehose] Ingest failed: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Firehose] Ingest error:", error);
    return false;
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
      `[Firehose] Stats: ${postsProcessed} posts (${rate.toFixed(1)}/sec), ${postsErrored} errors`,
    );
    postsProcessed = 0;
    postsErrored = 0;
    lastStatsTime = now;
  }
}

/**
 * Connect to JetStream and process posts
 */
async function connectAndProcess(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("[Firehose] Connecting to JetStream...");

    const ws = new WebSocket(JETSTREAM_URL);

    ws.on("open", () => {
      console.log("[Firehose] Connected to JetStream");
    });

    ws.on("message", async (data: WebSocket.Data) => {
      const message = data.toString();
      const post = parseJetStreamMessage(message);

      if (post) {
        const success = await ingestPost(post);
        if (success) {
          postsProcessed++;
        } else {
          postsErrored++;
        }
        logStats();
      }
    });

    ws.on("error", (error) => {
      console.error("[Firehose] WebSocket error:", error);
      postsErrored++;
    });

    ws.on("close", (code, reason) => {
      console.log(
        `[Firehose] Connection closed: ${code} ${reason.toString()}`,
      );
      resolve();
    });

    // Handle graceful shutdown
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

    // Reconnection loop
    while (true) {
      try {
        await connectAndProcess();
        console.log("[Firehose] Reconnecting in 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error("[Firehose] Connection failed:", error);
        console.log("[Firehose] Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  },
  retries: 0, // Handle retries internally with reconnection loop
  timeout: "24h", // Long-running task
});

/**
 * Firehose workflow - runs continuously to ingest posts
 */
export const firehoseWorkflow = new Workflow("firehose", {
  startingTask: firehoseTask,
  retries: 3,
  timeout: "24h",
});

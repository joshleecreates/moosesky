#!/usr/bin/env npx ts-node

import WebSocket from "ws";

// JetStream endpoint for Bluesky firehose (JSON format)
const JETSTREAM_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

// Moose ingest endpoint
const INGEST_URL = "http://localhost:4000/ingest/BlueskyPost";

// Stats tracking
let postsProcessed = 0;
let postsErrored = 0;
let lastStatsTime = Date.now();

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

interface BlueskyPost {
  postId: string;
  text: string;
  createdAt: Date;
  authorDid: string;
}

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

    return {
      postId: `at://${msg.did}/app.bsky.feed.post/${msg.commit.rkey}`,
      text: record.text,
      createdAt: new Date(record.createdAt),
      authorDid: msg.did,
    };
  } catch {
    return null;
  }
}

async function ingestPost(post: BlueskyPost): Promise<boolean> {
  try {
    const response = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function logStats() {
  const now = Date.now();
  const elapsed = (now - lastStatsTime) / 1000;

  if (elapsed >= 10) {
    const rate = postsProcessed / elapsed;
    console.log(
      `[Firehose] ${postsProcessed} posts (${rate.toFixed(1)}/sec), ${postsErrored} errors`
    );
    postsProcessed = 0;
    postsErrored = 0;
    lastStatsTime = now;
  }
}

function connect() {
  console.log("[Firehose] Connecting to JetStream...");

  const ws = new WebSocket(JETSTREAM_URL);

  ws.on("open", () => {
    console.log("[Firehose] Connected! Ingesting posts...");
  });

  ws.on("message", async (data: WebSocket.Data) => {
    const post = parseJetStreamMessage(data.toString());
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
    console.error("[Firehose] Error:", error.message);
  });

  ws.on("close", () => {
    console.log("[Firehose] Disconnected. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  });
}

console.log("Bluesky Firehose Ingestion");
console.log("==========================");
console.log("Press Ctrl+C to stop\n");

connect();

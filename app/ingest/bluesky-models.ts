import { IngestPipeline, Key, OlapTable, DateTime } from "@514labs/moose-lib";
import typia, { tags } from "typia";

/**
 * Bluesky Firehose Data Pipeline
 *
 * BlueskyPost (raw) → Transform (word extraction) → WordOccurrence (aggregated) → ClickHouse
 */

/** Raw post from Bluesky firehose */
export interface BlueskyPost {
  createdAt: Key<DateTime>; // Post timestamp (primary key for time-series)
  postId: string; // AT URI or CID
  text: string; // Post content
  authorDid: string; // Author's DID
}

/** Aggregated word occurrence per 10-second interval */
export interface WordOccurrence {
  intervalTimestamp: Key<DateTime>; // Truncated to 10-second interval
  word: string; // Lowercase normalized word
  count: number & tags.Type<"int64">; // Occurrences count
}

/** Pipeline for raw Bluesky posts - persisted in ClickHouse */
export const BlueskyPostPipeline = new IngestPipeline<BlueskyPost>(
  "BlueskyPost",
  {
    table: {
      orderByFields: ["createdAt"], // Time-series ordering
    },
    stream: true, // Stream for transformation
    ingestApi: true, // POST /ingest/BlueskyPost
  },
);

/** Pipeline for word occurrences - persisted in ClickHouse */
export const WordOccurrencePipeline = new IngestPipeline<WordOccurrence>(
  "WordOccurrence",
  {
    table: {
      orderByFields: ["intervalTimestamp", "word"],
    },
    stream: true,
    ingestApi: false, // Only populated via transform
  },
);

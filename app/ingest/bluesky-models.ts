import { IngestPipeline, Key, OlapTable, DateTime } from "@514labs/moose-lib";
import typia, { tags } from "typia";

/**
 * Bluesky Firehose Data Pipeline
 *
 * BlueskyPost (raw) → Transform (word extraction) → WordOccurrence (aggregated) → ClickHouse
 */

/** Raw post from Bluesky firehose */
export interface BlueskyPost {
  postId: Key<string>; // AT URI or CID
  text: string; // Post content
  createdAt: DateTime; // Post timestamp
  authorDid: string; // Author's DID
}

/** Aggregated word occurrence per 10-second interval */
export interface WordOccurrence {
  id: Key<string>; // Composite: word + interval timestamp hash
  word: string; // Lowercase normalized word
  intervalTimestamp: DateTime; // Truncated to 10-second interval
  count: number & tags.Type<"int64">; // Occurrences count
}

/** Pipeline for raw Bluesky posts - streaming only, no persistence */
export const BlueskyPostPipeline = new IngestPipeline<BlueskyPost>(
  "BlueskyPost",
  {
    table: false, // Don't persist raw posts
    stream: true, // Stream for transformation
    ingestApi: true, // POST /ingest/BlueskyPost
  },
);

/** Pipeline for word occurrences - persisted in ClickHouse */
export const WordOccurrencePipeline = new IngestPipeline<WordOccurrence>(
  "WordOccurrence",
  {
    table: {
      orderByFields: ["id"],
    },
    stream: true,
    ingestApi: false, // Only populated via transform
  },
);

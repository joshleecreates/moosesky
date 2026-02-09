import typia from "typia";
import { MaterializedView, sql } from "@514labs/moose-lib";
import { WordOccurrencePipeline } from "../ingest/models";

/**
 * Aggregated word trends per 10-second interval
 * Used for efficient time-series queries on word frequency
 */
interface WordTrend {
  word: string;
  interval: Date;
  totalCount: number & typia.tags.Type<"int64">;
}

const wordTable = WordOccurrencePipeline.table!;
const wordColumns = wordTable.columns;

/**
 * Materialized view aggregating word counts by 10-second interval
 * Enables fast queries for trending words and word frequency over time
 */
export const WordTrendsMV = new MaterializedView<WordTrend>({
  tableName: "WordTrends",
  materializedViewName: "WordTrends_MV",
  orderByFields: ["word", "interval"],
  selectStatement: sql`SELECT
    ${wordColumns.word} as word,
    toStartOfInterval(${wordColumns.intervalTimestamp}, INTERVAL 10 SECOND) as interval,
    sum(${wordColumns.count}) as totalCount
  FROM ${wordTable}
  GROUP BY ${wordColumns.word}, toStartOfInterval(${wordColumns.intervalTimestamp}, INTERVAL 10 SECOND)
  `,
  selectTables: [wordTable],
});

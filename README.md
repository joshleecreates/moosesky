# MooseSky - Bluesky Firehose Word Trends

A real-time word trends application that ingests the Bluesky firehose and analyzes trending words.

Built with [Moose](https://docs.fiveonefour.com/moose) and [Temporal](https://temporal.io/).

## Prerequisites

- [Devbox](https://www.jetify.com/devbox) installed
- Docker running

## Getting Started

### 1. Start the Development Environment

```bash
# Enter the devbox shell
devbox shell

# Install dependencies
npm install

# Start moose (includes ClickHouse, Redpanda, Redis, Temporal)
moose-cli dev
```

### 2. Run the Firehose Workflow

Once moose is running, start the firehose ingestion workflow:

```bash
# In a separate terminal (inside devbox shell)
moose-cli workflow run firehose
```

The workflow will:
- Connect to Bluesky's JetStream firehose
- Ingest posts into Kafka/Redpanda
- Transform posts to extract word occurrences
- Store data in ClickHouse for analysis

### 3. View the Dashboard

Open http://localhost:4000/dashboard to see trending words.

### 4. Stop the Workflow

You can stop the workflow from the Temporal UI at http://localhost:8080:
1. Find the `firehose` workflow
2. Click "Terminate" or "Cancel"

## Cleaning/Resetting Data

### Reset Everything (Recommended)

```bash
# Stop moose, then restart with clean flag
moose-cli dev --clean
```

### Manual Cleanup

#### Clear Redis (cursor position)
```bash
redis-cli FLUSHALL
# Or just the cursor:
redis-cli DEL bluesky:firehose:cursor
```

#### Clear ClickHouse Tables
```bash
# Connect to ClickHouse
clickhouse-client --host localhost --port 18123 --user panda --password pandapass

# Truncate tables
TRUNCATE TABLE local.BlueskyPost_0_0;
TRUNCATE TABLE local.WordOccurrence_0_0;

# Or drop and let moose recreate them:
DROP TABLE IF EXISTS local.BlueskyPost_0_0;
DROP TABLE IF EXISTS local.WordOccurrence_0_0;
```

#### Clear Kafka/Redpanda Topics
```bash
# List topics
rpk topic list

# Delete topics
rpk topic delete BlueskyPost_0_0
rpk topic delete WordOccurrence_0_0
```

## Architecture

```
Bluesky JetStream (WebSocket)
         │
         ▼
┌─────────────────────┐
│  Temporal Workflow  │
│  (firehose.ts)      │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Kafka/Redpanda     │
│  (BlueskyPost)      │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Transform          │
│  (word extraction)  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  ClickHouse         │
│  (WordOccurrence)   │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Dashboard API      │
│  (trends.ts)        │
└─────────────────────┘
```

## Configuration

Key settings in `moose.config.toml`:

| Service | Port |
|---------|------|
| Moose HTTP | 4000 |
| ClickHouse HTTP | 18123 |
| Redpanda/Kafka | 19092 |
| Redis | 6379 |
| Temporal | 7233 |
| Temporal UI | 8080 |

## Acknowledgments

This project was inspired by [BlueHoover](https://github.com/JosephRedfern/bluehoover) by Joe Redfern.

## License

MIT

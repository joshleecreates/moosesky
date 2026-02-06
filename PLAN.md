# Plan: Add MCP Chat Application and Next.js Frontend

## Context

The moosesky project is a Bluesky word trends analytics app built with the Moose framework. It currently has a static HTML dashboard served via Express. The goal is to add:
1. An MCP (Model Context Protocol) server endpoint so AI can query the ClickHouse database
2. A Next.js frontend with an AI chat interface that connects to the MCP server via Anthropic's Claude

This follows the reference template at `https://github.com/514-labs/moosestack/tree/7d510666910de533ed735aab14a04662dc302318/templates/typescript-mcp`.

User choices: **pnpm monorepo**, **Bluesky-customized prompts**, **API key auth included**.

Additionally, the existing static HTML dashboard (`app/public/index.html`) should be migrated into the Next.js web app as the main page, replacing the simple landing page.

---

## Phase 1: Monorepo Restructure

### 1.1 Create `packages/moosesky-service/` and move all Moose files into it

Move these items into `packages/moosesky-service/`:
- `app/`, `scripts/`, `moose.config.toml`, `tsconfig.json`, `devbox.json`, `devbox.lock`, `template.config.toml`, `.moose/`, `.ts-node/`, `.vscode/`
- Current `package.json` → `packages/moosesky-service/package.json` (rename to `"name": "moosesky-service"`)

Keep at root: `.git/`, `.claude/`, `.gitignore`, `README.md`, `.devbox/`

### 1.2 Create root workspace files

**`/package.json`** (new root):
```json
{
  "name": "moosesky",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:moose": "pnpm --filter moosesky-service dev",
    "dev:web": "pnpm --filter web-app dev"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["@confluentinc/kafka-javascript"]
  }
}
```

**`/pnpm-workspace.yaml`**:
```yaml
packages:
  - 'packages/*'
```

### 1.3 Update service `package.json`

Add new MCP dependencies to `packages/moosesky-service/package.json`:
- `@modelcontextprotocol/sdk`: `^1.24.2`
- `@514labs/express-pbkdf2-api-key-auth`: `^1.0.4`
- `zod`: `^3.25.0`

Remove the `pnpm` section (moved to root).

### 1.4 Update `.gitignore`

Add: `.next`, `.env`, `.env.local`

### 1.5 Install deps and verify

```bash
pnpm install
cd packages/moosesky-service && pnpm dev  # verify Moose still works
```

> **Risk**: `moose-cli` uses `package_manager = "npm"` in `moose.config.toml` and `tsconfig.json` references `./node_modules/@514labs/moose-lib/dist/compilerPlugin.js`. With pnpm, symlinks in `node_modules` should resolve correctly. If not, add `.npmrc` at root with `shamefully-hoist=true`.

---

## Phase 2: MCP Server Endpoint (Backend)

### 2.1 Create `packages/moosesky-service/app/apis/mcp.ts`

Follow the template's `mcp.ts` pattern exactly:
- Express app with `express.json()` middleware
- API key auth via `createAuthMiddleware` from `@514labs/express-pbkdf2-api-key-auth` (only enforced when `MCP_API_KEY` env var is set)
- `serverFactory(mooseUtils)` creates a fresh `McpServer` per request with two tools:
  - **`query_clickhouse`** — Executes read-only SQL (`readonly: "2"`) with configurable limit (max 1000 rows)
  - **`get_data_catalog`** — Discovers tables/materialized views via `system.tables` and `system.columns`, supports filtering and summary/detailed formats
- `StreamableHTTPServerTransport` in stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`)
- Single `app.all("/")` handler creates fresh transport + server per request
- Export as `WebApp` mounted at `/tools`

### 2.2 Update `packages/moosesky-service/app/index.ts`

Add one line:
```typescript
export * from "./apis/mcp";
```

---

## Phase 3: Next.js Web App (Frontend)

### 3.1 Create `packages/web-app/` with config files

| File | Notes |
|------|-------|
| `package.json` | Key deps: `@ai-sdk/anthropic`, `@ai-sdk/mcp`, `@ai-sdk/react`, `ai` (v5), `next` (v16), `react` (v19), `react-markdown`, `remark-gfm`, `next-themes`, `react-resizable-panels`, `lucide-react`, shadcn/ui radix packages, `tailwindcss` v4 |
| `tsconfig.json` | Standard Next.js config with `@/*` → `./src/*` path alias |
| `next.config.ts` | Default/empty config |
| `postcss.config.mjs` | `@tailwindcss/postcss` plugin |
| `.env.development` | `MCP_SERVER_URL=http://localhost:4000` |
| `.env.example` | `ANTHROPIC_API_KEY=your-key` and `MCP_API_TOKEN=your-token` |

### 3.2 Create utility files (copy from template verbatim)

- `src/lib/utils.ts` — `cn()` utility (clsx + twMerge)
- `src/env-vars.ts` — `getMcpServerUrl()` and `getAnthropicApiKey()` helpers
- `src/hooks/use-mobile.ts` — `useIsMobile()` hook

### 3.3 Create UI components (shadcn/ui — copy from template)

`src/components/ui/`: `badge.tsx`, `button.tsx`, `collapsible.tsx`, `dropdown-menu.tsx`, `resizable.tsx`, `scroll-area.tsx`, `textarea.tsx`

Or generate via: `npx shadcn@latest add badge button collapsible dropdown-menu resizable scroll-area textarea`

### 3.4 Create theme + layout components (copy from template)

- `src/components/theme-provider.tsx` — Wraps `next-themes` ThemeProvider
- `src/components/theme-toggle.tsx` — Light/Dark/System dropdown
- `src/components/layout/content-header.tsx` — Sticky header with ThemeToggle
- `src/components/layout/resizable-chat-layout.tsx` — ResizablePanelGroup with main + chat panels, ChatLayoutContext
- `src/components/layout/chat-layout-wrapper.tsx` — Composes the above

### 3.5 Create app shell (adapted from template)

- `src/app/globals.css` — Tailwind v4 theme with oklch colors (copy from template)
- `src/app/layout.tsx` — Root layout with ThemeProvider + ChatLayoutWrapper. Customize metadata title to "Bluesky Word Trends"

### 3.6 Migrate dashboard into Next.js as the main page

The existing static dashboard (`app/public/index.html`) is an 788-line HTML file with D3.js charts. Convert it into React components for the main page.

**Current dashboard features to preserve:**
- **Stats bar**: Unique words count, total occurrences, data range (from `/trends/stats`, auto-refresh 60s)
- **Trend chart**: D3.js line chart with tooltips showing word frequency over time
- **Search**: Input to search for a word and see its trend
- **Compare mode**: Add up to 5 words with color-coded lines, removable tags
- **Time range controls**: 5m, 15m, 1h, 6h, 24h buttons that reload data
- **Trending sidebar**: Top 15 words ranked by frequency (from `/trends/top`, auto-refresh 30s), clickable to search
- **Responsive**: Grid collapses to single column on narrow screens

**Implementation approach — convert to React components using Recharts (already in web-app deps):**

#### New files under `src/features/dashboard/`:

| File | Description |
|------|-------------|
| `stats-bar.tsx` | Stats display with auto-refresh via `useEffect` + `setInterval`. Calls `GET {MOOSE_URL}/trends/stats` |
| `trend-chart.tsx` | Recharts `LineChart` replacing D3.js. Responsive, multi-line for compare mode, tooltips with word/count/time |
| `search-form.tsx` | Word input + Search button + Compare button. Manages `currentWords` state |
| `time-range-controls.tsx` | Button group for 5m/15m/1h/6h/24h, tracks active selection |
| `trending-sidebar.tsx` | Ranked list of trending words with auto-refresh. Click to search. Top 3 highlighted |
| `compare-tags.tsx` | Color-coded tag chips with remove button for compared words |
| `use-trends-api.ts` | Custom hook encapsulating API calls to `/trends/search`, `/trends/top`, `/trends/stats` with response parsing |

#### `src/app/page.tsx` — Main dashboard page

Composes all dashboard components:
```
<header> Stats bar </header>
<main-grid>
  <left>
    <Card>
      <TimeRangeControls />
      <SearchForm />
      <CompareTags />
      <TrendChart />
    </Card>
  </left>
  <right>
    <Card>
      <TrendingSidebar />
    </Card>
  </right>
</main-grid>
```

#### API proxy route

Since the Next.js app runs on port 3000 and the Moose API on port 4000, the dashboard components need to reach the trends API. Two options:
1. **Next.js API proxy routes** (`src/app/api/trends/[...path]/route.ts`) that forward to `http://localhost:4000/trends/*`
2. **Direct client-side fetch** to `http://localhost:4000` with CORS (already enabled in trends.ts)

Use option 2 (direct fetch) since CORS headers are already set in the trends API. The `MOOSE_URL` env var (`NEXT_PUBLIC_MOOSE_URL=http://localhost:4000`) makes this configurable.

#### Additional dependencies

Add to web-app `package.json`:
- `recharts` is already included in the template deps — use it instead of D3.js

#### Environment

Add to `.env.development`:
```
NEXT_PUBLIC_MOOSE_URL=http://localhost:4000
```

### 3.7 Create API routes (copy from template)

- `src/app/api/chat/route.ts` — POST handler, delegates to `getAgentResponse()`
- `src/app/api/chat/status/route.ts` — GET handler, checks `ANTHROPIC_API_KEY` availability

### 3.8 Create chat feature files

**Copied verbatim from template** (14 files):
- `src/features/chat/agent-config.ts` — Creates Anthropic client + MCP client at `${MCP_SERVER_URL}/tools`
- `src/features/chat/get-agent-response.ts` — Wraps tools for timing, creates UIMessageStream
- `src/features/chat/chat-ui.tsx` — Main chat with `useChat` hook, auto-scroll, tool timings
- `src/features/chat/chat-input.tsx` — Textarea with Enter/Shift+Enter
- `src/features/chat/chat-output-area.tsx` — Renders messages with text/reasoning/tool parts
- `src/features/chat/chat-button.tsx` — Floating FAB to toggle chat panel
- `src/features/chat/clickhouse-tool-invocation.tsx` — ClickHouse query results as tables
- `src/features/chat/tool-invocation.tsx` — Generic tool invocation rendering
- `src/features/chat/tool-data-catalog.tsx` — Data catalog rendering
- `src/features/chat/code-block.tsx` — Pre/code block
- `src/features/chat/reasoning-section.tsx` — AI reasoning display
- `src/features/chat/source-section.tsx` — Source links
- `src/features/chat/text-formatter.tsx` — ReactMarkdown with GFM
- `src/features/chat/use-anthropic-status.ts` — Hook to check API key

**Customized for Bluesky** (2 files):

**`src/features/chat/system-prompt.ts`** — System prompt explaining:
- The app tracks word trends from Bluesky firehose
- Table schemas: `BlueskyPost` (createdAt, postId, text, authorDid), `WordOccurrence` (intervalTimestamp, word, count), `WordTrends` MV (word, interval, totalCount)
- Query guidelines: use `get_data_catalog` first, time functions, GROUP BY patterns

**`src/features/chat/suggested-prompt.tsx`** — Custom prompts:
- "What are the top trending words right now?"
- "Show me the trend for the word 'ai' over the last hour"
- "Compare the words 'bluesky', 'twitter', and 'mastodon'"
- "What topics are people talking about most?"

---

## File Summary

| Action | Path | Description |
|--------|------|-------------|
| MOVE | `app/`, `scripts/`, `moose.config.toml`, `tsconfig.json`, `devbox.*`, etc. | Into `packages/moosesky-service/` |
| CREATE | `/package.json` | Root workspace config |
| CREATE | `/pnpm-workspace.yaml` | Workspace definition |
| MODIFY | `packages/moosesky-service/package.json` | Rename, add MCP deps |
| MODIFY | `packages/moosesky-service/app/index.ts` | Add MCP export |
| CREATE | `packages/moosesky-service/app/apis/mcp.ts` | MCP server endpoint (~300 lines) |
| MODIFY | `.gitignore` | Add .next, .env entries |
| CREATE | `packages/web-app/` | ~40 new files (Next.js app + chat + dashboard) |
| CREATE | `packages/web-app/src/features/dashboard/` | ~7 files (dashboard components migrated from static HTML) |

---

## Verification

1. **Moose service**: `cd packages/moosesky-service && pnpm dev` — verify existing endpoints work at `http://localhost:4000/trends/health`
2. **MCP endpoint**: `curl -X POST http://localhost:4000/tools -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'` — should return `query_clickhouse` and `get_data_catalog` tools
3. **Web app**: Create `packages/web-app/.env.local` with `ANTHROPIC_API_KEY=sk-...`, then `cd packages/web-app && pnpm dev` — open `http://localhost:3000`
4. **Dashboard**: Verify the main page shows the stats bar, trend chart, search form, and trending sidebar — all pulling data from `http://localhost:4000/trends/*`
5. **End-to-end chat**: Click chat button, ask "What are the top trending words?", verify the AI calls `get_data_catalog` then `query_clickhouse` and returns formatted results

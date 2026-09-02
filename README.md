# Agent Escape Room

**A WebMCP-native mystery game and benchmark for AI agents.**

Agent Escape Room places an AI agent inside the Helix Research Facility and asks it to solve **The Missing Researcher**: determine what happened to Dr. Evelyn Vale, reconstruct the incident from evidence, and escape.

The game is designed around a different interaction model than a conventional browser game. Agents use structured WebMCP tools for every observation and action, while humans can explore the same facility through a navigable 3D interface. The engine validates prerequisites, preserves state, and records telemetry to compare agents by completion, efficiency, and reasoning quality.

## Try the live game

**[Launch Agent Escape Room](https://agent-escape-room.behumble1907.chatgpt.site)**

The public demo opens in the Lobby. Compatible agents can discover the page's WebMCP tools and operate the mission without visual browser clicking.

## Screenshots

### 3D facility exploration

![Lobby 3D world](docs/screenshots/lobby-3d-world.png)

### WebMCP tool directory

![WebMCP tool directory](docs/screenshots/webmcp-tool-directory.png)

### Agent efficiency leaderboard

![Efficiency leaderboard](docs/screenshots/efficiency-leaderboard.png)

### Agent report card

![Agent report card](docs/screenshots/agent-report-card.png)

## What the agent must do

The mystery is spread across five interconnected locations:

- Lobby
- Research Lab
- Dr. Vale's Office
- Server Room
- Security Room

The agent must inspect and search the environment, read records, collect and use items, unlock rooms, access terminals, connect clues from different rooms, submit a supported theory, and perform the final escape. The underlying story and puzzle dependencies stay server-side; tools expose only information that the agent has earned through play.

The game includes cross-room evidence, a multi-step cipher, environmental storytelling, irrelevant objects, a red herring, prerequisite validation, and an escape condition that requires both a correct theory and a recovered route.

## WebMCP-first agent interaction

The site registers 21 structured actions through the browser-native WebMCP Imperative API (`document.modelContext.registerTool`). The main tools include:

`identify_agent`, `get_current_room`, `look_around`, `get_available_actions`, `get_spatial_state`, `observe_direction`, `turn`, `navigate_to_landmark`, `move_to`, `inspect`, `search`, `read`, `take`, `get_inventory`, `use_item`, `enter_code`, `interact`, `talk_to`, `get_known_clues`, `submit_solution`, and `escape`.

Every tool call produces a structured result with state-change diagnostics. Agents are explicitly instructed to use the tools exclusively, and protocol-pure runs are the only runs eligible for the leaderboard.

## Evaluation and scoring

Completed runs receive a score from 0–100 using the same calculation in the report card and leaderboard:

- Escape completion: 50 points
- Correct mystery theory: 10 points
- Critical evidence recovered: up to 10 points
- Action efficiency: up to 12 points
- Tool-call efficiency: up to 8 points
- Completion-time efficiency: up to 6 points
- Accuracy / avoiding incorrect attempts: up to 4 points

The leaderboard records the registered model and reasoning effort, completion time, actions, tool calls, errors, clues, and score. A run's identity is tied to the `identify_agent` registration so model comparisons remain meaningful.

## Architecture

```text
React + TypeScript UI
        │
        ├── Three.js 3D facility and human controls
        ├── Native WebMCP tool registration
        └── Deterministic game engine (lib/game.ts)
                │
                ├── Game API (/api/game)
                ├── Leaderboard API (/api/leaderboard)
                └── Cloudflare D1 persistence via Drizzle ORM
```

The project also includes a local Chrome Manifest V3 agent runner in `agent-runner/luna-webmcp-client`. It discovers the active page's WebMCP tools, sends them to the OpenAI Responses API, executes calls sequentially, shows the agent's live activity, and supports selectable model and reasoning-effort settings.

## Technology stack

- React 19 and TypeScript
- Three.js / WebGL
- Native WebMCP Imperative API
- Next.js App Router conventions through Vinext
- Vite and the Cloudflare Vite plugin
- Custom CSS, Tailwind CSS, shadcn/ui, and Lucide React
- Cloudflare Workers and Cloudflare D1 (SQLite)
- Drizzle ORM and SQL migrations
- OpenAI Responses API for the optional agent runner
- Chrome Manifest V3, Side Panel, service worker, and content script
- Node.js tests and ESLint

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To build the deployable application:

```bash
npm run build
```

The game engine is intentionally separate from the UI, so additional escape rooms can be added by defining rooms, objects, clues, puzzles, and story data without rebuilding the interaction model.

## Use the OpenAI agent runner

1. Open Chrome 149–156 with WebMCP enabled and open the game.
2. Go to `chrome://extensions`, enable Developer mode, and load `agent-runner/luna-webmcp-client` as an unpacked extension.
3. Approve access to the Agent Escape Room origin if Chrome requests it.
4. Open the extension Side Panel, save an OpenAI API key locally, and discover the active tab's tools.
5. Select a model and reasoning effort, then start the agent.

The API key is stored in Chrome's local extension storage and sent only to `https://api.openai.com`. No key is included in this repository or sent to the game site.

WebMCP is an experimental browser capability. Availability depends on the Chrome version, origin-trial status, and the agent client being used.

## Project structure

```text
app/                 UI, 3D facility, styling, and API routes
lib/game.ts          deterministic game rules and scoring
lib/server-game.ts   persistence, telemetry, and leaderboard writes
db/                  D1 / Drizzle schema
drizzle/             database migrations
public/              facility materials and room assets
worker/              Cloudflare Worker entry point
agent-runner/        optional Chrome WebMCP agent runner
docs/screenshots/    project screenshots
```

## Inspiration

The project explores what changes when a game is built for an AI agent as the primary player. Instead of evaluating only visual navigation or button clicking, Agent Escape Room evaluates observation, tool use, memory, evidence linking, planning, and efficient reasoning in a persistent world.

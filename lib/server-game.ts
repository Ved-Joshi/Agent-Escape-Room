import { env } from "cloudflare:workers";
import {
  act,
  initialState,
  publicView,
  score,
  type GameAction,
  type GameState,
} from "@/lib/game";

const previewSessions = new Map<string, GameState>();
export async function loadSession(id: string) {
  try {
    const row = await env.DB.prepare(
      "SELECT state FROM game_sessions WHERE id = ?",
    )
      .bind(id)
      .first<{ state: string }>();
    return row ? (JSON.parse(row.state) as GameState) : null;
  } catch {
    return previewSessions.get(id) ?? null;
  }
}
export async function saveSession(id: string, state: GameState) {
  try {
    await env.DB.prepare(
      "INSERT INTO game_sessions (id, state, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP",
    )
      .bind(id, JSON.stringify(state))
      .run();
  } catch {
    previewSessions.set(id, state);
  }
}
function resultDiagnostics(
  before: GameState,
  after: GameState,
  action: GameAction,
) {
  const changes: string[] = [];
  const added = (a: string[], b: string[]) =>
    b.filter((value) => !a.includes(value));
  for (const [item, label] of [
    [added(before.inventory, after.inventory), "inventory"],
    [added(before.clues, after.clues), "evidence"],
    [added(before.unlocked, after.unlocked), "rooms unlocked"],
    [added(before.discovered, after.discovered), "objects inspected"],
    [added(before.solved, after.solved), "puzzles solved"],
  ] as [string[], string][]) {
    if (item.length) changes.push(`${label}: ${item.join(", ")}`);
  }
  if (before.currentRoom !== after.currentRoom)
    changes.push(`location: ${before.currentRoom} → ${after.currentRoom}`);
  if (before.nearObject !== after.nearObject)
    changes.push(`nearby target: ${after.nearObject ?? "none"}`);
  if (before.heading !== after.heading)
    changes.push(`heading: ${before.heading}° → ${after.heading}°`);
  const target = String(
      action.target ?? action.object ?? action.document ?? "",
    ).toLowerCase(),
    lines = [`STATE CHANGE: ${changes.length ? changes.join("; ") : "None"}.`];
  if (action.type === "inspect")
    lines.push(
      `OBJECT STATUS: ${after.discovered.includes(target) ? "Inspected" : "Not inspected"}.`,
    );
  if (action.type === "read")
    lines.push(
      `SOURCE STATUS: ${changes.some((x) => x.startsWith("evidence:")) ? "New evidence recorded" : "No new evidence; do not repeat this read"}.`,
    );
  if (action.type === "search")
    lines.push(
      `CONTAINER STATUS: ${changes.some((x) => x.startsWith("inventory:") || x.startsWith("evidence:")) ? "New content recovered" : "No new content; do not repeat this search"}.`,
    );
  if (
    !changes.length &&
    ["inspect", "read", "search", "interact", "code", "use"].includes(
      action.type,
    )
  )
    lines.push(
      "RECOVERY: This action produced no progress. Call get_available_actions, get_inventory, or get_known_clues before choosing a different objective.",
    );
  return lines.join("\n");
}
export async function executeGame(
  sessionId: string,
  action?: GameAction,
  toolCall = false,
) {
  let state = (await loadSession(sessionId)) ?? initialState(sessionId);
  state = {
    ...state,
    observed: state.observed ?? [],
    heading: state.heading ?? 0,
    navigationActions: state.navigationActions ?? 0,
    observationActions: state.observationActions ?? 0,
    visualActions: state.visualActions ?? 0,
    protocolEligible: state.protocolEligible ?? state.toolCalls > 0,
  };
  let result = "Session ready.";
  if (action) {
    const before = state;
    [state, result] = act(state, action);
    if (toolCall)
      result = `${result}\n\n${resultDiagnostics(before, state, action)}`;
    if (!toolCall)
      state = {
        ...state,
        visualActions: state.visualActions + 1,
        protocolEligible: false,
      };
  }
  if (toolCall && action) {
    state.toolCalls += 1;
    state.toolTrace = [
      ...(state.toolTrace ?? []).slice(-49),
      { name: action.type, args: action, result, at: Date.now() },
    ];
  }
  await saveSession(sessionId, state);
  if (
    state.escaped &&
    state.completedAt &&
    state.protocolEligible &&
    state.visualActions === 0 &&
    state.toolCalls > 0 &&
    state.agentName &&
    state.model
  ) {
    try {
      await env.DB.prepare(
        "INSERT INTO leaderboard (id, session_id, agent_name, model, effort, duration_ms, score, actions, tool_calls, incorrect_attempts, clues) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET agent_name=excluded.agent_name, model=excluded.model, effort=excluded.effort, duration_ms=excluded.duration_ms, score=excluded.score, actions=excluded.actions, tool_calls=excluded.tool_calls, incorrect_attempts=excluded.incorrect_attempts, clues=excluded.clues",
      )
        .bind(
          crypto.randomUUID(),
          sessionId,
          state.agentName,
          state.model,
          state.effort ?? "unspecified",
          state.completedAt - (state.benchmarkStartedAt ?? state.startedAt),
          Math.round(score(state)),
          state.actions,
          state.toolCalls,
          state.incorrectAttempts,
          state.clues.length,
        )
        .run();
    } catch {
      /* Local preview has no durable leaderboard. */
    }
  }
  return { state, result, view: publicView(state) };
}
export function validSession(id: string) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(id);
}

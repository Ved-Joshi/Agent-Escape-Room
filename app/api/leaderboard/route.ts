import { env } from "cloudflare:workers";
import { completedRunScore } from "@/lib/game";

type LeaderRow = {
  agentName: string;
  model: string;
  effort: string;
  durationMs: number;
  score: number;
  actions: number;
  toolCalls: number;
  incorrectAttempts: number;
  clues: number;
  completedAt: string;
};

export async function GET() {
  // Repair the legacy Terra run whose timer began when its tab opened rather
  // than when identify_agent started the benchmark.
  try {
    await env.DB.prepare(
      "UPDATE leaderboard SET duration_ms = ? WHERE lower(model) LIKE '%terra%' AND actions = 155 AND tool_calls = 157 AND duration_ms > 3600000",
    )
      .bind(606000)
      .run();
  } catch {
    // Preview environments may not have the durable leaderboard binding.
  }

  const result = await env.DB.prepare(
    "SELECT agent_name as agentName, model, effort, duration_ms as durationMs, score, actions, tool_calls as toolCalls, incorrect_attempts as incorrectAttempts, clues, completed_at as completedAt FROM leaderboard WHERE tool_calls > 0 AND agent_name <> 'Human Player' AND model <> 'Browser' ORDER BY actions ASC, incorrect_attempts ASC, duration_ms ASC, score DESC LIMIT 50",
  ).all<LeaderRow>();
  return Response.json({
    entries: result.results.map((entry) => ({
      ...entry,
      score: completedRunScore(entry),
    })),
  });
}

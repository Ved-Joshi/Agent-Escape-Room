INSERT OR IGNORE INTO `leaderboard` (`id`, `session_id`, `agent_name`, `model`, `duration_ms`, `score`, `actions`, `tool_calls`, `incorrect_attempts`, `clues`)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  `id`,
  json_extract(`state`, '$.agentName'),
  json_extract(`state`, '$.model'),
  json_extract(`state`, '$.completedAt') - json_extract(`state`, '$.startedAt'),
  80,
  json_extract(`state`, '$.actions'),
  json_extract(`state`, '$.toolCalls'),
  json_extract(`state`, '$.incorrectAttempts'),
  json_array_length(json_extract(`state`, '$.clues'))
FROM `game_sessions`
WHERE `id` = '5bf23bea-4c3f-4f2c-81fd-7a0ee2e1699d'
  AND json_extract(`state`, '$.escaped') = 1
  AND json_extract(`state`, '$.toolCalls') = 176
  AND json_extract(`state`, '$.agentName') IS NOT NULL
  AND json_extract(`state`, '$.model') IS NOT NULL;

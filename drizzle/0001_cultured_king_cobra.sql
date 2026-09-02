CREATE TABLE `leaderboard` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`model` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`score` integer NOT NULL,
	`actions` integer NOT NULL,
	`tool_calls` integer NOT NULL,
	`incorrect_attempts` integer NOT NULL,
	`clues` integer NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_session_id_unique` ON `leaderboard` (`session_id`);
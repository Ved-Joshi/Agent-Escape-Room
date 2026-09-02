ALTER TABLE `leaderboard` ADD `effort` text DEFAULT 'unspecified' NOT NULL;
--> statement-breakpoint
UPDATE `leaderboard` SET `effort` = 'low' WHERE `session_id` = '5bf23bea-4c3f-4f2c-81fd-7a0ee2e1699d';

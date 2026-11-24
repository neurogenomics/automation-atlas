CREATE TABLE IF NOT EXISTS `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL DEFAULT '',
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);

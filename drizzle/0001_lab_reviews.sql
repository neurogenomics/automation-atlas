-- Lab membership and protocol reviews (#105). Same arrangement as the Graph
-- Workshop: ChatGPT Sites sign-in, an owner set by the OWNER_EMAIL runtime
-- setting, members admitted by invitation or the owner's approval.
CREATE TABLE IF NOT EXISTS `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL DEFAULT 'member',
	`status` text NOT NULL DEFAULT 'pending',
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invites` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL DEFAULT 'member',
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'open',
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_responses` (
	`review_id` text NOT NULL,
	`step_id` text NOT NULL,
	`user_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`review_id`, `step_id`, `user_id`)
);

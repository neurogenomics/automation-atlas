CREATE TABLE `login_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`method` text NOT NULL,
	`member_id` text,
	`return_to` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_flow_expiry` ON `login_flows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`member_id` text NOT NULL,
	`email` text NOT NULL,
	`method` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_identity_subject` ON `login_identities` (`issuer`,`subject`);--> statement-breakpoint
CREATE INDEX `login_identity_member` ON `login_identities` (`member_id`);--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_session_expiry` ON `login_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `login_session_member` ON `login_sessions` (`member_id`,`created_at`);
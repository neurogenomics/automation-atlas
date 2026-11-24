CREATE TABLE `lab_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lab_protocols` (
	`collection_id` integer PRIMARY KEY NOT NULL,
	`version_id` integer NOT NULL,
	`version_number` integer,
	`name` text NOT NULL,
	`labstep_updated_at` text DEFAULT '' NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`pushed_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lab_push_keys` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);

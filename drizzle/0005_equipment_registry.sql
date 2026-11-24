CREATE TABLE `registry_assessments` (
	`org_id` text NOT NULL,
	`id` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`visibility` text NOT NULL,
	`refs` text NOT NULL,
	PRIMARY KEY(`org_id`, `id`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `registry_members` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `registry_members_user` ON `registry_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `registry_organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`claims` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `registry_publications` (
	`org_id` text NOT NULL,
	`record_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`actor` text NOT NULL,
	`decided_at` text NOT NULL,
	`projection` text,
	PRIMARY KEY(`org_id`, `record_id`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `registry_revisions`(`revision_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `registry_public_id` ON `registry_publications` (`record_id`);--> statement-breakpoint
CREATE TABLE `registry_revisions` (
	`org_id` text NOT NULL,
	`record_id` text NOT NULL,
	`seq` integer NOT NULL,
	`revision_id` text NOT NULL,
	`visibility` text NOT NULL,
	`state` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`observed_at` text NOT NULL,
	`expires_at` text,
	`wire` text NOT NULL,
	PRIMARY KEY(`org_id`, `record_id`, `seq`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_revision_id` ON `registry_revisions` (`revision_id`);--> statement-breakpoint
CREATE TRIGGER registry_revision_no_update BEFORE UPDATE ON registry_revisions
BEGIN
	SELECT RAISE(ABORT, 'Registry revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER registry_revision_no_delete BEFORE DELETE ON registry_revisions
BEGIN
	SELECT RAISE(ABORT, 'Registry revisions are immutable');
END;

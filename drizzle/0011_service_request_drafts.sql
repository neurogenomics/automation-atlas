CREATE TABLE `registry_request_drafts` (
	`org_id` text NOT NULL,
	`id` text NOT NULL,
	`actor` text NOT NULL,
	`assessment_id` text NOT NULL,
	`key_digest` text NOT NULL,
	`input_digest` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`draft` text NOT NULL,
	PRIMARY KEY(`org_id`, `id`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_request_actor_key` ON `registry_request_drafts` (`org_id`,`actor`,`key_digest`);
--> statement-breakpoint
CREATE TRIGGER registry_request_draft_no_update BEFORE UPDATE ON registry_request_drafts
BEGIN
  SELECT RAISE(ABORT, 'Registry request drafts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER registry_request_draft_no_delete BEFORE DELETE ON registry_request_drafts
BEGIN
  SELECT RAISE(ABORT, 'Registry request drafts are immutable');
END;

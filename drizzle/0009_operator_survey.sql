CREATE TABLE `registry_survey_drafts` (
	`org_id` text NOT NULL,
	`actor` text NOT NULL,
	`record_id` text NOT NULL,
	`version` text NOT NULL,
	`target` text NOT NULL,
	`payload` text NOT NULL,
	`reviewed_policy_id` text,
	PRIMARY KEY(`org_id`, `actor`, `record_id`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);

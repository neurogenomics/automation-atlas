CREATE TABLE `registry_pilot_revisions` (
	`org_id` text NOT NULL,
	`cohort_id` text NOT NULL,
	`seq` integer NOT NULL,
	`version` text NOT NULL,
	`actor` text NOT NULL,
	`saved_at` text NOT NULL,
	`reason` text NOT NULL,
	`snapshot` text NOT NULL,
	PRIMARY KEY(`org_id`, `cohort_id`, `seq`),
	FOREIGN KEY (`org_id`) REFERENCES `registry_organisations`(`id`) ON UPDATE no action ON DELETE no action
);

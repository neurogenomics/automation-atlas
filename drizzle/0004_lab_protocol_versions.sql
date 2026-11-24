CREATE TABLE `lab_protocol_versions` (
	`collection_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `version_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `lab_protocols`(`collection_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TRIGGER lab_protocol_archive_previous
AFTER UPDATE OF version_id ON lab_protocols
WHEN OLD.version_id <> NEW.version_id
BEGIN
  INSERT INTO lab_protocol_versions (collection_id, version_id, data, updated_at)
  VALUES (OLD.collection_id, OLD.version_id, OLD.data, OLD.updated_at);
END;

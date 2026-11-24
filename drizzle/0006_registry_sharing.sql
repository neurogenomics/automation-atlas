ALTER TABLE `registry_publications` ADD `policy_id` text;--> statement-breakpoint
ALTER TABLE `registry_publications` ADD `restricted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `registry_publications` ADD `disclosure` text;
--> statement-breakpoint
CREATE VIEW registry_record_links AS
  SELECT org_id, record_id, json_extract(wire, '$.record.installation.record_id') AS linked_id
    FROM registry_revisions WHERE json_extract(wire, '$.record.record_type') = 'configuration'
  UNION ALL
  SELECT org_id, record_id, json_extract(wire, '$.record.target.record_id')
    FROM registry_revisions WHERE json_extract(wire, '$.record.record_type') = 'assertion'
  UNION ALL
  SELECT r.org_id, r.record_id, json_extract(j.value, '$.record_id')
    FROM registry_revisions r, json_each(r.wire, '$.record.related_assertions') j
    WHERE json_extract(r.wire, '$.record.record_type') = 'assertion';

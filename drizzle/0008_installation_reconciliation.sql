ALTER TABLE registry_revisions ADD COLUMN installation_event text;
--> statement-breakpoint
DROP VIEW registry_record_links;
--> statement-breakpoint
-- D1 limits the terms in each compound SELECT. Group link families separately.
CREATE VIEW registry_record_links (org_id, record_id, revision_id, linked_id, linked_revision_id, edge) AS
WITH
  direct_links (org_id, record_id, revision_id, linked_id, linked_revision_id, edge) AS (
    SELECT org_id, record_id, revision_id,
      json_extract(wire, '$.record.installation.record_id'),
      json_extract(wire, '$.record.installation.revision_id'), 'installation'
      FROM registry_revisions WHERE json_extract(wire, '$.record.record_type') = 'configuration'
    UNION ALL
    SELECT org_id, record_id, revision_id,
      json_extract(wire, '$.record.target.record_id'), json_extract(wire, '$.record.target.revision_id'), 'target'
      FROM registry_revisions WHERE json_extract(wire, '$.record.record_type') IN ('assertion','access_claim','availability_claim')
    UNION ALL
    SELECT org_id, record_id, revision_id,
      json_extract(installation_event, '$.target.record_id'), json_extract(installation_event, '$.target.revision_id'), 'reconciliation'
      FROM registry_revisions WHERE action IN ('duplicate_link','duplicate_unlink')
  ),
  assertion_links (org_id, record_id, revision_id, linked_id, linked_revision_id, edge) AS (
    SELECT r.org_id, r.record_id, r.revision_id, json_extract(j.value, '$.record_id'), json_extract(j.value, '$.revision_id'), 'assertion'
      FROM registry_revisions r, json_each(r.wire, '$.record.related_assertions') j
      WHERE json_extract(r.wire, '$.record.record_type') = 'assertion'
    UNION ALL
    SELECT r.org_id, r.record_id, r.revision_id, json_extract(j.value, '$.record_id'), json_extract(j.value, '$.revision_id'), 'assertion'
      FROM registry_revisions r, json_each(r.wire, '$.record.supporting_assertions') j
      WHERE json_extract(r.wire, '$.record.record_type') IN ('access_claim','availability_claim')
  ),
  offer_links (org_id, record_id, revision_id, linked_id, linked_revision_id, edge) AS (
    SELECT r.org_id, r.record_id, r.revision_id, json_extract(j.value, '$.record_id'), json_extract(j.value, '$.revision_id'), 'installation'
      FROM registry_revisions r, json_each(r.wire, '$.record.backing_installations') j
      WHERE json_extract(r.wire, '$.record.record_type') = 'offer' AND j.type = 'object'
    UNION ALL
    SELECT r.org_id, r.record_id, r.revision_id, json_extract(j.value, '$.record_id'), json_extract(j.value, '$.revision_id'), 'configuration'
      FROM registry_revisions r, json_each(r.wire, '$.record.backing_configurations') j
      WHERE json_extract(r.wire, '$.record.record_type') = 'offer' AND j.type = 'object'
    UNION ALL
    SELECT org_id, record_id, revision_id, json_extract(wire, '$.record.access_policy.facility_default.source.native_id'),
      json_extract(wire, '$.record.access_policy.facility_default.source.version'), 'facility_default'
      FROM registry_revisions WHERE json_extract(wire, '$.record.record_type') = 'offer'
        AND json_extract(wire, '$.record.access_policy.facility_default.source.namespace') = 'planner:registry_offer'
  )
  SELECT org_id, record_id, revision_id, linked_id, linked_revision_id, edge FROM direct_links
  UNION ALL
  SELECT org_id, record_id, revision_id, linked_id, linked_revision_id, edge FROM assertion_links
  UNION ALL
  SELECT org_id, record_id, revision_id, linked_id, linked_revision_id, edge FROM offer_links;
--> statement-breakpoint
CREATE VIEW registry_active_duplicates AS
  SELECT r.org_id, r.record_id AS source_id, r.revision_id,
    json_extract(r.installation_event, '$.target.record_id') AS target_id
  FROM registry_revisions r
  WHERE r.action = 'duplicate_link' AND NOT EXISTS (
    SELECT 1 FROM registry_revisions n
    WHERE n.org_id = r.org_id AND n.record_id = r.record_id AND n.seq > r.seq
  );
--> statement-breakpoint
CREATE TRIGGER registry_duplicate_unlink_guard BEFORE INSERT ON registry_revisions
WHEN NEW.action != 'duplicate_unlink' AND EXISTS (
  SELECT 1 FROM registry_active_duplicates d WHERE d.org_id = NEW.org_id AND d.source_id = NEW.record_id
)
BEGIN
  SELECT RAISE(ABORT, 'A duplicate installation requires an explicit unlink');
END;

import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  user_id: text("user_id").primaryKey().notNull(),
  email: text("email").notNull().default(""),
  data: text("data").notNull(),
  updated_at: integer("updated_at").notNull(),
});
export const members = sqliteTable("members", {
  user_id: text("user_id").primaryKey().notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  joined_at: integer("joined_at").notNull(),
});
export const invites = sqliteTable("invites", {
  email: text("email").primaryKey().notNull(),
  role: text("role").notNull().default("member"),
  invited_by: text("invited_by").notNull(),
  created_at: integer("created_at").notNull(),
});
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey().notNull(),
  title: text("title").notNull(),
  author_id: text("author_id").notNull(),
  status: text("status").notNull().default("open"),
  data: text("data").notNull(),
  created_at: integer("created_at").notNull(),
});
export const review_responses = sqliteTable("review_responses", {
  review_id: text("review_id").notNull(),
  step_id: text("step_id").notNull(),
  user_id: text("user_id").notNull(),
  data: text("data").notNull(),
  updated_at: integer("updated_at").notNull(),
}, (t) => [primaryKey({ columns: [t.review_id, t.step_id, t.user_id] })]);
// Google and email/password sign-in (#132), as on the Graph Workshop. members.user_id
// stays the canonical identity (the ChatGPT id for people who started there);
// these map each linked login to it. Only hashes of sessions and flow handles are kept.
export const login_identities = sqliteTable("login_identities", {
  id: text("id").primaryKey().notNull(),
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  member_id: text("member_id").notNull(),
  email: text("email").notNull(),
  method: text("method").notNull(),
  created_at: integer("created_at").notNull(),
}, (t) => [uniqueIndex("login_identity_subject").on(t.issuer, t.subject), index("login_identity_member").on(t.member_id)]);
export const login_sessions = sqliteTable("login_sessions", {
  hash: text("hash").primaryKey().notNull(),
  member_id: text("member_id").notNull(),
  identity_id: text("identity_id").notNull(),
  created_at: integer("created_at").notNull(),
  expires_at: integer("expires_at").notNull(),
}, (t) => [index("login_session_expiry").on(t.expires_at), index("login_session_member").on(t.member_id, t.created_at)]);
export const login_flows = sqliteTable("login_flows", {
  state_hash: text("state_hash").primaryKey().notNull(),
  browser_hash: text("browser_hash").notNull(),
  verifier: text("verifier").notNull(),
  nonce: text("nonce").notNull(),
  method: text("method").notNull(),
  member_id: text("member_id"),
  return_to: text("return_to").notNull(),
  created_at: integer("created_at").notNull(),
  expires_at: integer("expires_at").notNull(),
}, (t) => [index("login_flow_expiry").on(t.expires_at)]);
// The lab's own protocols, imported from Labstep (#145; approved by Nathan 6 Nov 2026).
// One row per Labstep protocol collection, holding the exact version last pushed.
// Only active lab members can read them. They are pushed from the owner's computer,
// where the Labstep key stays, with a push key the owner approved (only its hash is kept).
export const lab_protocols = sqliteTable("lab_protocols", {
  collection_id: integer("collection_id").primaryKey().notNull(),
  version_id: integer("version_id").notNull(),
  version_number: integer("version_number"),
  name: text("name").notNull(),
  labstep_updated_at: text("labstep_updated_at").notNull().default(""),
  content_hash: text("content_hash").notNull().default(""),
  data: text("data").notNull(),
  pushed_by: text("pushed_by").notNull(),
  updated_at: integer("updated_at").notNull(),
});
export const lab_protocol_versions = sqliteTable("lab_protocol_versions", {
  collection_id: integer("collection_id").notNull().references(() => lab_protocols.collection_id, {onDelete: "cascade"}),
  version_id: integer("version_id").notNull(),
  data: text("data").notNull(),
  updated_at: integer("updated_at").notNull(),
}, (t) => [primaryKey({columns: [t.collection_id, t.version_id]})]);
export const lab_push_keys = sqliteTable("lab_push_keys", {
  hash: text("hash").primaryKey().notNull(),
  member_id: text("member_id").notNull(),
  label: text("label").notNull(),
  created_at: integer("created_at").notNull(),
  last_used_at: integer("last_used_at"),
});
// The instruments the lab can use (#145), one list for the whole lab. Active members
// read it; the owner edits it on the Equipment page or pushes it with a push key.
export const lab_equipment = sqliteTable("lab_equipment", {
  id: text("id").primaryKey().notNull(),
  data: text("data").notNull(),
  updated_by: text("updated_by").notNull(),
  updated_at: integer("updated_at").notNull(),
});

// The registry keys use canonical Planner identities, without private lab membership.
export const registryOrganisations = sqliteTable("registry_organisations", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  claims: text().notNull(),
  created_by: text().notNull(),
  created_at: text().notNull(),
});
export const registryMembers = sqliteTable("registry_members", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  user_id: text().notNull(),
  role: text().notNull(),
  updated_by: text().notNull(),
  updated_at: text().notNull(),
}, (t) => [primaryKey({ columns: [t.org_id, t.user_id] }), index("registry_members_user").on(t.user_id)]);
export const registryRevisions = sqliteTable("registry_revisions", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  record_id: text().notNull(),
  seq: integer().notNull(),
  revision_id: text().notNull(),
  visibility: text().notNull(),
  state: text().notNull(),
  action: text().notNull(),
  actor: text().notNull(),
  observed_at: text().notNull(),
  expires_at: text(),
  wire: text().notNull(),
  service: text(),
  installation_event: text(),
}, (t) => [primaryKey({ columns: [t.org_id, t.record_id, t.seq] }), uniqueIndex("registry_revision_id").on(t.revision_id)]);
export const registryPublications = sqliteTable("registry_publications", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  record_id: text().notNull(),
  revision_id: text().notNull().references(() => registryRevisions.revision_id),
  actor: text().notNull(),
  decided_at: text().notNull(),
  projection: text(),
  policy_id: text(),
  restricted: integer().notNull().default(0),
  disclosure: text(),
}, (t) => [primaryKey({ columns: [t.org_id, t.record_id] }), index("registry_public_id").on(t.record_id)]);
export const registryAssessments = sqliteTable("registry_assessments", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  id: text().notNull(),
  actor: text().notNull(),
  created_at: text().notNull(),
  visibility: text().notNull(),
  refs: text().notNull(),
  match_input: text(),
}, (t) => [primaryKey({ columns: [t.org_id, t.id] })]);

// Private, resumable operator drafts. They are not shared registry revisions.
export const registrySurveyDrafts = sqliteTable("registry_survey_drafts", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  actor: text().notNull(),
  record_id: text().notNull(),
  version: text().notNull(),
  target: text().notNull(),
  payload: text().notNull(),
  reviewed_policy_id: text(),
}, (t) => [primaryKey({ columns: [t.org_id, t.actor, t.record_id] })]);

// Append-only private pilot snapshots. They never participate in public projections.
export const registryPilotRevisions = sqliteTable("registry_pilot_revisions", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  cohort_id: text().notNull(),
  seq: integer().notNull(),
  version: text().notNull(),
  actor: text().notNull(),
  saved_at: text().notNull(),
  reason: text().notNull(),
  snapshot: text().notNull(),
}, (t) => [primaryKey({ columns: [t.org_id, t.cohort_id, t.seq] })]);

// An actor's immutable local request preparation and idempotency ledger.
export const registryRequestDrafts = sqliteTable("registry_request_drafts", {
  org_id: text().notNull().references(() => registryOrganisations.id),
  id: text().notNull(),
  actor: text().notNull(),
  assessment_id: text().notNull(),
  key_digest: text().notNull(),
  input_digest: text().notNull(),
  created_at: text().notNull(),
  expires_at: text().notNull(),
  draft: text().notNull(),
}, (t) => [primaryKey({ columns: [t.org_id, t.id] }),
  uniqueIndex("registry_request_actor_key").on(t.org_id, t.actor, t.key_digest)]);

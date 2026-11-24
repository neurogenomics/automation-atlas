# Equipment registry (#297, #300, #298, #286, #305 and #303)

The Planner Worker owns organisation-scoped installation and evidence reports.
Its registry membership is separate from private lab admission. It uses the
canonical Planner sign-in identity; a bad Planner session fails closed. Creation
assigns the caller a new opaque organisation ID. Names, domains and external
identifiers are unverified claims, including when two workspaces use the same
name or identifier. An owner can grant or revoke a role for an **exact canonical
Planner user ID**. There is no email or domain matching, invitation sending,
automatic enrolment, or institutional verification.

| Registry role | Organisation and public candidate records | Restricted records | Members, publication and backup |
| --- | --- | --- | --- |
| Owner | Read, create, correct, review, retire and restore | Read, create, correct, review, retire and restore | Manage |
| Editor | Read, create, correct, retire and restore | No access | No access |
| Reviewer | Read and review | Read, create, correct, review, retire and restore | No access |

The original record visibility stays fixed across its immutable history.
An owner can add an application restriction for owner and reviewer reads.
That restriction covers every revision and other records that refer to the
restricted record, including indirect references. Lifting an application
restriction restores at most the original tier. Reviewer write permissions
still use the record's original tier. Record reads report original
`visibility` and the current `effective_visibility`.

Owners can publish a projection from a reviewed public installation or
installation group with dated sources and declared public discovery and
republication rights. Its required fields are the record and revision IDs,
record kind, label, observation date, and reported assurance. The owner may
explicitly include a known group count and select up to five eligible source
links. Each selected link contains only its HTTPS URL and observation date.
Links with credentials, a query, or a fragment are ineligible. Location,
actor, membership, source proof, and access details stay in the registry.

Changing a record revision, restricting it, revoking release, or reaching
its expiry removes the projection. Lifting a restriction requires a fresh
publication decision for any anonymous release.

## Planner browser

Open **Registry** to browse published reports, or use
`/web/index.html#registry/public/<record-id>` for a stable report link. The
detail reflects the current published revision and becomes unavailable if
that projection expires, is revised, restricted, or withdrawn.

Choose **Contribution workspace** and sign in to create or select a workspace.
To join someone else's workspace, give its owner the exact Planner user ID shown
there. The workspace shows its distinct organisation ID and your registry role.
Names and affiliations are unverified; app roles never grant private lab access.

The normal form captures an individual installation, a group with a reported
count or unknown count, a configuration with fitted, absent or unknown modules,
an evidence assertion, a service offer or facility default, or a dated access or
availability claim. Linked records use exact revisions. Record the observation
date, source locators and declared use rights. Load more target revisions from
the form when the workspace has more reports. The exact JSON editor handles Atlas
model pins, identifiers and joint operating envelopes with evidence pointers.
Save a correction against the revision you opened. On conflict the draft stays
in that tab beside the latest readable revision. Reload to start a new correction
after comparing them. Exact history preserves observations, sources and review
actions. Registry forms have no profile sync, local storage or automatic upload.

Owners can restrict visibility, preview the allowed dated projection, and choose
whether to publish or withdraw it. Changing the selected fields invalidates the
preview. The workspace can also show which dependent assessments need recheck
and explicitly download a private backup. The workspace is also where contributors
describe service terms and check reported fit. Service records and assessment
inputs have no anonymous projection. Browser contributions do not verify
provider roles or approve access, availability, bookings or execution.

### Operator survey and enquiries

From a workspace report, open **Operator inventory survey** on an installation
or configuration. The seven steps cover heads and modules, labware and
handling, drivers/software and connections, trained support, offered methods,
booking, and charges. Read the report and its dated sources above the survey.
The form starts with unknown; blanks are not observations. An answer can
separately mark reported present, reported absent, unknown, or refer the
question to an operator role. Entries are reported by the signed-in user and
do not update the Registry record or match engine until a separate evidence
report and, where required, review are recorded.

**Save and continue** stores the answers and next step in the account's
workspace draft. Reopen the same report to resume. An observation can cite a
dated, opaque reference or SHA-256 digest. Selecting a local file computes
only its digest in the browser; no filename, file bytes or link is sent.
Each connection needs an exact endpoint and interface, a separate reported
status and dated evidence. Connections are linked to their exact installation
and, when applicable, configuration revision. A reported connection does not
establish unattended interoperability. If the equipment head changes, the
survey must explicitly adopt the current head; unchanged connections keep
their original pins. Concurrent draft edits preserve the form and return
409 rather than overwriting the saved draft.

Select general questions for an enquiry and set its status to ready for
review. A Registry owner can approve their own saved preview against its
exact draft version, record head and sharing policy. The preview contains
only fixed question text for the selected topics. There is no public survey
URL, and no answers, references, contacts, account IDs or assessment context
are inserted. Users can review the text before copying it; the application
never sends it. Any authenticated editor/reviewer with record access can keep
a private draft; the owner approval does not grant provider authority.
Drafts are account-private working data in the hosted database, separate from
the profile and browser storage. The organisation owner's archive does not
export or restore these drafts, including the owner's own. The author can save
the authenticated survey GET response as a private JSON reference. To restore
into the same exact equipment head, read the current draft version, then
submit only its saved `draft` with the fresh expected version (null for an
empty slot) and exact current head. Reset any reviewed enquiry to ready for
review. Compare each saved connection's full equipment pins before removing
the server-generated `pins` properties from the write payload; only include
connections whose pins still match the exact current equipment. Keep historical
or inaccessible bindings in the private reference rather than claiming them
for a newer configuration. Do not use this procedure to copy a draft to a
different author or workspace.

After building, run `npm run test:registry-browser` for the built Worker and
SQLite lifecycle in Chromium. To save synthetic screenshots, set
`REGISTRY_SCREENSHOTS_DIR` to a local output directory outside the repository.

## Routes

Prefix the private paths below with `/api/registry/organisations`. Writes take
same-origin JSON; JSON duplicate keys, decimals/exponents, invalid UTF-8 and
unknown fields fail admission. Unknown or inaccessible tenants and guessed
record IDs return 404. GET responses are not cached.

| Method and path | Purpose and body |
| --- | --- |
| `GET /` and `POST /` | List the caller's canonical `user_id` and memberships; create with `{name, claims?}`. Use the prefix without a trailing slash. Each claim has `kind` (`domain` or `external_id`), `value`, `observed_at` (date), and optional `source_url`. |
| `GET /:org/members`, `POST /:org/members` | Owner lists members or sets `{user_id, role}`, where `role` is `editor`, `reviewer`, or `null` to revoke. |
| `GET /:org/records`, `POST /:org/records` | List visible heads or create an immutable record. List pagination uses `?after=<next_after>`. |
| `GET /:org/records/:id`, `GET /:org/records/:id/history` | Read the head or ordered exact revisions, respectively. History pagination uses `?after=<next_after>`. |
| `POST /:org/records/:id/revisions` | Submit a correction with the creation fields and `expected_head`. Copy actions take only `{expected_head, action}`. |
| `GET /:org/records/:id/reconciliation` | Read the canonical pin and visible linked duplicate sources for an individual installation. |
| `POST /:org/records/:id/reconciliation` | Owner links or unlinks a duplicate with `{action, expected_head, expected_target, observed_at, reason, source_url?}`. |
| `POST /:org/records/:id/move` | Record a dated location change with `{expected_head, observed_at, reason, reported_location, source}`. |
| `GET /:org/records/:id/survey`, `POST /:org/records/:id/survey` | Read or save an account-private inventory draft. A write takes `{expected_head, expected_version, draft, acknowledge_repin?, review?, expected_policy_id?}`; use a null version on first save. The owner reviews an unchanged draft and exact sharing policy. |
| `POST /:org/records/:id/refresh-matches` | Recompute the author's affected matches for an exact offer and dated, reviewed training report: `{expected_head, reviewed_answer}`. |
| `POST /:org/records/:id/match` | Check a pinned service offer against a symbolic request; optionally save its inputs and result. See below. |
| `GET /:org/records/:id/claims` | List visible assertion heads, their exact-target currentness and conflicting claim kinds. |
| `GET /:org/records/:id/sharing` | Owner reads the current sharing policy ID, exact head, publication, and eligible fields. |
| `POST /:org/records/:id/sharing` | Owner changes the restriction with `{expected_head, expected_policy_id, restricted}`. |
| `POST /:org/records/:id/publication-preview` | Owner previews the exact public projection with `{expected_head, expected_policy_id, fields?}`. The preview makes no changes. |
| `POST /:org/records/:id/publication` | Owner publishes or revokes with `{expected_head, expected_policy_id, publish, fields?}`. |
| `GET /api/registry/public`, `GET /api/registry/public/:id` | Browse current public projections or read one by ID. The list returns `publications` and `next_after`. Pass `?limit=25&after=<next_after>` to continue. The page size ranges from 1 to 50. |
| `GET /:org/assessments`, `GET /:org/assessments/:id`, `POST /:org/assessments` | Read dependency currentness; pin with `{visibility, references}`. Assessment visibility is `organisation` or `restricted`. |
| `GET /:org/backup` | Owner exports protected registry data and current sharing and publication state. |

Use `GET /:org/assessments?limit=25` for history beyond 100 captures. This returns
`assessments` and `next_after`. Pass the returned cursor as the URL-encoded
`after` parameter. Page sizes are 1–50. Pagination follows creation time and ID,
and each read uses current membership and visibility. Exact detail and the
legacy unpaged response keep their previous contract. The browser's
**Dependent assessments** section appends pages using **More dependent assessments**.

A creation payload has `visibility` (`organisation`, `restricted` or
`public`), `observed_at` (date), `expires_at` (timestamp or null),
`use_rights`, `sources`, and the typed `record` body. The server creates the
IDs, recorded time, content digest and exact predecessor; it assigns the
reporter on new assertions. `expected_head` has `schema_version`,
`organisation_id`, `record_type`, `record_id`, `revision_id`, and
`content_digest`. SQLite appends a revision only if the expected head and
write role still match. Competing updates return 409. A sharing or publication
decision compares both the exact current head and `expected_policy_id` in
the same SQLite statement, then returns the new policy ID. Pass `null`
before the first policy decision, including for a legacy publication. The
optional `fields` object accepts `reported_count: true` and
`source_indices: [0, …]` from the owner sharing read's `eligible_fields`.
Omit `fields` for the base projection. Use the same pins and selection for
preview and release. Revisions are immutable
in the database. A correction adds a successor; retirement keeps history, and
restore appends an active successor. Copy actions are `review`,
`review_disputed`, `withdraw`, `supersede`, `retire`, and `restore`.
Review preserves the report, and withdrawal or supersession changes only the
assertion lifecycle. Offers can be withdrawn with a review action. Access and
availability reports can be withdrawn by retiring them; a later restore is
explicit and preserves the withdrawal in history. Review never grants provider
authority. Opposing current
claims remain independently visible to permitted readers, with truth and
authority unresolved.

The Worker validates the exact [agentic-lab release](https://github.com/neurogenomics/agentic-lab/pull/112)
at `e0295ebcd485b100150773e6f9c2e9497a5bbd45` from the checksum-pinned local
schema closure. It supports `installation`, `installation_group`,
`configuration`, `assertion`, `offer`, `access_claim` and
`availability_claim`. Restricted visibility is a Planner access
class, represented on the wire as `organisation_private`. Verification
includes the canonical `agentic-lab/review-json/1` digest and exact registry
references. An Atlas model pin or a captured source locator is retained as
reported provenance; this Worker does not fetch or authenticate external
records. Typed thresholds retain their evidence pointers, and an envelope
stays one set of joint limits. No configuration, group count, or application
review establishes technical fit, availability, access approval, custody
verification, or execution authority.

Assessment pins include the exact referenced configurations, installations and
assertions used as dependencies, including linked registry revisions. They
require declared assessment rights and stay available for historical review.
When any pin is revised, retired, withdrawn, disputed or expires, a fresh read
reports the affected exact reference and its current head. A dependency
the viewer can no longer read appears only as `{status: "unavailable"}`.
This checks revision and lifecycle currentness. No live directory records are included.

## Private workflow comparisons

Open an individual installation and expand **Compare a workflow on this installation**. Select a pinned workflow and its review reference. Optionally select a current Registry configuration linked to that exact installation revision. Choose a catalogue model and enter reported fitted channel counts to explore a hardware hypothesis. The comparison shows dated Registry inventory, the planning assumptions, the baseline and proposed assignments, modeled liquid balance per vessel, named fractions, and exact source pins. The result is available as a private download. **Choose a protocol block** limits the comparison to the selected contiguous range of exact source steps. State the starting vessel, volume and evidence reference. An unknown volume withholds a numeric estimate for the block.

`POST /api/registry/organisations/:org/records/:id/planning-v1` accepts the exact `expected_head`, a `configuration` reference or null, the planning `protocol`, a `decision` with `workload` and optional `objective`, the `planner_model_id`, and a `head_hypothesis` array or null. It uses the normal evaluator in upgrade scope with method changes disabled. The Worker checks current visibility, rights, expiry and exact pins before evaluation and again before returning the result. The digest binds the Registry pins to the exact evaluator and planning input. Replay submits the same inputs and checks currentness again. The request and result are processed in memory. Booking, installed fit and transport reach require their own evidence.

The private work map includes `transport_review` when a provisional route exists. It groups modeled handoffs by direction and distinguishes initial loading from subsequent moves. Initial loading is included in setup. The other operator minutes are planning estimates. The station labels refer to modeled positions. Exact reach, labware, station interface and recovery need evidence before a connection can earn automation credit.

Optional `module_hypotheses` pairs an inventory `module_id` on the exact configuration with a model option’s `option_key`. Use it only when the report refers to that option. A mapped reported absence excludes the option in the scenario, including when a fitted report conflicts with the absence. Mapped fitted and unknown reports remain provisional. The result names the mapping, the reported states and the effect. The binding digest includes the resolved mappings for replay.

**Download replay file** saves the exact workflow descriptor, review reference, Registry pins, scenario choices and binding digest. The file contains neither protocol snapshots nor result rows. On the installation card, **Reopen a private comparison** rebuilds the request from the available local workflow and authorized sources. The Worker rechecks current permissions, pins and the evaluator, and publishes only the fresh matching result. Optional `replay_digest` on `planning-v1` requires the returned binding to match and refuses changes with 409.

## Installation reconciliation and dated moves

Open an individual installation in the workspace to link it as a duplicate
of another active installation. The registry owner chooses the canonical
record and its exact current revision, then supplies a date, reason and
optional HTTPS evidence locator. Names, models and external IDs remain
reported evidence. The SQLite write checks both same-organisation heads and
owner membership. A report with incoming duplicate links remains canonical
until its links are removed. This keeps active links direct and acyclic.

The link adds a retired revision to the duplicate source. Both IDs, original
reports, assertions and revision histories remain readable within their
current permissions. The canonical report retains its original head. Its
workspace summary shows only the linked reports the viewer may read. The
source history inherits restrictions from its exact canonical target, even
after an unlink. The source leaves public results and selection for new
configurations and services. New backing pins through an existing
configuration also cannot select a linked duplicate. Existing evidence keeps
its exact pins and needs recheck when the installation head changes.
The historical reconciliation edge affects privacy. After an unlink, it
does not make the former canonical report an input to a new assessment.

Use **Unlink duplicate** to correct a decision. This action pins the current
source and target heads and adds an active source revision. A generic restore
cannot remove a duplicate link. Linking and unlinking both end the previous
public projection. Any new publication still requires a fresh review and
explicit owner release.

Use **Record dated location change** to update an active individual
installation. The same roles that can correct that installation can record
the change. Supply its date, reason and a dated source locator. A blank
location reports that the new location is unknown. The old and new locations
remain on their exact revisions. The move date and evidence have their own
fields, preserving the original report's observation date and expiry.
Moves change the installation report within its organisation. They do not
transfer custody or authority. Group reports stay outside this workflow.

Migration `0008_installation_reconciliation` stores private installation
events alongside immutable revisions. An `event-<sha256 hex>` revision ID
binds the event, actor, lifecycle and dates to its exact parent and registry
identity. The unchanged C12 digest includes that ID. Restore verifies the
event binding, exact canonical reference and permitted transition. Retain
the expanded link view and guard when recovering forward. To remove them
completely, restore an approved database backup from before the migration.

## Service policy and match inputs

Select **New equipment report → Service offer or facility policy** to enter a
reported offer. Choose exact backing installations and configurations. The
form records methods, accepted and excluded materials, deliverables, delivery
mode, price basis, versioned policy and provider links; the exact editor can
add C12 lead times. Blank lists are unknown; a dash states an empty list.
Amounts, capacity and lead times are not estimated by the registry.

An offer may include an optional Planner annotation
`service: {kind, contacts}` alongside the C12 payload. The kinds are `service`
(the default) and `facility_default`. Contact keys are `provider_contact`,
`custodian`, `operator` and `access_approver`; omit unknown roles. These
private reported labels are separate from the authenticated revision actor and
from the unverified provider reference. They never grant authority. The
annotation is immutable per revision and included in the owner archive digest.
It does not alter C12 wire bytes or the C12 digest; the exact revision ID also
pins the annotation.

- A facility default is a reported policy record in the same workspace,
  designated on creation. Its primary policy source namespace must be
  `planner:facility_policy`, so the C12 digest binds its designation. Its policy
  source still needs a native ID and version. It has an explicit provider, dated policy revision,
  and no backing resources, links, contact roles or nested default. It is not
  a matchable service. A selected local default is expressed in the C12
  `access_policy.facility_default` as `source.namespace: "planner:registry_offer"`,
  `source.native_id: <policy record ID>`, `source.version: <exact policy revision ID>`,
  and `content_digest: <exact policy wire digest>`. The provider namespace, native
  ID and version must match exactly. A foreign workspace, other provider, plain
  service or nested default cannot supply inherited rules.
- Explicit offer fields override the corresponding default fields, including
  an explicit empty list. A null method, input or exclusion list inherits only
  from a readable, current local default with a listed state and an explicit
  value. This scopes overrides to that offer and its reported backing resources.
  There is no workspace-wide inferred policy or automatic fallback to a
  different installation. External default references preserve provenance but
  supply no rule by themselves. Effective dates use UTC calendar dates, both
  stated boundaries inclusive. A missing start is unknown; a missing end is
  displayed as no stated end. Explicit material exclusion takes precedence over
  an accepted input. Rules compare source namespace and native ID; an explicit
  rule version requires the matching request version.
- Access claims target one exact offer, installation or configuration revision
  and identify one dimension: willingness, eligibility or training. A subject
  can be public, the exact current registry organisation, or an exact Planner
  principal. Principal claims must be restricted. Match checks use only claims
  visible to the caller for those scopes and that subject; they do not reveal
  another principal’s claim or infer access from an affirmed report. Availability
  is separate, optionally time-bounded, and reported rather than live. A
  supporting assertion must have the same exact target and dimension.
  Opposing reports and contradictory supporting assertions remain visible as unresolved evidence. A clear current
  denial at offer scope applies to every alternative; a denial at a backing
  scope applies only to that alternative. The Planner has no provider verifier.
- **Assess this service** checks exact numeric points within a single
  configuration and envelope. Separate configurations and installations are
  alternatives, and no joint or multi-device execution is inferred. The check
  uses exact decimal/rational comparison and requires matching units,
  dimensions, bases and explicit references. A null reference stays unknown.
  Declared references must match exactly; pressure needs an absolute or gauge
  reference. Evidence-qualified reference conditions are currently unresolved.
  Unstated conditions, missing measurements or an ambiguous backing relation
  also keep the fit unknown.
  This is a reported point comparison. A request can require exact module
  identifiers; each must be reported fitted on the same configuration.
  Explicit reported absence rules that configuration out; omissions remain
  unknown. Neither a reported module state nor a reported fit establishes
  qualification, method capability or hardware execution.
- The match POST takes `{expected_head, method, material, requirements, conditions, required_modules?, save?, questions?}`.
  `method` and `material` are a C12 source reference without a URL or null.
  Each required point is `{observable_id, value, dimension, unit, basis, reference}`
  with a decimal string and reference of null, `{kind:"none", id:null}`, or
  `{kind:"declared", id:<reference ID>}`. `conditions` is an array of explicitly declared condition
  strings. A replaced offer head returns 409. Matching uses a single snapshot of
  readable pinned evidence and its current heads. It returns policy versions
  and date status, technical alternatives, and separate evidence summaries.
  For a current listed offer, explicit plain HTTPS provider links can be opened
  by a person. Queries, fragments and credentials are refused. A generic local
  enquiry draft omits request inputs and subject IDs. There is no automatic
  external request, contact, booking or hardware action.
- With `save: true`, Planner stores the exact request, result and dependency
  snapshot. Saved inputs are shown to their author while dependencies remain
  readable. Currentness for saved service assessments is also private to their
  author; other permitted readers do not receive changes in that author’s claim
  scope. An owner can export the protected archive. A revision, expiry,
  window change, withdrawal or newly unreadable dependency changes currentness
  without changing the original assessment. An already expired report stays
  inspectable as expired rather than making a fresh check stale immediately.
  The write also checks that no applicable claim head appeared during
  evaluation. A new or no longer visible claim in the original author’s scope
  marks a saved assessment as needing recheck without revealing the claim.
  Saving never creates or stores a provider request.

- With `questions: true`, matching also returns private decision questions
  with the likely answerer, rationale and the exact before/alternative
  consequences evaluated by the same matcher. Decisions that change the route
  appear first. Supported alternatives concern current offer-scope training,
  eligibility, willingness and availability, an unstated method list, or
  coupled unknown modules and operating conditions within one configuration.
  Known hardware is held fixed and stale or unsupported pins are not assumed
  current. These scenarios are never evidence or saved assessment inputs.
- To apply a training answer, create a dated access report linked to the
  exact offer, include its source, then use **Record evidence review** on the
  report. Return to the offer, check fit and choose **Refresh my affected
  assessments** with that exact reviewed answer. The Worker reruns the
  author's own latest saved captures of that same offer with their original
  inputs and the current permitted evidence. It does not update other users'
  captures or re-pin an offer. Each request saves up to twelve eligible
  captures together, or none if inputs, review or visibility changed. If
  `more` is true, repeat with the same reviewed answer; the browser does this
  in bounded batches, shows progress, and can resume after a failed batch.
  Refresh returns the before/after outcome and retains the original results.
  A repeated request skips captures already refreshed with the answer. An owner
  archive retains both captures and restore checks their lineage and the
  reviewed evidence against the independently reproduced results.

Migration `0007_registry_services` adds nullable private annotations and match
snapshots and rebuilds the record link view. The new view preserves the original
organisation, record and linked ID columns and adds revision IDs and edge types.
Restriction checks use all revisions, so a correction cannot remove a private
pointer from historical visibility enforcement. For recovery, keep the new
view and columns and roll forward with a compatible Worker; reverting the view
after any service writes would omit required privacy edges. To revert completely,
restore a protected pre-migration database snapshot under the approved recovery
process. An older Worker cannot safely serve the new service UI or manage those
records.

### Bounded pilot cohorts

Open **Registry → Contribution workspace → Pilot cohorts** as a Registry owner
or reviewer. Each organisation can register up to eight cohorts and each cohort
can hold up to 24 leads. Record the sampling frame and the inclusive UTC dates
in which leads were identified. Invitation, reply and review dates describe
events already recorded by a steward and may fall after the identification
window. The pilot workflow records contact and referral decisions in the
workspace and has no sending, access-grant or institutional verification action.

Use dated, protected `ref:` identifiers or exact `sha256:` digests for
responsible owner/operator evidence, steward consent attestation, overlap,
referral, reported access and support, required module/interface facts, and
before/after decision evidence. Use versioned locators for paired artifacts and
retain a pair for `no_change`. The Registry stores these references without
reading the referenced artifact or sharing any account's private assessment.
Lead labels and consent records are visible to the organisation's owners and
reviewers. Only an owner can export them.

The dashboard counts the registered cohort as of the displayed UTC date:

| Measure | Numerator | Denominator |
| --- | --- | --- |
| Identified | Registered leads in the identification window | Registered leads |
| Invited | Leads with a dated invitation | Identified leads |
| Replied | Leads with a dated reply, including unsolicited replies | Identified leads |
| Reviewed | Leads with a dated operator review | Identified leads |
| Platform evidence verified | Reviewed leads with a current exact evidence pin and complete pilot evidence | Reviewed leads |
| Inaccessible | Leads with evidence of reported inaccessibility | Identified leads |
| Stale | Leads with a saved pin whose revision changed, expired or reached its reconfirmation date | Identified leads |
| Response rate | Invited leads whose reply date is on or after their invitation date | Invited leads |

A platform evidence check requires the current exact installation revision
created by Registry review with dated sources. Its pilot lead also needs
responsible person evidence, reported consenting steward evidence, clear
overlap, assessed access and support, and known evidence for every module/interface
field declared in the cohort checklist. An empty checklist, omitted fact or
explicitly unknown required fact leaves the lead short of platform verification. Inaccessible equipment can have verified evidence of
inaccessibility. Institutional and provider authority remain unverified.
The reconfirmation date is exclusive. Reconfirmation requires a fresh
underlying Registry review and an explicit new pin. Each save records its
reason, author and prior cohort version in the correction history. The version
digest binds that metadata, the exact snapshot and its parent version.

Use `GET/POST /:org/pilot` to list or create cohorts,
`GET/POST /:org/pilot/:cohort` to read or append a version, and
`GET /:org/pilot/:cohort/history` for saved versions.
The write body contains `expected_version`, `reason` and `snapshot`.
On a version conflict, the browser retains the attempted edit so the steward
can reconcile it with the current cohort.

## Import dated ROAR reports (#310)

The public discovery link is [Atlas ROAR discovery](https://instrument-capability-catalogue.nathan-skene.chatgpt.site/#roar).
The stable Planner contribution link is
[Contribution workspace](https://lab-automation-planner-skene.nathan-skene.chatgpt.site/web/index.html#registry/workspace).
In an organisation workspace, its owner opens **Import ROAR reports**, selects
the exact `roar-discovery.json` and C11 `bundle.json` from the Atlas build, and
previews the changes. Saving admits the evidence only to that workspace. The
private URL is `/web/index.html#registry/workspace/<organisation-id>/roar-import`.

The admitted release is crosswalk schema 1, version 2026-11-12 (Atlas source
commit `3088f5c63063a6ddf7f7056ddb4e2ff5e2d55611`), and Atlas C11 schema 0.1.0
from Atlas release commit `a07f1060f26f03bfaacad5ab19b4a94c3342dbf7`.
The Worker checks exact file SHA-256, the embedded identity manifest and each
C11 record's shape, digest, identity, rights and source links. A normal Atlas
export or an ordinary model ID is not a C11 pin. The importer never fetches a
source URL. It checks the scoped owner again at the write and applies all
changes together against the reviewed exact heads and sharing policies.
A future release requires a new reviewed pin and mapping before admission.

All 26 source role IDs, four conflicts, date and source locators survive as
private C12 reports and linked source packets. Sources identify Atlas's dated
crosswalk entries; they do not claim an Imperial page version or snapshot.
Six exact matched roles have model pins. Three Freeslate Junior roles share
one grouped report with the model identity and unknown asset count. Compound
Agilent and H-Cube/Phoenix reports retain candidate pins separately; their
whole configuration has no assigned model. Unresolved leads have reasons
and no assumed individual equipment. A matched identity does not confirm
fitted modules, facility authority, custody, availability, or access rights.

`POST /api/registry/organisations/<id>/roar-import/preview` takes JSON
`{crosswalk, bundle}`, both original UTF-8 JSON texts. It returns per-report
changes, exact current heads and a `review_digest`. Send the same two texts and
that digest to `.../roar-import/apply`. The digest binds the proposed contents as
well as the source release, actor, heads and sharing policies. Reimport of an unchanged release adds
no revisions; if an existing report was corrected, retired or restricted,
a changed release cannot overwrite it. A release that moves or removes an
imported role needs manual reconciliation and cannot be applied through this
importer. Open an imported report's **Evidence
assertions** to read the dated source packet. Owners can retire reports through
the ordinary registry lifecycle. Reimport does not restore retired reports.
The existing scoped backup and local restore include both records and packets.
Imported evidence starts private, with assessment and republication rights
unknown; the normal selected-field publication rules still apply.

Fresh market imports and runtime capability mapping exclude explicit
`planningEligibility` values other than `assessed`, including `unassessed` and `unsupported`. Legacy records
without the field continue to use their existing evidence routes. This
import does not change historical market or Portfolio snapshots.

## Resume the native D1 upgrade (#312)

The native Site keeps its existing D1 binding and migration journal. The
replacement release preserves migrations `0000` through `0006` byte for byte
and keeps the original journal tags, ordering and times. It groups the
registry link view queries in `0007` and `0008` to fit D1's compound SELECT
limit. The next publication on the same Site resumes from the last recorded
successful migration and applies pending migrations in order. Use the
previous successful Site version as the serving fallback while verifying the
replacement. If the platform reports a different migration state, inspect
the failure before another deployment or any database intervention.

The built Worker regression starts with the four migrations from the earlier
native version, inserts synthetic profile, member and protocol rows, and
runs the pending SQL with SQLite's compound SELECT term limit set to five.
It then checks exact link edges, service assessments, transitive restrictions,
duplicate history and backup restore under that same limit.

## Prepare a private service request (#317)

Start from the public Registry or Atlas to discover a reported facility. A
public group can describe reported coverage. Preparing a draft requires a
private, individually sourced installation, its exact model and configuration,
and a reviewed offer in the same workspace.

1. Run the [reviewed assessment](planning-api.md) with the compact Portal
   input or the same offline format. In **Requested method reference**, enter
   `planner:reviewed_protocol <protocol_id> <interpretation_digest>` using the
   values from `binding`. The offer must report the matching exact method.
2. Enter the material, required points, fitted modules and conditions for the
   specific service. Select **Save this private assessment and its exact
   inputs**. The workflow assessment checks structure and source binding. The
   service assessment checks the separately entered requirements against
   reported evidence for one configuration. Preparation requires mapped source
   coverage, balanced supported movements with known declared stock, and a
   complete declared layout within vessel capacity. The reviewed preview can
   still display unresolved findings and external claims.
3. From **Dependent assessments**, open the saved result. Choose the exact
   configuration, select the reviewed assessment input JSON file and choose
   **Prepare private request**. Inspect the local result, save its draft ID or
   download the private JSON. The workspace can retrieve the draft by ID while
   the author still has access to all selected evidence and the draft is current.

The offer, installation and configuration need current source-backed reviews.
Provider willingness, eligibility and training need affirmative current
reviewed reports for the requesting principal or workspace. Reported
availability needs a current reviewed report about the exact selected offer,
configuration or installation. Conflicting, stale or unreadable evidence
blocks preparation and readback. Availability is reported and can change. A
facility link opens manually. The draft has no provider outcome, reservation,
charge or execution authority. Review the file and its private identifiers
before deciding whether to share it.

For an authenticated client, `POST
/api/registry/organisations/:org/assessments/:id/request-v1` takes an object
with these four fields:

| Field | Value |
|---|---|
| `schema` | `planner/registry-service-request-input/1` |
| `idempotency_key` | A fresh client key of 16–96 ASCII letters, digits, underscores or hyphens |
| `configuration` | The exact Registry revision reference from the saved match |
| `reviewed_input` | The supported compact `lab-automation-planner/reviewed-assessment-input/1` JSON object |

Submit strict JSON within 256 KiB. The original reviewed input is used in
memory for assessment and exact digest binding. The stored
`planner/registry-service-request/1` draft contains the source binding,
assessment and result digests, exact model and Registry revision references,
and local-only status. It contains no source text or raw replay key. Only the
assessment author can prepare, replay or retrieve it through the draft routes.
The owner can export a protected workspace backup.

The first successful request returns 201. The same author and key with identical
inputs returns the same draft with 200, including parallel retries. An input
change on the same key returns `409 idempotency_conflict`. Readback uses `GET
/api/registry/organisations/:org/request-drafts-v1/:id`. After 24 hours or the
earliest captured expiry, whichever comes first, it returns `410 draft_expired`.
Currentness failures can return `409 assessment_stale`; lost visibility can
return 404. Reassess the current evidence and use a new key when starting a new
request.

Each workspace retains up to 100 immutable draft receipts, including expired
receipts. The API returns `409 request_capacity_reached` when a new key would
exceed that limit. Keep the owner backup in protected storage and use a new
workspace for further requests when capacity is reached. Existing replay keys
remain bound to their original inputs and workspace.

## Backup and restore rehearsal

An owner export contains private and restricted evidence. Keep it in protected
storage. The API returns a complete bounded archive or a size error, never a
truncated backup. Restore an intact owner export into a **new local SQLite
database** using the same migrations as the Worker:

```sh
node scripts/restore-registry.mjs /private/path/registry-export.json /private/path/new-registry.sqlite
```

Restore checks the canonical SHA-256 archive digest before creating a
database or writing rows. The digest covers every export field except
`archive_digest` itself, including memberships, lifecycle metadata and
sharing policy identities, restrictions, and publication decisions. Version 2
exports carry the sharing metadata. A workspace with service records or a
saved match uses version 3, which preserves the annotations and immutable match
inputs and results. Workspaces with installation reconciliation or move events
use version 4. Pilot cohorts and their history use version 5. Workspaces with private request
drafts use version 6, which preserves the assessment, author and replay pins
and retains previous pilot data. Earlier archives remain readable. Version 1 exports restore with their original publication
state and no added restriction. The digest detects accidental changes. Anyone who can edit
the archive can recalculate the digest, so restore requires an export from a
trusted owner. Restore also checks the pinned release, revision digest chain,
and scoped references, and rejects assertion rows claiming verified authority.
For version 3 it also checks exact service edges and recomputes saved match
results from their pinned snapshot.
It inserts the archive as a transaction, preserving exact IDs, restrictions,
and revocation state. The restore command creates a fresh local SQLite database.
Hosted recovery uses the approved database recovery process. Verify on synthetic data via `node --test tests/worker.test.js`;
the tests use the actual bundled Worker and SQLite with every D1 migration.

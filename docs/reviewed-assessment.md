# Reviewed assessment profile 1

Issue #285 adds an explicitly selected structural assessment at `#reviewed`. It reads canonical ReviewedProtocol 0.2 directly, without the prose parser or the legacy class-based, initially empty well ledger. The default planner, account profiles, imports, recommendations and simulation exports keep their existing behavior. This profile is not promoted to the default and grants no scientific approval, automation savings, scheduling feasibility or execution permission.

## Private workspace

Import a compact input below, a canonical 0.2 record, or a saved workspace. Edit the separate run and configuration JSON, then assess. The record itself stays immutable: revise its meaning in the review authority and import the new revision. Every edit invalidates assessment/comparison results. Unsupported operations and all original conditions, evidence, questions and limitations remain inspectable.

The workspace lives only in tab memory. **Save private workspace / backup** downloads `lab-automation-planner/reviewed-workspace/1` with exactly `schema` and `input`; reopening validates again and restores no approval or computed result. Reloading loses unsaved work. A previous import can be restored in memory. Return to the default planner for immediate rollback. Nothing is automatically written to localStorage, account routes, Labstep or the Protocol Portal. Downloaded files can contain private scientific text: keep them in private storage.

## Offline producer contract

Use Node 22 or later and a pinned, reviewed planner release. The fixed command is:

```sh
node scripts/assess-reviewed.mjs < private-input.json > private-assessment.json
```

Do not use `npm run` for a machine stdout protocol, since npm adds banners. The CLI accepts **no arguments**, path selectors, code, network requests or device instructions. It reads bounded stdin and writes exactly one JSON object plus newline. Exit 0 means an assessment was produced, including partial/unsupported outcomes; exit 2 is a structured `lab-automation-planner/reviewed-assessment-error/1` with `error.code`, `path`, and a non-echoing message. The connected caller must apply its own timeout, process isolation and response-size limit and admit only the expected release/profile/bindings.

`lib/reviewed/assessment.js` exports the same `assess(input)` used in the browser. In-process inputs must already preserve the original JSON meaning. External bytes must first use fatal UTF-8 decoding with `ignoreBOM: true`, then `parseReview` from `lib/reviewed/json.js`; never use `JSON.parse` first. This rejects BOM, malformed UTF-8, duplicate decoded keys, non-ASCII object keys, unsafe integer numbers, float/exponent tokens and lone surrogates. Scientific amounts remain decimal strings. Canonical hashing implements `agentic-lab/review-json/1` with lexical key ordering, including numeric-looking keys. Interpretation digest excludes only `interpretation_digest`.

Input profile `lab-automation-planner/reviewed-assessment-input/1` has exactly:

| Field | Meaning |
| --- | --- |
| `schema` | The input profile above. |
| `record` | Complete immutable ReviewedProtocol `schema_version: "0.2.0"`. No implicit 0.1 migration. |
| `binding` | Exact `{protocol_id, revision_id, interpretation_digest, source}` copied from record; every source field must match. |
| `run` | Exactly `{cardinalities, layout}` as below. |
| `configurations` | Array of independently selected configurations below. |
| `review_claims` | Array of external, untrusted assertions; no flag can unlock authority or execution. |
| `upstream_findings` | Array of `{code, path, message}`; retained as findings, never silently cleared. |

`run.cardinalities` admits optional `per_sample`, `per_container`, `per_batch`: integer 1–1,000,000 or null. Total/absolute basis means 1. Cardinalities never imply a physical vessel layout. `run.layout` maps canonical location IDs to null or explicit slots, each `{id, units, capacity_uL}`. Slot IDs are globally unique; units are positive safe integers summing to that state's basis cardinality. Capacity is a nonnegative decimal-string µL amount or null. Eight per-sample units may be eight slots of one unit each, or one slot of eight units, with different physical capacity results. A shared total-basis donor is not multiplied by sample count. This first profile distributes each stated per-basis quantity uniformly among its explicitly assigned units; heterogeneous instances need separately represented states.

Each configuration is exactly `{id, revision, head: {min_uL, max_uL}, evidence, availability}`. Limits are nonnegative decimal strings or null; nonempty evidence and both limits are required for a stated quantity-basis range comparison. Availability is `unknown`, `available`, or `unavailable`; even `available` is unverified here. This is **not a physical stroke/dispense assignment**. A pooled per-sample amount is not assumed to be a single stroke. Zero movement is not applicable to a minimum stroke range. Capacity checks are separate per-instance checks. No catalogue class, missing module, unknown head range or portable checkbox becomes confirmed compatibility.

The compact input is at most 2 MiB UTF-8, depth 64, 100,000 nodes, 500 operations, 3,000 states/materials and 1,000 locations. The product of configuration count and operation count is limited to 10,000 before output expansion. Findings are stored once with shared global/per-operation index references, rather than duplicated per configuration. There are at most 50 configurations, 1,000 slots per location, 100 claims and 2,000 upstream findings. Output is at most 4 MiB; over-budget processing refuses rather than truncates. Decimal strings are at most 128 characters; normalized rational numerator/denominator are at most 512 digits. Nonterminating quantities use `{numerator, denominator}` strings; no silent float rounding occurs.

## Release, integrity and authority

The embedded exact schema bytes in `lib/reviewed/contract-bundle.js` are pinned to agentic-lab commit `7f382b0f9ced92bf2d5c42b5853ddc5a1bc2788d`:

| File | SHA-256 |
| --- | --- |
| `contracts/reviewed-protocol.schema.json` | `903b3fce4f260cf112e347ba6f0e6552020f5ad46577ff81376aa1a60de42c9c` |
| `contracts/versions/0.2.0/reviewed-protocol.schema.json` | `784333a747d2cacb164dfecfc09f2515e16ddc556adb04084379ce90cf919435` |

The semantic design reference is protocol-portal `8c4fe82784111e8635c4404e0230bf9393fa9fb3`. Algorithm is `explicit-volume-ledger/1`. The output `release` names these pins and algorithm; the connected deployment must additionally pin the actual planner commit/entrypoint manifest. An algorithm label alone does not authenticate runtime code.

The shape validator is a closed evaluator for the **exact pinned keyword inventory**, not a general-purpose JSON Schema engine. Unknown keywords, references or review versions fail closed. Runtime additionally checks IDs, graph topology, quantities, whole-state port copies, explicit lineage, movement intent and source/revision/digest agreement. Shape checks and checksums do not prove that prose was interpreted correctly, that native source bytes are authentic, or that an imported human reviewed anything. The compact input contains no native source capture; its source hashes remain attributed bindings. Only a connected authority loading its own saved revision and events can establish local applicability. Standalone results always remain `external_claims_only`, `structural_preview`, `overall_feasibility: "not_established"`, `execution_allowed: false` and `automatic_recommendation: null`.

Output profile is `lab-automation-planner/reviewed-assessment/1`. It binds the complete input hash, exact interpretation/source binding, run hash and configuration hash. `operations` retain each complete declared operation and original `record_index`, alongside separately stated movement consumption, accounting status and stock sufficiency. `states` retain original state snapshots and separate computed aggregates, ancestry, component amounts and physical layouts. `record_metadata` and `retained` preserve the remaining canonical fields; operation ordering is topological for calculation, with `record_index` preserving the input array order. Findings include path, operation and affected scopes. No assessment claims that an internally moved amount equals reagent purchasing consumption.

## Supported meaning and explicit limits

Supported arithmetic is exact volume movement (`uL`, `mL`, `L`) between four distinct immutable before/after states at two distinct unchanged locations. Whole-state ports must reproduce the state quantity and provenance exactly. Donor residuals, occupied recipients, explicit pooling, zero moves, known additions from unknown stock, unit/cardinality conversion, and exact make-up-to operands are represented separately. Additive balance requires the explicit nonreacting additive model. Unsupported models can retain independently stated add amounts, but cannot seed a later physical balance. Known contradictions, overdraw, stale state reuse, overlapping state branches, missing dependencies, false ports and cycles never silently reset inventory. Make-up-to requires known initial and target amounts under the supported model.

Material IDs are distinct even if names/classes match. `contributor_ids` describe ancestry, **not guaranteed current composition after partial mixture withdrawal**. Component amounts are computed for pure donors and whole-mixture transfers only when justified. Partial mixture withdrawal does not infer uniform mixing, fraction partition, target retention or wash effectiveness. Explicitly unrolled exchanges can retain total inventories; implicit repeat/conditional/unknown control remains unsupported. Non-transfer separations, washes, reactions, transformations, fraction selection, continuous flow, scientific predicates and resource/schedule constraints stay visible and unassessed. A delay constraint is never converted into a step duration. No costs or time savings are invented.

## Legacy differential boundary

Only an explicit UI upload can request the existing prose parser diagnostic. It must match collection/version and the original export GUID/text hash (lab-mcp's spaced Python JSON hash format). It is a separately bound `lab-automation-planner/legacy-diagnostic/1`, never consumed by the reviewed ledger or CLI. Only the verified text projection is parsed; unbound title/inventory/timer/device decorations are omitted. There is no guessed one-to-one pairing of parser actions and canonical operations and no fabricated legacy metric baseline. The report retains legacy action quantities, reviewed movement/conditions/constraints, count differences and omitted scope. Original source availability is explicit.

A synthetic differential deliberately retains a real legacy heuristic disagreement: “Transfer 10 µl from source tube to recipient tube.” yields no legacy parsed quantity because of the existing vessel-size heuristic, while the independently declared reviewed movement stays 10 µL. This issue does not change that default parser. Equal-quantity comparison is tested separately.

## Validation and maintenance

`npm ci --ignore-scripts --no-fund`, `npm test`, `npm run check`, `npm run build`, and `npm run test:reviewed-browser` verify the profile. Playwright 1.65.0 is pinned test-only; no production dependency was added. Browser CI extracts signed Ubuntu 24.04 libraries without installing packages, privileges or package hooks; only the Chromium child receives the extracted library/font paths. The existing required PyLabRobot simulation job remains unchanged. Browser tests use synthetic files and loopback only, verify no external requests or profile storage, exercise malformed original bytes, private download/reopen/export, stale async results/failures, sidebar navigation, comparison and rollback. Independent acceptance mapping is in [reviewed-assessment-cases.md](reviewed-assessment-cases.md).

Private scientific approval and full Portal export/import applicability are downstream integration gates; this standalone preview never fabricates them. Promotion to default still requires #247 physical/reliability gates and benchmark evidence.

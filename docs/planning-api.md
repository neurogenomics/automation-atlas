# Planning API v1

A signed-in caller can submit private, reviewed copies of protocol snapshots and explicit planning assumptions. The service runs the same operation model, simulation, ranking, explanations and decision questions as the normal **Decide** page. In that page, open **How this was worked out** and choose **Download private decision JSON** for the same result object. The API additionally returns the exact submitted request digest, full snapshot digests and a build digest.

The API also accepts the Portal's pinned compact ReviewedProtocol input on two separate routes. These use the existing **Reviewed assessment** structural ledger. They preserve canonical source and interpretation digests, unsupported operations and unresolved findings. The result is a declared volume and stated-range preview. It supplies no Decide time, cost or eligibility estimates. Portal applicability and scientific approval stay with their existing authorities.

## Routes

The base is `/api/planning/v1/`. All response bodies are JSON and carry `Cache-Control: no-store`. POST requires the Planner's existing ChatGPT Sites sign-in or a valid configured Planner session and `Content-Type: application/json`. Same-origin browser requests use the signed-in session. Other origins get no CORS permission. No application API keys or client-supplied identity headers are accepted by the preview. The hosted Worker relies on the Sites ingress to attest identity. Use an already authenticated same-origin application session on Sites. The example below uses a disposable loopback session and never asks for hosted session cookies.

| Method and route | Input and result |
| --- | --- |
| `GET contract` | Public JSON Schema 2020-12 bundle. Select a definition with a local `$ref` such as `#/$defs/assessment_request`. Includes hard limits, evaluator build digest, public-field policy and manual provider links. |
| `GET capabilities?model=ot2` | Public operation reference claims for one model. Use the curated model ID. Capability and citations are model-family catalogue references. Local fit, options fitted, approval, availability and costs remain outside this projection. |
| `POST validate` | Decide request or same-release workspace. Verifies exact snapshot/version pins, bounds and request assumptions. Returns source digests, caller review claim, operation count, unresolved readings and labware warnings. |
| `POST assess` | Decide request or same-release workspace. Returns `{evaluator, request_sha256, source_versions, decision}`. |
| `POST compare` | `{input, configurations: [leftId, rightId]}` with two distinct exact IDs from the same assessment or its question alternatives. Returns the standard paired difference, including actions automated by only one route, delta of right minus left, facts, metrics and evidence IDs. |
| `POST questions` | Decide request or same-release workspace. Returns the ranked questions for the recommended route, with the exact yes/no alternative IDs and deltas where known. An empty array is valid when no configuration or unresolved question is selected. |
| `POST export` | Decide request or same-release workspace. Returns an exact input workspace suitable for a private JSON file. |
| `POST import` | Exact exported workspace. Returns `{workspace, current_evaluator, reproducible_here}` after validation. Submit the returned workspace directly to `assess`. |
| `POST reviewed/validate` | Original compact `lab-automation-planner/reviewed-assessment-input/1` bytes from Portal or the offline producer. Returns the binding and existing validator/ledger release. |
| `POST reviewed/assess` | Same compact bytes. Returns the existing `lab-automation-planner/reviewed-assessment/1` object, also produced by the Reviewed assessment workspace and offline CLI. |

Ranking uses candidates clear of hard physical blockers whenever available. The least-equipment, cost and walk-away objectives require at least 80% of the best modeled labour saving from that eligible set. When every route has a hard physical blocker, diagnostic comparisons can retain the ledger findings.

The Decide request root is `{schema: "planner/assessment-request/1", protocol, installations, decision}`.
`protocol` contains the workflow, its supplied snapshots, caller review evidence ID and optional exact-line reviewed overrides. The caller can set a workflow branch and include constraints as part of a pinned override. Each workflow part names the source, ID and exact version. Locked Labstep exports additionally require the exact legacy ordered GUID/text hash. The response separately fingerprints the entire snapshot so timers, observations and metadata are bound too. Supply only snapshots the caller has permission to process. The API cannot fetch a snapshot, browser profile, Registry installation or remote provider record on the caller's behalf. The reviewed route checks the exact 0.2.0 source-bound record and retains unverified external claims.

Installation profiles describe the caller's own declared assumptions for a catalogue model, including the access answer, model ID, and optional installed options. `accessible` requires all the normal Decide confirmations, with unknown access kept out. `upgrade` allows questions on caller-supplied installations. `design` also considers prospective configurations. The analysis records who or what the result relies on in the questions and evidence references. A caller assertion carries no facility verification. Configure or review private records via the existing Registry routes and roles.

Hard physical contradictions, such as a modeled overflow of the selected vessel, exclude a route from ranking in Accessible now. The decision retains the physical finding and route exclusion reason. Upgrade and design comparisons can show blocked routes for diagnosis. Correct the source interpretation or change the setup and compare again.

Use the `binding.protocol_id` and `binding.interpretation_digest` from the reviewed assessment to pin the method when [preparing a private Registry service request](equipment-registry.md#prepare-a-private-service-request-317).

### Record examples and errors

The synthetic inputs in [planning-fixtures.mjs](../scripts/planning-fixtures.mjs) use plain water and symbolic equipment. Generate a complete request with:

```sh
node --input-type=module -e 'import {planningFixture} from "./scripts/planning-fixtures.mjs"; console.log(JSON.stringify(planningFixture("individual", "design", true), null, 2))'
```

| Definition | Example in the normal routes | Validation |
| --- | --- | --- |
| `capability_claim` | `GET capabilities?model=ot2` provides `ot2:liquid-transfer` if present in this catalogue build, with origin and linked model references. | Missing catalogue model gives `reference_not_found`. Public values come from a fixed projection. |
| `installation_profile` | `{"id":"example-ot2","modelId":"ot2","access":"unknown"}` | Mixed/repeated identities or unknown model IDs fail with `installation_identity`. Extra fields fail request validation. |
| `operation_route` | `decision.configurations[0]` contains an exact route/head ID, eligibility, metrics, evidence IDs and facts. | A route not returned by the assessment gives `configuration_not_in_result`. |
| `protocol_model` | The fixture's `protocol` section contains `workflow`, `snapshots` and `review`. | Invalid structure, missing/duplicate source identities, stale version pins, draft Labstep input and changed source hashes fail with stable error codes. |
| `assessment_request` and `assessment_result` | The fixture is a complete request. The `decision` from `assess` carries baseline, alternatives, search counts, evidence and questions. | Unknown request version gives `unsupported_request_version`. Unknown fields and bad input assumptions are rejected. |
| `configuration_difference` | The clean client compares the first two in-scope configurations returned for the example. | Repeated IDs give `configuration_duplicate`. A missing ID gives `configuration_not_in_result`. |

Errors use `planner/planning-error/1` with a stable `error.code` and optional schema path. HTTP 400 covers rejected inputs, 401 missing/invalid identity, 403 cross-origin posts, 404 unknown route or visible result ID, 405 method mismatch, 408 observed cancellation, 409 unsupported evaluator for recomputation, 413 resource limits, 415 wrong content type, and 422 unsupported input or snapshot profile. Error responses omit user text, supplied locators, configurations and credentials. The two public reads expose only the fields identified by `public_fields` in the bundle, including the allowlisted claim envelope and its nested evidence ID, URL and version. Public capability reference evidence can include a URL and an unknown version. There is no public protocol, installation or assessment field.

## Reproducibility and transport

An installation can supply `installedHeads` with a `status` and a `heads` array of `{id, channels}` entries. Reported or confirmed records identify each fitted catalogue head family. For independent heads, the recorded channel count can be below the catalogue maximum. Unknown or conflicting records have an empty array and receive no equipment assessment. Reported heads do not qualify for accessible scope. As-installed scenarios use manual transfers between stations.

The optional workflow `block` selects one exact source, protocol ID and version ID, with inclusive step positions `from` and `through`. Its `input` supplies catalogue `labware`, per-vessel `volumeUl` and an `evidence` reference. A null volume returns `protocol_block_input_required`. The manual and alternative simulations start from the same declaration, while source digests and step identities remain pinned to the original snapshot. All metrics apply only to the selected steps. If a block ends at a wash with later source steps still present, include the next liquid-handling step before comparing. This resolves whether the source records the final removal separately.

A dependent optional stage needs an explicit workflow branch before assessment. If the branch is unresolved, the API returns `protocol_branch_required` with the path `/protocol/workflow/branches`. Ordinary labelled alternatives still use the existing provisional reading. When the source includes a recognized quality-control decision whose outcome determines work, assessment returns `protocol_qc_outcome_required` with the path `/protocol/workflow`. Review the condition and any explicit alternate instruction in Protocols. The v1 assessment does not supply a QC outcome.

V1 admits exactly the described fields and versions. Unsupported versions fail explicitly. Supply `planner/text-import/1`, `planner/protocolsio-import/1` or a locked `lab-mcp/protocol-export/1` snapshot matching the declared shape. Locators are stable HTTPS URLs without authentication, queries or fragments, or empty for text without a source URL. A claim that somebody reviewed the model describes the caller's review evidence. Any unresolved readings remain present. V1 admits reviewed line overrides and named branch selection. Unmodelled input fields such as workflow variant definitions fail validation so they are never silently dropped. The reviewed Portal routes use the separate existing exact schema and lexical rules.

Workspace digests use UTF-8 SHA-256 over compact JSON with lexically sorted keys and preserved array order. Decide v1 accepts finite numbers and safe integers. The parser rejects decimal values whose normalized JSON number would lose precision, along with malformed UTF-8, BOM and duplicate keys. Equivalent number spellings such as `0.50` and `5e-1` produce the same digest. The engine uses JavaScript numeric precision in its calculations. The existing reviewed profile continues to require its strict original JSON and exact decimal strings. The evaluator hash covers the built Worker module and its pinned catalogue/algorithm dependency closure. A supported workspace can be inspected and returned under another evaluator, with `reproducible_here: false`. Recompute against its saved evaluator or explicitly submit the input as a new decision. Preserve old files alongside new outputs.

The request limit is 256 KiB and the result limit is 1 MiB. Exports also fit the request limit. Other caps include six snapshots, 80 steps across a workflow, 1,024 code units per instruction line, 100 expanded actions, 32 repetitions per action, 192 total repetitions, 192 samples, and eight installation profiles. The Worker checks parsed work, not identifier length in prose. It also stops when simulation work exceeds the declared ledger budget. The search reports evaluated/in-scope counts and the existing provider-removal search method. Limits produce a labelled error rather than a partial recommendation. Unknown times and unresolved facts are preserved. A client can cancel using `AbortSignal`; the Worker checks during input and around computation. A synchronous computation already running may finish its bounded work after disconnection. There is no persisted job, queue, publication, hardware action or external request.

Request and response bodies stay in the request or explicitly downloaded file. The API makes no profile, Registry, Labstep or provider writes. Private files contain the submitted content and assumptions. Protect them as you would the original evidence and avoid including credentials or signed URLs in supplied text.

## Clean-client example

Run Node 22, then start the built Sites Worker preview:

```sh
npm ci --ignore-scripts --no-fund
npm run dev
```

In another shell run:

```sh
node scripts/planning-client.mjs http://localhost:8000
```

The client signs into the preview, verifies its account with `/api/me`, validates the fixture, assesses it, compares two returned configurations and reads the next questions. It exports a private temporary file, reopens it through the import endpoint and proves the assessment matches after recomputation. There is no browser or Portal local storage in this client. `npm run test:planning-browser` runs that client plus 12 whole-result comparisons against the actual Chromium Decide download across both synthetic workflow structures, three scopes and missing wait/access data. On the local arm64 macOS preview with Node 22.23.4, the clean client's observed validate/assess/compare/questions times were 16/148/88/72 ms in one run. These are loopback observations for the synthetic fixture, with a five-second client timeout.

## Equipment-source reuse

For a versioned, rights-checked public equipment file, follow [ROAR report intake](equipment-registry.md#import-dated-roar-reports-310). It validates the exact C11 Atlas bundle and crosswalk through a Registry owner preview and exact-head apply, and preserves private scope and imported provenance. A model identity cannot identify an installed asset. The [equipment-service reuse decision](https://github.com/neurogenomics/agentic-lab/blob/bb5238aeb3a4bfe338dba3b7f5c14e508ee275f8/decisions/2026-11-12-equipment-service-reuse.md) records the rights and source boundaries, including submitted Jisc CC0 equipment records and separate rights for other content and harvested material. Published manual provider entry points are available in the contract. Use the facility's normal access, booking and review workflows. An outbound Jisc feed, institution-enabled iLab scopes, OpenIRIS tenant contract and supported PPMS metadata feed remain unverified for this deployment.

### Tips and run time

The optional `decision.objective: "tips-runtime"` uses the same standalone bench and handler assessment as Decide. A ranked `standalone` route has a null `head_id`. The private result adds `tip_runtime`, `bench_routes` and per-action `mechanisms` when this objective is selected. Missing essential evidence leaves the route unassessed. The existing 192-sample hosted limit still applies. [Standalone bench planning](standalone-bench-planning.md) explains the eligibility and ranking rules.

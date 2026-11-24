# Offline goal comparison (#291)

Compare one proposed method with one explicit protocol goal. The evaluator
checks the supplied claims and explains unresolved criteria; it does not
predict scientific outcomes. It does not feed the Planner's equipment
rankings, browser profiles or reviewed volume ledger.

Run `node scripts/compare-goal.mjs` (or `npm run --silent compare:goal`)
with a single UTF-8 JSON object on stdin. Exit 0 emits one canonical JSON
line conforming to the released `goal-comparison` 0.1.0 schema. Exit 2 emits
one `lab-automation-planner/goal-comparison-error/1` envelope with a
stable code and, when available, an input pointer. No flags or extra keys
are accepted. Local callers can use `compareGoal(input)` from
`offline/goal-comparison/evaluator.js` with a plain JSON value. Keep the
CLI and its fixed local source/schema closure together when packaging it.

| Required key | Meaning |
| --- | --- |
| `schema` | `lab-automation-planner/goal-comparison-input/1` |
| `record` | Exact original ReviewedProtocol 0.2.0 |
| `goal` | Released protocol-goal 0.1.0 with exact binding to that record |
| `alternative` | Released method-alternative 0.1.0 bound to that goal and the identical original scope |
| `configurations` | Array of released ConfigurationInput claims; use `[]` when none were supplied |

Requests are limited to 2 MiB and the existing review JSON depth/node
limits, with at most 128 criteria and 32 configurations. The response is
limited to 4 MiB and the same canonical depth/node limits. The CLI does
not follow evidence pointers or contact external services. Configuration
inputs require at least one applicable configuration criterion because
the released result must account for every supplied configuration.
Configuration inputs can supply scalar limits only.

The evaluator checks the original interpretation digest, source binding,
ordered operation scope, companion digests and alternative goal pointer.
Original material/state pairs must resolve to a port on a selected
operation. Pairs in the alternative namespace do not match original
pairs, even with identical labels. Claims match by observable ID, kind
and, for sets, disposition. Competing claims under the same key and
claims that the same immutable pair is both retained and discarded are
rejected. A complete empty set is distinct from an unknown set. Targets
give context; express required retention or protection from discard as
explicit criteria. The CLI verifies local bindings, not the existence or
approval of a parent revision or the authenticity of evidence.

The bounded scalar policy recognizes:

- Volume: `uL`, `mL`, `L`; time: `s`, `min`, `h`; mass: `ug`,
  `mg`, `g`, `kg`; pressure: `Pa`, `kPa`, `bar` with matching
  declared `absolute` or `gauge` reference.
- Same unit only: temperature `degC`, rotation speed `rpm`, acceleration
  `g`, amount concentration `mol/L`, mass concentration `g/L`, signal
  or recovery ratio `1`, and currency `EUR`, `GBP`, `USD` or synthetic
  `XTS` without exchange rates.
- Matching `total`, `absolute`, `per_sample`, `per_container` or
  `per_batch` bases. There is no cardinality conversion. Declared
  reference conditions must match exactly as evidence reference sets.

A missing value, criterion threshold or matching observation is unknown;
supplied quantities with incompatible or unsupported semantics are
unsupported. The evaluator compares exact fractions. It returns the
normalized measurement in the threshold's unit when representable by the
released scalar schema, or uses the original unit when only that is
representable. An exact result is labelled as inferred arithmetic. Source
evidence, stable reasons and pointers distinguish the declared claim
from a verified experimental observation. A configuration finding's
input pointers resolve inside the one complete configuration object
identified by `input_digest`; that digest covers the whole supplied
object under review-json/1. Its revision binding remains a supplied
claim. Method input pointers resolve inside the exact alternative.

A necessary contradiction overrides unknowns and preferences. When a
necessary configuration limit applies, a pass requires a single supplied
configuration to meet all necessary limits. With no match, the decision
is unresolved if at least one configuration is unresolved or none were
supplied, and fails if every supplied one contradicts a necessary limit.
Each supplied estimate retains its source pointer. A complete estimate
returns the exact attributed subtotal, including any missing measurement
semantics as supplied. No currency, unit or basis is inferred from the
estimate kind. An incomplete or unknown subtotal never becomes a total. This single-candidate output
does not rank alternatives; preference eligibility is false. Scientific
equivalence, access and physical qualification remain unestablished;
execution permission is always false.

The [contract pin](../offline/goal-comparison/contracts/pin.json) lists
exact schema and synthetic fixture checksums from
[agentic-lab #106](https://github.com/neurogenomics/agentic-lab/pull/110)
at `c5b057576cb5b4fd8a0557d4badb4c86239b2655`. The existing embedded
ReviewedProtocol schemas match the transitive dependencies byte for
byte. The algorithm is `bounded-goal-comparison` version `1`; its
release digest hashes the canonical map of fixed runtime paths to
SHA-256 file hashes (see `releasePaths`). Portal should independently
pin the executable closure when adopting the command. Copy every
`releasePaths` file byte for byte, including `package.json`; this
dependency-free runtime needs no npm install. The evaluator
validates and seals each output under review-json/1.

`node --test tests/goal-comparison.test.js` runs the released comparison
oracles through the CLI and additional mutations. The stale human
decision oracle belongs to Portal; the Planner test checks that an
alternative bound to the older goal is rejected. All fixtures are
symbolic. `reviewed-assessment/1` and its historical release stay intact.

# Independent reviewed-ledger acceptance mapping

The supervisor-authored oracle predates the implementation and is retained at `tests/fixtures/reviewed/independent-reviewed-ledger-cases.json`. Test quantities are synthetic software inputs, not experimental recommendations. Every positive fixture binds matching synthetic source text, source hashes and interpretation digest; mutation fixtures are resealed before testing semantic rejection.

`node --test tests/reviewed.test.js` exercises these independently expected results:

| Oracle ID | Actual test name | Expected result asserted |
| --- | --- | --- |
| occupied_recipient | occupied recipient keeps added amount, totals and component identity | 30 A − 10 = 20; recipient 7 B + 10 A = 17; components A10/B7 |
| distinct_same_class | distinct same-named material identities never collapse | Separate A/B stocks, B40 − 20 = 20; pooled A10/B20 without class collapse |
| fraction_exact | fractional and large significant quantities remain exact | 0.3 − 0.1 − 0.2 = exactly 0 |
| large_significant_decimal | fractional and large significant quantities remain exact | 9007199254740.993 µL − 0.001 µL = 9007199254740.992 µL; exact equivalent of the nL oracle using released supported units |
| unit_conversion | exact unit conversion | 0.001 mL − 0.125 µL = 0.875 µL |
| eight_separate_wells | eight independent wells consume160 but each contains20 | Aggregate160, shared source40, eight separate20 µL slots fit50 µL each |
| eight_shared_destination | eight samples in one physical destination exceed50 | Shared destination160 exceeds50 |
| unknown_layout | unknown layout retains aggregate consumption; mismatch never invents slots | Aggregate160 remains; absent/mismatched layout cannot establish physical fit; missing cardinality stays unknown |
| unknown_inventory | known addition with unknown stock is not physical stock sufficiency | Requested10, residual null, sufficiency unknown |
| zero_move_identity | zero movement does not add a donor contributor | Recipient remains B7 only; A is not introduced |
| sequential_unrolled | explicit unrolled exchanges preserve inventories without claiming retention | Source40, sample10, waste60 after three explicit additions/removals; component partition unknown after partial withdrawal |
| stale_before_state | stale donor and overlapping branches reject instead of replaying inventory | Repeated immutable donor snapshot rejected |
| unknown_head_range | unknown head range stays unknown; portable approval changes no authority | Technical fit unknown; no assumed minimum |
| portable_approval | unknown head range stays unknown; portable approval changes no authority | Claimed local_authenticated does not grant local authority or execution |
| no_quantity_from_prose | unknown structured movement never reparses prose | Structured unknown stays unknown despite text mentioning10 µL |

Additional regressions cover make-up-to exact operands and stale target, model-unknown consumption without additive balance, zero movement below configured minimum, negative state totals, false whole-state ports, graph cycles/unknown IDs, branches/repeats, conditions/delays, lexical original bytes, canonical cross-language hashes, digest/binding tampering, schema keyword refusal, output expansion limits and complete retained fields. Source-bound legacy comparison includes both equality and a genuine existing-parser disagreement; it never changes reviewed accounting.

The ledger implements explicit split/residual and pooling **movement** semantics. Generic separation, retained/discarded fraction selection, reaction yield and wash target retention from `independent-conformance-cases.json` are deliberately unsupported unless already represented as explicit whole-state movements. They must retain `operation_unsupported`/`component_partition_unknown`, not a calculated retained yield. Continuous-flow residence/scheduling and max-delay feasibility require consumers not implemented by this profile. The retained broader corpus is a future acceptance specification, not a claim that every case is implemented or executed here.

`npm run test:reviewed-browser` exercises the actual Chromium UI with uploaded synthetic original bytes, private save/reload/reopen, assessment/comparison export, invalid draft navigation, asynchronous success/failure races, rollback and 390px containment. It asserts no external requests, JavaScript errors or changed browser profile storage. `npm test`, `npm run check`, build and required PyLabRobot CI protect the existing default workflows independently.

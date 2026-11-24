// Inert synthetic identities, no provider calls.
import {fixture as reviewedFixture} from './reviewed.mjs';

export const pinRequestRecord = ({schema_version, organisation_id, record_id, revision_id, content_digest, record}) =>
  ({schema_version, organisation_id, record_type: record.record_type, record_id, revision_id, content_digest});
const rights = {discovery: 'permitted', assessment: 'permitted', republication: 'permitted', basis: 'Synthetic declaration'};
const observed_at = '2026-01-01';
const expires = '2099-01-01T00:00:00Z';
const digest = 'sha256:' + '1'.repeat(64);
const source = {source: {namespace: 'synthetic:registry', native_id: 'fixture-document', version: 'r1', url: 'https://example.org/report'},
  observed_at, visibility: 'public', snapshot_digest: digest, use_rights: rights};
const model = {schema_version: '0.1.0', record_id: 'symbolic-model', revision_id: 'symbolic-model-r1', content_digest: digest};
export const requestRecord = (record, visibility = 'organisation', use_rights = rights) =>
  ({record, visibility, sources: [source], observed_at, expires_at: expires, use_rights});

export async function requestDraftFixture(call, principal, {identified = true, missing = '', visibility = 'organisation', badRights = false, reviewed = null} = {}) {
  async function expect(path, method, body, status) {
    const result = await call(path, method, body);
    if (result.status !== status) throw Error(`Fixture ${path}: expected ${status}, got ${result.status} ${JSON.stringify(result.json)}`);
    return result.json;
  }
  const root = '/api/registry/organisations';
  const {organisation} = await expect(root, 'POST', {name: 'Synthetic request workspace'}, 201);
  const path = root + '/' + organisation.id;
  const add = async (record, visibility = 'organisation', use_rights = rights) => {
    const body = requestRecord(record, visibility, use_rights);
    const {revision} = await expect(path + '/records', 'POST', body, 201);
    return (await expect(path + '/records/' + revision.record.record_id + '/revisions', 'POST',
      {expected_head: pinRequestRecord(revision.record), action: 'review'}, 200)).revision.record;
  };
  const installation = await add({record_type: 'installation', label: 'Synthetic exact installation', model,
    reported_location: null, external_id_claims: identified ? [{identifier: {namespace: 'synthetic:asset', native_id: 'asset-a'},
      source_pointer: '/sources/0'}] : []});
  const grouped = await add({record_type: 'installation_group', label: 'Synthetic grouped discovery', reported_count: 3, model,
    reported_location: null, external_id_claims: []}, 'public');
  await expect(path + '/records/' + grouped.record_id + '/publication', 'POST',
    {expected_head: pinRequestRecord(grouped), expected_policy_id: null, publish: true}, 200);
  const configuration = await add({record_type: 'configuration', installation: pinRequestRecord(installation), fitted_modules: null,
    operating_envelopes: [{envelope_id: 'exact-envelope', source_pointer: '/sources/0', conditions: [],
      all_of: [{observable_id: 'symbolic-point', operator: 'lte', threshold: {schema_version: '0.1.0', value: '3',
        dimension: 'symbolic-dimension', unit: 'symbolic-unit', basis: 'symbolic-basis', reference: {kind: 'none', id: null, conditions: []},
        provenance: {kind: 'reviewer_asserted', evidence: [], explanation: 'Inert software fixture'}}}]}]});
  reviewed ??= await reviewedFixture();
  const method = {namespace: 'planner:reviewed_protocol', native_id: reviewed.binding.protocol_id, version: reviewed.binding.interpretation_digest};
  const material = {namespace: 'synthetic:material', native_id: 'symbolic-object'};
  const offer = await add({record_type: 'offer', label: 'Synthetic offered service', state: 'listed',
    provider: {namespace: 'synthetic:provider', native_id: 'fixture-service'},
    backing_installations: [pinRequestRecord(installation)], backing_configurations: [pinRequestRecord(configuration)],
    external_id_claims: [], access_policy: {revision: {source: {namespace: 'synthetic:policy', native_id: 'fixture-policy', version: 'r1'},
      content_digest: digest}, facility_default: null, effective_from: observed_at, effective_until: '2099-01-01'},
    material_exclusions: [], terms: {methods: [method], accepted_inputs: [material], output_deliverables: null,
      delivery_modes: ['staff_delivered'], price: null, lead_times: null, routes: [{kind: 'enquiry', url: 'https://example.org/fixture'}]}}, visibility);
  const claims = {};
  for (const dimension of ['provider_willingness', 'eligibility', 'training', 'availability']) {
    const common = {target: pinRequestRecord(offer), observed_at, valid_until: expires, supporting_assertions: []};
    const claim = dimension === 'availability'
      ? {...common, record_type: 'availability_claim', state: dimension === missing ? 'unknown' : 'available', window: null}
      : {...common, record_type: 'access_claim', dimension, outcome: dimension === missing ? 'unknown' : 'affirmed',
        subject: {kind: 'principal', id: principal}};
    claims[dimension] = await add(claim, dimension === 'availability' ? 'organisation' : 'restricted', badRights && dimension === 'eligibility' ? {...rights, assessment: 'unknown'} : rights);
  }
  const matchRequest = {expected_head: pinRequestRecord(offer), method, material, conditions: [],
    requirements: [{observable_id: 'symbolic-point', value: '2', dimension: 'symbolic-dimension', unit: 'symbolic-unit',
      basis: 'symbolic-basis', reference: {kind: 'none', id: null}}], save: true};
  const matched = await expect(path + '/records/' + offer.record_id + '/match', 'POST', matchRequest, badRights ? 409 : 201);
  return {path, organisation, installation, configuration, offer, grouped, claims, matched, reviewed, add,
    body: {schema: 'planner/registry-service-request-input/1', idempotency_key: 'synthetic-request-key-001',
      configuration: pinRequestRecord(configuration), reviewed_input: reviewed}};
}

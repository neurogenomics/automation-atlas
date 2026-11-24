import {date, hash, refShape, sameRef} from './contract.js';

export const installationActions = ['duplicate_link', 'duplicate_unlink', 'move'];
export const installationText = (value, limit) => typeof value === 'string' && value === value.trim() &&
  value.length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

export function installationLocator(value) {
  if (value === null) return true;
  if (!installationText(value, 2048) || !value.startsWith('https://') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch { return false; }
}

export function validInstallationEvent(bundle, wire, row, event) {
  const action = row.action;
  if (event === null) return !installationActions.includes(action);
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
    wire.record.record_type !== 'installation' || !wire.parent || event.action !== action ||
    !date(event.observed_at) || event.observed_at > wire.recorded_at.slice(0, 10) ||
    !installationText(event.reason, 500)) return false;
  const fields = Object.keys(event);
  if (action === 'move') return fields.length === 4 && row.state === 'active' &&
    Number.isInteger(event.source_index) && event.source_index >= 0 && event.source_index < wire.sources.length &&
    installationLocator(wire.sources[event.source_index].source.url) &&
    wire.sources[event.source_index].observed_at <= wire.recorded_at.slice(0, 10);
  return ['duplicate_link', 'duplicate_unlink'].includes(action) && fields.length === 5 &&
    (action === 'duplicate_link' ? row.state === 'retired' : row.state === 'active') &&
    installationLocator(event.source_url) && refShape(bundle, event.target) &&
    event.target.organisation_id === wire.organisation_id && event.target.record_type === 'installation' &&
    event.target.record_id !== wire.record_id;
}

export function validInstallationTransition(current, previous) {
  const e = current.installation_event;
  if (!e) return previous?.installation_event?.action !== 'duplicate_link';
  if (!previous || current.observed_at !== previous.observed_at || current.expires_at !== previous.expires_at ||
    !sameRef(current.record.use_rights, previous.record.use_rights)) return false;
  const after = current.record.record, before = previous.record.record;
  if (e.action === 'move') {
    if (previous.state !== 'active' || after.reported_location === before.reported_location ||
      !sameRef({...after, reported_location: before.reported_location}, before)) return false;
    const oldSources = previous.record.sources, sources = current.record.sources;
    return (sources.length === oldSources.length && sameRef(sources, oldSources)) ||
      (sources.length === oldSources.length + 1 && e.source_index === oldSources.length &&
        sameRef(sources.slice(0, -1), oldSources));
  }
  if (!sameRef(after, before) || !sameRef(current.record.sources, previous.record.sources)) return false;
  return e.action === 'duplicate_link' ? previous.state === 'active' :
    previous.installation_event?.action === 'duplicate_link' &&
      previous.installation_event.target.record_id === e.target.record_id;
}

export async function installationRevisionId(wire, row, event) {
  const {organisation_id, record_id, parent, recorded_at} = wire;
  const {actor, state, visibility, observed_at, expires_at} = row;
  const digest = await hash({format: 'planner-installation-event/1', organisation_id, record_id, parent, recorded_at,
    actor, state, visibility, observed_at, expires_at, event});
  return 'event-' + digest.slice('sha256:'.length);
}

export async function validInstallationBinding(bundle, wire, row, event) {
  if (!validInstallationEvent(bundle, wire, row, event)) return false;
  return event ? wire.revision_id === await installationRevisionId(wire, row, event) : !wire.revision_id.startsWith('event-');
}

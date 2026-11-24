"""Merge researched pipette heads and tips (data/pipettes-research.json) into
content/pipettes.json (issue #67). Hand-checked entries already in
content/pipettes.json (the Flex) are kept.

Normalisation, all visible in the output:
- 'independent n' channels count as n channels working together (e.g. 8);
  '2/4/8' takes the largest.
- A head with no tip list in the research uses one tip size equal to its
  maximum volume (marked 'tips assumed from range').
- Non-pipetting heads (syringe dispensers) are left out here; dispensing is
  a separate operation.
- A configuration whose heads are not given uses every pipetting head the
  research lists with the same channel count (marked).

Usage: python3 -I scripts/build-pipettes.py
"""
import json
import re

out = json.load(open('content/pipettes.json'))
research = json.load(open('data/pipettes-research.json'))
research = research.get('handlers', research)


def channels(v):
  if isinstance(v, (int, float)):
    return int(v)
  nums = [int(n) for n in re.findall(r'\d+', str(v))]
  return max(nums) if nums else None


for hid, r in research.items():
  if hid in out['handlers']:
    continue
  heads, notes = [], []
  for h in r.get('heads', []):
    ch = channels(h.get('channels'))
    if not ch or 'syringe' in str(h.get('channels')) or h.get('maxUl') is None:
      continue
    tips = h.get('tipSizesUl') or h.get('tips')
    entry = {'id': h['id'], 'label': h.get('label') or h['id'], 'channels': ch, 'minUl': h.get('minUl') or 1, 'maxUl': h['maxUl'], 'tips': tips or [h['maxUl']]}
    if not tips:
      entry['note'] = 'tips assumed from range'
    if h.get('minUl') is None:
      entry['note'] = (entry.get('note', '') + '; minimum volume not found, 1 µl assumed').strip('; ')
    heads.append(entry)
  ids = {h['id'] for h in heads}
  configs = []
  for c in r.get('configurations', []):
    hs = [x for x in (c.get('heads') or []) if x in ids]
    if not hs:
      hs = [h['id'] for h in heads if h['channels'] == 8] or [h['id'] for h in heads]
      c = {**c, 'notes': (c.get('notes') or '') + ' Heads not listed in the research: every 8-channel head is used.'}
    configs.append({'id': c['id'], 'label': c.get('label') or c['id'], 'heads': hs, **({'notes': c['notes']} if c.get('notes') else {})})
  if not configs and heads:
    configs = [{'id': 'all', 'label': 'All recorded heads', 'heads': sorted(ids)}]
  tips = r.get('tips') or []
  per_rack = next((t.get('perRack') for t in tips if t.get('perRack') == 96), 96)
  out['handlers'][hid] = {
    'heads': heads, 'configurations': configs,
    'tipSizes': sorted({t['sizeUl'] for t in tips if t.get('sizeUl')}),
    'tipsPerRack': per_rack,
    'lowRetention': {'available': next((t.get('lowRetention') for t in tips if t.get('lowRetention') is not None), None), 'note': r.get('lowRetentionNote') or 'No low-retention tip of the vendor\'s was found in the sources checked.'},
    'thirdPartyTips': r.get('thirdPartyTips') or {'allowed': None},
    'tipReuse': r.get('tipReuse') or {'supported': None},
    'multiDispense': r.get('multiDispense') or {'supported': None},
    'sources': r.get('sources', []),
  }
  print(hid, len(heads), 'heads;', [c['id'] for c in configs])

json.dump(out, open('content/pipettes.json', 'w'), indent=1, ensure_ascii=False)
open('content/pipettes.json', 'a').write('\n')

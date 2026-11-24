"""Merge researched on-deck module records (data/modules-research.json) into
content/module-capabilities.json and content/positions.json (issue #65).

For each handler and operation the planner uses one module (the engine holds
one provider per operation). The choice is the module that covers the most
conditions: for shaking, cooling while shaking beats heating while shaking
beats shaking only; for a cold reagent position, the coldest static module
(not the thermocycler, which holds the sample). Other researched modules stay
recorded with `ops: []` and `offers` listing what they could do.

Usage: python3 -I scripts/build-modules.py
"""
import json

AMB = 22
caps = json.load(open('content/module-capabilities.json'))
pos = json.load(open('content/positions.json'))
research = json.load(open('data/modules-research.json'))
market_modules = {  # catalogue placeholders replaced by a researched module for the same operation
  'starlet': {'magnetic-separation', 'heating-cooling', 'vessel-transfer'},
  'i7': {'magnetic-separation', 'vessel-transfer'},
  'bravo': {'heating-cooling', 'mixing', 'shaking', 'vessel-transfer', 'magnetic-separation', 'thermocycling'},
  'firefly': {'magnetic-separation', 'heating-cooling', 'mixing', 'shaking'},
  'fluent': {'vessel-transfer'},
  'andrew': {'heating-cooling', 'shaking', 'vessel-transfer', 'mixing'},
}


def temp(t):
  if not t:
    return None
  out = {'min': t.get('min'), 'max': t.get('max'), 'cooling': t.get('cooling') or 'none'}
  if t.get('maxBelowAmbientK') is not None:
    out['belowAmbientK'] = t['maxBelowAmbientK']
  if t.get('minAboveAmbientK') is not None:
    out['aboveAmbientK'] = t['minAboveAmbientK']
  return out


def low(t):
  if not t:
    return None
  if t['cooling'] == 'relative':
    return max(t['min'] if t['min'] is not None else -99, AMB - t.get('belowAmbientK', 0))
  if t['cooling'] == 'none':
    return t['min'] if t['min'] is not None else AMB + t.get('aboveAmbientK', 0)
  return t['min']


def score(op, m):
  t, a = temp(m.get('temperature')), m.get('agitation')
  if op == 'shaking':
    if not a:
      return -1
    s = 1
    if t and a.get('duringTemperature'):
      s += 2 if (low(t) is not None and low(t) <= 8) else 1
    return s
  if op == 'heating-cooling':
    if 'thermocycling' in m.get('ops', []) or not t:
      return -1
    lo = low(t)
    return 10 - (lo if lo is not None else 50) / 10 + (0.5 if not m.get('agitation') else 0)
  return 1


for hid, mods in research.items():
  if hid in ('flex', 'ot2'):
    continue
  # The research lists firefly+'s ODTC under firefly; plain firefly has no on-deck thermocycler.
  mods = {n: m for n, m in mods.items() if not (hid == 'firefly' and 'firefly+' in n)}
  ops = sorted({op for m in mods.values() for op in m.get('ops', [])})
  chosen = {}
  for op in ops:
    cands = [(score(op, m), name) for name, m in mods.items() if op in m.get('ops', [])]
    cands = [c for c in cands if c[0] >= 0]
    if cands:
      chosen[op] = max(cands)[1]
  # A second module per operation (#144): the one that covers the most
  # temperature the chosen module cannot (a heat-only shaker beside a cooling
  # one), if it adds at least 5 K at either end. Thermocyclers hold the sample
  # and are not a second cold or warm position.
  def span(m, op):
    t = temp(m.get('temperature'))
    if op == 'shaking' and not (m.get('agitation') and (not t or m['agitation'].get('duringTemperature'))):
      return None
    if op == 'heating-cooling' and ('thermocycling' in m.get('ops', []) or not t):
      return None
    if not t:
      return (AMB, AMB)
    lo = low(t)
    return (lo if lo is not None else AMB, t['max'] if t['max'] is not None else AMB)
  alt_for = {}
  for op, main in chosen.items():
    if op not in ('shaking', 'heating-cooling') or not span(mods[main], op):
      continue
    mlo, mhi = span(mods[main], op)
    best = None
    for name, m in mods.items():
      if name == main or op not in m.get('ops', []) or not span(m, op):
        continue
      lo, hi = span(m, op)
      gain = max(0, mlo - lo) + max(0, hi - mhi)
      if gain >= 5 and (not best or gain > best[0]):
        best = (gain, name)
    if best:
      alt_for.setdefault(best[1], []).append(op)
  out, positions = {}, {}
  for name, m in mods.items():
    mine = [op for op, n in chosen.items() if n == name]
    if op_mixing := ('shaking' in mine and 'mixing' in market_modules.get(hid, set())):
      mine.append('mixing')
    src = m.get('source') or {}
    out[name] = {'ops': mine, 'offers': m.get('ops', []), 'temperature': temp(m.get('temperature')), 'agitation': m.get('agitation'),
                 'partNumber': m.get('partNumber'), 'replaces': sorted(set(mine) & market_modules.get(hid, set())),
                 'source': {'url': src.get('url'), 'quote': src.get('quote'), 'sourceKind': src.get('sourceKind')}, 'notes': m.get('notes')}
    if alt_for.get(name):
      out[name]['altOps'] = alt_for[name]
    if m.get('mode') in ('move-on', 'in-place'):
      ms = m.get('modeSource') or src
      positions[name] = {'mode': m['mode'], 'pipetting': True, 'basis': 'source', 'source': {'url': ms.get('url'), 'quote': ms.get('quote')}}
  # Records added to the content by hand (an on-deck dispenser, #72) are kept.
  for name, rec in (caps['handlers'].get(hid) or {}).items():
    if name not in out and rec.get('dispense'):
      out[name] = rec
      if name in (pos['handlers'].get(hid) or {}):
        positions[name] = pos['handlers'][hid][name]
  caps['handlers'][hid] = out
  pos['handlers'][hid] = positions
  print(hid, {op: n for op, n in chosen.items()}, {'alt': alt_for} if alt_for else '')

json.dump(caps, open('content/module-capabilities.json', 'w'), indent=1, ensure_ascii=False)
open('content/module-capabilities.json', 'a').write('\n')
json.dump(pos, open('content/positions.json', 'w'), indent=1, ensure_ascii=False)
open('content/positions.json', 'a').write('\n')

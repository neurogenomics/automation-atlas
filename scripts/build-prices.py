"""Build content/prices.json from reviewed price observations (issue #57).

Inputs are JSON arrays of observations in the shape documented in
docs/prices.md (one per priced item seen on a page, award notice, listing
or quotation). This script only selects, classifies and maps them to the
planner's instruments and operations; it never creates an amount.

Usage: python3 -I scripts/build-prices.py <observations.json>... --fx <hmrc.csv> --out content/prices.json
"""
import argparse, csv, hashlib, json, re, sys

# Planner instrument ids for each observed platform. Anything not listed is
# kept out (it is not a planner instrument).
HANDLER = {
  'andrew': 'andrew', 'bravo': 'bravo', 'i7': 'i7', 'firefly': 'firefly', 'fluent': 'fluent',
  'flex': 'flex', 'ot2': 'ot2', 'starlet': 'starlet',
  'other:Hamilton STAR': 'plr-hamilton-star', 'other:Hamilton NGS STAR': 'plr-hamilton-star',
  'other:Hamilton Vantage': 'plr-hamilton-vantage', 'other:Hamilton NIMBUS': 'plr-hamilton-nimbus',
  'other:Hamilton Microlab Prep': 'plr-hamilton-prep',
  'other:Tecan Freedom EVO': 'plr-tecan-evo', 'other:Tecan Freedom EVO 100': 'plr-tecan-evo',
  'other:Tecan Freedom EVO 150': 'plr-tecan-evo', 'other:Tecan Freedom EVO 200': 'plr-tecan-evo',
}
# Stand-alone devices, priced per operation class (workcell or connected route).
CLASS = {'odtc': 'thermocycling', 'kingfisher': 'magnetic-separation', 'plateloc': 'sealing', 'other:Hamilton Heater Shaker': 'shaking',
         **{f'device:{op}': op for op in ('fragment-analysis', 'qpcr', 'fluorescence-reading', 'storage')}}
TIPS = {'other:Hamilton CO-RE tips': ['plr-hamilton-star', 'starlet', 'plr-hamilton-vantage', 'plr-hamilton-nimbus']}

SERVICE = re.compile(r'\b(SERVICE|SERVIEC|MAINTENANCE|AGREEMENT|PREVENTATIVE|PM VISIT|WARRANTY RENEWAL)\b', re.I)
NOT_SYSTEM = re.compile(r'\b(UPGRADE|TIPS?|PLATE|PLATES|SOFTWARE|TRAINING|PARTS?|ADAPTER|REPAIR)\b', re.I)
# A purchase that bundles maintenance is a system price, not a service contract.
WITH_SYSTEM = re.compile(r'(\bincl\.?|\bincluding\b|\+ ?\d+ ?y|\bupgrade and\b|\bsecond\b)', re.I)
MULTI = re.compile(r'\b(TWO|THREE|FOUR|\(2\)|\(3\)|MACHINES|SYSTEMS|INSTRUMENTS)\b', re.I)
KIND = {'contract-award': 'award', 'tender-award': 'award', 'grant-award': 'award', 'federal-schedule': 'list',
        'list-price': 'list', 'consumable-list': 'list', 'used-asking': 'used-asking', 'used-sold': 'used-sold', 'auction-result': 'used-sold', 'quote': 'quote'}
MIN_YEAR = 2018  # older awards are kept out of ranges: prices and configurations have moved


def rid(o):
  h = hashlib.sha1(json.dumps([o['url'], o['item'], o['amount'], o['date']], sort_keys=True).encode()).hexdigest()[:10]
  return f"{o['platform'].replace('other:', '').lower().replace(' ', '-')}-{h}"


def usable(o, why):
  if o.get('amount') in (None, 0) or not o.get('url') and not o.get('reference'):
    return why('no amount or source')
  if o.get('confidence') == 'low':
    return why('low confidence (multi-unit, bundle or unclear)')
  if 'FOR PARTS' in (o.get('notes') or '').upper():
    return why('for parts / not working')
  if KIND.get(o['evidenceKind']) is None:
    return why(f"kind {o['evidenceKind']} not used")
  y = int(str(o.get('date') or '0')[:4] or 0)
  if KIND[o['evidenceKind']] in ('award', 'list') and y and y < MIN_YEAR:
    return why(f'before {MIN_YEAR}')
  return True


def evidence(o):
  e = {'id': rid(o), 'item': o['item'], 'kind': KIND[o['evidenceKind']], 'amount': o['amount'], 'currency': o['currency'],
       'date': str(o.get('date') or ''), 'condition': o.get('condition') or 'not stated', 'vat': o.get('vatOrTax') or 'not stated',
       'service': o.get('includesService') or 'not stated', 'configuration': o.get('configuration') or 'not stated',
       'party': o.get('buyerOrSeller') or '', 'confidence': o.get('confidence') or 'medium',
       'source': {'url': o.get('url'), 'title': o.get('sourceTitle') or o.get('buyerOrSeller') or o['url'], 'quote': o.get('quote') or ''}}
  if o.get('reference'):
    e['source']['reference'] = o['reference']
  if o.get('notes'):
    e['notes'] = o['notes']
  return e


def option(e, label=None, quantity=None):
  out = {'label': label or f"{e['item']} ({e['party'] or e['source']['title']}, {e['date'][:7]})", 'evidence': [e['id']]}
  if quantity:
    out['quantity'] = quantity
  return out


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('inputs', nargs='+')
  ap.add_argument('--curated', required=True, help='hand-written instrument lines (vendor list prices, quotes, bundles)')
  ap.add_argument('--fx', required=True)
  ap.add_argument('--fx-period', required=True)
  ap.add_argument('--out', required=True)
  a = ap.parse_args()

  rates = {r['Currency Code']: float(r['Currency Units per £1']) for r in csv.DictReader(open(a.fx))}
  rates['GBP'] = 1.0
  curated = json.load(open(a.curated))
  ev = {e['id']: e for e in curated['evidence']}
  handlers = curated['handlers']
  classes = curated.get('classes', {})
  dropped = {}

  def why(reason):
    dropped[reason] = dropped.get(reason, 0) + 1
    return False

  seen = set()
  for path in a.inputs:
    for o in json.load(open(path)):
      key = (o.get('url'), o.get('amount'))
      if key in seen:
        why('duplicate'); continue
      seen.add(key)
      if not usable(o, why):
        continue
      e = evidence(o)
      if e['currency'] not in rates:
        why(f"no HMRC rate for {e['currency']}"); continue
      plat, kind, text = o['platform'], e['kind'], f"{o['item']} {o.get('configuration') or ''}"
      tip_for = TIPS.get(plat) or ([HANDLER[plat]] if o['evidenceKind'] == 'consumable-list' and re.search(r'\btips?\b', o['item'], re.I) and plat in HANDLER else None)
      if o['evidenceKind'] == 'consumable-list' and not tip_for:
        why('consumable other than tips'); continue
      if tip_for:
        n = re.search(r'([\d,]{3,6})\s*tips', text, re.I)
        if not n or kind not in ('list', 'award') or re.search(r'\b\d+\s+(LOW VOLUME )?CO-RE TIPS CASE|\bCASES\b', o['item'], re.I):
          why('tip price without a single-pack tip count'); continue
        ev[e['id']] = e
        for h in tip_for:
          handlers.setdefault(h, {}).setdefault('tips', {'label': 'Filtered or conductive tips, per tip', 'options': []})['options'].append(option(e, quantity=1 / int(n.group(1).replace(',', ''))))
        continue
      h = HANDLER.get(plat)
      c = CLASS.get(plat)
      if not h and not c:
        why('not a planner instrument'); continue
      if kind in ('award', 'list', 'quote') and MULTI.search(text):
        why('several instruments in one price'); continue
      if SERVICE.search(o['item']) and not WITH_SYSTEM.search(o['item']) and kind in ('award', 'list'):
        if h:
          ev[e['id']] = e
          handlers.setdefault(h, {}).setdefault('annual', {'label': 'Service contract, per year', 'options': []})['options'].append(option(e))
        else:
          why('device service contract')
        continue
      if NOT_SYSTEM.search(o['item']) and not (kind.startswith('used') and re.search(r'\b(system|workstation|liquid handl)', o['item'], re.I)):
        why('part, upgrade or consumable'); continue
      ev[e['id']] = e
      if c:
        classes.setdefault(c, {'options': []})['options'].append(option(e))
        continue
      own = handlers.setdefault(h, {})
      if kind.startswith('used'):
        own.setdefault('base', {'label': 'Base instrument', 'options': []})['options'].append(option(e))
      else:
        own.setdefault('bundles', [])
        sysb = next((b for b in own['bundles'] if b.get('id') == 'configured-system'), None)
        if not sysb:
          sysb = {'id': 'configured-system', 'label': 'Configured system as bought by public buyers', 'covers': own.get('moduleNames', []), 'options': []}
          own['bundles'].append(sysb)
        sysb['options'].append(option(e))

  for h in handlers.values():
    h.pop('moduleNames', None)
  # Supplier quotations a lab has received are private to that lab (#116):
  # keep them out of the public price file and out of every option citing them.
  private = {i for i, e in ev.items() if e.get('kind') == 'quote'}
  def strip(line):
    if line:
      line['options'] = [o for o in line['options'] if not (set(o['evidence']) & private)]
  for h in handlers.values():
    for line in [h.get('base'), h.get('annual'), h.get('tips'), *h.get('modules', {}).values(), *h.get('services', []), *h.get('bundles', [])]:
      strip(line)
  for c in classes.values():
    strip(c)
  used = {i for h in handlers.values() for line in [h.get('base'), h.get('annual'), h.get('tips'), *h.get('modules', {}).values(), *h.get('services', []), *h.get('bundles', [])] if line for o in line['options'] for i in o['evidence']}
  used |= {i for c in classes.values() for o in c['options'] for i in o['evidence']}
  out = {
    'version': curated['version'],
    'about': curated['about'],
    'fx': {'period': a.fx_period, 'unitsPerGBP': {k: v for k, v in sorted(rates.items()) if k in {ev[i]['currency'] for i in used} | {'GBP'}},
           'source': {'title': f'HMRC monthly exchange rates, {a.fx_period}', 'url': 'https://www.trade-tariff.service.gov.uk/exchange_rates'}},
    'evidence': sorted((ev[i] for i in used), key=lambda e: e['id']),
    'handlers': handlers, 'classes': classes, 'integration': curated.get('integration', {}),
    'excluded': dict(sorted(dropped.items())),
  }
  with open(a.out, 'w') as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
    f.write('\n')
  print(f"{len(out['evidence'])} evidence records; excluded: {out['excluded']}")


if __name__ == '__main__':
  main()

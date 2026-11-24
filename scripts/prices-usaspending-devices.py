import json, urllib.request, sys
Q = {
 'fragment-analysis': ['TapeStation 4200', '4200 TAPESTATION'],
 'qpcr': ['QuantStudio 5', 'CFX Opus 96'],
 'fluorescence-quantification': ['Synergy H1', 'CLARIOstar', 'VANTAstar'],
 'centrifugation': ['VSpin', 'Rotanta 460 Robotic'],
 'shaking': ['BioShake', 'Teleshake'],
 'storage': ['Cytomat', 'Liconic STX'],
 'workcell': ['Automata LINQ', 'integrated workcell liquid handler'],
}
out = {}
for op, terms in Q.items():
  for t in terms:
    body = {"filters": {"keywords": [t], "award_type_codes": ["A","B","C","D"], "time_period": [{"start_date": "2018-01-01", "end_date": "2026-11-05"}]},
            "fields": ["Award ID","Recipient Name","Award Amount","Description","Start Date","Awarding Agency","generated_internal_id"], "limit": 40, "page": 1, "sort": "Award Amount", "order": "desc"}
    req = urllib.request.Request("https://api.usaspending.gov/api/v2/search/spending_by_award/", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
      r = json.load(urllib.request.urlopen(req, timeout=60))
    except Exception as e:
      print(op, t, 'ERR', e); continue
    out[t] = {'op': op, 'results': r.get('results', [])}
    print(f"\n== {op} / {t}: {len(r.get('results', []))}")
    for x in r.get('results', []):
      print(f"  {str(x.get('Start Date'))[:7]} {round(x.get('Award Amount') or 0):>9} | {(x.get('Description') or '')[:110]} | {x.get('Recipient Name','')[:25]}")
json.dump(out, open('devices-raw.json','w'), indent=1)

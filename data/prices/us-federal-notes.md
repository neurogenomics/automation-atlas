# federal.json: how it was collected (2026-11-05)

163 records: 135 contract-award, 12 federal-schedule, 12 consumable-list, 4 grant-award. All USD.

## Sources that worked

1. **USAspending.gov public API** (no key, JSON):
   - `POST api.usaspending.gov/api/v2/search/spending_by_award/`, contract award types A-D, FY2011 to FY2026, sorted by amount.
   - Keywords: STARLET, MICROLAB STAR, NGS STAR, HAMILTON VANTAGE, HAMILTON NIMBUS, MICROLAB PREP, MICROLAB NIMBUS, NIMBUS LIQUID, NIMBUS96, HAMILTON COMPANY, HAMILTON HEATER, HEATER SHAKER, CO-RE, ODTC, INHECO, TELESHAKE, BIOMEK I7, BIOMEK I5, BIOMEK 4000, BIOMEK TIPS, BIOMEK I7 TIPS, TECAN FLUENT, FREEDOM EVO, DITI, BRAVO LIQUID, PLATELOC, AGILENT VSPIN, VSPIN, FIREFLY, SPT LABTECH, DRAGONFLY DISCOVERY, ANDREW+, ANDREW ALLIANCE, MANTIS, MANTIS LIQUID, MANTIS CHIP, FORMULATRIX, KINGFISHER FLEX, EPMOTION, AUTOMATA, AUTOMATA LINQ, OPENTRONS, HAMILTON PREP.
   - `GET api/v2/awards/{id}/` for about 65 key awards, to get the full description and period of performance.
   - Each record's `url` is the human-readable award page `https://www.usaspending.gov/award/{generated_internal_id}`. Amounts are the total obligated award amount. Descriptions are federal purchase-order text, so configuration is only as detailed as the contracting officer wrote it.
   - Raw search results are in `usa/`; award details are in `det/`.
2. **NIH RePORTER API** (`api.reporter.nih.gov/v2/projects/search`, activity code S10, title search). Searched: liquid handling, liquid handler, Hamilton, Biomek, Tecan, Bravo, Fluent, Vantage, STARlet, Microlab, epMotion, firefly, Andrew, Mantis, automated workstation, automation. Only 4 S10 titles named a target platform.
3. **Government Scientific Source (govsci.com)** product pages, opened one at a time with WebFetch. GSS is a GSA Schedule holder (GS-07F-5934R appears in many awards), and many of its pages show "Contract Availability: GSA". These prices give Biomek i5/i7 by configuration, Bravo, AssayMAP Bravo, PlateLoc, epMotion, the Hamilton Heater Shaker, and Hamilton/Tecan/Beckman tips by case. Prices on some pages had changed from what search-engine snippets showed. Only the amount on the fetched page was recorded; differences are noted per record.
4. **Seegene US promo page**: Hamilton 235903 CO-RE 300 µL tips, $250 per case of 5,760. This is a promotion, not a list price.
5. **store.beckman.com**: pack size only (B85888 = 10 racks x 96). No price is shown to anonymous users.

## Blocked or empty sources (not bypassed)

- **GSA Advantage**: search URLs return 404 to WebFetch, and the site is a JS app. Not attempted further.
- **GSA eLibrary / VA FSS price lists**: not reached; the catalogues are JS-only or downloadable files behind forms.
- **SAM.gov J&A / sole-source notices**: search found notices (for example, VA sole-source to Hamilton for STARlet service, CDC sole-source for Fluent 1080), but the snippets had no dollar values. Attachments on sam.gov were not opened.
- **madeinamerica.gov waiver** for the NIH firefly (RFQ-NIH-2157190): lists items (firefly 6-head, tips 125/50 µL 40 racks/case, genomics kit) but no dollar value.
- **hamiltoncompany.com**: 403.
- **agilent.com store**: 403.
- **fishersci.com**: timeout. The KingFisher Flex 5400630 page requires a login for price.
- **vwr.com / avantorsciences.com** (Bravo tips 19477-002): redirected to a homepage or returned empty content. A search snippet showed a "$529.40 pack of 50" listing on the Canadian site, but it was not recorded because the page could not be opened.
- **Contracts Finder UK attachment** (Hamilton STAR price indication, £139,625 per search snippet): 403, not recorded. It is also outside the federal scope.
- **govsci.com search and category pages**: JS-rendered, so they show 0 results. Only direct product-detail URLs work.
- A curl fetch of govsci was refused by the harness as bot-check circumvention. Only WebFetch was used after that.

## Not found

- No federal award text naming Automata LINQ, Hamilton NIMBUS purchases (one software upgrade only, $7,900), INHECO CPAC or Teleshake as line items, Agilent VSpin, or the Hamilton HHS outside GSS.
- No peer-reviewed paper with a stated purchase price was found in one standard plus one extended search. Industry blogs (Excedr, LabX) quote price ranges but were not recorded as evidence.

## Caveats for the planner

- Federal award amounts often bundle accessories, installation, training and warranty. Records flag multi-unit awards (for example 2x Freedom EVO 200 for $840,894; 2x firefly for $352,523) and very large or ambiguous ones (Vantage $2.56M; Fluent 480 "machines" $2.08M) with `confidence: low`.
- Service contracts are tagged `evidenceKind: contract-award` with `includesService: yes (...)`. Most are for 1 year; the POP is given in notes when known.
- Per-tip costs in notes are simple divisions of the stated case price by the stated tip count. They are not separate observations.

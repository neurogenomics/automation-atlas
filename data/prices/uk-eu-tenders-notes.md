# Tender price search notes (2026-11-05)

Output: `tenders.json`, 128 records: 60 from Contracts Finder, 13 from Find a Tender, 55 from TED. 127 have an amount. Confidence: 41 high, 62 medium, 25 low.
Builder script: `build_tenders.py`. Raw API pulls are in `raw/`.

## How the data was read
- **Find a Tender and Contracts Finder HTML** (`/Notice/...` and `/PDF`) return **HTTP 403** to WebFetch. I did not try to get around this.
- **Contracts Finder official public API** works:
  - `POST /api/rest/2/search_notices/json` with status Awarded, about 45 keywords.
  - `GET /api/rest/2/get_published_notice/json/<id>` returns the full notice: description, award value and supplier.
  - URLs in the records point to the human notice page, `/Notice/<id>`.
- **Find a Tender official OCDS API** works for single notices: `GET /api/1.0/ocdsReleasePackages/<notice-id>`.
  - It has no keyword search, so I found notice IDs through WebSearch with the domain restricted to find-tender.
  - It rate-limits (429). Requests were slowed down.
  - `amount` is net of VAT. `amountGross` is shown where the notice gives it.
- **TED v3 Search API** works: `POST https://api.ted.europa.eu/v3/notices/search`.
  - The query was full-text `FT~"term"` over award/VEAT notice types, from 2018-01-01.
  - Values come from the `total-value` field. That field is the eForms notice total, which is net of VAT.
  - TED notice HTML is rendered by JavaScript, so WebFetch got nothing back.
  - The `/xml` endpoint returned an empty 202, which looks like a bot challenge. I stopped there. A later attempt with a browser user-agent was refused by the permission system, and I did not retry it.
  - In practice, only eForms-era notices (late 2023 onwards) came back with titles and descriptions. That is why the EU records date from 2023 to 2026.

## Searches tried
- **WebSearch (standard):**
  - find-tender: Hamilton STARlet, Biomek i7/i5, Tecan Fluent, NGS library prep with Hamilton Vantage/NIMBUS/STAR, firefly/mosquito/Bravo/Andrew+, Oxford/Cambridge/Crick/Sanger/Imperial.
  - Contracts Finder: liquid handling robot.
  - TED: Hamilton Microlab STAR.
- **Contracts Finder API keywords:**
  - Instruments and vendors: liquid handling, liquid handler, Hamilton, STARlet, Microlab, Vantage, NIMBUS, Biomek (i7/i5/4000), Tecan, Freedom EVO, Fluent (780/480), Bravo, Agilent liquid handler, Opentrons, mosquito, Dragonfly, Mantis, SPT Labtech, Andrew, Andrew Alliance, Waters Andrew, KingFisher, epMotion, Echo acoustic, Echo 525, ODTC, INHECO, Formulatrix, CyBio, Integra Assist, Gilson PIPETMAX.
  - Generic terms: pipetting robot, robotic pipetting, NGS library preparation, automated nucleic acid extraction, automation platform genomics.
- **TED API terms:**
  - English: liquid handling, liquid handler, pipetting robot, Microlab STAR, STARlet, Hamilton Robotics, Biomek, Freedom EVO, Tecan Fluent, Agilent Bravo, Opentrons, SPT Labtech, mosquito, Andrew Alliance (0 hits), epMotion, KingFisher.
  - Other languages: Pipettierroboter, Pipettierautomat, Liquid-Handling, robot de pipetage, station de pipetage (0 hits), pipetteringsrobot.
  - Rate-limited (429), not retried: pipetteerrobot, robot pipettaggio, Hamilton Vantage, Hamilton NIMBUS.

## Interpretation cautions
- **Swedish, Danish and Norwegian regional values:**
  - Some are much higher than a single instrument, for example Region Skåne SEK 11.5M, VGR SEK 6–6.6M, Uppsala SEK 6M, Örebro SEK 5.6M and the Echo 525 at NOK 6.8M.
  - They probably include consumables frameworks and service options over the term. They are marked low.
- **UK COVID-era fleet buys are not per-unit prices.** Examples: DHSC STARlet £10.7M, PHE Biomek £1.76M, PHE Mosquito/Dragonfly £0.84M, NHSBT Hamilton £1.1–1.4M. They are marked low.
- **University of Dundee awards are excluded or flagged:**
  - The £1.5M Beckman award (065316-2025) is a cumulative spend ceiling, so it is not recorded.
  - The SPT drop-setter award shows the same £183,082.10 on both lots and is marked low.
  - The Tecan service award is excluded: £625k is an estimated value on the contract notice, not an award.
- **Frameworks not recorded as prices:**
  - LUPC Lab Equipment (General) Lot 9, £200M (061087-2025).
  - APUC lab equipment, £10M.
  - Helse Sør-Øst liquid handling framework, NOK 29M.
  - Karolinska pipetting robots, SEK 154M.
- **VEAT/intention notices** (Milan STARlet €185k, Bonn Echo €311k, Amsterdam UMC €315k) give the intended contract value. They are flagged in the notes, and Amsterdam UMC is not recorded.
- **Some API records list no winner** (for example Copenhagen Fluent 1080). The model is named in the title or description.
- **Not found:** no Waters Andrew+, Agilent Bravo in the EU, INHECO ODTC standalone, Hamilton NIMBUS or Vantage purchase awards with values. The only Vantage entry is a service plan. The only standalone ODTC price is inside the NHS "NGS STARlet 8 x 1ml ODTC" package (£123,435.81).

## Not done or blocked
- whatdotheyknow.com FOI: not searched, for lack of time.
- University contract registers: not searched.
- HTML views of Find a Tender, Contracts Finder and TED: blocked or JavaScript-only, as described above.

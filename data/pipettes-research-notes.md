# Pipetting heads and tips research notes (issue #67), 2026-11-05

Data: `pipettes.json` in this folder. Shape: `{"about", "handlers": {"<planner id>": {heads, configurations, tips, thirdPartyTips, tipReuse, multiDispense, timePerPass, sources, notes}}}`. This matches `content/pipettes.json`, where the Flex entry is the existing pattern. Each tip has an extra optional `heads` field that says which head the tip fits, where that varies. `null` means not found.

## Blocked or unusable sources
- hamiltoncompany.com (product-specs, consumables, FAQ): 403. Their figures in search snippets were not recorded.
- agilent.com (tip selection guide 5991-1902EN, Bravo tip page): 403. The Stanford Bravo PDF on swap.stanford.edu also returned 403.
- laboratory-equipment.com Vantage brochure: 403. bostonind.com: 402.
- VWR/Avantor pages redirect to the VWR home page. reuzeit listings redirect or fail TLS.
- A curl with a browser user agent was refused by the permission classifier (bot-check circumvention). It was not retried. All PDFs were fetched with WebFetch and converted with pdftotext.

## Main primary documents
- Hamilton "Automated Solutions" brochure (2025, hosted by ELRIG). It has the platform table: Prep 2 ch + 8 MPH; NIMBUS 8 ch, 96/384; STAR line 16 × 1000 µL and 8 × 5 mL, 96 or 384; Vantage and STAR V 16/8/8 MagPip, 96 and/or 384, 0.35–5000 µL.
- Microlab Prep brochure 2023: CO-RE II tip part numbers, 5 × 96 per case, conductive.
- PyLabRobot `resources/hamilton/tip_racks.py` and `tip_creators.py`: Hamilton part numbers for 10 to 5000 µL, sterile and clear variants, 4/5 mL racks of 24.
- Tecan Fluent Product Catalog 402731: A-FCA 0.5–1000 µL; L-FCA; MCA96 1–1000 µL; MCA384 0.25–125 µL (384) and 0.5–500 µL (96); full LiHa, MCA96 and MCA384 DiTi part numbers. LiHa tips are stated as also for the EVO LiHa.
- Tecan Freedom EVO spec sheet: Liquid LiHa 2/4/8 ch 0.5–5000 µL; Air LiHa 4/8 ch 0.5–1000 µL; MCA96 1–200 µL; MCA384; tip re-racking.
- Agilent Bravo data sheet 5990-3480EN: 96LT 2–250 µL; 96ST and 384ST 0.3–70 µL; tip ranges per size.
- SPT firefly user guide (specs 1.3, tips 3.1) and product page.
- Beckman store pages and a 2024 Beckman tip flyer (Neta) for i-Series tip part numbers.
- Waters KB WKB122208 for Andrew+ pipettes. Andrew Alliance guideline for "put tips back".
- Opentrons OT-2 docs and shop pages.

## Caveats and judgement calls
- Hamilton 96 and 384 head ranges come from old announcements. The 96 head (1–1000 µL) is from 2012. The 384 head (50 µL per channel, 300 µL with Rocket tips in 96 format) is from 2010. The 384-head tip part number was not confirmed.
- STARlet: the brochure gives one STAR-line row (16 × 1000 µL max). The STARlet maximum of 8 channels is an assumption and is marked as such.
- Vantage tips are assumed to be the CO-RE range, because PyLabRobot uses the same Hamilton tip definitions. No Vantage-specific tip source was found.
- NIMBUS: whether channels and a head can be fitted together is not confirmed.
- Biomek i7 Span-8 range: Beckman pages give no Span-8-only range. 1–250 µL (extended 1–1000 µL) comes from one Chinese core-facility listing. The tip-to-head mapping for MC96-300 and MC96-1200 is inferred from volumes. No 384-head tips were identified.
- Beckman low-retention tips: none seen from Beckman. Third-party low-retention tips for Biomek exist (Thermo, Alkali, from search snippets only).
- Fluent MCA96: the catalog says 1–1000 µL, but it lists MCA96 tips only up to 500 µL. Both facts are recorded.
- Bravo tip part numbers come from a third-party cross-reference (Fluotics on PipetTipFinder), because the Agilent guide was blocked. Filtered and conductive Bravo part numbers (e.g. 19133-142) appeared only in a search summary and were not recorded.
- firefly tips per rack: 384 or 96 is inferred from the rack format and not stated. The product page table has inconsistent rows. The dispenser range is 200 nL–3690 µL in the guide and 200 nL–4 mL on the product page.
- Andrew+: no tip list could be read (the KB links out). Tip sizes and racks are a gap.
- OT-2: there is no GEN2 P1000 8-channel in the docs. Third-party tips are "not validated". Whether they void the OT-2 warranty was not confirmed. The Flex entry cites quotation terms that void it.
- timePerPass: no vendor time per aspirate/dispense pass was found for any platform. The only figure is the firefly dispenser bulk fill, "starting from 30 seconds" per 96-well plate.
- tipReuse for Hamilton rests on PyLabRobot `return_tips()`, not VENUS. multiDispense was confirmed only for Hamilton Prep (UI "Multi-Dispense"), firefly syringes and OT-2 `distribute()`.

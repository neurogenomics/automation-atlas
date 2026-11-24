# Non-contact dispensers: research notes (2026-11-05)

Companion to `dispensers-research.json`. These are the gaps, conflicts and source-quality caveats. Every figure in the JSON has a URL and a quote. Where a value is null, the field says "not found".

## Not found (left null)

- **Increment / resolution:** dragonfly discovery, Certus Flex (the SelectScience snippet ">0.05 nl" was not verified on a maker page), MultiFlo FX (the cassette size is used as a proxy and marked as inferred).
- **Prime volume:** dragonfly, Tempest, Certus, Multidrop Combi and Combi nL. MultiFlo FX gives minimum prime volumes. Mantis gives default prime per chip. I.DOT and Echo have no fluid path.
- **Time to fill a plate:** Mantis (only "10 fills/s"), Echo (only "700 drops/s" for the 650 Plus).
- **Viscosity limits:** dragonfly (claims "irrespective of liquid viscosity" but gives no number), Tempest, Certus, Multidrop Combi, Combi nL, MultiFlo FX.
- **Suspension limits** (particle size, settling, stirring): no maker gives any. The Mantis FAQ suggests a third-party shaker. Tempest has a "Keep Cells and Beads Suspended" heading, but its body text was not retrievable.
- **Bead-pellet disturbance from non-contact dispensing:** no quantitative maker or peer-reviewed source. The only related evidence is that an all-Echo NGS paper still did bead clean-ups with a pipetting robot.
- **Quantified splash or cross-contamination for non-contact dispensers:** none found. There are only vendor "no carryover" claims and the Mantis FAQ explanation of splash mechanics.
- **Robot-deck trough dead volumes** (Opentrons/NEST, Agilent, Axygen, Hamilton): no maker figure found. The only measured comparison is INTEGRA's note for hand-held multichannel pipettes (10–65 µL).
- **Prices not found:**
  - New list prices for dragonfly, Mantis, Tempest, Certus, I.DOT, Echo and MultiFlo FX (all quote-only).
  - dragonfly syringe packs.
  - I.DOT source plates (VWR lists packs of 100 without a price).
  - Echo 384PP/LDV plates (Fisher blocked).
  - Certus valves and syringe kits (Trajan store returned HTTP 429).
  - MultiFlo cassettes: a Fisher UK snippet gave GBP 675/837, but the page itself was blocked, so the value is null.
- **Opentrons integration:** no Opentrons OEM or partner listing for any of these dispensers. The Opentrons integrated-devices page lists BD Rhapsody and a Cephla microscope only.
- **DIY:**
  - No "Chris Anderson lab" syringe-dispenser design could be identified. Please supply the link or paper.
  - "OpenSampler" exists only as a water sampler (OPEnS Lab) and a vial autosampler (OpenBuilds), not as a plate dispenser.
  - No HardwareX non-contact bulk plate dispenser was found. Sidekick (solenoid displacement pumps, $710) is the closest.

## Conflicts to resolve

- **dragonfly dead volume:** the product page says "75 or 240 µL". The user-manual consumables page says 30 µL (LDV) and 200 µL (standard). Both are recorded.
- **Certus minimum volume:** the DKSH distributor page gives 35 nL and the KIT facility page gives 10 nL. Dead volume of 65 µL comes from DKSH only.
- **Echo 384PP lower working volume:** the HKU facility SOP gives 15 µL (20 µL for the CP calibration). A search snippet of the Beckman 2023 consumables brochure gave 20 µL, but the brochure is not retrievable (404 / Wayback empty).
- **Tempest pump rate:** the same page says both 8 fills/s and 3 fills/s.

## PyLabRobot (checked main @7779f50, 2026-11-03)

- **Multidrop Combi:** PR #964 (bulk dispenser module plus Multidrop Combi backend) was merged on 2026-03-25 into the `v1b1` branch. `devices.json` lists it as "mostly" with api_version v0. The code is not in main. Use the PR branch or history.
- **Echo 525/650:** PR #1001 is open and unmerged.
- **MultiFlo / MultiFlo FX / 405TS:** PR #1266 is open and unmerged. Main already has an EL406 backend with peristaltic and syringe dispenser modules, which belong to the same BioTek LHC family.
- **Mantis:** listed as "wip" in `devices.json`, with no code.
- **Certus, Tempest, dragonfly, I.DOT:** absent.

## Source-quality caveats

- beckman.com, dispendix.com, agilent.com and fishersci.* block scripted fetches:
  - Echo figures came via WebFetch text extraction, so quotes may be lightly normalised.
  - I.DOT figures come from Wayback copies of the maker datasheet (v3.1, Dec 2024) and the product page (Jan 2026).
  - The MultiFlo FX spec sheet is BioTek's own PDF (dated 10/15/14) hosted on messe.de, plus a Sep 2024 Wayback copy of the Agilent page.
- Certus has no Gyger-hosted spec sheet. It relies on the DKSH distributor page and a KIT core-facility page.
- Echo source-plate working volumes come from an HKU core-facility SOP, not from Beckman.
- Formulatrix eStore and Thermo UK prices are geo-localised GBP list prices as seen on 2026-11-05. Used prices are eBay US asking prices, not sold prices.
- The Multidrop Combi+ GBP list prices (21,431; SMART+ 22,959; Combi nL 33,047) and cassette prices (GBP 712 list) come from Thermo UK pages.

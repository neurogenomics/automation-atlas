# Deck capacity: research notes (5 Nov 2026)

Companion to `decks.json`. Generator: `deckgen/build.py`. The PyLabRobot clone is at commit 7779f50 in `plr/pylabrobot`.

## Schema notes
- `positions: null` means no figure was found on an opened page. It does not mean zero.
- Module `positions` can be fractional: Hamilton gives the ODTC as 2.5 ANSI/SLAS sites. A packer should round up.
- `fixed[].positions: 0` marks waste that sits outside the counted positions, such as the Hamilton waste block right of the last track.
- Extra key `variants`: per-model figures for Fluent 480/780/1080, Freedom EVO 100/150/200 and STAR/NGS STAR/STARplus. The top-level `positions` is the middle model (Fluent 780, EVO 150).
- Storage `tipRacks: null` means the storage exists but no tip-box count was found.

## How positions were derived
- **STAR/STARlet:** the tracks are the deck. The Illumina-hosted Hamilton reference guide says "up to 9 carriers with 6 tracks (6T) for microplates and CO-RE tips". So STAR is 54/6 = 9 carriers x 5 = 45 and STARlet is 30/6 = 5 x 5 = 25. 1T tube carriers reduce this.
- **Vantage:** the figure is derived from PLR only (1.3 m deck, 54 tracks, same 22.5 mm pitch). PLR places the trash inside the deck span, so 45 is an upper bound. The 2.0 m deck is not modelled.
- **EVO:** grids per model come from PLR and UniteLabs. 3- and 4-position carriers are 149 mm, which is 6 grids. Grid 1 is assumed to hold the wash station (the PLR default). The figure counts 4-position carriers; the 3-position figure is in the basis text.
- **Fluent:** the Tecan catalog states microplate capacity per model directly (30/48/72).
- **Biomek i7:** 9 deck plates x 5 positions, per the hardware manual.
- **Bravo:** 9 locations, each holding a platepad or an accessory.
- **Opentrons:**
  - OT-2: 11 slots plus the trash in slot 12.
  - Flex: 12 working slots, one of which must hold the trash bin or the waste chute, plus 4 gripper-only staging slots.

## Conflicts found
- **Opentrons Flex Stacker:** the API page says 7 tip racks (6 in the Stacker + 1 on the shuttle) and that the shuttle occupies a column 4 slot. The current hardware page says a maximum of six tip racks, with an adapter in a column 3 slot that still stores labware. Both are recorded.
- **OT-2 Thermocycler:** Protocol Designer lists it as "Slots 7 and 10". The hardware page says it requires 7, 8, 10 and 11. 4 is used.
- **Flex Magnetic Block:** it can sit in column 3 on top of a staging area slot (staging quickstart). It cannot go in column 4: "Modules are not supported in column 4". The brief assumed staging slots were allowed; that is only true in this column 3 sense.

## Blocked or failed sources (no bypass attempted)
- hamiltoncompany.com (product-specs, compare-platforms): HTTP 403. The NIMBUS figures (20 SLAS positions for NIMBUS96/HD, 11 for NIMBUS4) and the STAR "55 ANSI/SLAS" figure were seen only in search snippets and are not used.
- bostonind.com: HTTP 402. frankshospitalworkshop.com (STAR manual): TLS certificate error.
- hpst.cz Bravo data sheet: redirects to an unrelated site. A labrulez.com copy was used instead.
- chem-agilent.com Bravo accessory data sheet: 404. labrulez paper page: 403.
- healthcare21.eu EVO: 404.
- sptlabtech firefly+ page: 404.
- Andrew+ (waters.com, andrewalliance.com): blocked earlier in this session (see modules-notes.md). A curl with a browser user agent was refused by the permission system as bot-check circumvention and was not retried.
- Partway through, WebSearch and WebFetch hit the session's 5-hour usage limit (resets 14:40 London). That stopped the firefly, Andrew+, BenchCel per-rack and Biomek ALP footprint lookups.

## Sources reused from earlier in this session
The following were opened from local copies that an earlier agent in this session downloaded to `mod_dl/` (URLs listed in `modules.json`):
- Hamilton Integrated Devices brochure (conferenceharvester.com): HHS/HHC 1 site, ODTC 2.5 sites, Turntable 2 positions.
- Microlab Prep brochure (cdn.shopify.com): 8 positions.
- NGS STAR flyer (trillium.de).
- Beckman NGS eBook (pages.beckman.com).
- firefly flyer.

## Gaps
- **NIMBUS:** no SBS count from an opened page. PLR gives 30 rails on an 831 x 424 mm deck.
- **firefly / firefly+:** no position count. Only "2 tier moving deck" plus a sub-deck is confirmed. No firefly+ shelf count.
- **Andrew+:** nothing confirmed (domino/pegboard count unknown).
- **Biomek ALP footprints:**
  - Unknown: Peltier, Shaking Peltier, Orbital Shaker, ATC, Trash ALP.
  - Known: static ALPs come as 1x1, 1x3 and 1x5.
  - Not found: Biomek stackers/hotels.
- **Fluent/EVO module footprints:** Thermoshake, ODTC, Te-MagS and BioShake grids are unknown. CPAC HT segment = 3 positions.
- **Hamilton:** footprints unknown for CPAC, magnetic stand and Thermoshake. No autoload/off-deck tip capacity. STARplus count unconfirmed (PLR 76 tracks).
- **Bravo:** tip boxes per BenchCel rack unknown (2/4/6 racks confirmed). Per-accessory placement rules not opened, beyond the trash (location 4 or 6) and the shaker/barcode reader (any location).

## Update, 6 Nov 2026 (#135)
- **firefly / firefly+:** the full user guide (FF1013–FF2002) says the shaker and thermal modules sit below the decks and "do not take up deck locations"; the firefly+ ODTC sits in the base. Magnetic blocks go on the decks, but no per-block footprint is stated, so they stay assumed at one position. Thermal modules: -20 to 99 °C; shaker 200–3000 rpm (specifications page).
- **Bravo:** Heating Shaking Station and Magnetic Bead Accessory take one location each, any location; the Peltier Thermal Station and the tip trash each need the cutout at location 4 or 6 (now a placement rule). ODTC footprint on the Bravo still not found (only generic "about two SBS positions" in snippets).
- **NIMBUS:** a Thermo Fisher Axiom NIMBUS site-prep guide places the Thermoshake in deck position 1 and the CPAC in position 2 (one each). The total NIMBUS deck count is still not stated in any opened page, so NIMBUS keeps no deck record.
- **Flex Stacker:** both figures agree: 6 tip racks inside the Stacker plus 1 on its shuttle = 7.
- **Still unknown:** Andrew+ domino count; Biomek ALP footprints on the i7 (the "single ALP position" text is for Biomek 3000/NX/FX); Tecan grid footprints of Thermoshake, ODTC, Te-MagS and Magnum FLX; Hamilton track footprints of Thermoshake, magnetic stand, CPAC and HHC (hamiltoncompany.com still blocks fetchers); Biomek magnet range.

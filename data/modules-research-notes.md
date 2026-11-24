# On-deck modules: research notes (5 Nov 2026)

Companion to `modules.json`. Generator: `modgen/build.py`. Downloaded PDFs are in `mod_dl/`.

## Schema extensions
- `temperature.minAboveAmbientK`: the lower limit is ambient + N K (heat-only devices). `min` is null in that case.
- `temperature.maxBelowAmbientK`: the most a `relative` cooler can go below ambient.
- `agitation.type` can be `"rocking"` (Hamilton Seesaw) or null where the type is unknown.
- `mode: null` marks grippers and arms: they move plates and are not destinations.

## Primary sources opened (with what each gave)
| Source | Host | Gave |
|---|---|---|
| Hamilton "Integrated Devices" brochure (PDF created Jan 2024) | conferenceharvester.com (exhibitor upload) | HHS 2G/3G, HHC, ODTC, Sample Cooling Carrier, HIS, Seesaw: ranges and part numbers |
| Hamilton NGS STAR flyer | trillium.de (distributor) | NGS STAR deck: ODTC, HHS, CPAC Ultraflat, Ambion magnetic stand, iSWAP, CO-RE gripper |
| Hamilton Clinical NGS STARlet IVD-R flyer (2021) | trillium.de | ODTC, 2 HHS, 2 CPAC, magnetic stand, CO-RE gripper |
| Hamilton NGS VANTAGE flyer | trillium.de | Thermoshake AC, CPAC, ODTC, cooling carrier, IPG, Quad CO-RE gripper, magnetic stand |
| Hamilton Microlab Prep brochure (Aug 2023) | cdn.shopify.com (distributor) | Prep HHS part numbers (105 °C, 2500 rpm), compatible magnet plates, CO-RE II paddles |
| inheco.com product pages: cpac, thermoshake-classic, thermoshake-ac, teleshake-95, odtc | inheco.com | Ranges, ΔT limits, rpm |
| Inheco Thermoshake brochure 01-2023 PDF | inheco.com | RM variant for Tecan RoMa; integration list (Biomek i5/i7, Hamilton Vantage/Star Line/Nimbus, Tecan Fluent/EVO) |
| qinstruments.com: BioShake Q1, 3000-T elm, D30-T elm | qinstruments.com | Ranges, rpm, order numbers |
| Beckman "Automated Solutions for NGS Library Prep" eBook PDF | pages.beckman.com | Static Peltier, Shaking Peltier, Orbital Shaker ALPs, ATC, gripper |
| Thermo Fisher ATC 96 spec sheet | assets.thermofisher.com | ATC 4–105 °C |
| Tecan Fluent Product Catalog 402731 PDF | tecan.com/hubfs | ODTC, BioShake series, CPAC HT 2-TEC, CPLC, MIO, Magnum FLX, RGA/FCA/MCA96 grippers |
| Tecan Freedom EVO 2 150 spec sheet | richmondscientific.com (reseller) | RoMa gripper |
| SelectScience Te-Shake and Te-MagS pages | selectscience.net | Te-Shake and Te-MagS descriptions only (no figures) |
| Macherey-Nagel NucleoMag Blood EVO app note | cdn.shopify.com | Te-Shake and RoMa used on EVO |
| Agilent Bravo User Guide (KB14): accessories overview, hardware overview, Magnetic Bead Accessory, Orbital Shaking Station | automation.help.agilent.com | Accessory identities (Teleshake 95, CPAC Ultraflat), gripper, magnet |
| SPT Labtech firefly flyer PDF, firefly and firefly+ web pages | sptlabtech.com | Module list (no figures), ODTC on firefly+ |
| Waters connected-devices catalogue 720007738EN (Oct 2022) | icpms.cz (labrulez copy) | Heater-Shaker+, Shaker+, Magnet+, Peltier+ and gripper part numbers and ranges |
| Andrew Alliance Peltier+ user manual 518.0041 | andrewalliance.com/wp-content | Peltier+ 0–99 °C (tested at 26 °C RT) |
| PyLabRobot repository (local clone, commit 7779f50, 3 Nov 2026) | github.com/PyLabRobot/pylabrobot | Cross-checks: ThermoShake/CPAC/ODTC/BioShake tables in docs/user_guide/*/hello-world.ipynb; legacy HHS backend asserts 0<T≤105 °C and 20–2000 rpm (code limits, not specs); Prep heater-shaker reads its ranges from firmware |

## Blocked or failed sources (no bypass attempted)
- hamiltoncompany.com (all product-spec, HHS, HHC, ODTC, NIMBUS and Prep FAQ pages): HTTP 403.
- beckman.com and mybeckman.vn ALP pages (A93938, A93942), SPRIPlate FAQ: HTTP 403.
- waters.com product and shop pages (Heater-Shaker+, Shaker+), andrewalliance.com HTML pages, analytics-shop.com: 403 or timeout.
- agilent.com brochure 5990-4482EN: returned HTML instead of the PDF. A search snippet says the Peltier station runs −20 to +100 °C; this was not verified and is not used.
- inheco.com PDFs for the ODTC, CPAC and Teleshake brochures: returned HTML (dead links). The product HTML pages were used instead.
- docs.pylabrobot.org: the old URLs return 404 (site restructured), so the local clone was used.
- laboratory-equipment.com: 403.

## Searches run (main)
Hamilton HHS/HHC specs; Inheco Thermoshake ΔT; CPAC Ultraflat part numbers; Biomek Static/Shaking Peltier ALP; Bravo Peltier/Orbital stations; firefly modules (twice); Andrew+ Peltier+/Shaker+/Magnet+/gripper; Tecan Fluent modules; Te-MagS/Te-Shake/RoMa; Te-Shake "ambient +5" 80 °C; Hamilton NGS STAR/NIMBUS deck layouts; NIMBUS CO-RE gripper; Prep heater shaker/grippers; Thermo ATC; Beckman SPRIPlate magnet; Inheco Teleshake 95.

## Known gaps and caveats
- **NIMBUS**: no on-deck magnet and no gripper confirmed from an opened page. Search snippets mention an optional CO-RE Gripper, CO-RE Paddles and a Labware Gripper Arm (hamiltoncompany.com, 403). A 2009 article describes a NIMBUS heater/shaker package with heating to 70 or 95 °C; it is outdated and not used. ODTC on NIMBUS is not confirmed.
- **STARlet**: iSWAP not confirmed. HHC is assumed on STARlet as part of the "STAR" line.
- **Biomek i7**: no magnet module sourced. SPRIPlate 96 Super Magnet Plate A32782 appears only in search snippets. Static/Shaking Peltier part numbers come from search URLs. Neither Peltier states a ΔT limit, so both are recorded as `absolute` as stated. The Shaking Peltier's orbit type is unverified.
- **Tecan EVO**: no figures for Te-Shake (temperature or rpm) or the Te-MagS heater. ODTC, CPAC and BioShake on EVO are not confirmed from opened pages; only Fluent is confirmed. The Thermoshake RM/AC are confirmed for EVO.
- **Bravo**: Orbital Shaking Station rpm and model unknown. It is not stated whether the Peltier station uses the 70 °C or the 110 °C CPAC variant (70 recorded). Thermal Station (chiller) range unknown.
- **firefly**: no temperature or rpm figures published for the cooler/heater block or the shaker. The magnet model is not named.
- **Andrew+**: Peltier+ `maxBelowAmbientK = 26` is derived (0 °C at 26 °C room temperature). Shaker+ 200–3000 rpm covers plates; the tube version may top out at 2000 (unverified).
- **HHC**: absolute 0–110 °C per the brochure. Search snippets report that a hamiltoncompany.com page says 0–100 °C (not opened).
- **CPAC ΔT**: the page says "minimum 25K below room temperature"; the spec table is summarised as "Up to 30 K". 25 K is recorded.
- **Hamilton HIS and Seesaw**: platform assignment (STAR) is assumed; the brochure does not name platforms for them.

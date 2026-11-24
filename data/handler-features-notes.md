# Handler feature survey: gaps and caveats (2026-11-05)

Companion to `handler-features.json`. 140 cells: 78 true, 2 false, 60 null. A null means **not found**. It does not mean absent.

## Access problems that caused nulls
- **hamiltoncompany.com** (product pages, compare page, HamiltonOne, DeckWatch flyer, knowledge base) returned 403 to the fetcher. Hamilton cells therefore rest on:
  - the STAR Line Operator's Manual 627043_04 (2020), hosted at gmc.vu.lt;
  - the STAR brochure hosted at epfl.ch;
  - the Microlab Prep brochure on Hamilton's Shopify CDN;
  - a Hamilton-authored SelectScience article for NIMBUS;
  - Hamilton's 2013 VANTAGE launch press release (RoboticsTomorrow).
- **Search snippets.** Where a cell's quote came from a search-engine snippet of a blocked page, `source.via` says so. Those quotes were not checked against the page itself. Affected cells: STAR/STARlet remoteMonitoring (HamiltonOne); VANTAGE LLD, clot and camera; Prep errorRecovery; Bravo liquidClasses; Andrew+ camera.
- **agilent.com** (Bravo product page, data sheet, VWorks PDFs) returned 403. Bravo cells come from the online VWorks User/Setup Guide (automation.help.agilent.com). Those are software-level features, not Bravo hardware.
- **waters.com** (Andrew+ and OneLab pages) timed out on every attempt, and andrewalliance.com now redirects there. This is why Andrew+ is almost entirely null.
- **Biomek** brochure PDFs on media.beckman.com returned "not found". Product and software pages worked.
- Per auto-mode policy, I did not work around any bot block with a spoofed user agent.

## Substantive gaps (worth a manual check)
- **NIMBUS:** no source fetched for tip presence, camera/barcode, remote monitoring, error recovery, simulation or liquid classes. VENUS runs it, but no source tied VENUS simulation to NIMBUS.
- **VANTAGE:** error recovery, simulation and liquid classes are not stated in any fetched source. A STARlet-specific listing for HamiltonOne was also not found.
- **Biomek i7:** the LLD principle (capacitive or pressure) is not stated. Nothing found on clot or pressure monitoring, or on tip presence.
- **Fluent:** pLLD and MultiSense/PMP are documented on the Tecan knowledge-portal page for Freedom EVO (Liquid/Air LiHa arms). Whether Fluent arms have pLLD was not confirmed. Tip presence was not found.
- **Freedom EVO:** the camera cell is "true" only because of the PosID barcode reader. No camera was found. Error recovery was not found.
- **Bravo:** no LLD, clot or tip-presence source. The hardware pages were blocked.
- **firefly / firefly+:** no LLD, pressure monitoring, tip presence, camera or remote alerts were found. Error recovery, simulation and liquid classes come from help-centre topic titles; the article bodies were not read.
- **Andrew+:** only camera and OLM tip recognition are sourced.
- **OT-2:** "false" for LLD rests on Flex release notes ("Flex pipettes only"). "false" for liquid classes rests on the Flex-only scope plus a docs search snippet saying OT-2 pipettes raise an error. OT-2 has only aspirate/dispense speed (flow rate).
- **userBase:** only Opentrons states numbers: "thousands of labs in 40+ countries" and more than 100 Flex protocols as of January 2025. Neither is an installed-unit count. No other vendor's installed base was found.
- **overnightUnattended:** several "true" values are weak. Flex, OT-2 and STAR rest only on walkaway or HEPA wording, with no overnight claim. Biomek i-Series ("overnight, unattended runs") and VANTAGE ("overnight and weekend runs") have explicit claims. No vendor stated a post-run 4 °C hold.
- **Gravimetric verification:** not found on any maker page. The only reference is a third-party paper on EVO (PMC5030733).

## PyLabRobot
The PyLabRobot README says the Visualizer "can be used to develop and test protocols without a physical robot". It lists Hamilton STAR, Hamilton Vantage, Tecan Freedom EVO and Opentrons OT-2. NIMBUS, Prep and Flex are not listed in the README; newer code may support them, but this was not verified. docs.pylabrobot.org returned an empty page to the fetcher.

## Update, 6 Nov 2026 (#156)
- New features: **barcode reading**, **LIMS/ELN integration**, **audit trail** for all 14 handlers.
  - Handheld scanners count as barcode reading for Prep and Andrew+ (the detail says so). The firefly scanner type is not stated.
  - Bravo LIMS and audit cells describe VWorks software, not the hardware.
  - The firefly+ cells reuse the firefly software source, which names only "firefly".
- Filled from other hosts:
  - VANTAGE: tip presence and liquid classes (PyLabRobot backend source); error recovery (VENUS pages of Hamilton's online brochure, a software-level claim).
  - NIMBUS: tip presence (PyLabRobot); error recovery (VENUS).
  - Freedom EVO: tip presence and error recovery (EVO brochure PDF on testmart.com).
  - Andrew+: remote alerts (Andrew Alliance help centre on intercom.help, which is reachable while waters.com is not).
  - STAR/STARlet: user base ("20,000 satisfied customers": customers, not installed units).
- Still null:
  - VANTAGE: simulator, user base.
  - NIMBUS: camera, remote monitoring, simulator, liquid classes, overnight, user base.
  - Prep: tip presence, remote monitoring, liquid classes, overnight, user base.
  - Bravo: liquid-level and clot detection, tip presence, camera, overnight, user base.
  - Andrew+: liquid-level and clot detection, error recovery, simulator, liquid classes, overnight, user base.
  - OT-2: barcode, LIMS and audit trail.
- Newly blocked: the gmc.vu.lt STAR manual (bot challenge). beckman.com refuses curl but works with the fetcher.

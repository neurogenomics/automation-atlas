# Used / refurbished liquid-handler prices: search log (2026-11-05)

Output: `used.json`, 145 records. 144 are `used-asking`; the other is a government-surplus auction that closed with no bids, also recorded as `used-asking` and explained in its notes. There are **no sold or auction-result prices**: none of the sources I could reach exposed one.

## How to read the data
- eBay records come from the eBay Browse API (`mcp__ebay__ebay_search`). The API doesn't give a listing start date, so `date` is the observation date. Amounts are asking prices without shipping, and most listings accept Best Offer, so sale prices are probably lower.
- eBay condition mapping: "Seller refurbished" becomes `refurbished`. "New / New – Open box / New other" becomes `new`; these are secondary-market items, not OEM new, and the notes say so. "For parts or not working" becomes `used` and is flagged FOR PARTS in the notes. Leave those 3 records out of any working-unit floor.
- DotMed records were read from category pages through WebFetch, so a summariser model extracted them. Confidence is `medium`. Dates show only month and day (late Oct to early Nov); the year 2026 is inferred. Records from Surplus Solutions, LLC whose page says "Serviced & in stock" are set to `refurbished`.
- Duplicates removed: the same unit cross-listed on ebay.com and ebay.co.uk (unigreenscheme STAR M and STARlet M, buy2sell NXp), identical twin listings (Biomek 4000 #2, ODTC Left/Right, Arc STAR $115k x2), and the easyBlood STARlet listed on both eBay and DotMed.
- I didn't convert currencies. Medians are calculated per currency.

## Searches run
eBay US: Hamilton STARlet liquid handler; Hamilton Microlab STAR; Hamilton Vantage OR Nimbus; Hamilton heater shaker 199027; Biomek liquid handler; Biomek i7; Biomek i5; Tecan Freedom EVO; Tecan Fluent; Agilent Bravo; TTP Labtech mosquito; SPT Labtech dragonfly; Formulatrix Mantis; Andrew Alliance Andrew+; KingFisher Flex; Inheco ODTC; eppendorf epMotion; Opentrons OT-2; Opentrons Flex; Opentrons thermocycler module.
eBay UK: "liquid handler" (min £800); Opentrons. Note: OR-joined queries returned 0 on EBAY_GB.
Not found on eBay: SPT firefly (not searched separately; none came up in the general searches), Hamilton Heater Shaker as a complete deck module with controller in one listing.
WebSearch (standard): used STARlet price; Biomek i7 auction sold price (BidSpotter/Proxibid/Heritage Global); GovDeals/GSA liquid handler; BidSpotter Hamilton STAR lot sold; GovDeals liquid handler; Opentrons OT-2 used (LabX/Copia/GenTech).
WebFetch, pages that returned usable prices: DotMed liquid-handling category pages (all, hamilton, tecan, beckman-coulter, agilent); LabExchange OT-2 listing; Municibid UMass Amherst STAR listing.

## Blocked or no usable data
| Source | Result |
|---|---|
| LabX | HTTP 403 on category and search pages |
| EquipNet | HTTP 403 on search and listing pages. Search snippets mention an unused Biomek i7 at €72,500 with an accepted offer and a STAR at $5,000 Make-an-Offer. Not recorded because I couldn't open the pages |
| Surplus Solutions (ssllc.com) direct | HTTP 403. Their prices were captured through DotMed instead |
| Marshall Scientific | HTTP 429 (rate limited) |
| Machinio | HTTP 403 |
| BidSpotter | HTTP 405 on search |
| GovDeals | HTTP 403 |
| GSA Auctions | page loaded with no lot content (JS-rendered) |
| Proxibid | search page showed 0 items (JS-rendered) |
| Heritage Global (hgpauction.com) | 404 on search URL |
| BioSurplus | site search returned "no results" for "hamilton star" and "liquid handler" |
| Copia Scientific | liquid-handling category lists models but shows no prices (quote only) |
| GenTech Scientific | search returned only blog posts; GC/LC dealer, no liquid handlers found |
| International Equipment Trading (ietltd.com) | home page has no liquid handler listings; request-a-quote only |
| Bid on Equipment | not attempted |
| Sigma Equipment | OT-2 listing requires login to see price |
| eBay sold prices | not exposed by the Browse API tool; no sold or completed data |
| unigreenscheme OT-2 page | POA, no longer available |

## Gaps
- There are no sold or hammer prices for any platform. Every figure is an ask.
- Thin coverage (fewer than 3 records): Opentrons Flex (1 base robot), OT-2 (3 records across 2 currencies), Hamilton Vantage (1 working, 1 parts), NIMBUS (1 working, 1 parts), dragonfly (2), Biomek NXp (2), Biomek 4000 (2), firefly (0).
- Andrew records are mostly the older Andrew 1000 / gen-1 models. Only one is explicitly Andrew+ ($3,500).

## Module and device prices added 6 Nov 2026 (#135, in curated.json)
- Fluent: ODTC 96, CPLC set of 3 and RGA from Government Scientific Source product pages (US federal-schedule reseller, list); Thermoshake RM and Alpaqua Magnum FLX from eBay listings (used).
- Hamilton STAR/STARlet ODTC: USAspending award 2024 ($19,847, NGS STAR ODTC 96).
- Bravo Peltier Thermal Station: Agilent CPAC Ultraflat HT 2-TEC, eBay (new, secondary market).
- OT-2 Magnetic Module GEN2: eBay open box; Opentrons has discontinued the module.
- Plate centrifuge class: Agilent VSpin with loader (eBay, used) and G5582A (dealer, refurbished).
- Not found: Teleshake 95, HHC, CO-RE gripper alone, Bravo gripper and Magnetic Bead Accessory, complete Te-MagS, Biomek Shaking Peltier, robotic Hettich centrifuge, new BioNex HiG or Agilent centrifuge, Andrew+ accessories, OEM low-retention tips for Hamilton and Beckman, the BioShake QOT kit for OT-2. Workcell integration is not broken out of any award found (one 2018 Hamilton workcell award bundles the handler).

// Pinned public evidence snapshot; installation facts and private protocols are not overwritten.
export const market = {
  "sourceVersion": "2026-11-09.public.1",
  "sourceCommit": "179c09553b06ed10af6f67772eeaaa2ecd3ed44e",
  "importedOn": "2026-11-09",
  "records": [
    {
      "id": "andrew",
      "name": "Andrew+",
      "vendor": "Waters",
      "category": "liquid handler",
      "summary": "Electronic pipette robot with separately selected single/eight-channel pipettes and connected devices.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.2,
          "maxUl": 10000,
          "detail": "Separate pipette options: single-channel 0.2–10, 5–120, 10–300, 50–1000, 100–5000 and 500–10000 µL; eight-channel 0.2–10, 5–120, 10–300 and 50–1200 µL. The family envelope is not one pipette range."
        },
        {
          "operation": "mixing",
          "type": "native",
          "detail": "native mixing capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Connected heating/shaking devices",
          "detail": "optional heating-cooling capability using Connected heating/shaking devices. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Connected grippers",
          "detail": "optional vessel-transfer capability using Connected grippers. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Single/eight-channel electronic pipettes",
        "Connected heating/shaking devices",
        "Connected grippers",
        "Vacuum+"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-waters-pipettes",
          "title": "Waters WKB122208: supported Andrew+/Pipette+ pipettes",
          "url": "https://support.waters.com/KB_Inst/Other/WKB122208_What_Pipettors_and_Pipet_Tips_Are_Supported_on_Andrew",
          "section": "Additional Information / part-number list; Answer / supported pipettes",
          "checked": "2026-10-31"
        },
        {
          "id": "mfr-waters-connected",
          "title": "Waters connected devices and accessories",
          "url": "https://www.waters.com/waters/en_US/Automation-Connected-Devices-and-Accessories/nav.htm?cid=135073544&locale=en_US",
          "section": "Connected devices: grippers, Peltier+, Shaker+ and Heater-Shaker+",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-andrew-enquiry",
          "title": "Andrew+ manufacturer enquiry",
          "url": "https://www.waters.com/nextgen/be/en/products/laboratory-automation-and-equipment.html",
          "section": "Contact Sales; legacy Andrew Alliance ROI URL redirects here; no numerical purchase price extracted",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "andrew-single-low",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Single-channel low-volume pipette option.",
          "value": {
            "min": 0.2,
            "max": 10
          },
          "unit": "µL",
          "configuration": "186009769, 1 channel",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-waters-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "andrew-single-large",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Single-channel larger-volume option.",
          "value": {
            "min": 50,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "186009766, 1 channel",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-waters-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "andrew-eight-low",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Eight-channel low-volume option.",
          "value": {
            "min": 0.2,
            "max": 10
          },
          "unit": "µL",
          "configuration": "186009768, 8 channels",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-waters-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "andrew-eight-large",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Eight-channel larger-volume option.",
          "value": {
            "min": 50,
            "max": 1200
          },
          "unit": "µL",
          "configuration": "186009615, 8 channels",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-waters-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "andrew-pipette-compatibility",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Supported pipettes are Waters/Andrew Alliance-branded Sartorius units; robot adapters are separate items.",
          "sourceIds": [
            "mfr-waters-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "andrew-connected-handling",
          "operation": "vessel-transfer",
          "type": "optional",
          "statement": "Connected tube and microplate/column grippers provide vessel movement.",
          "configuration": "Compatible connected gripper and supported vessel",
          "sourceIds": [
            "mfr-waters-connected"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Remaining supported pipette sizes are listed in the linked part-number table; no single pipette spans the entire family envelope.",
        "Condition-specific accuracy tables are supplied as an image/attached manual; not transcribed here.",
        "Connected grippers do not establish centrifuge loading, cap manipulation or arbitrary off-deck reach."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify whether an authorised external control interface is available for the exact Andrew+ / OneLab configuration."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "andrew-configuration-quote",
          "kind": "instrument",
          "item": "Andrew+",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-andrew-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "control-route",
          "statement": "Can the vendor supply a documented programmatic interface, its licence terms and a working example for this Andrew+ configuration?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "bravo",
      "name": "Bravo",
      "vendor": "Agilent",
      "category": "liquid handler",
      "summary": "Nine-position plate handler with interchangeable pipette heads and optional thermal/handling accessories.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.3,
          "maxUl": 250,
          "detail": "Head-specific limits: 96LT 2–250 µL; 96ST/384ST 0.3–70 µL. Tip choice further restricts these limits."
        },
        {
          "operation": "thermocycling",
          "type": "optional",
          "module": "ODTC",
          "detail": "optional thermocycling capability using ODTC. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Heating/cooling",
          "detail": "optional heating-cooling capability using Heating/cooling. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "mixing",
          "type": "optional",
          "module": "Shaker",
          "detail": "optional mixing capability using Shaker. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Plate gripper",
          "detail": "optional vessel-transfer capability using Plate gripper. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnet",
          "detail": "optional magnetic-separation capability using Magnet. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "96LT / 96ST / 384ST heads",
        "ODTC",
        "Plate gripper",
        "Heating/cooling",
        "Shaker",
        "Magnet",
        "BenchCel integration"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-bravo-datasheet",
          "title": "Bravo datasheet 5990-3480EN, February 2023",
          "url": "https://www.agilent.com/cs/library/datasheets/public/5990-3480EN.pdf",
          "section": "Page 2: key features, pipetting specifications and accessories",
          "checked": "2026-10-31"
        },
        {
          "id": "bravo-modules",
          "title": "Bravo accessory catalogue 5991-0369EN",
          "url": "https://www.agilent.com/cs/library/catalogs/Public/5991-0369EN.pdf",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-bravo-control",
          "title": "Agilent Bravo datasheet 5990-3480EN",
          "url": "https://www.agilent.com/cs/library/datasheets/public/5990-3480EN.pdf",
          "section": "p1 VWorks; p2 Control and optional plate gripper",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-bravo-enquiry",
          "title": "Agilent Bravo manufacturer enquiry",
          "url": "https://www.agilent.com/en/product/automated-liquid-handling/automated-liquid-handling-platforms/bravo-automated-liquid-handling-platform",
          "section": "Request a Quote",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "used-bravo-dotmed-5190722",
          "title": "Public seller listing: used Agilent Bravo 5190722",
          "url": "https://www.dotmed.com/listings/detail.html?lid=5190722",
          "section": "Asking price, condition, listing date; Item Description / As configured included items",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "bravo-96lt",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Long-tip 96-channel head range.",
          "value": {
            "min": 2,
            "max": 250
          },
          "unit": "µL",
          "configuration": "96LT disposable-tip head",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "bravo-st",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Short-tip head range depends further on selected tip.",
          "value": {
            "min": 0.3,
            "max": 70
          },
          "unit": "µL",
          "configuration": "96ST or 384ST disposable-tip head",
          "conditions": "10 µL tips: 0.3–10; 30 µL: 0.5–30; 70 µL: 0.75–70 µL.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "bravo-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Up to nine pipettable platepad positions.",
          "value": 9,
          "unit": "positions",
          "conditions": "Tips, waste, reservoirs and modules also consume positions.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "bravo-gripper",
          "operation": "vessel-transfer",
          "type": "optional",
          "statement": "Plate gripper relocates labware and handles lids/stacks.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "bravo-odtc",
          "operation": "thermocycling",
          "type": "optional",
          "statement": "An on-deck thermal cycler is an accessory.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "bravo-external",
          "operation": "device-integration",
          "type": "external",
          "statement": "Open design supports integration with a separate robot or BenchCel handler.",
          "sourceIds": [
            "mfr-bravo-datasheet"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No condition-specific volumetric accuracy table extracted.",
        "ODTC, gripper and other accessories cannot be inferred from ownership of a Bravo.",
        "A centrifuge is not documented as a native component in this datasheet."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify a documented connection between the chosen external controller and this Bravo configuration; VWorks control does not establish a PyLabRobot driver."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-bravo-control"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "bravo-configuration-quote",
          "kind": "instrument",
          "item": "Agilent Bravo",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-bravo-enquiry"
          ]
        },
        {
          "id": "used-bravo-5190722",
          "kind": "bundle",
          "item": "Used Bravo with 96LT head and gripper — seller listing 5190722",
          "amount": 24995,
          "currency": "USD",
          "condition": "used",
          "priceType": "asking",
          "priceBasis": "seller-asking",
          "sourceType": "reseller",
          "region": "United States; international delivery terms require confirmation",
          "vat": "Tax/import/VAT treatment not stated",
          "shipping": "Not included as a quantified amount; request delivery and installation terms",
          "availability": "not-verified",
          "checked": "2026-10-31",
          "listingDate": "2026-10-26",
          "configuration": "Seller-described Bravo 16050-102 with 96LT head and gripper; one specific used system. Seller reports in stock; live stock and condition not independently confirmed.",
          "inclusions": "Seller lists 96LT head, gripper, nine platepads, emergency stop, computer running VWorks, and communication/power cables.",
          "exclusions": "Additional modules, installation/training, licence transfer and service terms require explicit confirmation; asking price is not a transaction value or a complete ownership budget.",
          "sourceIds": [
            "used-bravo-dotmed-5190722"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion.",
        "A used asking price is a single configuration-specific offer, not market value. Condition, live stock, licence transfer and commissioning remain unverified."
      ],
      "practicalConsiderations": [
        {
          "topic": "vendor-control",
          "statement": "Agilent documents VWorks control and Ethernet/RS-232 interfaces for Bravo.",
          "sourceIds": [
            "int-bravo-control"
          ],
          "status": "documented"
        },
        {
          "topic": "plate-handling",
          "statement": "Is the optional gripper fitted, and which external transfer position has been qualified?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "i7",
      "name": "Biomek i7",
      "vendor": "Beckman Coulter",
      "category": "liquid handler",
      "summary": "Large configurable workstation with Span-8/multichannel combinations and third-party peripheral integration.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.5,
          "maxUl": 5000,
          "detail": "Published family envelopes include 0.5–1200 and 0.5–5000 µL; establish the exact head and tips before applying a limit."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnetic accessories",
          "detail": "optional magnetic-separation capability using Magnetic accessories. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "thermocycling",
          "type": "external",
          "detail": "external thermocycling capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "centrifugation",
          "type": "external",
          "detail": "external centrifugation capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Gripper",
          "detail": "optional vessel-transfer capability using Gripper. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Multichannel / Span-8 configurations",
        "Gripper",
        "Magnetic accessories",
        "External thermocycler",
        "External centrifuge"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-i7-brochure",
          "title": "Biomek i-Series brochure, 2025",
          "url": "https://media.beckman.com/-/media/pdf-assets/brochures/biomek-i-series-automated-liquid-handlers-brochure.pdf?rev=47d63a19459246b28cbf1fd9feee7d3c",
          "section": "PDF pages 3, 5 and 6: gripper, model comparison and device integrations",
          "checked": "2026-10-31"
        },
        {
          "id": "i7",
          "title": "Beckman Biomek i-Series",
          "url": "https://www.beckman.it/en/liquid-handlers/biomek-i-series-automated-workstations",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-biomek-integration",
          "title": "Beckman Biomek i-Series brochure",
          "url": "https://media.beckman.com/-/media/pdf-assets/brochures/biomek-i-series-automated-liquid-handlers-brochure.pdf?rev=47d63a19459246b28cbf1fd9feee7d3c",
          "section": "p4 Biomek software; p6 third-party device integration",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-i7-enquiry",
          "title": "Biomek i7 manufacturer enquiry",
          "url": "https://www.beckman.com/liquid-handlers/biomek-i-series-automated-workstations/biomek-i7",
          "section": "Explore models / Request a Quote; configured head variants",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "i7-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "i7 provides 45 pipettable positions.",
          "value": 45,
          "unit": "positions",
          "configuration": "i7 model comparison, PDF page 5",
          "sourceIds": [
            "mfr-i7-brochure"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "i7-heads",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Options include Span-8, one or two 96/384 multichannel heads, or a hybrid Span-8/multichannel arrangement.",
          "sourceIds": [
            "mfr-i7-brochure"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "i7-volume",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Published alternatives are 0.5–1200 or 0.5–5000 µL, depending on head.",
          "configuration": "Selected i7 pipetting head; these are alternative envelopes, not one guaranteed head range.",
          "sourceIds": [
            "mfr-i7-brochure"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "i7-gripper",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "The brochure includes a rotating labware gripper.",
          "sourceIds": [
            "mfr-i7-brochure"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "i7-peripherals",
          "operation": "device-integration",
          "type": "external",
          "statement": "Listed integrations include thermocyclers, readers, shakers, Peltier devices, storage and robotic arms.",
          "sourceIds": [
            "mfr-i7-brochure"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "The brochure does not provide a condition-specific accuracy matrix.",
        "Individual historic machines may differ from the 2025 brochure.",
        "Integrated peripheral availability and exact controller compatibility require configuration evidence; no native centrifuge claim is made."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Establish the external-control interface and software licences for the specific Biomek installation."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-biomek-integration"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "i7-configuration-quote",
          "kind": "instrument",
          "item": "Biomek i7",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-i7-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "vendor-control",
          "statement": "Beckman documents Biomek software control and third-party peripheral integration; these are not evidence of a PyLabRobot i7 backend.",
          "sourceIds": [
            "int-biomek-integration"
          ],
          "status": "documented"
        },
        {
          "topic": "head-and-gripper",
          "statement": "Which Span-8/multichannel arrangement and gripper movement paths must the integration support?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "firefly",
      "name": "firefly",
      "vendor": "SPT Labtech",
      "category": "liquid handler",
      "summary": "Separate reagent dispensing and sample pipetting, with configuration-dependent genomic modules.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.5,
          "maxUl": 125,
          "detail": "Sample pipetting: 0.5–125 µL; 96/384 arrays or 8/16 strips."
        },
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 0.2,
          "maxUl": 3690,
          "detail": "Positive-displacement reagent syringes: 0.2–3690 µL; separate from sample pipetting."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnetic blocks",
          "detail": "optional magnetic-separation capability using Magnetic blocks. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Genomics thermal and shaker stations",
          "detail": "optional heating-cooling capability using Genomics thermal and shaker stations. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "mixing",
          "type": "optional",
          "module": "Genomics thermal and shaker stations",
          "detail": "optional mixing capability using Genomics thermal and shaker stations. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "native vessel-transfer capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "ATL/EZL configuration",
        "Genomics thermal and shaker stations",
        "Magnetic blocks"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-firefly-spec",
          "title": "SPT firefly technology specifications",
          "url": "https://www.sptlabtech.com/migration/product-help-center/firefly-user-guide-specifications-1.3-firefly-technology",
          "section": "Sections 1.3.1–1.3.6, 1.3.11 and 1.3.12",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-firefly-enquiry",
          "title": "SPT firefly manufacturer enquiry",
          "url": "https://www.sptlabtech.com/products/firefly",
          "section": "Product enquiry; exact model/options and public numerical price not established",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "firefly-pipette",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Sample-pipetting range.",
          "value": {
            "min": 0.5,
            "max": 125
          },
          "unit": "µL",
          "configuration": "96/384 arrays or 8/16-tip strips",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-dispense",
          "operation": "dispensing",
          "type": "native",
          "statement": "Positive-displacement reagent-syringe range.",
          "value": {
            "min": 0.2,
            "max": 3690
          },
          "unit": "µL",
          "configuration": "4 mL reagent syringes",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Two movable decks each accommodate eight plate positions.",
          "value": 16,
          "unit": "positions",
          "conditions": "Upper/lower labware height limits are 49.7/93 mm; occupied accessories restrict usable layouts.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-temperature",
          "operation": "heating-cooling",
          "type": "optional",
          "statement": "Genomics thermal-module setpoints span −20 to 99°C; incubation module is not a PCR cycler.",
          "value": {
            "min": -20,
            "max": 99
          },
          "unit": "°C",
          "configuration": "Genomics plate thermal module",
          "conditions": "Surface regulation specification; not guaranteed sample temperature.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-shaker",
          "operation": "mixing",
          "type": "optional",
          "statement": "Genomics shaker operates from 200 to 3000 rpm.",
          "value": {
            "min": 200,
            "max": 3000
          },
          "unit": "rpm",
          "configuration": "Genomics shaker; separate thermal station",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-gripper",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Built-in grippers move compatible labware between decks, modules and magnetic blocks.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "firefly-magnets",
          "operation": "magnetic-separation",
          "type": "optional",
          "statement": "Alpaqua/Permagen blocks support compatible 96/384 plates and downloaded stack definitions.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No pipetting accuracy matrix extracted.",
        "The thermal module is not a thermocycler.",
        "Centrifugation is not listed among these native modules."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify the supported external API, software version and permissions for the exact firefly variant."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "firefly-configuration-quote",
          "kind": "instrument",
          "item": "SPT firefly",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-firefly-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "separate-functions",
          "statement": "Does the proposed control route expose sample pipetting, reagent dispensing, grippers and the installed thermal/shaker modules separately?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "firefly-plus",
      "name": "firefly+ (Plus)",
      "vendor": "SPT Labtech",
      "category": "liquid handler",
      "summary": "ATL expansion adds plate/lid/tip storage and configurable integrated thermocycling.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.5,
          "maxUl": 125,
          "detail": "Sample pipetting: 0.5–125 µL; 96/384 arrays or 8/16 strips."
        },
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 0.2,
          "maxUl": 3690,
          "detail": "Positive-displacement reagent syringes: 0.2–3690 µL; separate from sample pipetting."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnetic blocks",
          "detail": "optional magnetic-separation capability using Magnetic blocks. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Genomics thermal and shaker stations",
          "detail": "optional heating-cooling capability using Genomics thermal and shaker stations. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "mixing",
          "type": "optional",
          "module": "Genomics thermal and shaker stations",
          "detail": "optional mixing capability using Genomics thermal and shaker stations. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "native vessel-transfer capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "thermocycling",
          "type": "optional",
          "module": "Optional ODTC",
          "detail": "optional thermocycling capability using Optional ODTC. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "ATL/EZL configuration",
        "Genomics thermal and shaker stations",
        "Magnetic blocks",
        "Additional plate storage",
        "Optional ODTC"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-firefly-spec",
          "title": "SPT firefly technology specifications",
          "url": "https://www.sptlabtech.com/migration/product-help-center/firefly-user-guide-specifications-1.3-firefly-technology",
          "section": "Sections 1.3.1–1.3.6, 1.3.11 and 1.3.12",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-firefly-plus-enquiry",
          "title": "SPT firefly+ manufacturer enquiry",
          "url": "https://www.sptlabtech.com/products/firefly",
          "section": "Plus expansion and enquiry; exact thermocycler/storage configuration requires quote",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "fireflyplus-atl",
          "operation": "configuration",
          "type": "optional",
          "statement": "firefly+ expansion requires the ATL head variant.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fireflyplus-pipette",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Inherits firefly sample-pipetting range.",
          "value": {
            "min": 0.5,
            "max": 125
          },
          "unit": "µL",
          "configuration": "ATL firefly with Plus expansion",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fireflyplus-storage",
          "operation": "storage",
          "type": "optional",
          "statement": "Expansion provides additional storage for plates, lids and tips.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fireflyplus-cycler",
          "operation": "thermocycling",
          "type": "optional",
          "statement": "Integrated thermocycler options extend the incubation-only base platform.",
          "sourceIds": [
            "mfr-firefly-spec"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Select the actual thermocycler option and compatible plate/lid.",
        "Storage positions and thermal block performance are not fully extracted.",
        "No integrated centrifuge or qPCR fluorescence capability established by this specification."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify control of the ATL/Plus expansion and the selected thermocycler, as well as the base firefly."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "firefly-plus-configuration-quote",
          "kind": "instrument",
          "item": "SPT firefly+",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-firefly-plus-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "expansion-integration",
          "statement": "Which external API commands cover expansion storage, lids and thermocycler error recovery on this exact Plus configuration?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "flex",
      "name": "Flex",
      "vendor": "Opentrons",
      "category": "liquid handler",
      "summary": "Configurable single-, eight- and 96-channel pipettes, optional gripper and USB-controlled modules.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 1000,
          "detail": "Head-specific options: 1/8-channel 1–50 or 5–1000 µL; 96-channel 1–200 or 5–1000 µL."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnetic Block",
          "detail": "optional magnetic-separation capability using Magnetic Block. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Temperature Module",
          "detail": "optional heating-cooling capability using Temperature Module. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "mixing",
          "type": "optional",
          "module": "Heater-Shaker",
          "detail": "optional mixing capability using Heater-Shaker. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "thermocycling",
          "type": "optional",
          "module": "Thermocycler",
          "detail": "optional thermocycling capability using Thermocycler. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Gripper",
          "detail": "optional vessel-transfer capability using Gripper. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "1/8/96-channel heads",
        "Gripper",
        "Magnetic Block",
        "Temperature Module",
        "Heater-Shaker",
        "Thermocycler",
        "Stacker",
        "HEPA/UV",
        "Absorbance reader"
      ],
      "performance": "Example only: Flex 1–50 µL 8-channel head at 1 µL with 20 µL tips: ±10% systematic error, 6% CV; at 50 µL with 50 µL tips: ±1.25%, 0.60% CV. Manufacturer conditions; not sample-specific validation.",
      "sources": [
        {
          "id": "mfr-flex-pipettes",
          "title": "Opentrons Flex pipettes",
          "url": "https://docs.opentrons.com/flex/system-description/pipettes/",
          "section": "Pipette specifications: 1-, 8- and 96-channel tables; introduction",
          "checked": "2026-10-31"
        },
        {
          "id": "mfr-flex-modules",
          "title": "Opentrons Flex modules",
          "url": "https://docs.opentrons.com/flex/modules/",
          "section": "Supported modules; Thermocycler generation compatibility",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-flex",
          "title": "PyLabRobot Flex guide",
          "url": "https://docs.pylabrobot.org/stable/user_guide/opentrons/flex/hello-world.html",
          "section": "Connection table; hardware-verification warning; Install and import; Prepare the physical deck",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-robots",
          "title": "Opentrons robot storefront",
          "url": "https://opentrons.com/products/categories/robots",
          "section": "Robots: Flex and OT-2 Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-modules",
          "title": "Opentrons module storefront",
          "url": "https://opentrons.com/products/categories/modules",
          "section": "Modules: individually named Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-pipettes",
          "title": "Opentrons pipette storefront",
          "url": "https://opentrons.com/products/categories/pipettes",
          "section": "Pipettes: channel-specific Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-workstations",
          "title": "Opentrons workstation storefront",
          "url": "https://opentrons.com/products/categories/workstations",
          "section": "Workstations: named Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-flex-product",
          "title": "Flex robot product page",
          "url": "https://opentrons.com/products/opentrons-flex-robot",
          "section": "Product introduction: mandatory On-Site Installation; selected hardware; Add to Cart and delivery statement",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-stacker-product",
          "title": "Flex Stacker product page",
          "url": "https://opentrons.com/products/opentrons-flex-stacker-1",
          "section": "Configuration and pre-Q3-2025 upgrade/customer-kit requirements; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-temp-product",
          "title": "Temperature Module product page",
          "url": "https://opentrons.com/products/temperature-module-gen2",
          "section": "OT-2 versus Flex configurations; aluminum block selection; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-heat-product",
          "title": "Heater-Shaker product page",
          "url": "https://opentrons.com/products/heater-shaker-module",
          "section": "OT-2 versus Flex configurations; one selected plate adapter included; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-thermocycler-product",
          "title": "Thermocycler Module product page",
          "url": "https://opentrons.com/products/thermocycler-module-1",
          "section": "OT-2 Module Only versus Flex with Caddy/Calibration Adapter configuration; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-gripper-product",
          "title": "Flex Gripper product page",
          "url": "https://opentrons.com/products/opentrons-flex-gripper-gen1",
          "section": "Product offer and Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-magblock-product",
          "title": "Flex Magnetic Block product page",
          "url": "https://opentrons.com/products/opentrons-flex-magnetic-block-gen1",
          "section": "Product offer; required compatible robot/gripper purchased separately",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-services",
          "title": "Opentrons Instrument Services",
          "url": "https://opentrons.com/instrument-services",
          "section": "Custom Protocol Development; One-Time Services; contact for terms",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-madsci-index",
          "title": "MADSci node module index at bbfcba5",
          "url": "https://github.com/AD-SDL/MADSci/blob/bbfcba5efcaeacb750252a921256de5d61d51bb2/docs/madsci_powered/Modules.md",
          "section": "Liquid handling and formulation: ot2_module",
          "checked": "2026-11-02"
        },
        {
          "id": "int-madsci-ot2-module",
          "title": "MADSci Opentrons module at ecb4e6e",
          "url": "https://github.com/AD-SDL/ot2_module/tree/ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
          "section": "README and src/ot2_rest_node.py: run_protocol",
          "checked": "2026-11-02"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Conditioned example only",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "flex-small",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Small pipette models support one or eight channels.",
          "value": {
            "min": 1,
            "max": 50
          },
          "unit": "µL",
          "configuration": "Flex 1-channel or 8-channel 1–50 µL pipette",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-flex-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-large",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Large pipette models support one or eight channels.",
          "value": {
            "min": 5,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "Flex 1-channel or 8-channel 5–1000 µL pipette",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-flex-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-96",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "96-channel alternatives occupy both pipette mounts.",
          "configuration": "96-channel 1–200 or 5–1000 µL models; not simultaneous independent pipettes.",
          "sourceIds": [
            "mfr-flex-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-small-error",
          "operation": "pipetting-performance",
          "type": "native",
          "statement": "At 1 µL: systematic error ±10%, random error 6% CV.",
          "configuration": "1–50 µL eight-channel head; 20 µL tips",
          "conditions": "Manufacturer table at this exact volume/tip combination; no other liquids inferred.",
          "sourceIds": [
            "mfr-flex-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-larger-error",
          "operation": "pipetting-performance",
          "type": "native",
          "statement": "At 50 µL: systematic error ±1.25%, random error 0.60% CV.",
          "configuration": "1–50 µL eight-channel head; 50 µL tips",
          "conditions": "Manufacturer table at this exact volume/tip combination.",
          "sourceIds": [
            "mfr-flex-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-heatshake",
          "operation": "mixing",
          "type": "optional",
          "statement": "Heater-Shaker heats to 95°C and shakes at 200–3000 rpm.",
          "sourceIds": [
            "mfr-flex-modules"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-cooling",
          "operation": "heating-cooling",
          "type": "optional",
          "statement": "Temperature Module maintains 4–95°C steady state.",
          "sourceIds": [
            "mfr-flex-modules"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-magnet",
          "operation": "magnetic-separation",
          "type": "optional",
          "statement": "Magnetic Block is passive; OT-2 active Magnetic Modules are unsupported.",
          "sourceIds": [
            "mfr-flex-modules"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "flex-cycler",
          "operation": "thermocycling",
          "type": "optional",
          "statement": "Thermocycler GEN2 supports gripper access; GEN1 is unsupported on Flex.",
          "sourceIds": [
            "mfr-flex-modules"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "The selected instrument may have only one subset of these heads/modules.",
        "Performance examples are not universal accuracy guarantees.",
        "Detailed deck/labware constraints remain source-dependent."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "Flex",
            "registryId": "plr-opentrons-flex",
            "status": "basic",
            "api": "pylabrobot.opentrons.Flex",
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/opentrons/flex/hello-world.html",
            "hardwareTestingRequired": null,
            "scope": "Flex v1 driver; operation-specific coverage, not every available head or module.",
            "limitations": [
              "Hardware verification is operation-specific; 1-channel and 96-channel heads remain unverified.",
              "Current guide examples use an eight-channel head; do not infer full multi-module workcell support."
            ]
          }
        ],
        "prerequisites": [
          "Provide the documented robot-server HTTP connection and appropriate Opentrons dependency; network discovery needs local-network visibility.",
          "Match physical labware geometry, tip rack and calibration to the chosen head."
        ],
        "gaps": [
          "The current guide explicitly leaves one-channel and 96-channel heads, and some operations, unverified.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-plr-flex"
        ]
      },
      "madsci": {
        "status": "upstream-listed",
        "integrations": [
          {
            "framework": "MADSci",
            "status": "upstream-listed",
            "module": "ot2_module",
            "moduleRevision": "ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
            "indexRevision": "bbfcba5efcaeacb750252a921256de5d61d51bb2",
            "license": "MIT; see upstream module LICENSE",
            "documentationUrl": "https://github.com/AD-SDL/ot2_module/tree/ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
            "sourceIds": [
              "int-madsci-index",
              "int-madsci-ot2-module"
            ],
            "scope": "Upstream index lists OT-2 and Flex. Exact commands, firmware and configuration need independent verification.",
            "limitations": "This is a software discovery lead, not proof of installed hardware or validated operations. The run_protocol action substitutes parameters into its input file in place; use a disposable working copy if independently evaluating it."
          }
        ]
      },
      "procurement": [
        {
          "id": "flex-base-start",
          "kind": "instrument",
          "item": "Flex robot starting configuration",
          "amount": 24950,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Product page exposes Add to Cart; no warehouse stock verification.",
          "checked": "2026-10-31",
          "configuration": "Store category starting price; selected pipettes and installation are not reconciled into this amount.",
          "inclusions": [
            "Robot starting offer; precise minimum configuration must be checked."
          ],
          "exclusions": [
            "Mandatory On-Site Installation has no separately verified current amount here.",
            "Selected pipettes, gripper, modules, shipping, tax and support must be reconciled in a quote."
          ],
          "sourceIds": [
            "cost-ot-robots",
            "cost-flex-product"
          ]
        },
        {
          "id": "flex-pipette-single-start",
          "kind": "module",
          "item": "Flex single-channel pipette",
          "amount": 3600,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Starting price for the single-channel family; confirm 1–50 or 5–1000 µL variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-pipettes"
          ]
        },
        {
          "id": "flex-pipette-eight-start",
          "kind": "module",
          "item": "Flex eight-channel pipette",
          "amount": 6400,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Starting price for eight-channel family; confirm exact volume variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-pipettes"
          ]
        },
        {
          "id": "flex-pipette-96-start",
          "kind": "module",
          "item": "Flex 96-channel pipette",
          "amount": 15250,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Starting price for 96-channel family; confirm exact volume variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-pipettes"
          ]
        },
        {
          "id": "flex-gripper-start",
          "kind": "module",
          "item": "Flex Gripper",
          "amount": 9750,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product offer has Add to Cart; no physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Flex Gripper starting offer",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-gripper-product"
          ]
        },
        {
          "id": "flex-magnet-start",
          "kind": "module",
          "item": "Flex Magnetic Block",
          "amount": 1750,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product offer has Add to Cart; not a stock count.",
          "checked": "2026-10-31",
          "configuration": "Passive Flex Magnetic Block; same component also indexed under the dedicated block record.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "Flex robot and gripper, plates, protocol qualification, shipping and tax not included by inference."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-magblock-product"
          ]
        },
        {
          "id": "flex-temperature-start",
          "kind": "module",
          "item": "Temperature Module starting configuration",
          "amount": 3975,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product page has Add to Cart; stock not verified.",
          "checked": "2026-10-31",
          "configuration": "Starting module listing; confirm Flex caddy/calibration variant and aluminum block.",
          "inclusions": [
            "Product page describes one selected aluminum block."
          ],
          "exclusions": [
            "Starting category price is not evidence that the Flex caddy/adapter is included.",
            "Other hardware, installation, shipping and tax unconfirmed."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-temp-product"
          ]
        },
        {
          "id": "flex-heatershaker-start",
          "kind": "module",
          "item": "Heater-Shaker starting configuration",
          "amount": 4150,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product page has Add to Cart; stock not verified.",
          "checked": "2026-10-31",
          "configuration": "Starting module listing; distinguish OT-2-only versus Flex caddy configuration.",
          "inclusions": [
            "Product page states one selected plate adapter is included."
          ],
          "exclusions": [
            "Do not infer inclusion of Flex caddy/calibration adapter in category starting amount.",
            "Other hardware, service, tax and shipping unconfirmed."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-heat-product"
          ]
        },
        {
          "id": "flex-thermocycler-start",
          "kind": "module",
          "item": "Thermocycler Module starting configuration",
          "amount": 10230,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product page has Add to Cart; stock not verified.",
          "checked": "2026-10-31",
          "configuration": "Starting category listing; Flex caddy/calibration configuration may cost more.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "Do not assume Flex caddy/calibration adapter is included at this starting price.",
            "Actual selected total, seals, service, shipping and tax require confirmation."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-thermocycler-product"
          ]
        },
        {
          "id": "flex-stacker-start",
          "kind": "module",
          "item": "Flex Stacker starting configuration",
          "amount": 15000,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product page has Add to Cart; supplier advertises dispatch lead time, not verified stock.",
          "checked": "2026-10-31",
          "configuration": "Stacker versus Stacker-with-Kit variants must be selected.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "Required robot upgrade for pre-Q3-2025 Flex units is explicitly not included.",
            "Required Customer Kit / Stacker Kit variant must be confirmed; do not assume included in the starting price.",
            "Shipping, tax, installation and service unconfirmed."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-stacker-product"
          ]
        },
        {
          "id": "flex-temp-caddy-start",
          "kind": "module",
          "item": "Flex Temperature Module Caddy and Calibration Adapter",
          "amount": 1500,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Separately listed accessory; avoid double-counting if bundled in a module variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules"
          ]
        },
        {
          "id": "flex-heat-caddy-start",
          "kind": "module",
          "item": "Flex Heater-Shaker Caddy and Calibration Adapter",
          "amount": 1500,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Separately listed accessory; avoid double-counting if bundled in a module variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules"
          ]
        },
        {
          "id": "flex-thermal-caddy-start",
          "kind": "module",
          "item": "Flex Thermocycler Caddy and Calibration Adapter",
          "amount": 1750,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Separately listed accessory; avoid double-counting if bundled in a module variant.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules"
          ]
        },
        {
          "id": "flex-ngs-start",
          "kind": "bundle",
          "item": "Flex NGS Workstation",
          "amount": 77300,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Named workstation Starting at offer; exact selected heads/modules/installation not itemised in this observation.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-workstations"
          ]
        },
        {
          "id": "flex-pcr-start",
          "kind": "bundle",
          "item": "Flex PCR Workstation",
          "amount": 54150,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Named workstation Starting at offer; exact bill of materials requires confirmation.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-workstations"
          ]
        },
        {
          "id": "flex-installation-quote",
          "kind": "service",
          "item": "Mandatory Flex On-Site Installation",
          "amount": null,
          "currency": null,
          "condition": "new",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "quote-required",
          "availabilityDetail": "Service terms and regional availability require confirmation.",
          "checked": "2026-10-31",
          "configuration": "Required by robot product page; current separately itemised amount not obtained.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-flex-product",
            "cost-ot-services"
          ]
        },
        {
          "id": "flex-support-quote",
          "kind": "service",
          "item": "Protocol development, training and service",
          "amount": null,
          "currency": null,
          "condition": "new",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "quote-required",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Scope-specific service offer; current public numerical price not admitted.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-ot-services"
          ]
        }
      ],
      "procurementGaps": [
        "Starting prices are not additive configured totals: bundle inclusion and caddy variants can overlap.",
        "No currency conversion or UK landed-cost estimate; region/tax/shipping/install terms remain unknown.",
        "Dynamic product selection sometimes omits prices or exposes placeholder zero; those values are not admitted.",
        "Orderable means Add to Cart exists, not verified stock or delivery."
      ],
      "practicalConsiderations": [
        {
          "topic": "connection",
          "statement": "The guide documents HTTP over Ethernet/Wi-Fi on port 31950, with a USB-serial alternative.",
          "sourceIds": [
            "int-plr-flex"
          ],
          "status": "documented"
        },
        {
          "topic": "geometry",
          "statement": "PLR supplies aspiration/dispense coordinates from its resource definitions; the robot does not resolve the plate geometry.",
          "sourceIds": [
            "int-plr-flex"
          ],
          "status": "documented"
        },
        {
          "topic": "modules",
          "statement": "Does this driver version support every installed module and required gripper operation?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "ot2",
      "name": "OT-2 GEN2",
      "vendor": "Opentrons",
      "category": "liquid handler",
      "summary": "Two-mount GEN2 platform with head-specific ranges; generation compatibility must be preserved.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 300,
          "detail": "Curated GEN2 heads: P20 1–20 µL and P300 20–300 µL. Other head ranges remain outside this extracted record."
        },
        {
          "operation": "thermocycling",
          "type": "optional",
          "module": "Thermocycler",
          "detail": "optional thermocycling capability using Thermocycler. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Temperature Module",
          "detail": "optional heating-cooling capability using Temperature Module. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "mixing",
          "type": "optional",
          "module": "Heater-Shaker",
          "detail": "optional mixing capability using Heater-Shaker. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnetic Module",
          "detail": "optional magnetic-separation capability using Magnetic Module. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Single/eight-channel GEN2 pipettes",
        "Thermocycler",
        "Temperature Module",
        "Heater-Shaker",
        "Magnetic Module"
      ],
      "performance": "P20 GEN2 multi at 1 µL: ±20% systematic error and 10% CV per manufacturer specification; exact liquid/tip qualification still needed.",
      "sources": [
        {
          "id": "mfr-ot2-pipettes",
          "title": "Opentrons OT-2 GEN2 pipettes",
          "url": "https://docs.opentrons.com/ot-2/pipettes/",
          "section": "Replacing OT-2 pipettes; single-channel and multi-channel specifications",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-ot2",
          "title": "PyLabRobot OT-2 guide",
          "url": "https://docs.pylabrobot.org/stable/user_guide/opentrons/ot2/hello-world.html",
          "section": "Supported liquid operations; Physical setup; Model the physical deck",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-robots",
          "title": "Opentrons robot storefront",
          "url": "https://opentrons.com/products/categories/robots",
          "section": "Robots: Flex and OT-2 Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-modules",
          "title": "Opentrons module storefront",
          "url": "https://opentrons.com/products/categories/modules",
          "section": "Modules: individually named Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-pipettes",
          "title": "Opentrons pipette storefront",
          "url": "https://opentrons.com/products/categories/pipettes",
          "section": "Pipettes: channel-specific Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot2-product",
          "title": "OT-2 robot product page",
          "url": "https://opentrons.com/products/ot-2-robot",
          "section": "Introduction: base includes one GEN2 single-channel pipette; consumables separate; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-temp-product",
          "title": "Temperature Module product page",
          "url": "https://opentrons.com/products/temperature-module-gen2",
          "section": "OT-2 versus Flex configurations; aluminum block selection; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-heat-product",
          "title": "Heater-Shaker product page",
          "url": "https://opentrons.com/products/heater-shaker-module",
          "section": "OT-2 versus Flex configurations; one selected plate adapter included; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-thermocycler-product",
          "title": "Thermocycler Module product page",
          "url": "https://opentrons.com/products/thermocycler-module-1",
          "section": "OT-2 Module Only versus Flex with Caddy/Calibration Adapter configuration; Add to Cart",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-mag-discontinued",
          "title": "OT-2 Magnetic Module documentation",
          "url": "https://docs.opentrons.com/ot-2/modules/magnetic/",
          "section": "Magnetic Module features: discontinued; remaining inventory requires Sales confirmation",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-madsci-index",
          "title": "MADSci node module index at bbfcba5",
          "url": "https://github.com/AD-SDL/MADSci/blob/bbfcba5efcaeacb750252a921256de5d61d51bb2/docs/madsci_powered/Modules.md",
          "section": "Liquid handling and formulation: ot2_module",
          "checked": "2026-11-02"
        },
        {
          "id": "int-madsci-ot2-module",
          "title": "MADSci Opentrons module at ecb4e6e",
          "url": "https://github.com/AD-SDL/ot2_module/tree/ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
          "section": "README and src/ot2_rest_node.py: run_protocol",
          "checked": "2026-11-02"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Conditioned example only",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "ot2-p20",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "P20 is available as single or eight-channel.",
          "value": {
            "min": 1,
            "max": 20
          },
          "unit": "µL",
          "configuration": "P20 GEN2",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "ot2-p300",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "P300 is available as single or eight-channel.",
          "value": {
            "min": 20,
            "max": 300
          },
          "unit": "µL",
          "configuration": "P300 GEN2",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "ot2-p1000",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "P1000 is single-channel.",
          "value": {
            "min": 100,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "P1000 GEN2 single-channel",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "ot2-mount",
          "operation": "configuration",
          "type": "native",
          "statement": "Each single/eight-channel pipette occupies one left or right mount.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "ot2-p20-performance",
          "operation": "pipetting-performance",
          "type": "native",
          "statement": "P20 eight-channel at 1 µL: ±20% systematic error and 10% CV.",
          "configuration": "P20 GEN2 multi-channel at 1 µL",
          "conditions": "Manufacturer multi-channel specification; not the tighter single-channel specification.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "ot2-generation",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "OT-2 and Flex pipettes are mutually incompatible.",
          "sourceIds": [
            "mfr-ot2-pipettes"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Compatible module generations and deck footprints need separate module-source extraction.",
        "No native plate-gripper or centrifuge claim follows from the pipette documentation."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "OT-2",
            "registryId": "plr-opentrons-ot2",
            "status": "mostly",
            "api": "pylabrobot.opentrons.OT2",
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/opentrons/ot2/hello-world.html",
            "hardwareTestingRequired": null,
            "scope": "OT-2 v1 guide lists liquid operations for single-channel GEN1 and GEN2 pipettes.",
            "limitations": [
              "The registry label mostly must not be generalized to eight-channel liquid operations."
            ]
          }
        ],
        "prerequisites": [
          "Use the robot hostname/IP over the same network, with HTTP port 31950 reachable.",
          "Complete deck, pipette-offset and exact-tip-rack tip-length calibration in the Opentrons App."
        ],
        "gaps": [
          "Multi-channel pipetting coverage is not established by the current guide.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-plr-ot2"
        ]
      },
      "madsci": {
        "status": "upstream-listed",
        "integrations": [
          {
            "framework": "MADSci",
            "status": "upstream-listed",
            "module": "ot2_module",
            "moduleRevision": "ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
            "indexRevision": "bbfcba5efcaeacb750252a921256de5d61d51bb2",
            "license": "MIT; see upstream module LICENSE",
            "documentationUrl": "https://github.com/AD-SDL/ot2_module/tree/ecb4e6e80a5f9c1ac8d79a5753e62e4b5cb69105",
            "sourceIds": [
              "int-madsci-index",
              "int-madsci-ot2-module"
            ],
            "scope": "Upstream index lists OT-2 and Flex. Exact commands, firmware and configuration need independent verification.",
            "limitations": "This is a software discovery lead, not proof of installed hardware or validated operations. The run_protocol action substitutes parameters into its input file in place; use a disposable working copy if independently evaluating it."
          }
        ]
      },
      "procurement": [
        {
          "id": "ot2-base-start",
          "kind": "instrument",
          "item": "OT-2 robot starting configuration",
          "amount": 15950,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product page exposes Add to Cart; physical stock not checked.",
          "checked": "2026-10-31",
          "configuration": "Starting category amount; base product includes one GEN2 single-channel pipette.",
          "inclusions": [
            "Product page states base model includes one GEN2 single-channel pipette; confirm chosen variant."
          ],
          "exclusions": [
            "Additional pipettes, modules, consumables and other labware sold separately; service, tax and shipping unconfirmed."
          ],
          "sourceIds": [
            "cost-ot-robots",
            "cost-ot2-product"
          ]
        },
        {
          "id": "ot2-single-start",
          "kind": "module",
          "item": "OT-2 single-channel pipette",
          "amount": 2950,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Starting price for single-channel family; exact GEN2 volume variant must be selected.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-pipettes"
          ]
        },
        {
          "id": "ot2-eight-start",
          "kind": "module",
          "item": "OT-2 eight-channel pipette",
          "amount": 3950,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "not-verified",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Starting price for eight-channel family; exact GEN2 volume variant must be selected.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-pipettes"
          ]
        },
        {
          "id": "ot2-temperature-start",
          "kind": "module",
          "item": "Temperature Module",
          "amount": 3975,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Category starting amount; OT-2 Module Only variant must be selected.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-temp-product"
          ]
        },
        {
          "id": "ot2-heatershaker-start",
          "kind": "module",
          "item": "Heater-Shaker Module",
          "amount": 4150,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Category starting amount; OT-2 Module Only variant with chosen plate adapter.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-heat-product"
          ]
        },
        {
          "id": "ot2-thermocycler-start",
          "kind": "module",
          "item": "Thermocycler Module GEN2",
          "amount": 10230,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Price listing is not a physical stock check.",
          "checked": "2026-10-31",
          "configuration": "Category starting amount; OT-2 Module Only variant, not Flex caddy bundle.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-thermocycler-product"
          ]
        },
        {
          "id": "ot2-magnet-discontinued",
          "kind": "module",
          "item": "OT-2 Magnetic Module",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "discontinued",
          "availabilityDetail": "Discontinued product; remaining stock not confirmed. Do not equate with Flex passive Magnetic Block.",
          "checked": "2026-10-31",
          "configuration": "Powered OT-2 Magnetic Module; exact GEN1/GEN2 residual inventory must be confirmed. Manufacturer states discontinued and explicitly not Flex-compatible.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-ot-mag-discontinued"
          ]
        }
      ],
      "procurementGaps": [
        "Additional single pipette price must not be automatically added to the base offer that already includes one.",
        "Starting category prices do not guarantee every configuration at that amount.",
        "Discontinued Magnetic Module may have residual stock, but no current deliverable supply is established."
      ],
      "practicalConsiderations": [
        {
          "topic": "connection",
          "statement": "The driver creates a robot-server run and waits for each command to succeed or fail.",
          "sourceIds": [
            "int-plr-ot2"
          ],
          "status": "documented"
        },
        {
          "topic": "calibration",
          "statement": "The physical setup instructions require deck, pipette-offset and tip-length calibration for the selected tips.",
          "sourceIds": [
            "int-plr-ot2"
          ],
          "status": "documented"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "starlet",
      "name": "NGS STARlet",
      "vendor": "Hamilton",
      "category": "liquid handler",
      "summary": "Preconfigured NGS STARlet with documented magnetic, thermal, mixing and handling functions.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 1000,
          "detail": "native liquid-transfer capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Configured plate handling",
          "detail": "optional vessel-transfer capability using Configured plate handling. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "NGS magnetic/thermal accessories",
          "detail": "optional magnetic-separation capability using NGS magnetic/thermal accessories. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Independent channels",
        "NGS magnetic/thermal accessories",
        "Configured plate handling"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-ngs-starlet",
          "title": "Hamilton NGS STARlet",
          "url": "https://www.hamiltoncompany.com/assay-ready-workstations/ngs-starlet",
          "section": "Overview / NGS Automation for Any Laboratory; Specifications / Pipetting Options, Platform/Accessories and Transport Tools",
          "checked": "2026-10-31"
        },
        {
          "id": "mfr-ngs-starlet-2025-app",
          "title": "Hamilton NGS STARlet ONT application AN-2501-11",
          "url": "https://assets-robotics.hamiltoncompany.com/Application-Notes-ROB/Application-Notes-ROB-2025-05/AN-2501-11_NGS-STARlet-ONT-LSK114.pdf?v=1746176174",
          "section": "System Description: eight independent 1000 µL channels; application-specific deck",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-star",
          "title": "PyLabRobot Hamilton STAR and STARlet",
          "url": "https://docs.pylabrobot.org/stable/user_guide/hamilton/star/index.html",
          "section": "STAR/STARlet support table and legacy STARBackend API",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-setup",
          "title": "PyLabRobot installation",
          "url": "https://docs.pylabrobot.org/stable/user_guide/getting-started/installation.html",
          "section": "Physical hardware dependency groups; Using the USB interface; Windows driver ownership",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-starlet-enquiry",
          "title": "Hamilton NGS STARlet manufacturer enquiry",
          "url": "https://www.hamiltoncompany.com/assay-ready-workstations/ngs-starlet",
          "section": "Product/contact enquiry; no numerical price extracted",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "starlet-volume",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Published pipetting range depends on configuration.",
          "value": {
            "min": 1,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "NGS STARlet 1 mL channels",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-channels",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Channel count is unresolved: the current manufacturer overview says eight channels while its specification table says four.",
          "configuration": "Exact quoted NGS STARlet configuration required",
          "conditions": "Current page is internally inconsistent. A separate 2025 application also describes eight channels; do not treat either count as universal.",
          "sourceIds": [
            "mfr-ngs-starlet",
            "mfr-ngs-starlet-2025-app"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Published capacity is 25 ANSI/SLAS positions.",
          "value": 25,
          "unit": "positions",
          "configuration": "NGS STARlet product specification",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-mag",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "NGS processing zone includes a magnetic plate.",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-shakers",
          "operation": "mixing",
          "type": "native",
          "statement": "Two HHS units are described with 2500 rpm and heating up to 105°C; two cooling/heating devices are also listed.",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-gripper",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "CO-RE Gripper is listed as standard.",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "starlet-odtc",
          "operation": "thermocycling",
          "type": "optional",
          "statement": "ODTC is identified as optional.",
          "sourceIds": [
            "mfr-ngs-starlet"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Current product page itself says eight channels in its overview and four in its specification table. Resolve exact quoted configuration; the 2025 application is a separate eight-channel example.",
        "No condition-specific pipetting accuracy extracted.",
        "Actual quoted configuration determines installed accessories."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "STAR",
            "registryId": "plr-hamilton-star",
            "status": "full",
            "api": "pylabrobot.legacy.liquid_handling.backends.STARBackend",
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/hamilton/star/index.html",
            "hardwareTestingRequired": null,
            "scope": "Underlying STAR/STARlet family backend; a lead for NGS STARlet, not verification of the complete NGS workstation.",
            "limitations": [
              "Legacy v0 API. Confirm selected channels, gripper, peripheral interfaces and firmware."
            ]
          }
        ],
        "prerequisites": [
          "Confirm the exact STARlet generation and installed NGS accessories against backend commands.",
          "The documented USB route requires USB dependencies and platform-specific driver access; avoid concurrent vendor control."
        ],
        "gaps": [
          "Family support cannot certify an NGS method, integrated ODTC, heating/shaking devices or a particular four/eight-channel configuration.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-plr-star",
          "int-plr-setup"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "starlet-configuration-quote",
          "kind": "instrument",
          "item": "Hamilton NGS STARlet",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-starlet-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "family-scope",
          "statement": "PyLabRobot lists STAR and STARlet under the legacy STARBackend.",
          "sourceIds": [
            "int-plr-star"
          ],
          "status": "documented"
        },
        {
          "topic": "host-driver",
          "statement": "The Windows USB setup changes the device driver and requires Hamilton/VENUS software to be closed; this is a setup dependency, not a step performed by this catalogue.",
          "sourceIds": [
            "int-plr-setup"
          ],
          "status": "documented"
        },
        {
          "topic": "vendor-recovery",
          "statement": "What vendor-software restoration and service procedure is needed if USB driver ownership is changed?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "fluent",
      "name": "Fluent",
      "vendor": "Tecan",
      "category": "liquid handler",
      "summary": "FCA, MCA96/MCA384 and robotic-gripper arm options have distinct operating envelopes.",
      "capabilities": [],
      "modules": [
        "Flexible Channel Arm",
        "Multi-Channel Arm",
        "Robotic Gripper Arm",
        "Configured peripherals"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mfr-fluent-platform",
          "title": "Tecan Fluent automated workstation",
          "url": "https://www.tecan.com/fluent-automated-workstation",
          "section": "Fluent Liquid Handler Specifications table",
          "checked": "2026-10-31"
        },
        {
          "id": "fluent",
          "title": "Tecan liquid handling catalogue",
          "url": "https://www.tecan.com/download-tecans-liquid-handling-catalog",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-fluent-enquiry",
          "title": "Tecan Fluent manufacturer enquiry",
          "url": "https://www.tecan.com/fluent-automated-workstation",
          "section": "Request a Quote; configuration consultation",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "fluent-fca",
          "operation": "liquid-transfer",
          "type": "optional",
          "statement": "FCA has eight independent-Z channels with adjustable 9–38 mm Y spacing.",
          "configuration": "Flexible Channel Arm",
          "sourceIds": [
            "mfr-fluent-platform"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fluent-mca96",
          "operation": "liquid-transfer",
          "type": "optional",
          "statement": "MCA96 published volume range.",
          "value": {
            "min": 1,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "Multiple Channel Arm 96",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "mfr-fluent-platform"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fluent-mca384",
          "operation": "liquid-transfer",
          "type": "optional",
          "statement": "MCA384 exchanges adapters for 96/384 formats and supports selective tip pickup.",
          "configuration": "MCA384; 15/50/125 µL disposable-tip sizes in 384 format are capacities, not minimum-volume specifications.",
          "sourceIds": [
            "mfr-fluent-platform"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fluent-gripper",
          "operation": "vessel-transfer",
          "type": "optional",
          "statement": "RGA offers standard/long-Z and interchangeable finger configurations.",
          "sourceIds": [
            "mfr-fluent-platform"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "fluent-arm-count",
          "operation": "configuration",
          "type": "native",
          "statement": "480 supports one/two arms; 780 and 1080 support up to three subject to configuration.",
          "sourceIds": [
            "mfr-fluent-platform"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "FCA low-volume accuracy requires its liquid/air displacement and tip-specific specification.",
        "MCA96 marketing precision phrase lacks a complete condition matrix here, so no universal accuracy value is asserted.",
        "Thermal, magnetic and centrifuge integration requires separate device/configuration records."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Establish a Fluent-specific external control interface and driver; the Tecan EVO entry is a different product."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "The registry contains Tecan EVO, not an exact Fluent mapping.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "fluent-configuration-quote",
          "kind": "instrument",
          "item": "Tecan Fluent",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact heads, modules, software, installation and service require an itemised offer.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-fluent-enquiry"
          ]
        }
      ],
      "procurementGaps": [
        "No numerical price extracted from the inspected public manufacturer route. This is not a claim that no public price exists anywhere.",
        "A quote/contact route does not establish stock, price, lead time or module inclusion."
      ],
      "practicalConsiderations": [
        {
          "topic": "arm-scope",
          "statement": "Does the proposed interface support the selected FCA/MCA96/MCA384 arms and gripper, including recovery and tip-selection modes?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "mantis",
      "name": "MANTIS",
      "vendor": "FORMULATRIX",
      "category": "reagent dispenser",
      "summary": "FORMULATRIX Reagent dispenser. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "dispensing",
          "type": "native",
          "detail": "native dispensing capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Reagent chips",
        "Reagent inputs"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mantis-hardware-54",
          "title": "MANTIS 5.4 Hardware Overview",
          "url": "https://help.formulatrix.com/mantis/5.4/Content/Hardware_Overview.htm",
          "section": "Large Capacity Chip Changer; Chip Types and Specifications, silicone LV/HV and Hi-Fi rows; footnote **",
          "checked": "2026-10-31"
        },
        {
          "id": "mantis-product",
          "title": "MANTIS product information",
          "url": "https://formulatrix.com/liquid-handling-systems/mantis-liquid-dispenser/",
          "section": "More Than a Reagent Dispenser",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-mantis-manufacturer",
          "title": "FORMULATRIX MANTIS",
          "url": "https://formulatrix.com/liquid-handling-systems/mantis-liquid-dispenser/",
          "section": "Product enquiry / configuration; no numerical price extracted",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-fisher-mantis",
          "title": "Fisher Scientific MANTIS HV chip pack",
          "url": "https://www.fishersci.com/shop/products/mantis-chip-1ul-and-5ul-12pk/NC1916994",
          "section": "NC1916994 / supplier 233648; pack description; displayed price; surcharge notice; Add to Cart",
          "kind": "reseller",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "mantis-lv-minimum",
          "operation": "dispensing",
          "type": "native",
          "statement": "The silicone LV chip has a 0.1 µL minimum dispense and 0.1/0.5 µL diaphragms.",
          "value": 0.1,
          "unit": "µL",
          "configuration": "MANTIS with silicone LV chip",
          "conditions": "Chip-specific minimum; not a finite upper volume guarantee.",
          "sourceIds": [
            "mantis-hardware-54"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "mantis-hv-minimum",
          "operation": "dispensing",
          "type": "native",
          "statement": "The silicone HV chip has a 1 µL minimum dispense and 1/5 µL diaphragms.",
          "value": 1,
          "unit": "µL",
          "configuration": "MANTIS with silicone HV chip",
          "conditions": "Select the chip; the LV minimum does not apply to HV.",
          "sourceIds": [
            "mantis-hardware-54"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "mantis-hifi-specification",
          "operation": "dispensing",
          "type": "optional",
          "statement": "LV and HV Hi-Fi rows specify CV <2% and 5% accuracy error for both diaphragms.",
          "configuration": "LV or HV Hi-Fi chip; MANTIS software 5.1 or newer",
          "conditions": "Technical specification, not an extracted test result: liquid, replicates and test volume are not given in this table.",
          "sourceIds": [
            "mantis-hardware-54"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "mantis-lc3",
          "operation": "reagent-selection",
          "type": "optional",
          "statement": "The optional LC3 upgrade accommodates up to 48 chips.",
          "value": 48,
          "unit": "chips maximum",
          "configuration": "MANTIS with Large Capacity Chip Changer",
          "conditions": "Carousel configuration must be selected; this is not the standard chip inventory.",
          "sourceIds": [
            "mantis-hardware-54"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "mantis-plate-formats",
          "operation": "dispensing",
          "type": "native",
          "statement": "The manufacturer describes dispensing into SBS plate formats from 6 through 1536 wells and programmable custom layouts.",
          "configuration": "MANTIS dispenser",
          "conditions": "Verify exact plate geometry and dispense clearance; no universal labware fit is established.",
          "sourceIds": [
            "mantis-product"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No liquid-specific measured precision or accuracy result is admitted here. The public Artel study summary links to a form-gated full report.",
        "The newer product-page <2% claim must not be applied to standard chips: the 5.4 table gives <3% for standard silicone LV/HV chips.",
        "Chip/nozzle compatibility and exact labware geometry require configuration review."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "Mantis",
            "registryId": "plr-formulatrix-mantis",
            "status": "wip",
            "api": null,
            "documentationUrl": null,
            "hardwareTestingRequired": null,
            "scope": "MANTIS is listed as work in progress.",
            "limitations": [
              "The pinned record supplies neither an API path nor a driver quickstart. A ready-to-run integration is not established."
            ]
          }
        ],
        "prerequisites": [
          "Obtain the current implemented driver entry point, supported commands and hardware-test evidence for the exact MANTIS generation."
        ],
        "gaps": [
          "An upstream WIP listing is not evidence that normal dispensing workflows can currently be controlled.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "mantis-instrument-quote",
          "kind": "instrument",
          "item": "MANTIS dispenser",
          "amount": null,
          "currency": null,
          "condition": "not-stated",
          "priceType": "quote-required",
          "sourceType": "manufacturer",
          "priceBasis": "not-publicly-priced-in-inspected-source",
          "region": "Not established",
          "vat": "Not established; request itemised tax treatment.",
          "shipping": "Not established; request shipping and installation terms.",
          "availability": "not-verified",
          "availabilityDetail": "No live stock or deliverable configuration established.",
          "checked": "2026-10-31",
          "configuration": "Exact instrument/chip-changer configuration; no numerical manufacturer price extracted.",
          "inclusions": [
            "No priced bundle contents established."
          ],
          "exclusions": [
            "No numerical cost estimate, service coverage or delivery date inferred."
          ],
          "sourceIds": [
            "cost-mantis-manufacturer"
          ]
        },
        {
          "id": "mantis-hv-chip-pack-fisher",
          "kind": "module",
          "item": "MANTIS HV replacement chip pack (consumable)",
          "amount": 1954.08,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "reseller",
          "priceBasis": "displayed-pack",
          "region": "United States reseller storefront",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Add to Cart displayed; account-specific pricing and physical stock not verified.",
          "checked": "2026-10-31",
          "configuration": "Fisher NC1916994 / supplier 233648; title and packaging describe twelve silicone HV chips.",
          "inclusions": [
            "One listed purchase package, described as 12 chips; confirm packaging on order."
          ],
          "exclusions": [
            "Dispenser and chip changer are not included.",
            "Supplier surcharges may apply; account price may differ.",
            "Shipping and tax not stated."
          ],
          "sourceIds": [
            "cost-fisher-mantis"
          ],
          "sellerType": "reseller",
          "seller": "Fisher Scientific"
        }
      ],
      "procurementGaps": [
        "Chip pack is a reseller-listed consumable price, not instrument capital cost or manufacturer list price.",
        "Retailer capability text is not imported as performance evidence."
      ],
      "practicalConsiderations": [
        {
          "topic": "driver-readiness",
          "statement": "Which commands are implemented and tested, and can the chip changer, dispensing and error reporting be demonstrated on the intended hardware?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "dragonfly",
      "name": "dragonfly discovery",
      "vendor": "SPT Labtech",
      "category": "reagent dispenser",
      "summary": "SPT Labtech Reagent dispenser. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "dispensing",
          "type": "native",
          "detail": "native dispensing capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Disposable syringes",
        "Reservoirs",
        "Genomics accessories"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "dragonfly-technology",
          "title": "dragonfly discovery user manual: technology",
          "url": "https://www.sptlabtech.com/product-help-center/dragonfly-discovery-user-manual-dragonfly-discovery-technology",
          "section": "dragonfly discovery technology; Deep well block dragonfly discovery",
          "checked": "2026-10-31"
        },
        {
          "id": "dragonfly-product",
          "title": "dragonfly discovery product specifications",
          "url": "https://www.sptlabtech.com/products/dragonfly/dragonfly-discovery",
          "section": "Technical Specification; Versatile workflow integration",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-dragonfly-api",
          "title": "SPT dragonfly discovery",
          "url": "https://www.sptlabtech.com/products/dragonfly/dragonfly-discovery",
          "section": "Versatile workflow integration",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "dragonfly-volume",
          "operation": "dispensing",
          "type": "native",
          "statement": "Each head aspirates 0.3–4 mL and dispenses 0.2–4000 µL; one syringe fill holds up to 4 mL.",
          "value": "0.2–4000",
          "unit": "µL dispense",
          "configuration": "dragonfly discovery positive-displacement syringe head",
          "conditions": "Aspiration and dispense limits are different.",
          "sourceIds": [
            "dragonfly-technology"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "dragonfly-precision",
          "operation": "dispensing",
          "type": "native",
          "statement": "The technical manual specifies CV below 5% from 1 µL and 10% across 0.2–1 µL.",
          "configuration": "dragonfly discovery syringe dispensing",
          "conditions": "The manual refers to a broad range of fluids but does not identify tested liquids, replicates or an accuracy experiment; do not treat this as assay-specific validation.",
          "sourceIds": [
            "dragonfly-technology"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "dragonfly-heads",
          "operation": "dispensing",
          "type": "optional",
          "statement": "Instrument configurations provide 3, 6 or 10 dispensing heads.",
          "configuration": "Selected dragonfly discovery configuration",
          "conditions": "Head count must be selected; not all configurations contain ten heads.",
          "sourceIds": [
            "dragonfly-product"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "dragonfly-labware",
          "operation": "plate-handling",
          "type": "optional",
          "statement": "The product table lists 96-, 384- and 1536-well formats; the deep-well configuration accommodates blocks or racked tubes up to 44 mm high.",
          "value": 44,
          "unit": "mm maximum labware height in DWB configuration",
          "configuration": "Deep-well-block variant for tall labware",
          "conditions": "DWB instruments use an insert for standard-depth plates.",
          "sourceIds": [
            "dragonfly-product",
            "dragonfly-technology"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "dragonfly-integration",
          "operation": "device-integration",
          "type": "external",
          "statement": "A documented API supports integration with external plate handlers, stackers and liquid handlers.",
          "configuration": "dragonfly discovery plus selected third-party devices",
          "conditions": "An API is not evidence that any particular device combination is installed or qualified.",
          "sourceIds": [
            "dragonfly-product"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No liquid-specific accuracy test or precision replicate count extracted.",
        "Source speed claims omit dispense-volume conditions and are not converted into workflow or unattended duration.",
        "Exact plate part numbers, reservoir choice and driver compatibility remain unverified."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify access to the manufacturer API and its version/licensing before designing a third-party integration."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-dragonfly-api"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "vendor-api",
          "statement": "SPT documents an API for integration with external plate handlers, stackers and other instruments; it does not identify a PyLabRobot backend.",
          "sourceIds": [
            "int-dragonfly-api"
          ],
          "status": "documented"
        },
        {
          "topic": "consumables-and-state",
          "statement": "How are syringe loading, reservoir state, priming, plate handoffs and failed dispenses represented by the selected API?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "kingfisher",
      "name": "KingFisher Flex",
      "vendor": "Thermo Fisher",
      "category": "separation",
      "summary": "Thermo Fisher Separation. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "detail": "native magnetic-separation capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "24/96-well magnetic heads",
        "Compatible reagent plates"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "kingfisher-spec",
          "title": "KingFisher Flex product specifications",
          "url": "https://www.thermofisher.com/us/en/home/life-science/dna-rna-purification-analysis/automated-purification-extraction/kingfisher-systems/models/kingfisher-flex.html",
          "section": "Specifications: processing volumes, selectable magnetic heads, heating/cooling; ordering table 5400610/620/630/640",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "kingfisher-formats",
          "operation": "magnetic-separation",
          "type": "optional",
          "statement": "Four selectable magnetic heads correspond to PCR, 96-well, 96-deep-well and 24-deep-well configurations.",
          "configuration": "KingFisher Flex; chosen head and matching plastics",
          "conditions": "Heads are alternative configurations; no pipetting capability is inferred from processing-volume specifications.",
          "sourceIds": [
            "kingfisher-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "kingfisher-pcr-volume",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "The PCR-plate configuration processes 20–100 µL.",
          "value": "20–100",
          "unit": "µL",
          "configuration": "96 PCR head and skirted PCR plate",
          "conditions": "A processing-volume specification, not liquid-transfer accuracy.",
          "sourceIds": [
            "kingfisher-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "kingfisher-96-volume",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "The 96-well format processes 20–200 µL; the 96-deep-well format processes 50–1000 µL.",
          "configuration": "96 KF head or 96 deep-well head with corresponding plate",
          "conditions": "Do not combine the two envelopes into one head specification.",
          "sourceIds": [
            "kingfisher-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "kingfisher-24-volume",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "The 24-deep-well configuration processes 200–5000 µL.",
          "value": "200–5000",
          "unit": "µL",
          "configuration": "24 deep-well head and plate",
          "conditions": "Capacity is 24 samples for this head, not 96.",
          "sourceIds": [
            "kingfisher-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "kingfisher-heating",
          "operation": "heating",
          "type": "native",
          "statement": "The published heating range starts 5 °C above ambient and ends at 115 °C.",
          "value": "ambient +5 to 115",
          "unit": "°C",
          "configuration": "KingFisher Flex heating position",
          "conditions": "The lower limit is relative to ambient; it is not refrigeration to 5 °C.",
          "sourceIds": [
            "kingfisher-spec"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No extraction yield or recovery performance inferred from processing volumes.",
        "Exact consumable identity, head installed, heating performance and robotic loading integration need confirmation.",
        "The manufacturer site redirected to its German locale during verification; the corresponding specification rows were checked."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify remote start, status/error reporting and plate-loading support for KingFisher Flex specifically."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "model-boundary",
          "statement": "Is the proposed remote-control route for Flex, rather than a different KingFisher model?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "loading",
          "statement": "Who loads the plates and tip combs, and what physical and software interfaces would automate those handoffs?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "rotina",
      "name": "ROTINA 380 RC Robotic",
      "vendor": "Hettich",
      "category": "centrifuge",
      "summary": "Hettich Centrifuge. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "centrifugation",
          "type": "native",
          "detail": "native centrifugation capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Indexed robotic access",
        "Refrigeration",
        "Swing-out rotor",
        "Tube/plate adapters"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "rotina-datasheet",
          "title": "ROTINA 380 / RC Robotic datasheet DS.0525-EN",
          "url": "https://www.hettichlab.com/downloadcenter/Products/Datasheets/ROTINA380-380RC-Robotic_EN.pdf",
          "section": "p1 Features; p2 Technical data and rotor 3724-R; p3 rotor 3722-R and plate table; temperature/RCF footnotes",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-rotina-interface",
          "title": "Hettich ROTINA 380 / RC Robotic datasheet",
          "url": "https://www.hettichlab.com/downloadcenter/Products/Datasheets/ROTINA380-380RC-Robotic_EN.pdf",
          "section": "p1 Features: loading hatch and RS-232",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "rotina-variants",
          "operation": "centrifugation",
          "type": "native",
          "statement": "The non-refrigerated 380 is rated to 5000 rpm; refrigerated 380 RC is rated to 5100 rpm.",
          "configuration": "ROTINA 380 Robotic versus 380 RC Robotic",
          "conditions": "Instrument maxima do not replace rotor and vessel ratings.",
          "sourceIds": [
            "rotina-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "rotina-tube-rotor",
          "operation": "centrifugation",
          "type": "optional",
          "statement": "Rotor 3724-R with bucket 3725-R/4 is rated to 5000 rpm and 4696 ×g, with capacity up to sixteen 50 mL tubes.",
          "value": 4696,
          "unit": "×g maximum",
          "configuration": "Four-place swing-out rotor 3724-R; bucket 3725-R/4",
          "conditions": "RCF describes rotor performance. Check vessel ratings; the datasheet limits its annotated glass tubes to 4000 ×g.",
          "sourceIds": [
            "rotina-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "rotina-plate-rotor",
          "operation": "centrifugation",
          "type": "optional",
          "statement": "Rotor 3722-R with bucket 3730-R/2 is rated to 5100 rpm and 4362 ×g. It holds six 15 mm microplates or two 44.5 mm deep-well plates.",
          "value": 4362,
          "unit": "×g maximum",
          "configuration": "Two-place swing-out plate rotor 3722-R; bucket 3730-R/2; 5100 rpm requires RC instrument",
          "conditions": "Capacity depends on plate height; six plates is not the deep-well capacity.",
          "sourceIds": [
            "rotina-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "rotina-cooled-rotors",
          "operation": "cooling",
          "type": "native",
          "statement": "Both listed rotor configurations specify a lowest achievable temperature of 0 °C for cooled versions.",
          "value": 0,
          "unit": "°C lowest specified",
          "configuration": "ROTINA 380 RC Robotic with listed rotor/bucket combinations",
          "conditions": "Datasheet footnote: with precooling at maximum speed. This is not a complete setpoint range.",
          "sourceIds": [
            "rotina-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "rotina-loading",
          "operation": "plate-handling",
          "type": "external",
          "statement": "The centrifuge provides a loading hatch and an RS-232 interface for integration.",
          "configuration": "ROTINA 380 / 380 RC Robotic",
          "conditions": "The external robot, gripping geometry and workcell control still require integration.",
          "sourceIds": [
            "rotina-datasheet"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No universal temperature setpoint range extracted.",
        "Adapters, vessel permissible RCF, balancing rules, seal/lid clearance and external loading must be checked for the chosen configuration."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Obtain the ROTINA 380 RC Robotic serial protocol and confirm compatible firmware and loading-hatch control."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Registry ROTANTA 460 Robotic and SBS 300 R entries are not ROTINA 380 RC Robotic drivers.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-rotina-interface"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "physical-interface",
          "statement": "Hettich specifies RS-232 and a loading/unloading hatch on the ROTINA robotic family.",
          "sourceIds": [
            "int-rotina-interface"
          ],
          "status": "documented"
        },
        {
          "topic": "rotor-and-handoff",
          "statement": "Are rotor positioning, imbalance/error handling, lids and the robot transfer geometry supported for the chosen rotor/buckets?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "plateloc",
      "name": "PlateLoc + BenchCel",
      "vendor": "Agilent",
      "category": "closure and handling",
      "summary": "Agilent Closure and handling. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "sealing",
          "type": "native",
          "detail": "native sealing capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "vessel-transfer",
          "type": "external",
          "detail": "external vessel-transfer capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "PlateLoc sealer",
        "BenchCel stackers/handler"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "plateloc-datasheet",
          "title": "PlateLoc Thermal Microplate Sealer datasheet 5991-7947EN",
          "url": "https://www.agilent.com/cs/library/datasheets/public/5991-7947EN.pdf",
          "section": "Specifications: microplate height, labware compatibility, performance, sealing technology, interface/software; 30 October 2019",
          "checked": "2026-10-31"
        },
        {
          "id": "plateloc",
          "title": "Agilent BenchCel and PlateLoc application",
          "url": "https://www.agilent.com/cs/library/applications/5991-8091EN.pdf",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-plateloc",
          "title": "PyLabRobot PlateLoc guide",
          "url": "https://docs.pylabrobot.org/stable/user_guide/agilent/plateloc/hello-world.html",
          "section": "Connection; Physical setup; Read status; Serial command profile",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-benchcel",
          "title": "PyLabRobot BenchCel 4R quickstart",
          "url": "https://docs.pylabrobot.org/stable/user_guide/agilent/benchcel/hello-world.html",
          "section": "Verified firmware; How it communicates; Physical setup; transfer teachpoint",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "plateloc-temperature",
          "operation": "plate-sealing",
          "type": "native",
          "statement": "The sealing temperature setting spans 30–200 °C.",
          "value": "30–200",
          "unit": "°C",
          "configuration": "Agilent PlateLoc Thermal Microplate Sealer",
          "conditions": "Select temperature and dwell for the exact plate and heat-seal material.",
          "sourceIds": [
            "plateloc-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "plateloc-labware",
          "operation": "plate-sealing",
          "type": "native",
          "statement": "The datasheet permits microplates up to 51 mm high, meeting ANSI/SBS 1-2004 through 4-2004 and having heat-sealable raised well rims.",
          "value": 51,
          "unit": "mm maximum plate height",
          "configuration": "PlateLoc with appropriate support insert",
          "conditions": "Skirtless and half-skirt PCR plates additionally require the Agilent 96-well PCR Plate Support.",
          "sourceIds": [
            "plateloc-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "plateloc-film",
          "operation": "plate-sealing",
          "type": "native",
          "statement": "PlateLoc uses roll-fed thermal seals; individual cut sheets and pressure-sensitive adhesive films are not supported.",
          "configuration": "PlateLoc thermal roll-fed mechanism",
          "conditions": "Confirm compatible seal chemistry and plate material.",
          "sourceIds": [
            "plateloc-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "plateloc-cycle",
          "operation": "plate-sealing",
          "type": "native",
          "statement": "The datasheet gives an approximate eight-second cycle per plate.",
          "value": 8,
          "unit": "s approximate cycle",
          "configuration": "PlateLoc sealing cycle",
          "conditions": "Loading, warm-up and external transport are not included; sealing settings can affect workflow time.",
          "sourceIds": [
            "plateloc-datasheet"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "plateloc-control",
          "operation": "device-integration",
          "type": "external",
          "statement": "RS-232 and an ActiveX interface support third-party automation; Agilent workstations use VWorks.",
          "configuration": "PlateLoc plus external automation controller",
          "conditions": "VWorks is not included with a standalone instrument purchase.",
          "sourceIds": [
            "plateloc-datasheet"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No seal-integrity performance inferred for a particular plate, contents or downstream operation.",
        "The approximately eight-second cycle is not an unattended-workflow duration or throughput guarantee."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "PlateLoc",
            "registryId": "plr-agilent-plateloc",
            "status": "mostly",
            "api": "pylabrobot.agilent.PlateLoc",
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/agilent/plateloc/hello-world.html",
            "hardwareTestingRequired": null,
            "scope": "PlateLoc sealer, independently of the external plate handler.",
            "limitations": [
              "Mostly v1; direct serial protocol does not report actual block temperature."
            ]
          },
          {
            "name": "BenchCel 4R",
            "registryId": "plr-agilent-benchcel-4r",
            "status": "mostly",
            "api": "pylabrobot.agilent.benchcel.BenchCel4R",
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/agilent/benchcel/hello-world.html",
            "hardwareTestingRequired": null,
            "scope": "BenchCel 4R four-stacker handler only.",
            "limitations": [
              "BenchCel 4R four-stacker configuration; protocol verified with firmware 3.2.20.0.",
              "Do not generalize to BenchCel 2R, other stacker counts or an untested transfer geometry."
            ]
          }
        ],
        "prerequisites": [
          "PlateLoc needs the serial dependency, USB-to-RS-232 adapter and correct DB9 cable.",
          "BenchCel 4R needs Ethernet, compressed air and a verified transfer teachpoint; VWorks must release the control session."
        ],
        "gaps": [
          "A pair of listed drivers does not establish a validated PlateLoc/BenchCel workflow.",
          "Driver-accepted temperature commands are not a replacement for the manufacturer operating envelope.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-plr-plateloc",
          "int-plr-benchcel"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "software-route",
          "statement": "PyLabRobot documents direct PlateLoc RS-232 control without ActiveX/VWorks; BenchCel teaching still uses VWorks in its guide.",
          "sourceIds": [
            "int-plr-plateloc",
            "int-plr-benchcel"
          ],
          "status": "documented"
        },
        {
          "topic": "status-observability",
          "statement": "PlateLoc status includes the written target and cycle completion, but not a measured block temperature.",
          "sourceIds": [
            "int-plr-plateloc"
          ],
          "status": "documented"
        },
        {
          "topic": "firmware-and-motion",
          "statement": "BenchCel verification is reported for 4R firmware 3.2.20.0; its reverse-engineered protocol and transfer teachpoints need checking on the intended unit.",
          "sourceIds": [
            "int-plr-benchcel"
          ],
          "status": "documented"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "linq",
      "name": "LINQ workcell",
      "vendor": "Automata",
      "category": "workcell",
      "summary": "Automata Workcell. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "native vessel-transfer capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "centrifugation",
          "type": "external",
          "detail": "external centrifugation capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "thermocycling",
          "type": "external",
          "detail": "external thermocycling capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "qc",
          "type": "external",
          "detail": "external qc capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Robot transport",
        "Configured devices",
        "Operator confirmation tasks"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "linq-instruments",
          "title": "LINQ SDK: Instruments and Drivers",
          "url": "https://docs.automata.tech/instruments-drivers",
          "section": "Workcell; Instruments / Config",
          "checked": "2026-10-31"
        },
        {
          "id": "linq-tasks",
          "title": "LINQ SDK: Tasks and Transport",
          "url": "https://docs.automata.tech/tasks-transport",
          "section": "Overview; ActionTask basics",
          "checked": "2026-10-31"
        },
        {
          "id": "linq-workflow",
          "title": "LINQ SDK: Workflow",
          "url": "https://docs.automata.tech/workflow",
          "section": "Workflow classes: time_constraints, instrument_blocks, run_instructions",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-linq-instruments",
          "title": "Automata LINQ instruments and drivers",
          "url": "https://docs.automata.tech/instruments-drivers",
          "section": "Workcell; Instruments / Config; Simulation Configuration",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "linq-workcell",
          "operation": "orchestration",
          "type": "native",
          "statement": "LINQ represents a workcell as an instrument list and a transport matrix.",
          "configuration": "Automata LINQ SDK workcell",
          "conditions": "A software model must correspond to a configured physical workcell.",
          "sourceIds": [
            "linq-instruments"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "linq-drivers",
          "operation": "device-integration",
          "type": "external",
          "statement": "Instruments have a selected driver and configuration; workflow actions execute against those devices.",
          "configuration": "LINQ with configured external instruments and compatible drivers",
          "conditions": "The orchestration platform does not itself supply a centrifuge, thermal cycler or liquid-transfer envelope.",
          "sourceIds": [
            "linq-instruments"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "linq-task-types",
          "operation": "orchestration",
          "type": "native",
          "statement": "Action tasks can represent labware movement, instrument actions or operator confirmation; custom code and data integrations are also supported.",
          "configuration": "LINQ workflow task graph",
          "conditions": "A manual confirmation remains a human handoff.",
          "sourceIds": [
            "linq-tasks"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "linq-constraints",
          "operation": "scheduling",
          "type": "native",
          "statement": "Workflow definitions carry time constraints, instrument blocks and run instructions.",
          "configuration": "LINQ Workflow object",
          "conditions": "These are scheduling inputs, not measured execution times or a guarantee of unattended operation.",
          "sourceIds": [
            "linq-workflow"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No vendor-independent hardware performance is assigned to LINQ.",
        "Device availability, driver version, transport compatibility, recovery behavior and timing need a concrete workcell."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Choose who owns orchestration and each physical device connection; establish any LINQ-to-PyLabRobot bridge explicitly."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-linq-instruments"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "separate-controller",
          "statement": "LINQ has its own workcell, driver and configuration model. Its simulation mode can bypass hardware initialization.",
          "sourceIds": [
            "int-linq-instruments"
          ],
          "status": "documented"
        },
        {
          "topic": "bridge-and-ownership",
          "statement": "Is there a supported bridge between LINQ and PyLabRobot, and how does it avoid concurrent control of the same instrument?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "odtc",
      "name": "ODTC",
      "vendor": "INHECO",
      "category": "thermocycler",
      "summary": "INHECO Thermocycler. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "thermocycling",
          "type": "native",
          "detail": "native thermocycling capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Plate format and controller options"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "odtc-spec",
          "title": "INHECO ODTC technical specifications",
          "url": "https://www.inheco.com/odtc.html",
          "section": "Technical Specifications ODTC 96/96 XL/384/384 XL; PCU; footnotes 1, 2 and 4",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-odtc",
          "title": "PyLabRobot ODTC guide",
          "url": "https://docs.pylabrobot.org/stable/user_guide/inheco/odtc/hello-world.html",
          "section": "Ethernet/SiLA connection; Mostly v0 listing",
          "checked": "2026-10-31"
        },
        {
          "id": "int-inheco-odtc",
          "title": "INHECO ODTC specifications",
          "url": "https://www.inheco.com/odtc.html",
          "section": "Power & Control Unit interface and footnote 1",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "odtc-temperature",
          "operation": "thermocycling",
          "type": "native",
          "statement": "ODTC 96 and 384 specification tables give a 4–99 °C temperature range.",
          "value": "4–99",
          "unit": "°C",
          "configuration": "ODTC 96/96 XL or 384/384 XL, selected model",
          "conditions": "Below-ambient operation footnote is incomplete on the retrieved page; confirm the operating manual and condensation restrictions.",
          "sourceIds": [
            "odtc-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "odtc-accuracy",
          "operation": "thermocycling",
          "type": "native",
          "statement": "Temperature accuracy is specified as ±0.30 K at 55 °C.",
          "value": 0.3,
          "unit": "K ± at 55 °C",
          "configuration": "ODTC 96/96 XL and 384/384 XL",
          "conditions": "The stated test temperature is 55 °C; this is not accuracy across the entire operating range.",
          "sourceIds": [
            "odtc-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "odtc-uniformity",
          "operation": "thermocycling",
          "type": "native",
          "statement": "Temperature uniformity is specified as ±0.20 K at 55, 72 and 95 °C.",
          "value": 0.2,
          "unit": "K ±",
          "configuration": "ODTC 96/96 XL and 384/384 XL",
          "conditions": "Applies to the specified plateau temperatures; no sample-temperature validation is inferred.",
          "sourceIds": [
            "odtc-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "odtc-formats",
          "operation": "thermocycling",
          "type": "native",
          "statement": "The 96 versions list 100 µL/well maximum PCR volume; the 384 versions list 50 µL/well.",
          "configuration": "Selected ODTC plate-format version with its optimized VCM plate interface",
          "conditions": "Technical tables specify optimization for particular PCR plates; other formats require enquiry. Do not assume every plate fits.",
          "sourceIds": [
            "odtc-spec"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "odtc-integration",
          "operation": "device-integration",
          "type": "external",
          "statement": "An automated horizontal lid and plate ejection support robotic access; the separate Power & Control Unit provides SiLA over Ethernet.",
          "configuration": "ODTC with its mandatory Power & Control Unit and external robot",
          "conditions": "ODTC must be powered by the designated PCU; robot integration is additional.",
          "sourceIds": [
            "odtc-spec"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "The below-ambient footnote is incomplete in the public page text; condensation limitations require the exact manual.",
        "Plate part-number compatibility, liquid loading, verification method and robot clearance remain configuration-specific."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "upstream-listed",
        "drivers": [
          {
            "name": "ODTC",
            "registryId": "plr-inheco-odtc",
            "status": "mostly",
            "api": null,
            "documentationUrl": "https://docs.pylabrobot.org/stable/user_guide/inheco/odtc/hello-world.html",
            "hardwareTestingRequired": null,
            "scope": "ODTC family listing marked Mostly v0; exact variant and firmware need confirmation.",
            "limitations": [
              "The registry has no API path and the guide is an overview rather than a runnable control example."
            ]
          }
        ],
        "prerequisites": [
          "Supply the required INHECO Power & Control Unit and network connection.",
          "Confirm protocol generation, firmware and the working API entry point for the selected ODTC."
        ],
        "gaps": [
          "PyLabRobot describes SiLA 2; the manufacturer page states SiLA/Ethernet without a generation in the cited table. Verify this agreement for the unit.",
          "No blanket compatibility across ODTC 96/384/XL variants is established.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-plr-odtc",
          "int-inheco-odtc"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "controller",
          "statement": "INHECO specifies its dedicated PCU with an Ethernet/SiLA interface and requires the ODTC to use that power/control unit.",
          "sourceIds": [
            "int-inheco-odtc"
          ],
          "status": "documented"
        },
        {
          "topic": "driver-overview",
          "statement": "The PyLabRobot overview requires the device IP address and Ethernet connectivity.",
          "sourceIds": [
            "int-plr-odtc"
          ],
          "status": "documented"
        },
        {
          "topic": "sequence-and-recovery",
          "statement": "Does the driver expose lid state, method loading, cycle completion and recovery for this firmware?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "magblock",
      "name": "Flex Magnetic Block",
      "vendor": "Opentrons",
      "category": "magnetic separation",
      "summary": "Opentrons Magnetic separation. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "detail": "native magnetic-separation capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Labware adapters"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "magblock-manual",
          "title": "Opentrons Flex Magnetic Block documentation",
          "url": "https://docs.opentrons.com/flex/modules/magnetic-block/",
          "section": "Magnetic components; Software control; Magnetic Block specifications",
          "checked": "2026-10-31"
        },
        {
          "id": "magblock-product",
          "title": "Opentrons Flex Magnetic Block GEN1",
          "url": "https://opentrons.com/products/opentrons-flex-magnetic-block-gen1",
          "section": "Recommended labware; FAQs: deepwell compatibility; Features",
          "checked": "2026-10-31"
        },
        {
          "id": "flexmodules",
          "title": "Opentrons Flex modules",
          "url": "https://docs.opentrons.com/flex/modules/",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        },
        {
          "id": "int-flex-magnetic-block",
          "title": "Opentrons Magnetic Block GEN1",
          "url": "https://docs.opentrons.com/flex/modules/magnetic-block/",
          "section": "Magnetic components; Software control",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-ot-modules",
          "title": "Opentrons module storefront",
          "url": "https://opentrons.com/products/categories/modules",
          "section": "Modules: individually named Starting at listings",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "cost-magblock-product",
          "title": "Flex Magnetic Block product page",
          "url": "https://opentrons.com/products/opentrons-flex-magnetic-block-gen1",
          "section": "Product offer; required compatible robot/gripper purchased separately",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "magblock-passive",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "GEN1 uses fixed ring magnets in a passive 96-well holder; it has no powered bead-moving mechanism.",
          "configuration": "Opentrons Flex Magnetic Block GEN1",
          "conditions": "Moving labware onto and off the block changes exposure; the block cannot raise or lower magnets.",
          "sourceIds": [
            "magblock-manual"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "magblock-labware",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "Named compatible labware includes Opentrons Tough full-skirt 0.2 mL PCR plates and NEST 2 mL 96-deep-well plates.",
          "configuration": "Magnetic Block GEN1 with the named plates",
          "conditions": "These are plate capacities, not a bead-capture performance guarantee for every working volume.",
          "sourceIds": [
            "magblock-product"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "magblock-gripper",
          "operation": "plate-handling",
          "type": "external",
          "statement": "Automated plate placement and removal use the Flex Gripper; this block is intended for Flex and is not OT-2 compatible.",
          "configuration": "Flex robot and Flex Gripper plus Magnetic Block GEN1",
          "conditions": "The gripper is a separate required component for automated movement.",
          "sourceIds": [
            "magblock-product",
            "magblock-manual"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "magblock-environment",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "The specification lists an ambient operating temperature of 20–25 °C.",
          "value": "20–25",
          "unit": "°C ambient",
          "configuration": "Magnetic Block GEN1",
          "conditions": "Indoor use; 30–80% non-condensing relative humidity.",
          "sourceIds": [
            "magblock-manual"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "No capture time, recovery, pellet location or liquid-specific separation performance is established.",
        "Other plates require fit and performance verification; Magnetic Module GEN2 compatibility must not be transferred to this passive block."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Model the passive block and exact plate position; establish supported movement by the separate robot/gripper."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "No standalone PyLabRobot Magnetic Block mapping is established. Flex driver coverage alone does not qualify the complete bead workflow.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines",
          "int-flex-magnetic-block"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [
        {
          "id": "magblock-dedicated-start",
          "kind": "module",
          "item": "Flex Magnetic Block",
          "amount": 1750,
          "currency": "USD",
          "condition": "new",
          "priceType": "listed",
          "sourceType": "manufacturer",
          "priceBasis": "starting-at",
          "region": "United States / select territories; local pricing differs",
          "vat": "Tax/VAT treatment not stated in inspected listing; verify at checkout or quote.",
          "shipping": "Shipping cost not stated; territory-specific delivery charges need confirmation.",
          "availability": "orderable",
          "availabilityDetail": "Direct product offer exposes Add to Cart; physical stock unverified.",
          "checked": "2026-10-31",
          "configuration": "Same physical component as flex-magnet-start; dedicated reference index, not another required purchase.",
          "inclusions": [
            "Named listed item; exact selected variant must be confirmed."
          ],
          "exclusions": [
            "No assumption that delivery, tax, installation, service or other hardware is included."
          ],
          "sourceIds": [
            "cost-ot-modules",
            "cost-magblock-product"
          ]
        }
      ],
      "procurementGaps": [
        "Flex passive Magnetic Block is a different, currently orderable offer; it does not establish OT-2 Magnetic Module availability.",
        "Robot, gripper, suitable plates and delivery/tax are separate requirements."
      ],
      "practicalConsiderations": [
        {
          "topic": "passive-device",
          "statement": "The Magnetic Block is unpowered and has no electronic interface; exposure is controlled by moving labware onto and off it with the Flex Gripper.",
          "sourceIds": [
            "int-flex-magnetic-block"
          ],
          "status": "documented"
        },
        {
          "topic": "handling",
          "statement": "Does the intended PLR Flex configuration support the required plate movement, offsets and collision clearance?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "cfx",
      "name": "CFX Opus 96",
      "vendor": "Bio-Rad",
      "category": "qc / reader",
      "summary": "Bio-Rad QC / reader. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "qc",
          "type": "native",
          "detail": "native qc capability. Review the source for exact configuration and integration requirements."
        },
        {
          "operation": "thermocycling",
          "type": "native",
          "detail": "native thermocycling capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Optical plates/seals",
        "Analysis software"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "cfx-bulletin",
          "title": "CFX Opus 96 Real-Time PCR System, Bulletin 7299 Ver D",
          "url": "https://www.bio-rad.com/sites/default/files/webroot/web/pdf/lsr/literature/Bulletin_7299.pdf",
          "section": "p1 System and Optical Detection System; p2 96-Well Reaction Block; March 2023",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "cfx-capacity",
          "operation": "qpcr",
          "type": "native",
          "statement": "CFX Opus 96 has a fixed 96-well block and specifies 1–50 µL samples, with 10–50 µL recommended.",
          "configuration": "CFX Opus 96, not CFX Opus 384 or other CFX models",
          "conditions": "Sample-size specification is not pipetting capability.",
          "sourceIds": [
            "cfx-bulletin"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "cfx-temperature",
          "operation": "thermocycling",
          "type": "native",
          "statement": "The block temperature range is 4–100 °C; the lid heating range is 30–110 °C.",
          "value": "4–100",
          "unit": "°C block",
          "configuration": "CFX Opus 96 fixed block",
          "conditions": "Block and lid ranges are separate specifications.",
          "sourceIds": [
            "cfx-bulletin"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "cfx-thermal-accuracy",
          "operation": "thermocycling",
          "type": "native",
          "statement": "The bulletin specifies thermal accuracy of ±0.2 °C.",
          "value": 0.2,
          "unit": "°C ±",
          "configuration": "CFX Opus 96",
          "conditions": "The bulletin does not state an accuracy test temperature or equilibration condition. Do not transfer the separate uniformity timing condition.",
          "sourceIds": [
            "cfx-bulletin"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "cfx-thermal-uniformity",
          "operation": "thermocycling",
          "type": "native",
          "statement": "Uniformity is ±0.3 °C, with max–min ≤0.6 °C, measured ten seconds after the block reaches its target.",
          "value": 0.3,
          "unit": "°C ±",
          "configuration": "CFX Opus 96",
          "conditions": "Block specification; not independent measurement of liquid temperature.",
          "sourceIds": [
            "cfx-bulletin"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "cfx-detection",
          "operation": "fluorescence-detection",
          "type": "native",
          "statement": "The optical system has six filtered LEDs and six filtered photodiodes, a 450–730 nm excitation/emission range and multiplex analysis of up to five targets per well.",
          "configuration": "CFX Opus 96",
          "conditions": "Six optical components do not mean six independently quantified assay targets; dye and assay selection remain necessary.",
          "sourceIds": [
            "cfx-bulletin"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Thermal-accuracy measurement conditions are not supplied in this bulletin.",
        "No one-copy sensitivity guarantee is assigned: the bulletin does not give the full detection experiment.",
        "Robotic loading, external control and assay performance require separate evidence."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify a CFX Opus 96-specific remote interface, software licence and supported automation commands."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "control-versus-export",
          "statement": "Can the interface initiate a run and report completion/errors, rather than only export results?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "loading-and-optics",
          "statement": "How will plates and the lid be handled, and how will the chosen assay settings and results be associated with each plate?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "tapestation",
      "name": "4200 TapeStation",
      "vendor": "Agilent",
      "category": "qc / reader",
      "summary": "Agilent QC / reader. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "qc",
          "type": "native",
          "detail": "native qc capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "ScreenTape assay-specific reagents"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "tapestation-product",
          "title": "Agilent 4200 TapeStation",
          "url": "https://www.agilent.com/en/product/automated-electrophoresis/tapestation-systems/tapestation-instruments/4200-tapestation-system-228263",
          "section": "Specifications: Number of Samples per Run",
          "checked": "2026-10-31"
        },
        {
          "id": "tapestation-d1000",
          "title": "D1000 ScreenTape Assay Quick Guide for 4200 TapeStation",
          "url": "https://download.chem.agilent.com/software/4200_tapestation_user_info_package_v2/tapestation%20user%20information/tapestation%20quick%20guides/agilent%20d1000%20quick%20guide_g2991-90030.pdf",
          "section": "p1 Specifications: Analytical and Physical tables; footnotes 2–3",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "tapestation-capacity",
          "operation": "electrophoresis",
          "type": "native",
          "statement": "4200 TapeStation accepts runs of 1–96 samples.",
          "value": "1–96",
          "unit": "samples per run",
          "configuration": "4200 TapeStation",
          "conditions": "Choose the matching DNA or RNA ScreenTape assay.",
          "sourceIds": [
            "tapestation-product"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "tapestation-d1000-range",
          "operation": "electrophoresis",
          "type": "native",
          "statement": "The D1000 ScreenTape assay sizes DNA from 35–1000 bp and requires 1 µL of sample.",
          "value": "35–1000",
          "unit": "bp",
          "configuration": "4200 TapeStation with standard D1000 ScreenTape assay",
          "conditions": "Not the High Sensitivity D1000 assay.",
          "sourceIds": [
            "tapestation-d1000"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "tapestation-d1000-time",
          "operation": "electrophoresis",
          "type": "native",
          "statement": "D1000 analysis is specified at under 20 minutes for 16 samples or under 90 minutes for 96 samples.",
          "configuration": "4200 TapeStation, standard D1000 assay",
          "conditions": "Analysis time is assay-specific; it is not hands-on time or a universal TapeStation runtime.",
          "sourceIds": [
            "tapestation-d1000"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "tapestation-d1000-sizing",
          "operation": "electrophoresis",
          "type": "native",
          "statement": "D1000 sizing precision is 5% CV and sizing accuracy ±10% when using one ladder per ScreenTape device.",
          "configuration": "4200 TapeStation, standard D1000 assay",
          "conditions": "With the electronic ladder, the guide instead specifies ±20% sizing accuracy.",
          "sourceIds": [
            "tapestation-d1000"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "tapestation-d1000-quantitation",
          "operation": "electrophoresis",
          "type": "native",
          "statement": "D1000 quantitative range is 0.1–50 ng/µL; precision is 15% CV at 0.1–1 ng/µL and 10% CV at 1–50 ng/µL.",
          "configuration": "4200 TapeStation, standard D1000 assay",
          "conditions": "Do not transfer these values to other ScreenTape assays.",
          "sourceIds": [
            "tapestation-d1000"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "Only standard D1000 quantitative specifications are extracted; other assays need their own current guides.",
        "No robotic loading or fully unattended upstream sample preparation is established.",
        "The assay guide is a historical manufacturer document, checked online in 2026; confirm revision for current consumables."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Verify external control and result export for 4200 TapeStation specifically."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "consumables-and-loading",
          "statement": "Which ScreenTape, tip and sample-loading steps remain manual, and does the proposed automation cover them?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "results",
          "statement": "Can the control software expose reliable run IDs, completion/error state and assay-specific result files?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "storage",
      "name": "Automated cold-storage systems",
      "vendor": "Azenta",
      "category": "storage",
      "summary": "Azenta Storage. Model-family reference; select and verify the exact configuration before use.",
      "capabilities": [
        {
          "operation": "cold-storage",
          "type": "native",
          "detail": "native cold-storage capability. Review the source for exact configuration and integration requirements."
        }
      ],
      "modules": [
        "Model-specific temperature zones",
        "Inventory software",
        "Tube/plate handling"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "storage-biostore",
          "title": "Azenta BioStore −80 °C Automated Storage System brochure",
          "url": "https://web.azenta.com/hubfs/azenta-files/resources/brochures-flyers/B309-18-BioStore-II-Jun-20.pdf",
          "section": "p2 Dual Temperature Options; p3 scalable throughput and Automation Interface Module",
          "checked": "2026-10-31"
        },
        {
          "id": "azenta",
          "title": "Azenta automated sample storage",
          "url": "https://www.azenta.com/automated-sample-storage-systems",
          "kind": "manufacturer",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-registry",
          "title": "PyLabRobot device registry at 3976f1235a4e2180306005541459c2bedfd0dad4",
          "url": "https://raw.githubusercontent.com/PyLabRobot/pylabrobot/3976f1235a4e2180306005541459c2bedfd0dad4/docs/_static/devices.json",
          "section": "Device IDs, status, API generation, nested models and needs_hardware_testing fields",
          "checked": "2026-10-31"
        },
        {
          "id": "int-plr-machines",
          "title": "PyLabRobot supported machines",
          "url": "https://docs.pylabrobot.org/stable/user_guide/machines.html",
          "section": "Reading the table; model-specific support; API generations",
          "checked": "2026-10-31"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-10-31",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "id": "storage-biostore-temperature",
          "operation": "cold-storage",
          "type": "native",
          "statement": "The BioStore brochure describes automated sample storage at −80 °C.",
          "value": -80,
          "unit": "°C nominal storage",
          "configuration": "BioStore −80 °C family in the cited brochure",
          "conditions": "This is a named family example, not a temperature shared by every automated storage system.",
          "sourceIds": [
            "storage-biostore"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "storage-dual-temperature",
          "operation": "cold-storage",
          "type": "optional",
          "statement": "A dual-temperature BioStore configuration offers separate −20 °C and −80 °C storage options.",
          "configuration": "Optional dual-temperature BioStore configuration",
          "conditions": "Separate zones; not a continuously validated −20 to −80 °C operating envelope.",
          "sourceIds": [
            "storage-biostore"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "storage-pickers",
          "operation": "sample-retrieval",
          "type": "optional",
          "statement": "The brochure describes configurations with up to sixteen picking stations and single- or dual-shuttle robotics.",
          "value": 16,
          "unit": "maximum optional picking stations",
          "configuration": "Configured BioStore system",
          "conditions": "Capacity and throughput depend on the chosen selectors, shuttles, labware and store dimensions.",
          "sourceIds": [
            "storage-biostore"
          ],
          "evidence": "manufacturer"
        },
        {
          "id": "storage-interface",
          "operation": "device-integration",
          "type": "external",
          "statement": "An optional Automation Interface Module presents samples on HD trays or SBS rack trays for downstream exchange.",
          "configuration": "BioStore with Automation Interface Module and external automation",
          "conditions": "External handling and LIMS integration need their own interfaces and qualification.",
          "sourceIds": [
            "storage-biostore"
          ],
          "evidence": "manufacturer"
        }
      ],
      "gaps": [
        "The existing record is a broad family placeholder. No specific store configuration, capacity, temperature tolerance, retrieval time or sample-preservation outcome is established.",
        "The family landing page returned HTTP 403. Accessible brochure uses historical BioStore/Strata names; current product naming and configuration must be confirmed.",
        "Manufacturer search results indicate BioStore was renamed BioArc, but no new-name equivalence is used to transfer these specifications."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Choose an exact storage-system model and controller before assigning any driver."
        ],
        "gaps": [
          "No exact-model driver mapping was established in the reviewed pinned registry and current documentation; this is not proof that support is absent.",
          "The generic storage record cannot be mapped to a specific driver. Cytomat, HighRes and other registry storage entries do not establish control of an Azenta BioStore/BioArc system.",
          "Driver coverage does not establish deployment effort, hardware qualification or assay validity."
        ],
        "sourceIds": [
          "int-plr-registry",
          "int-plr-machines"
        ]
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": [
        {
          "topic": "inventory-and-retrieval",
          "statement": "Which controller API supports inventory reconciliation, sample retrieval, handoff and return, including failures?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "cold-chain",
          "statement": "What mechanical transfer interface and temperature monitoring preserve the required storage conditions through retrieval?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "configuration-and-firmware",
          "statement": "Which exact instrument, head, modules and firmware versions must be supported? Verify the commands needed for this configuration.",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "labware-and-calibration",
          "statement": "Are the exact labware definitions, offsets and movement paths verified on the physical setup?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "software-and-service",
          "statement": "What OS, network/USB access, vendor software licences and service arrangements are required for the chosen control route?",
          "sourceIds": [],
          "status": "verification-question"
        },
        {
          "topic": "recovery-and-validation",
          "statement": "How will the system stop, recover and reconcile labware state after a failed command? Demonstrate the required operations and assay before unattended use.",
          "sourceIds": [],
          "status": "verification-question"
        }
      ]
    },
    {
      "id": "beckman-biomek-i5",
      "name": "Biomek i5",
      "vendor": "Beckman Coulter",
      "category": "liquid handler",
      "summary": "Open grid-deck liquid handler with 25 deck positions, configured with one 96/384 multichannel head or one Span-8 pod, plus a rotating gripper.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.5,
          "maxUl": 5000,
          "detail": "0.5–1,000 µL with the multichannel head; 0.5–5,000 µL with the Span-8 pod. The i5 takes one or the other, not both."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "Rotating gripper",
          "detail": "High-access rotating gripper."
        },
        {
          "operation": "shaking",
          "type": "optional",
          "module": "Shaking ALP",
          "detail": "Automated Labware Positioners (ALPs) for shaking."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Static Peltier ALP",
          "detail": "ALPs for heating/cooling, e.g. Static Peltier ALP A93938; range not published."
        }
      ],
      "modules": [
        "Single multichannel (96/384) head",
        "Span-8 pipetting pod",
        "Rotating gripper",
        "Automated Labware Positioners (ALPs)",
        "Static Peltier ALP",
        "Shaking ALP",
        "DeckOptix cameras",
        "Optional enclosure"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "bk-i5",
          "title": "Biomek i5 Automated Workstation",
          "url": "https://www.beckman.com/liquid-handlers/biomek-i5",
          "section": "Specifications / features",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "bk-iseries",
          "title": "Biomek i-Series features",
          "url": "https://www.beckman.com/liquid-handlers/biomek-i7/features",
          "section": "Configurations; ALPs; Software",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "bk-i5-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "25 deck positions.",
          "value": 25,
          "unit": "positions",
          "configuration": "Biomek i5",
          "sourceIds": [
            "bk-i5",
            "bk-iseries"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "bk-i5-mc",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Multichannel head range.",
          "value": {
            "min": 0.5,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "96/384 multichannel head",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "bk-i5"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "bk-i5-span8",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Span-8 range.",
          "value": {
            "min": 0.5,
            "max": 5000
          },
          "unit": "µL",
          "configuration": "Span-8 pod",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "bk-i5"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "bk-i5-control",
          "operation": "device-integration",
          "type": "native",
          "statement": "Biomek Software V6 states a REST API for external software control.",
          "sourceIds": [
            "bk-iseries"
          ]
        }
      ],
      "gaps": [
        "Span-8 independent Z or variable spacing not stated on the fetched pages.",
        "No magnetic ALP or on-deck thermocycler named for the i-Series.",
        "Peltier ALP temperature range not published.",
        "1.5 ml tube racks not named."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "tecan-veya",
      "name": "Veya",
      "vendor": "Tecan",
      "category": "liquid handler",
      "summary": "Air Restriction Pipetting handler with 4 or 8 channels (1 µL–5 ml), 22–34 plate positions and optional cooling, heating, shaking and decontamination modules.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 5000,
          "detail": "ARP channels, 1 µL to 5 ml with one hardware setup; Tecan tips only."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "Channel Gripper",
          "detail": "Channel Gripper for on-deck moves; optional robotic gripper arm below deck."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Cooling/heating modules",
          "detail": "Cooling and heating modules; unnamed, no specifications."
        },
        {
          "operation": "shaking",
          "type": "optional",
          "module": "Shaking module",
          "detail": "Shaking module; no specifications."
        }
      ],
      "modules": [
        "4 or 8 ARP channels",
        "Channel Gripper",
        "Robotic gripper arm (below-deck access)",
        "Cooling module",
        "Heating module",
        "Shaking module",
        "Decontamination module",
        "DeckCheck"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "tc-veya-br",
          "title": "Veya brochure 403123 V1.0 2025-01",
          "url": "https://www.tecan.com/hubfs/HubDB/Te-DocDB/pdf/BR_Veya_Effortless_Automation_403123.pdf",
          "section": "pp.4-5 Technical features and specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "tc-veya-web",
          "title": "Veya product page",
          "url": "https://lifesciences.tecan.com/products/veya-effortless-automation",
          "section": "Product page",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "veya-vol",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Pipetting range with one hardware setup.",
          "value": {
            "min": 1,
            "max": 5000
          },
          "unit": "µL",
          "configuration": "ARP channels with Tecan consumables",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "tc-veya-br",
            "tc-veya-web"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "veya-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Two deck sizes, 22 to 34 plate positions.",
          "value": {
            "min": 22,
            "max": 34
          },
          "unit": "plate positions",
          "configuration": "Deck size",
          "sourceIds": [
            "tc-veya-br"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "veya-ngs",
          "operation": "throughput",
          "type": "native",
          "statement": "Veya NGS Suite: up to 48 samples in four hours.",
          "value": 48,
          "unit": "samples",
          "configuration": "Veya NGS Suite",
          "conditions": "Time depends on the protocol.",
          "sourceIds": [
            "tc-veya-br"
          ]
        }
      ],
      "gaps": [
        "Channel independence and spacing not stated.",
        "No magnet or thermocycler module named.",
        "Module temperature and shaking ranges not published.",
        "Tube racks and API not stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "dynamic-devices-lynx",
      "name": "Lynx LM900 / LM1800",
      "vendor": "Dynamic Devices",
      "category": "liquid handler",
      "summary": "Liquid handler with swappable Multi-Core Pipetting Arm tools, including Volume Verified Pipetting heads with an independent volume per channel and magnetic-rod tools.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.3,
          "maxUl": 5000,
          "detail": "96VVP: 96 independent volumes, 1.5–1,250 µL per channel, fixed 9 mm array. Other tools 0.3 µL (384ST) to 5 ml (24ST/6ST)."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "KS magnetic rod tools",
          "detail": "KS magnetic rod tools: 96KS 20–2,200 µL, 24KS 50–15,000 µL, 24XL KS 100–25,000 µL."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Head Gripper Tool",
          "detail": "Head Gripper Tool for stacking, lidding and moving magnet/vacuum devices."
        }
      ],
      "modules": [
        "96VVP",
        "24VVP",
        "f8 VVP",
        "f4iz (independent Z)",
        "96ST",
        "384ST",
        "24ST",
        "6ST",
        "96KS magnetic rod tool",
        "24KS magnetic rod tool",
        "Head Gripper Tool",
        "SCARA / conveyor integration"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "dd-tech",
          "title": "Dynamic Devices technology",
          "url": "https://dynamicdevices.com/technology/",
          "section": "LM Platform Deck Sizes; VVP tools; Head Gripper Tool",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "dd-mcpa",
          "title": "Multi-Core Pipetting Arm Tools",
          "url": "https://dynamicdevices.com/multi-core-pipetting-arm-tools/",
          "section": "ST suite; KS magnetic rod tools",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "dd-mm4",
          "title": "Method Manager 4.0",
          "url": "https://dynamicdevices.com/method-manager-4-0/",
          "section": "Overview",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "lynx-deck-900",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "LM900 deck positions.",
          "value": 30,
          "unit": "positions",
          "configuration": "LM900",
          "sourceIds": [
            "dd-tech"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "lynx-deck-1800",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "LM1800 deck positions.",
          "value": {
            "min": 60,
            "max": 66
          },
          "unit": "positions",
          "configuration": "LM1800",
          "sourceIds": [
            "dd-tech"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "lynx-96vvp",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "96VVP sets an independent volume per channel with LLD on each channel.",
          "value": {
            "min": 1.5,
            "max": 1250
          },
          "unit": "µL",
          "configuration": "96VVP",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "dd-tech"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "lynx-f4iz",
          "operation": "liquid-transfer",
          "type": "optional",
          "statement": "f4iz gives independent Z and access to variably spaced tubes.",
          "value": {
            "min": 1.5,
            "max": 1250
          },
          "unit": "µL",
          "configuration": "f4iz 4-channel",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "dd-tech"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "lynx-ks",
          "operation": "magnetic-separation",
          "type": "optional",
          "statement": "96KS magnetic rod tool range.",
          "value": {
            "min": 20,
            "max": 2200
          },
          "unit": "µL",
          "configuration": "96KS",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "dd-mcpa"
          ]
        }
      ],
      "gaps": [
        "No on-deck heater-shaker, Peltier or thermocycler documented.",
        "No published LM900/LM1800 specification sheet.",
        "1.5 ml tube racks not named."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "revvity-sciclone-g3-ngsx-iq",
      "name": "Sciclone G3 NGSx iQ",
      "vendor": "Revvity",
      "category": "liquid handler",
      "summary": "Enclosed NGS workstation with a 96-channel head, gripper, temperature, magnetic and shaking options, an on-deck thermal cycler and a Twister III robot for tip and labware storage.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "detail": "96-channel head; volume range not in the fetched source."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "Integrated gripper",
          "detail": "Integrated gripper."
        },
        {
          "operation": "thermocycling",
          "type": "native",
          "module": "ODTC",
          "detail": "On-deck thermal cycler (ODTC) for PCR and heated incubations."
        },
        {
          "operation": "storage",
          "type": "native",
          "module": "Twister III",
          "detail": "Twister III stores and loads up to 27 tip boxes."
        },
        {
          "operation": "heating-cooling",
          "type": "native",
          "module": "Temperature option",
          "detail": "Temperature options; no specifications."
        },
        {
          "operation": "magnetic-separation",
          "type": "native",
          "module": "Magnetic option",
          "detail": "Magnetic option; no specifications."
        },
        {
          "operation": "shaking",
          "type": "native",
          "module": "Shaking option",
          "detail": "Shaking option; no specifications."
        }
      ],
      "modules": [
        "96-channel head",
        "Integrated gripper",
        "On-deck thermal cycler (ODTC)",
        "Twister III robotic arm",
        "Temperature option",
        "Magnetic option",
        "Shaking option",
        "UV light"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "rv-ngs-cat",
          "title": "Revvity NGS liquid handling catalogue",
          "url": "https://resources.revvity.com/pdfs/bro-ngs-liquid-handling-catalogue.pdf",
          "section": "pp.4-6 Instruments; Workstation table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "sciclone-twister",
          "operation": "storage",
          "type": "native",
          "statement": "Twister III stores and loads up to 27 tip boxes.",
          "value": 27,
          "unit": "tip boxes",
          "configuration": "Sciclone G3 NGSx iQ",
          "sourceIds": [
            "rv-ngs-cat"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "sciclone-head",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "High-precision 96-channel head for batches of up to 96 samples.",
          "sourceIds": [
            "rv-ngs-cat"
          ]
        }
      ],
      "gaps": [
        "Product pages returned 403: volume range, deck positions and ODTC specifications unverified.",
        "No tube handling stated for Sciclone.",
        "Revvity Fontus may be the current high-end option; not profiled."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "eppendorf-epmotion-5075",
      "name": "epMotion 5075 (t / v / vt / m)",
      "vendor": "Eppendorf",
      "category": "liquid handler",
      "summary": "Enclosed bench-top handler exchanging 1- or 8-channel tools (0.2–1,000 µL), with a gripper; the t version adds a ThermoMixer, v a vacuum station, m a magnet.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.2,
          "maxUl": 1000,
          "detail": "Single- or 8-channel tools 0.2–10, 1–50, 20–300, 40–1,000 µL."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Gripper",
          "detail": "Gripper, 1,200 g capacity, stacks up to 5 plates."
        },
        {
          "operation": "shaking",
          "type": "native",
          "module": "ThermoMixer",
          "detail": "ThermoMixer 300–2,000 rpm (5075t, vt, m)."
        },
        {
          "operation": "heating-cooling",
          "type": "native",
          "module": "ThermoMixer / thermal module",
          "detail": "ThermoMixer 15 °C below room temperature to 95 °C; thermal modules 0–110 °C."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "3D-MagSep",
          "detail": "3D-MagSep magnetic finger module, 5075m only."
        }
      ],
      "modules": [
        "Dispensing tools TS 10/50/300/1000 (1- and 8-channel)",
        "Gripper",
        "ThermoMixer",
        "Thermal module",
        "Vacuum station",
        "3D-MagSep",
        "Thermoracks for 24 × 0.5/1.5/2 ml Safelock tubes",
        "CleanCap (UV + HEPA)"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "ep-fam",
          "title": "Eppendorf epMotion Series brochure A50X X13 020/GB2 (2017; LabWrench-hosted copy)",
          "url": "https://cdn.labwrench.com/eMan/manualNo/9977/eppendorf_epmotion_5075t_ngs_solution_brochure.pdf",
          "section": "Feature overview; model pages; technical data p.29",
          "kind": "manufacturer (third-party host)",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "ep-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "5075t: 14 SLAS positions plus a small reservoir position.",
          "value": 14.5,
          "unit": "positions",
          "configuration": "5075t (5075v 12; 5075l 15)",
          "sourceIds": [
            "ep-fam"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "ep-rpm",
          "operation": "shaking",
          "type": "native",
          "statement": "ThermoMixer mixing frequency.",
          "value": {
            "min": 300,
            "max": 2000
          },
          "unit": "rpm",
          "configuration": "5075t",
          "sourceIds": [
            "ep-fam"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "ep-thermal",
          "operation": "heating-cooling",
          "type": "optional",
          "statement": "Thermal module setting range.",
          "value": {
            "min": 0,
            "max": 110
          },
          "unit": "°C",
          "configuration": "Thermal module",
          "sourceIds": [
            "ep-fam"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "ep-tubes",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Thermoracks hold 24 × 0.5/1.5/2 ml Safelock tubes.",
          "value": 24,
          "unit": "tubes",
          "configuration": "Thermorack",
          "sourceIds": [
            "ep-fam"
          ]
        }
      ],
      "gaps": [
        "eppendorf.com returned 403; figures are from a 2017 brochure and may be superseded.",
        "No on-deck thermocycler.",
        "Magnet only on 5075m."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "mgi-mgisp-960",
      "name": "MGISP-960",
      "vendor": "MGI Tech",
      "category": "liquid handler",
      "summary": "Enclosed workstation with a fixed 96-channel pipette (to 200 µL), gripper, on-deck PCR module, shaker, magnetic racks and temperature module, sold in preset configurations.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 200,
          "detail": "Fixed 96-channel; 1–200 µL (web) or 2–200 µL (2022 brochure)."
        },
        {
          "operation": "thermocycling",
          "type": "native",
          "module": "PCR module",
          "detail": "PCR module 4–99 °C."
        },
        {
          "operation": "heating-cooling",
          "type": "native",
          "module": "Temperature control module",
          "detail": "Temperature control module 4–90 °C."
        },
        {
          "operation": "shaking",
          "type": "native",
          "module": "Microplate shaker",
          "detail": "Microplate shaker 100–2,000 rpm."
        },
        {
          "operation": "magnetic-separation",
          "type": "native",
          "module": "Magnetic frame",
          "detail": "Two 96-well magnetic racks in configurations 1–3."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "Microplate gripper",
          "detail": "Microplate gripper in every configuration."
        }
      ],
      "modules": [
        "Fixed 96-channel pipette",
        "Microplate gripper",
        "PCR module",
        "Microplate shaker",
        "Magnetic frame",
        "Temperature control module",
        "HEPA filter",
        "UV lamps"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mgi-web",
          "title": "MGI SP-960",
          "url": "https://global-mgitech.com/gli/sp-960/",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "mgi-config",
          "title": "MGISP-960 configuration brochure (distributor-hosted)",
          "url": "https://www.richmondscientific.com/wp-content/uploads/2023/04/【Brochure】MGISP-960-Configuration.pdf",
          "section": "Product Composition; Configuration Selection table",
          "kind": "manufacturer (third-party host)",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "mgi-pcr",
          "operation": "thermocycling",
          "type": "native",
          "statement": "PCR module temperature range.",
          "value": {
            "min": 4,
            "max": 99
          },
          "unit": "°C",
          "configuration": "Configurations with PCR module",
          "sourceIds": [
            "mgi-web"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "mgi-cv",
          "operation": "pipetting-performance",
          "type": "native",
          "statement": "CV below 5% at 2 µL; below 1% at 200 µL.",
          "value": 5,
          "unit": "% CV",
          "configuration": "96-channel pipette",
          "conditions": "At 2 µL",
          "sourceIds": [
            "mgi-web"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "mgi-shaker",
          "operation": "shaking",
          "type": "native",
          "statement": "Shaker speed.",
          "value": {
            "min": 100,
            "max": 2000
          },
          "unit": "rpm",
          "configuration": "Microplate shaker",
          "sourceIds": [
            "mgi-config"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "mgi-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Configuration 1: 14 standard positions plus higher and lower positions and modules.",
          "value": 14,
          "unit": "standard positions",
          "configuration": "Configuration 1",
          "conditions": "Counts vary 13–22 by configuration.",
          "sourceIds": [
            "mgi-config"
          ]
        }
      ],
      "gaps": [
        "Minimum volume conflicts between sources (1 vs 2 µL).",
        "Control software and API not named.",
        "Tube handling not stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "analytik-jena-cybio-felix",
      "name": "CyBio FeliX",
      "vendor": "Analytik Jena",
      "category": "liquid handler",
      "summary": "Compact handler with 12 positions on two levels and swappable heads from 1 to 384 channels (1–1,000 µL), with third-party shaker, temperature and ring-magnet adapters.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 1,
          "maxUl": 1000,
          "detail": "1–384 channels, 1–1,000 µL by head; CHOICE head adapters 1/8/12/16/24 channels."
        },
        {
          "operation": "shaking",
          "type": "optional",
          "module": "BioShake 3000 elm",
          "detail": "QInstruments BioShake 3000 elm on deck."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "HeatPlate / ColdPlate",
          "detail": "QInstruments HeatPlate / ColdPlate."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "Magnum FLX magnet adapter",
          "detail": "Alpaqua Magnum FLX universal magnet adapter on deck."
        },
        {
          "operation": "thermocycling",
          "type": "optional",
          "module": "Thermal cycler",
          "detail": "Optional thermal cycler in Library Prep configurations; model not named."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Gripper",
          "detail": "On-deck gripper; robotic arm in Dual/Advanced configurations."
        }
      ],
      "modules": [
        "Head R 96/60, 96/250, 96/1000 µL",
        "Head R 384/60 µL",
        "CHOICE head",
        "SELECT 8-channel heads",
        "Gripper",
        "BioShake 3000 elm",
        "HeatPlate",
        "ColdPlate",
        "Magnum FLX magnet adapter",
        "CyBio Scheduler"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "aj-felix",
          "title": "CyBio FeliX",
          "url": "https://www.analytik-jena.com/cybiofelix",
          "section": "Overview; technical table; accessories",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "aj-ngs",
          "title": "Automated NGS Library Prep Configuration Overview 12795433",
          "url": "https://www.analytik-jena.com/import/assets/12795433_Fl_Automated_NGS_Library_Prep_Configuration_Overview_en.pdf",
          "section": "Pre-configured Systems in Detail table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "felix-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "Twelve positions on two levels.",
          "value": 12,
          "unit": "positions",
          "configuration": "CyBio FeliX",
          "sourceIds": [
            "aj-felix"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "felix-vol",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Volume range across heads.",
          "value": {
            "min": 1,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "Head-dependent",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "aj-felix",
            "aj-ngs"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "felix-tubes",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Tube formats 0.2–2.0 ml.",
          "sourceIds": [
            "aj-felix"
          ]
        }
      ],
      "gaps": [
        "Thermocycler model and whether it is on deck.",
        "Shaker and temperature specifications.",
        "No independent channels; partial tip pickup not stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "integra-assist-plus",
      "name": "ASSIST PLUS",
      "vendor": "INTEGRA Biosciences",
      "category": "liquid handler",
      "summary": "Low-cost bench robot that drives INTEGRA electronic pipettes (1–16 channels, adjustable-spacing VOYAGER) or a D-ONE single-channel module on a 3- or 4-position deck.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.5,
          "maxUl": 1250,
          "detail": "Pipettes from 1 to 16 channels, 0.5–1,250 µL; VOYAGER adjusts tip spacing on the fly."
        },
        {
          "operation": "magnetic-separation",
          "type": "optional",
          "module": "MAG / HEATMAG",
          "detail": "MAG / HEATMAG modules with vertically moving magnets."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "HEATMAG",
          "detail": "HEATMAG heating; passive PCR cooling blocks."
        }
      ],
      "modules": [
        "VIAFLO 8/12/16-channel pipettes",
        "VOYAGER adjustable-spacing pipettes",
        "D-ONE single-channel module",
        "3-position universal deck",
        "4-position portrait deck",
        "Rack for 1.5/2 ml microcentrifuge tubes (4540)",
        "MAG module",
        "HEATMAG module"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "int-pd",
          "title": "Product Description ASSIST PLUS 2022",
          "url": "https://www.integra-biosciences.com/sites/default/files/documents/Product_Description_ASSIST_PLUS_2022.pdf",
          "section": "Features and benefits",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "int-oi",
          "title": "ASSIST PLUS operating instructions V05 (128950)",
          "url": "https://www.integra-biosciences.com/sites/default/files/documents/128950_oi_assist_plus_en_4.pdf",
          "section": "7.2–7.7 Technical data; 8.1 Accessories",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "assist-vol",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Volume range across pipettes.",
          "value": {
            "min": 0.5,
            "max": 1250
          },
          "unit": "µL",
          "configuration": "Pipette-dependent",
          "conditions": "GripTip tips",
          "sourceIds": [
            "int-pd",
            "int-oi"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "assist-deck",
          "operation": "deck-capacity",
          "type": "native",
          "statement": "3-position universal or 4-position portrait deck.",
          "value": {
            "min": 3,
            "max": 4
          },
          "unit": "positions",
          "configuration": "Deck choice",
          "sourceIds": [
            "int-oi"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "assist-tubes",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Rack for 1.5/2 ml microcentrifuge tubes (part 4540).",
          "sourceIds": [
            "int-oi"
          ]
        }
      ],
      "gaps": [
        "No gripper, shaker or thermocycler.",
        "HEATMAG temperature and D-ONE volume ranges not extracted."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "formulatrix-fast",
      "name": "F.A.S.T.",
      "vendor": "FORMULATRIX",
      "category": "liquid handler",
      "summary": "96-channel positive-displacement handler (0.1–50 µL) for SBS 24- to 384-well plates, with five plate positions and a network API.",
      "capabilities": [
        {
          "operation": "liquid-transfer",
          "type": "native",
          "minUl": 0.1,
          "maxUl": 50,
          "detail": "LV tips 0.1–13 µL; HV tips 3–50 µL."
        }
      ],
      "modules": [
        "LV tips",
        "HV tips"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "fast-page",
          "title": "F.A.S.T. Liquid Handler",
          "url": "https://formulatrix.com/liquid-handling-systems/fast-liquid-handler/",
          "section": "Specifications / Benefits",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "fast-help",
          "title": "F.A.S.T. specifications (help v1.30)",
          "url": "https://help.formulatrix.com/fast/1.30/Content/Specifications.htm",
          "section": "Labware",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "fast-range",
          "operation": "liquid-transfer",
          "type": "native",
          "statement": "Volume range.",
          "value": {
            "min": 0.1,
            "max": 50
          },
          "unit": "µL",
          "configuration": "LV + HV tips",
          "conditions": "Published operating range; selected tips and liquid-specific qualification still apply.",
          "sourceIds": [
            "fast-page"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "fast-labware",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Fully skirted SBS plates only; max height 44 mm; no 1536.",
          "value": 44,
          "unit": "mm",
          "configuration": "F.A.S.T. 1.30",
          "sourceIds": [
            "fast-help"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "fast-api",
          "operation": "device-integration",
          "type": "native",
          "statement": "Network API for third-party automation platforms.",
          "sourceIds": [
            "fast-page"
          ]
        }
      ],
      "gaps": [
        "Tip orifice and suitability for aspirating tens-of-µm capsules not published.",
        "No gripper or temperature modules."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "beckman-echo-525",
      "name": "Echo 525 (and Echo 650 Plus series)",
      "vendor": "Beckman Coulter",
      "category": "reagent dispenser",
      "summary": "Contact-free acoustic transfer of 25 nl drops (25 nl–5 µL per transfer) from Echo-qualified source plates into 96/384-well plates; the Echo 650 Plus transfers 2.5 nl drops.",
      "capabilities": [
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 0.025,
          "maxUl": 5,
          "detail": "25 nl drops, 25 nl–5 µL well to well; destinations 8–16 mm high."
        }
      ],
      "modules": [
        "Echo Qualified 384PP source plate",
        "Echo Qualified Reservoir",
        "Echo Cherry Pick / Plate Reformat software",
        "Access Laboratory Workstation"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "echo525",
          "title": "Echo 525 Acoustic Liquid Handler",
          "url": "https://www.beckman.com/liquid-handlers/echo-525",
          "section": "Specifications / labware / software",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "echo650plus",
          "title": "Echo 650 Plus",
          "url": "https://www.beckman.kr/liquid-handlers/echo-acoustic/echo-650-plus-series/d01746",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "echo-range",
          "operation": "dispensing",
          "type": "native",
          "statement": "Transfer range one well to one well.",
          "value": {
            "min": 0.025,
            "max": 5
          },
          "unit": "µL",
          "configuration": "Echo 525",
          "conditions": "Aqueous, up to 50% glycerol.",
          "sourceIds": [
            "echo525"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "echo-dest",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Destinations: most SBS 96/384-well plates 8–16 mm high.",
          "value": {
            "min": 8,
            "max": 16
          },
          "unit": "mm plate height",
          "configuration": "Echo 525",
          "sourceIds": [
            "echo525"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "echo650-drop",
          "operation": "dispensing",
          "type": "native",
          "statement": "Echo 650 Plus drop resolution.",
          "value": 2.5,
          "unit": "nl",
          "configuration": "Echo 650 Plus series",
          "sourceIds": [
            "echo650plus"
          ]
        }
      ],
      "gaps": [
        "Source plate working and dead volumes not on fetched pages.",
        "Behaviour with capsule or particle suspensions not published.",
        "No public API stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "dispendix-i-dot",
      "name": "I.DOT One",
      "vendor": "DISPENDIX",
      "category": "reagent dispenser",
      "summary": "Pressure-driven non-contact nanolitre dispenser from open source wells; vendor pages could not be fetched, so this rests on facility and equipment listings.",
      "capabilities": [
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 0.008,
          "detail": "Transfers as low as 8 nl; 1 µL dead volume."
        }
      ],
      "modules": [
        "I.DOT One"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "kit-idot",
          "title": "iDOT One (KIT IBCS facility listing)",
          "url": "https://fms.ibcs.kit.edu/iDOT_One.php",
          "section": "Specifications",
          "kind": "secondary",
          "checked": "2026-11-09"
        },
        {
          "id": "azo-idot",
          "title": "I.DOT (AZoLifeSciences equipment listing)",
          "url": "https://www.azolifesciences.com/equipment/IDOT",
          "section": "Product description",
          "kind": "secondary",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "secondary-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "secondary",
          "id": "idot-min",
          "operation": "dispensing",
          "type": "native",
          "statement": "Minimum transfer.",
          "value": 8,
          "unit": "nl",
          "configuration": "I.DOT One",
          "sourceIds": [
            "kit-idot",
            "azo-idot"
          ]
        },
        {
          "evidence": "secondary",
          "id": "idot-dead",
          "operation": "dispensing",
          "type": "native",
          "statement": "Dead volume.",
          "value": 1,
          "unit": "µL",
          "configuration": "I.DOT One",
          "sourceIds": [
            "kit-idot",
            "azo-idot"
          ]
        }
      ],
      "gaps": [
        "dispendix.com and cytena.com returned 403/404: no manufacturer source.",
        "Source/target plates, maximum volume, CV and API unverified."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "formulatrix-tempest",
      "name": "TEMPEST",
      "vendor": "FORMULATRIX",
      "category": "reagent dispenser",
      "summary": "Non-contact diaphragm-chip bulk dispenser with 96 independently controlled outputs (up to 12 reagents) from 0.2 µL into 96/384/1536-well plates.",
      "capabilities": [
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 0.2,
          "detail": "From 0.2 µL; chips pair 200 nl + 1 µL or 1 + 5 µL; up to 12 reagents."
        }
      ],
      "modules": [
        "200 nl/1 µL chip",
        "1/5 µL chip",
        "Continuous Flow chip"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "tempest-page",
          "title": "TEMPEST Liquid Handler",
          "url": "https://formulatrix.com/liquid-handling-systems/tempest-liquid-handler/",
          "section": "Specifications / FAQ / Benefits",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "tempest-min",
          "operation": "dispensing",
          "type": "native",
          "statement": "Minimum dispense, CV below 5%.",
          "value": 0.2,
          "unit": "µL",
          "configuration": "Low-volume chip",
          "sourceIds": [
            "tempest-page"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "tempest-reagents",
          "operation": "dispensing",
          "type": "native",
          "statement": "Up to 12 reagents through 96 independently controlled outputs.",
          "value": 12,
          "unit": "reagents",
          "configuration": "8 nozzles per chip, up to 12 chips",
          "sourceIds": [
            "tempest-page"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "tempest-dead",
          "operation": "dispensing",
          "type": "native",
          "statement": "Non-recoverable dead volume per chip.",
          "value": 48,
          "unit": "µL",
          "configuration": "Per chip",
          "conditions": "As low as",
          "sourceIds": [
            "tempest-page"
          ]
        }
      ],
      "gaps": [
        "Twelve reagents cannot give 96 unique per-well barcodes (inference from the reagent limit).",
        "Compatibility with capsule suspensions not published."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "thermo-kingfisher-apex",
      "name": "KingFisher Apex (and Duo Prime)",
      "vendor": "Thermo Fisher",
      "category": "magnetic separation",
      "summary": "Magnetic-rod particle processor with four heads for 24 or 96 samples in PCR, standard and deep-well plates and storage tubes, heating to 100 °C and cooling to 4 °C.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "minUl": 10,
          "maxUl": 5000,
          "detail": "PCR 10–80 µL; standard 15–200 µL; 96 DW 50–1,000 µL; 24 DW 30–5,000 µL."
        },
        {
          "operation": "heating-cooling",
          "type": "native",
          "detail": "Heating up to 100 °C; cooling down to 4 °C."
        }
      ],
      "modules": [
        "96 PCR head",
        "96 Combi head",
        "96 DW head",
        "24 Combi head",
        "BindIt software"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "apex",
          "title": "KingFisher Apex System",
          "url": "https://thermofisher.com/us/en/home/life-science/dna-rna-purification-analysis/automated-purification-extraction/kingfisher-apex.html",
          "section": "Specifications table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "duoprime",
          "title": "KingFisher Duo Prime",
          "url": "https://www.thermofisher.com/do/en/home/life-science/dna-rna-purification-analysis/automated-purification-extraction/kingfisher-duo-prime.html",
          "section": "Specifications table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "apex-dw",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "96 deep-well range.",
          "value": {
            "min": 50,
            "max": 1000
          },
          "unit": "µL",
          "configuration": "96 DW head",
          "conditions": "Manufacturer working volume",
          "sourceIds": [
            "apex"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "apex-pcr",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "96 PCR plate range.",
          "value": {
            "min": 10,
            "max": 80
          },
          "unit": "µL",
          "configuration": "96 PCR head",
          "conditions": "Manufacturer working volume",
          "sourceIds": [
            "apex"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "apex-temp",
          "operation": "heating-cooling",
          "type": "native",
          "statement": "Heating and cooling range.",
          "value": {
            "min": 4,
            "max": 100
          },
          "unit": "°C",
          "configuration": "KingFisher Apex",
          "sourceIds": [
            "apex"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "duo-vol",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "Duo Prime 50–1,000 µL (12-pin) or 200–5,000 µL (6-pin); 6 or 12 samples.",
          "value": {
            "min": 50,
            "max": 5000
          },
          "unit": "µL",
          "configuration": "KingFisher Duo Prime",
          "conditions": "Manufacturer working volume",
          "sourceIds": [
            "duoprime"
          ]
        }
      ],
      "gaps": [
        "1.5 ml microcentrifuge tubes not listed.",
        "Whether rod capture works for beads inside capsules is not published.",
        "Stand-alone instrument; RS-232 for automation, no API stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "revvity-chemagic-360",
      "name": "chemagic 360",
      "vendor": "Revvity",
      "category": "magnetic separation",
      "summary": "Floor-standing extraction instrument in which an electromagnet magnetises 12-, 24- or 96-rod heads to separate magnetic particles from tubes or deep-well plates.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "detail": "Metal rods magnetised by an electromagnet; resuspension by rotating demagnetised rods."
        },
        {
          "operation": "dispensing",
          "type": "native",
          "minUl": 200,
          "maxUl": 45000,
          "detail": "Buffer dispenser 200 µL–45 ml."
        }
      ],
      "modules": [
        "chemagic 12 Rod Head",
        "chemagic 24 Rod Head",
        "chemagic 96 Rod Head",
        "chemagic Dispenser"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "chem-manual",
          "title": "chemagic 360 RUO User Manual 2024-9020-03",
          "url": "https://resources.revvity.com/pdfs/2024-9020-03 - chemagic 360 RUO User Manual - EN.pdf",
          "section": "Principles of Operation; Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "chem-disp",
          "operation": "dispensing",
          "type": "native",
          "statement": "Dispenser range, accuracy within ±12%.",
          "value": {
            "min": 200,
            "max": 45000
          },
          "unit": "µL",
          "configuration": "chemagic Dispenser",
          "conditions": "Manufacturer specification",
          "sourceIds": [
            "chem-manual"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "chem-heads",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "Protocols run with a 12, 24 or 96 rod head selected at login.",
          "sourceIds": [
            "chem-manual"
          ]
        }
      ],
      "gaps": [
        "Per-head sample volumes unverified (product pages returned 403).",
        "Kit-locked nucleic-acid extraction workflow; no published buffer-exchange use on particles or capsules."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "alpaqua-magnum-flx",
      "name": "Magnum FLX",
      "vendor": "Alpaqua",
      "category": "magnetic separation",
      "summary": "96-well SBS ring-magnet plate with solid-core ring magnets and a spring cushion base, for reactions up to 2 ml and elutions down to 10 µL.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "minUl": 10,
          "maxUl": 2000,
          "detail": "Ring magnets for 96-well PCR and deep-well plates; 10 µL–2 ml."
        }
      ],
      "modules": [
        "Spring Cushion base"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "flx",
          "title": "Magnum FLX",
          "url": "https://www.alpaqua.com/product/magnum-flx/",
          "section": "Product description / FAQ",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "flx-vol",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "Reactions up to 2 ml; elution as low as 10 µL.",
          "value": {
            "min": 10,
            "max": 2000
          },
          "unit": "µL",
          "configuration": "Magnum FLX",
          "conditions": "Manufacturer range",
          "sourceIds": [
            "flx"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "flx-sbs",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "SBS footprint with elevated base; stated universal liquid handler compatibility.",
          "sourceIds": [
            "flx"
          ]
        }
      ],
      "gaps": [
        "96-well plates only; no 1.5 ml tubes.",
        "Behaviour with beads inside capsules not published."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "alpaqua-magnum-ex",
      "name": "Magnum EX",
      "vendor": "Alpaqua",
      "category": "magnetic separation",
      "summary": "96-well SBS ring-magnet plate with corner brackets that accepts virtually any 96-well plate, including PCR and deep-well plates.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "detail": "Ring magnets; flat, round, V-bottom, deep-well and PCR plates."
        }
      ],
      "modules": [
        "Spring Cushion base",
        "Corner brackets"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "ex",
          "title": "Magnum EX",
          "url": "https://www.alpaqua.com/product/magnum-ex/",
          "section": "Product description",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "ex-compat",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Compatible with virtually any 96-well plate, any skirt.",
          "sourceIds": [
            "ex"
          ]
        }
      ],
      "gaps": [
        "Working volume range not listed.",
        "No tube format."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "permagen-ring-magnet-plates",
      "name": "Permagen 96-well ring magnet plates",
      "vendor": "Permagen Labware",
      "category": "magnetic separation",
      "summary": "SBS ring-magnet plates covering 5 µL PCR elutions to 2 ml deep-well (X96, X396, U480/U500, S-series, MSP480R/500R, RLE500).",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "minUl": 4,
          "maxUl": 2000,
          "detail": "X96 dual ring: 5 µL (PCR) to 2 ml (deep well); X396 combo 384/96."
        }
      ],
      "modules": [
        "X96 Dual Ring",
        "X396 Combo",
        "U480",
        "U500",
        "S380/S480/S500",
        "MSP480R/MSP500R",
        "RLE500/RLE500R",
        "0.2 ml tube top-plate kit"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "pg-ring",
          "title": "96-Well Ring Magnet Plates",
          "url": "https://www.permagenlabware.com/96-well-ring-magnet-plates/",
          "section": "Product listings",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "pg-x96",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "X96 Dual Ring range, SBS, cushion base.",
          "value": {
            "min": 5,
            "max": 2000
          },
          "unit": "µL",
          "configuration": "X96 A011623",
          "conditions": "Manufacturer range",
          "sourceIds": [
            "pg-ring"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "pg-x396",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "X396: 384-well PCR 5–39 µL; 96-well PCR 4–60 µL.",
          "value": {
            "min": 4,
            "max": 60
          },
          "unit": "µL",
          "configuration": "X396 A040523",
          "conditions": "Manufacturer range",
          "sourceIds": [
            "pg-ring"
          ]
        }
      ],
      "gaps": [
        "Plates and 0.2 ml strips only; no 1.5 ml tube ring format."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "permagen-msr-tube-racks",
      "name": "Permagen MSR microfuge tube racks",
      "vendor": "Permagen Labware",
      "category": "magnetic separation",
      "summary": "Bench racks for 1.5 ml tubes (6, 12, 24 tubes) using NdFeB magnets that pull beads to the back wall; not a ring around the tube.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "maxUl": 1500,
          "detail": "Side/back-wall capture for 1.5 ml and some 2.0 ml tubes."
        }
      ],
      "modules": [
        "MSR06 (6 × 1.5 ml)",
        "12- and 24-tube racks",
        "MSR1224 combination rack"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "msr06",
          "title": "6 × 1.5 ml Microfuge Tube Magnetic Separation Rack",
          "url": "https://www.permagenlabware.com/product/6-x-1-5ml-magnetic-separation-rack/",
          "section": "Product description",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "msr-side",
          "operation": "magnetic-separation",
          "type": "native",
          "statement": "Beads are pulled to the back/inner tube wall.",
          "sourceIds": [
            "msr06"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "msr-tubes",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Holds 6 × 1.5 ml microcentrifuge tubes.",
          "value": 6,
          "unit": "tubes",
          "configuration": "MSR06",
          "sourceIds": [
            "msr06"
          ]
        }
      ],
      "gaps": [
        "Not SBS; robot compatibility not stated.",
        "No commercial ring-around-tube separator for 1.5 ml tubes was found."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "vp-scientific-tube-magnet-racks",
      "name": "V&P Scientific 1.5/2 ml tube magnet racks",
      "vendor": "V&P Scientific",
      "category": "magnetic separation",
      "summary": "1.5/2 ml tube magnet racks, including an 8-place bottom-pellet rack and a 24-tube rack in SBS/SLAS format; none is a ring magnet.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "maxUl": 2000,
          "detail": "8-place rack with 10 mm NdFeB magnets pellets at the tube bottom; 24-tube rack in SBS/SLAS format."
        }
      ],
      "modules": [
        "8-place bottom-pellet rack",
        "24-tube SBS/SLAS rack",
        "SLAS magnetic frame"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "thistle",
          "title": "Magnetic racks for tubes (Thistle Scientific)",
          "url": "https://www.thistlescientific.com/product-category/general-laboratory-products/magnetic-bead-separation/magnetic-racks-for-tubes/",
          "section": "Product list",
          "kind": "secondary",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "secondary-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "secondary",
          "id": "vp-sbs24",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "24 × 1.5/2 ml tube magnetic rack in SBS/SLAS format.",
          "value": 24,
          "unit": "tubes",
          "configuration": "24-tube rack",
          "sourceIds": [
            "thistle"
          ]
        }
      ],
      "gaps": [
        "Retailer page only; magnet geometry for the 24-tube rack not stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "tecan-te-mags",
      "name": "Te-MagS",
      "vendor": "Tecan",
      "category": "magnetic separation",
      "summary": "On-deck Freedom EVO module with moveable magnets for a 96-well plate or up to 48 × 1.5 ml Sarstedt tubes, with an optional heating block.",
      "capabilities": [
        {
          "operation": "magnetic-separation",
          "type": "native",
          "maxUl": 1500,
          "detail": "Moveable magnets; 96-well plate or up to 48 × 1.5 ml tubes."
        },
        {
          "operation": "heating-cooling",
          "type": "optional",
          "module": "Heating block",
          "detail": "Optional heating block."
        }
      ],
      "modules": [
        "Tube configuration (48 × 1.5 ml)",
        "Heating block"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "temags",
          "title": "Te-MagS (SelectScience listing)",
          "url": "https://www.selectscience.net/product/te-mags-tm-magnetic-bead-separation",
          "section": "Product description",
          "kind": "secondary",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "secondary-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "secondary",
          "id": "temags-tubes",
          "operation": "consumable-compatibility",
          "type": "native",
          "statement": "Configurable for up to 48 × 1.5 ml Sarstedt tubes.",
          "value": 48,
          "unit": "tubes",
          "configuration": "Tube configuration",
          "conditions": "Sarstedt tubes",
          "sourceIds": [
            "temags"
          ]
        }
      ],
      "gaps": [
        "Not a Tecan datasheet; current sale status unverified.",
        "The only on-deck tube magnet found; none found for Hamilton or Biomek."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "highres-cellario",
      "name": "HighRes Cellario OS with FlexCart / Nucleus",
      "vendor": "HighRes Biosolutions",
      "category": "workcell",
      "summary": "Cellario OS scheduling with FlexCart, FlexPod and Nucleus platforms, the AutoPod mobile robot, and HighRes MicroSpin centrifuge and storage.",
      "capabilities": [
        {
          "operation": "scheduling",
          "type": "native",
          "detail": "Cellario Scheduler runs multiple orders on shared resources; simulation; stated 500+ instruments."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "FlexCart",
          "detail": "FlexCart platform with a robotic arm; arm model not named."
        },
        {
          "operation": "centrifugation",
          "type": "optional",
          "module": "MicroSpin Centrifuge",
          "detail": "MicroSpin: 3,000 x g, two plates or racks, consumables to 65 mm."
        },
        {
          "operation": "storage",
          "type": "optional",
          "module": "Storage",
          "detail": "Sample and consumable storage."
        }
      ],
      "modules": [
        "Cellario OS",
        "FlexCart",
        "FlexPod",
        "Nucleus",
        "AutoPod mobile robot",
        "Prime liquid handler",
        "MicroSpin Centrifuge",
        "Sample storage",
        "Lid management"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "hr-microspin",
          "title": "MicroSpin Centrifuge",
          "url": "https://www.highres.com/lab-instruments/microspin-centrifuge",
          "section": "Specs / FAQ",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "hr-orch",
          "title": "Cellario Platform",
          "url": "https://www.highres.com/lab-orchestration",
          "section": "Cellario Scheduler; Cellario OS",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "hr-flexcart",
          "title": "FlexCart",
          "url": "https://www.highres.com/lab-automation/flexcart",
          "section": "Overview",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "hr-spin-g",
          "operation": "centrifugation",
          "type": "optional",
          "statement": "MicroSpin maximum speed.",
          "value": 3000,
          "unit": "x g",
          "configuration": "MicroSpin Centrifuge",
          "sourceIds": [
            "hr-microspin"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "hr-spin-plates",
          "operation": "centrifugation",
          "type": "optional",
          "statement": "MicroSpin spins up to two plates or racks.",
          "value": 2,
          "unit": "plates or racks",
          "configuration": "MicroSpin Centrifuge",
          "sourceIds": [
            "hr-microspin"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "hr-api",
          "operation": "device-integration",
          "type": "native",
          "statement": "Cellario OS exposes APIs for LIMS, ELN and analytics integration.",
          "sourceIds": [
            "hr-orch"
          ]
        }
      ],
      "gaps": [
        "MicroSpin temperature control and 1.5 ml tube support not stated.",
        "FlexCart arm specifications not published."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "biosero-green-button-go",
      "name": "Biosero Green Button Go with GoSimple / GoDesigned workcells",
      "vendor": "Biosero",
      "category": "workcell",
      "summary": "Vendor-agnostic scheduling (GBG Scheduler) and orchestration software with a driver library, and pre-configured or custom workcells built around an arm and hotels.",
      "capabilities": [
        {
          "operation": "scheduling",
          "type": "native",
          "detail": "Schedules and executes processes on integrated platforms; RESTful API."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "GoSimple / GoDesigned workcells",
          "detail": "GoSimple includes a robotic arm and hotels; examples use UR5, PF400 on a 1.5 m rail, or C5 on a 2 m rail."
        }
      ],
      "modules": [
        "Green Button Go Scheduler",
        "Green Button Go Orchestrator",
        "Device drivers",
        "GoSimple workcells",
        "GoDesigned workcells"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "bio-sched",
          "title": "GBG Scheduler",
          "url": "https://biosero.com/software/green-button-go-scheduler",
          "section": "Product page",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "bio-gosimple",
          "title": "GoSimple Workcells",
          "url": "https://biosero.com/products/gosimple-workcells/",
          "section": "Overview",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "bio-anchem",
          "title": "Automating analytical chemistry",
          "url": "https://biosero.com/applications/drug-discovery/analytical-chemistry/",
          "section": "Small / Medium / Large workcell hardware lists",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "bio-api",
          "operation": "device-integration",
          "type": "native",
          "statement": "GBG Scheduler integrates via RESTful API and database hooks.",
          "sourceIds": [
            "bio-sched"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "bio-example",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Example workcell: PF400 on a 1.5 m rail with Hamilton STAR and LiCONiC STX500.",
          "value": 1.5,
          "unit": "m rail",
          "configuration": "Medium analytical chemistry workcell",
          "conditions": "Example configuration",
          "sourceIds": [
            "bio-anchem"
          ]
        }
      ],
      "gaps": [
        "No centrifuge appears in any fetched Biosero example workcell.",
        "GoSimple arm model not named."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "thermo-momentum-spinnaker",
      "name": "Thermo Momentum with Spinnaker 3 / Orbitor RS2 / F7",
      "vendor": "Thermo Fisher",
      "category": "workcell",
      "summary": "Momentum scheduling software with the Spinnaker 3 SCARA plate mover and hotels, the Orbitor RS2 radial mover and the six-axis F7 robot.",
      "capabilities": [
        {
          "operation": "scheduling",
          "type": "native",
          "detail": "Event-driven scheduling; REST API; 300+/500+ drivers (page gives both)."
        },
        {
          "operation": "vessel-transfer",
          "type": "native",
          "module": "Spinnaker 3",
          "detail": "Spinnaker 3: reach ±597 mm, payload 250 g (320 g max), vision-assisted teaching."
        },
        {
          "operation": "storage",
          "type": "optional",
          "module": "Plate hotels",
          "detail": "Spinnaker hotels up to 180 plates random access or 480 sequential; Orbitor RS2 up to 360 plates."
        }
      ],
      "modules": [
        "Momentum",
        "Spinnaker 3",
        "Spinnaker XT",
        "Orbitor RS2",
        "F7 robot",
        "Autonomous mobile robot"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "tf-ps003466",
          "title": "Spinnaker 3 product specifications PS003466",
          "url": "https://documents.thermofisher.com/TFS-Assets/CMD/Scientific-Resources/ps-003466-la-spinnaker-microplate-mover-ps003466-em-en.pdf",
          "section": "Specifications; Storage options; Control",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "tf-robotics",
          "title": "Thermo lab robotics",
          "url": "https://www.thermofisher.com/us/en/home/life-science/lab-equipment/lab-automation/lab-robotics.html",
          "section": "Product descriptions; comparison table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "tf-momentum",
          "title": "Momentum Workflow Scheduling Software",
          "url": "https://www.thermofisher.com/order/catalog/product/MOMENTUM",
          "section": "Features; technical specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "tf-reach",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Spinnaker 3 reach.",
          "value": 597,
          "unit": "mm",
          "configuration": "Spinnaker 3",
          "conditions": "± radius",
          "sourceIds": [
            "tf-ps003466",
            "tf-robotics"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "tf-hotels",
          "operation": "storage",
          "type": "optional",
          "statement": "Spinnaker hotel capacity.",
          "value": {
            "min": 180,
            "max": 480
          },
          "unit": "plates",
          "configuration": "Random access / sequential",
          "sourceIds": [
            "tf-ps003466"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "tf-api",
          "operation": "device-integration",
          "type": "native",
          "statement": "Momentum REST API consumes worklists and reports status.",
          "sourceIds": [
            "tf-momentum"
          ]
        }
      ],
      "gaps": [
        "No Thermo centrifuge named on the fetched pages.",
        "Driver count inconsistent on its own page."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "beckman-biomek-integration",
      "name": "Biomek integrated solutions (SAMI)",
      "vendor": "Beckman Coulter",
      "category": "workcell",
      "summary": "Beckman offers to integrate Biomek instruments into workcells, scheduled with SAMI EX or SAMI Process Management, with the Access Dual Robot System.",
      "capabilities": [
        {
          "operation": "scheduling",
          "type": "native",
          "detail": "SAMI EX / SAMI Process Management scheduling."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Access Dual Robot System",
          "detail": "Access Dual Robot System; no specifications on the page."
        }
      ],
      "modules": [
        "SAMI EX",
        "SAMI Process Management",
        "Access Dual Robot System",
        "Access Laboratory Workstation",
        "Biomek Echo One bundle"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "bc-process",
          "title": "Integration Process: Laboratory Automation",
          "url": "https://beckman.com/integrated-solutions/process",
          "section": "Page body and menus",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "bc-sami",
          "operation": "scheduling",
          "type": "native",
          "statement": "SAMI EX and SAMI Process Management are offered to schedule integrated Biomek workflows.",
          "sourceIds": [
            "bc-process"
          ]
        }
      ],
      "gaps": [
        "Integrated device list not opened; no centrifuge named.",
        "No arm specifications."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "agilent-microplate-centrifuge",
      "name": "Agilent Microplate Centrifuge with Automated Centrifuge Loader",
      "vendor": "Agilent",
      "category": "centrifuge",
      "summary": "Robot-accessible two-plate centrifuge, 3,000 rpm / 1,000 x g, with an Automated Centrifuge Loader for robots that cannot reach inside.",
      "capabilities": [
        {
          "operation": "centrifugation",
          "type": "native",
          "detail": "1,000 x g; 2 microplates or SBS tube racks; plates to 48.3 mm."
        },
        {
          "operation": "vessel-transfer",
          "type": "optional",
          "module": "Automated Centrifuge Loader",
          "detail": "Automated Centrifuge Loader."
        }
      ],
      "modules": [
        "Microplate Centrifuge G5582AA",
        "Automated Centrifuge Loader",
        "BenchCel workstation"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "ag-ds",
          "title": "Agilent Microplate Centrifuge datasheet 5990-3484JAJP",
          "url": "https://www.chem-agilent.com/pdf/low_5990-3484JAJP.pdf",
          "section": "Table 1 Specifications; Table 2 Operating requirements; Microplate loader",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "ag-g",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Maximum 3,000 rpm / 1,000 x g.",
          "value": 1000,
          "unit": "x g",
          "configuration": "Microplate Centrifuge",
          "sourceIds": [
            "ag-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "ag-height",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Maximum plate height.",
          "value": 48.3,
          "unit": "mm",
          "configuration": "Microplate Centrifuge",
          "sourceIds": [
            "ag-ds"
          ]
        }
      ],
      "gaps": [
        "No sample temperature control stated (4–40 °C is the ambient operating requirement).",
        "English datasheet returned 403; Japanese edition used."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "bionex-hig4",
      "name": "HiG 4 Automated Centrifuge",
      "vendor": "BioNex Solutions",
      "category": "centrifuge",
      "summary": "Two-bucket SBS centrifuge up to 4,000 x g, loaded directly by a robot, Peltier-cooled to around ambient (not to 4 °C).",
      "capabilities": [
        {
          "operation": "centrifugation",
          "type": "native",
          "detail": "Up to 4,000 x g; 2 buckets; SBS labware up to 61 mm; 350 g per bucket."
        }
      ],
      "modules": [
        "HiG 4",
        "HiG 3"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "bnx-hig",
          "title": "HiG Automated Centrifuge (LIT-50005 Rev H)",
          "url": "https://www.bionexsolutions.com/hig-centrifuge/",
          "section": "Specification table; integrations",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        },
        {
          "id": "solve-hig",
          "title": "Solve Scientific: BioNex HiG",
          "url": "https://solvescientific.com.au/suppliers/bionex-solutions/hig/",
          "section": "Spec table",
          "kind": "secondary",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "hig-g",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Maximum force.",
          "value": 4000,
          "unit": "x g",
          "configuration": "HiG 4",
          "sourceIds": [
            "bnx-hig"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "hig-payload",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Payload per bucket; SBS labware to 61 mm.",
          "value": 350,
          "unit": "g per bucket",
          "configuration": "HiG 4",
          "sourceIds": [
            "bnx-hig"
          ]
        },
        {
          "evidence": "secondary",
          "id": "hig-temp",
          "operation": "heating-cooling",
          "type": "native",
          "statement": "Sample temperature below 5 °C above ambient (cools to ambient, not below).",
          "value": 5,
          "unit": "°C above ambient",
          "configuration": "HiG 4",
          "sourceIds": [
            "solve-hig"
          ]
        }
      ],
      "gaps": [
        "Cannot hold 4 °C.",
        "1.5 ml tubes not stated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "hettich-rotanta-460-robotic",
      "name": "ROTANTA 460 Robotic",
      "vendor": "Hettich",
      "category": "centrifuge",
      "summary": "Refrigerated floor-standing robotic centrifuge with an automated lid hatch and rotor positioning; up to 6,446 x g and 12 microplates; no 1.5 ml microtube adapter listed.",
      "capabilities": [
        {
          "operation": "centrifugation",
          "type": "native",
          "detail": "Rotor 5622: 6,446 x g, 12 microplates or 2 deep-well plates; rotor 4444: 24 × 50 ml."
        },
        {
          "operation": "heating-cooling",
          "type": "native",
          "module": "Refrigeration",
          "detail": "Refrigerated, −20 to +40 °C; lowest at maximum speed 6–9 °C by rotor."
        }
      ],
      "modules": [
        "Rotor 5622",
        "Rotor 4444",
        "Front or back robot hatch (RS232)",
        "Refrigeration"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "r460-ds",
          "title": "ROTANTA 460 Robotic datasheet DS.0126-EN",
          "url": "https://hettichlab.com/downloadcenter/Products/Datasheets/ROTANTA-460-Robotic_EN.pdf",
          "section": "Technical data; rotor tables pp.2-3",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "r460-g",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Maximum RCF at 6,200 rpm.",
          "value": 6446,
          "unit": "x g",
          "configuration": "Rotor 5622",
          "sourceIds": [
            "r460-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "r460-temp",
          "operation": "heating-cooling",
          "type": "native",
          "statement": "Lowest temperature with pre-cooling at maximum speed.",
          "value": {
            "min": 6,
            "max": 9
          },
          "unit": "°C",
          "configuration": "Rotor 4444 / 5622",
          "conditions": "At maximum speed; lower speeds not specified",
          "sourceIds": [
            "r460-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "r460-hatch",
          "operation": "vessel-transfer",
          "type": "external",
          "statement": "Hatch opens in under 6 s for robot loading.",
          "value": 6,
          "unit": "s",
          "configuration": "Robot hatch",
          "sourceIds": [
            "r460-ds"
          ]
        }
      ],
      "gaps": [
        "Whether 4 °C is held at 1,000 x g is not published.",
        "No 1.5 ml microtube adapter listed."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "hettich-mikro-220-robotic",
      "name": "MIKRO 220 Robotic",
      "vendor": "Hettich",
      "category": "centrifuge",
      "summary": "Air-cooled, non-refrigerated robot-loaded microlitre centrifuge for 24 × 1.5/2.0 ml tubes; the only robot-loadable 1.5 ml tube centrifuge found.",
      "capabilities": [
        {
          "operation": "centrifugation",
          "type": "native",
          "detail": "24 × 0.8/1.5/2.0 ml tubes; 18,327 x g; robot loads through a lid hatch."
        }
      ],
      "modules": [
        "Rotor 2394 (90°)",
        "Rotor 2334 (45°)",
        "Adapter 2031 (1.5 ml)"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "m220-ds",
          "title": "MIKRO 220 Robotic datasheet",
          "url": "https://hettichlab.com/downloadcenter/Products/Datasheets/MIKRO220Robotic_EN.pdf",
          "section": "Technical data; rotor/vessel tables",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "m220-cap",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Capacity 24 × 1.5/2.0 ml tubes.",
          "value": 24,
          "unit": "tubes",
          "configuration": "Rotor 2394 or 2334",
          "sourceIds": [
            "m220-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "m220-g",
          "operation": "centrifugation",
          "type": "native",
          "statement": "Maximum RCF at 13,000 rpm.",
          "value": 18327,
          "unit": "x g",
          "configuration": "Rotor 2394 or 2334",
          "sourceIds": [
            "m220-ds"
          ]
        }
      ],
      "gaps": [
        "Not refrigerated: cannot run at 4 °C. No refrigerated robot-loadable 1.5 ml centrifuge was found.",
        "Tube lids must be closed; lid handling not addressed."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "brooks-preciseflex-400",
      "name": "PreciseFlex 400 (PF400)",
      "vendor": "Brooks Automation",
      "category": "arm",
      "summary": "Collaborative 4-axis bench sample handler with a servo gripper for SBS plates, tubes and vials; 0.5 kg payload, ±0.09 mm repeatability, optional linear rail.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "Servo gripper for SBS plates (landscape and portrait), tubes and vials."
        }
      ],
      "modules": [
        "Servo gripper",
        "Collaborative linear rail",
        "Z-axis 400/750/1160 mm"
      ],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "pf400-ds",
          "title": "PreciseFlex 400 Sample Handler datasheet",
          "url": "https://manuals.brooks.com/getmedia/3dd476e9-9925-41b4-b17f-0336f29e8bfa/PreciseFlex-400.pdf",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "pf-payload",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Payload with servo gripper.",
          "value": 0.5,
          "unit": "kg",
          "configuration": "Servo gripper",
          "sourceIds": [
            "pf400-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "pf-repeat",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Repeatability.",
          "value": 0.09,
          "unit": "mm",
          "configuration": "PF400",
          "conditions": "±",
          "sourceIds": [
            "pf400-ds"
          ]
        },
        {
          "evidence": "manufacturer",
          "id": "pf-reach",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Horizontal reach with servo gripper.",
          "value": {
            "min": 579,
            "max": 734
          },
          "unit": "mm",
          "configuration": "Standard / extended reach",
          "sourceIds": [
            "pf400-ds"
          ]
        }
      ],
      "gaps": [
        "1.5 ml tube gripping not specified."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "ufactory-xarm-lite-6",
      "name": "xArm Lite 6",
      "vendor": "UFACTORY",
      "category": "arm",
      "summary": "Low-cost 6-axis desktop arm, 600 g payload, 440 mm reach, ±0.5 mm repeatability; no manufacturer statement of laboratory validation.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "Generic pick-and-place; no labware gripper or lab use stated."
        }
      ],
      "modules": [],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "xl6",
          "title": "Lite 6 collaborative robot",
          "url": "https://www.ufactory.cc/lite-6-collaborative-robot/",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "xl6-spec",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Payload 600 g, reach 440 mm, repeatability ±0.5 mm.",
          "value": 0.6,
          "unit": "kg",
          "configuration": "xArm Lite 6",
          "sourceIds": [
            "xl6"
          ]
        }
      ],
      "gaps": [
        "Not lab-validated by the manufacturer.",
        "Repeatability about five times looser than the PF400."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "dobot-mg400",
      "name": "MG400",
      "vendor": "Dobot",
      "category": "arm",
      "summary": "Low-cost 4-axis desktop arm, 500 g rated payload, 440 mm radius, ±0.05 mm repeatability; no manufacturer statement of laboratory use.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "Generic pick-and-place."
        }
      ],
      "modules": [],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mg400",
          "title": "Dobot MG400",
          "url": "https://www.dobot-robots.com/products/desktop-four-axis/mg400.html",
          "section": "Overview; spec table",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "mg400-spec",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Payload 500 g (750 g max), radius 440 mm, repeatability ±0.05 mm.",
          "value": {
            "min": 0.5,
            "max": 0.75
          },
          "unit": "kg",
          "configuration": "MG400",
          "sourceIds": [
            "mg400"
          ]
        }
      ],
      "gaps": [
        "Not lab-validated by the manufacturer."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "dobot-magician",
      "name": "Dobot Magician",
      "vendor": "Dobot",
      "category": "arm",
      "summary": "Education-grade 4-axis desktop arm, 500 g payload, 320 mm reach, ±0.2 mm repeatability.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "Generic pick-and-place."
        }
      ],
      "modules": [],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "magician",
          "title": "Dobot Magician",
          "url": "https://www.dobot-robots.com/products/education/magician.html",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "magician-spec",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Payload 500 g, reach 320 mm, repeatability ±0.2 mm.",
          "value": 0.5,
          "unit": "kg",
          "configuration": "Magician",
          "conditions": "Manufacturer lab tests",
          "sourceIds": [
            "magician"
          ]
        }
      ],
      "gaps": [
        "Not lab-validated by the manufacturer."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    },
    {
      "id": "elephant-mycobot-280-pi",
      "name": "myCobot 280 Pi",
      "vendor": "Elephant Robotics",
      "category": "arm",
      "summary": "6-axis desktop arm with 250 g payload and 280 mm radius for education and research; repeatability not published.",
      "capabilities": [
        {
          "operation": "vessel-transfer",
          "type": "native",
          "detail": "Generic pick-and-place."
        }
      ],
      "modules": [],
      "performance": "Condition-specific performance has not been extracted into this record.",
      "sources": [
        {
          "id": "mycobot",
          "title": "myCobot 280 Pi (2023)",
          "url": "https://www.elephantrobotics.com/en/mycobot-280-pi-2023-en/",
          "section": "Specifications",
          "kind": "manufacturer",
          "checked": "2026-11-09"
        }
      ],
      "evidenceLevel": "manufacturer-sourced",
      "license": "Original manufacturer documents retain their own rights; independently authored factual summaries link to those sources. No blanket licence for third-party documents is asserted.",
      "verified": "2026-11-09",
      "completeness": {
        "headSelection": "Review source; family envelope may combine multiple heads",
        "labware": "Not fully extracted",
        "accuracy": "Not extracted",
        "geometry": "Not extracted",
        "integration": "Native/optional/external roles; exact device compatibility requires review",
        "claimCoverage": "Selected original manufacturer claims extracted; remaining gaps are listed."
      },
      "upstream": null,
      "claims": [
        {
          "evidence": "manufacturer",
          "id": "mycobot-spec",
          "operation": "vessel-transfer",
          "type": "native",
          "statement": "Payload 250 g, working radius 280 mm.",
          "value": 0.25,
          "unit": "kg",
          "configuration": "myCobot 280 Pi",
          "sourceIds": [
            "mycobot"
          ]
        }
      ],
      "gaps": [
        "Repeatability not published; not lab-validated."
      ],
      "integration": {
        "framework": "PyLabRobot",
        "status": "not-established",
        "drivers": [],
        "prerequisites": [
          "Locate exact model/backend documentation and confirm required control interface."
        ],
        "gaps": [
          "No exact-model support conclusion established in this record; this is not a claim that support is impossible."
        ],
        "sourceIds": []
      },
      "madsci": {
        "status": "not-assessed",
        "integrations": []
      },
      "procurement": [],
      "procurementGaps": [
        "No public price or live supply observation has been captured for this record."
      ],
      "practicalConsiderations": []
    }
  ]
};

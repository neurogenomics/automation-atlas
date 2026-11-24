# Automation Atlas

A planner for lab automation. Give it a protocol and the instruments you can use, and it shows what automation would take off a person's hands: hands-on time, trips back to the bench, and the questions that still need answering before you buy or book anything.

**Use it now: <https://lab-automation-planner-skene.nathan-skene.chatgpt.site/web/index.html>.** No account or install is needed.

## What you can do

1. **Protocols.** Paste protocol text from anywhere (protocols.io, a paper, a document) or upload a Labstep export. Lines the planner cannot read are listed, not guessed. Combine protocols into a workflow and choose the labware and batch size.
2. **Your equipment.** Pick the instruments you can use from the catalogue and mark each option as Have, Don't have or Not sure. "Not sure" becomes a question for the instrument's owner.
3. **Decide what to automate.** Compare doing it by hand with your confirmed equipment, your equipment plus unconfirmed options, or the best complete setup from the whole catalogue. Each result shows hands-on minutes, what stays manual, the price evidence for the setup and the open questions.
4. **Portfolio.** For a shared facility, weigh candidate setups across several groups' workflows and download the comparison as CSV or Markdown.

The instrument records come from the [Instrument Atlas](https://github.com/neurogenomics/instrument-capability-catalogue) ([site](https://instrument-capability-catalogue.nathan-skene.chatgpt.site/)).

## What happens to your data

Without signing in, everything stays in your browser and can be exported or imported as a JSON file. If you sign in, your equipment, workflows and answers are saved to your account. Protocols you import are never uploaded; they stay in your browser.

## What the numbers mean

Minutes are planning estimates from the protocol text and catalogue records, not measurements. A result never validates a wet-lab method, confirms that an instrument is installed or configured as assumed, or grants access to a facility. Prices are recorded observations with their source; unpriced items are named, never estimated.

## Run it yourself

Requires Node 22 or newer and Python 3.12.

```sh
npm ci --ignore-scripts --no-fund
npm test          # unit and worker tests
npm run check     # validates the shipped catalogue data
npm run dev       # builds, then serves the planner on http://localhost:8000
```

`npm run build` writes one self-contained worker (`dist/server/index.js`) with the site files embedded and the D1 migrations in `dist/drizzle/`. The hosted site runs on ChatGPT Sites; `worker/app.js` is a standard fetch-handler worker with a D1 (SQLite) binding named `DB`.

Where things are: `lib/` is the engine (protocol reading, setups, simulation, the physical ledger), `content/` the shipped catalogue data, `data/` the research behind it, `web/` the browser app, `worker/` the server, `docs/` the API and feature guides.

## What this copy leaves out

This repository is exported from the lab's private working repository (see `PUBLIC_SOURCE.json` for the source commit). The lab's own unpublished protocols are not included, so the engine tests and report scripts that run on them are not here either. The tests that are here pass on their own. Development happens upstream and is re-exported, so please do not expect pull requests to merge directly; open an issue instead.

## Report a problem or ask for something

[Open an issue](https://github.com/neurogenomics/automation-atlas/issues/new/choose). For a wrong instrument fact, include the manufacturer source that shows the correct value. For a protocol the planner misreads, include the smallest piece of text that shows it (only text you are free to share).

## Licence

- Code (`lib/`, `web/`, `worker/`, `scripts/`, `tests/`, `offline/`, `db/`): [MIT](LICENSE).
- Authored catalogue records, research notes and documentation (`content/`, `data/`, `docs/`): [CC BY 4.0](LICENSE-DATA). Cite as "Automation Atlas, neurogenomics lab, Imperial College London" with a link to this repository.
- Third-party material keeps its own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Manufacturer documents are linked, not redistributed. Price observations are facts recorded from the cited public sources and sellers.

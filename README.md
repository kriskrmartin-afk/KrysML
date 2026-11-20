# KrysML

**Krystyon's Modelling Language** (formerly Krys.ML)

KrysML is a simple, plain-text modelling language for creating process, relationship and interface diagrams, as well as basic flow charts.

KrysML.com is a single-file, offline-compatible, open-source tool that turns KrysML into diagrams. It's a free tool that will always be available to everybody.

KrysBPM (krysml.com/bpm) is an experimental companion application for modelling more complex business processes using BPMN 2.0 notation. It supports nested gateways, actor assignments and BPMN XML export for compatible third-party tools. It is currently in beta.

KrysML.com is a long term project that aims to put automation into the hands of people who don't code, whilst protecting the privacy of their work.

**Live app:** https://krysml.com

## Values

* Clarity and shared understanding over niche expertise
* Solving real-world issues over memorising syntax and diagram shapes
* Same input = same output over randomness of AI algorithms
* Speed and simplicity over putting in more hours and effort

While there is value in the items on the right, I value the items on the left more.

## Working offline

Use Ctrl+S (or Cmd+S) to save the page. Open in a private/incognito window if you don't need to save what you are working on.


## About this repository

This repository contains two related applications: KrysML.com and KrysBPM.

**Current KrysML.com version:** v5.1.0  
**Release date:** 13 November 2026

KrysML.com is the original standalone, single-file application.

| File | Purpose |
|---|---|
| `index.html` | KrysML application, including embedded Dagre |
| `_headers` | Netlify deployment security and response headers |
| `LICENSE` | MIT License |
| `OPEN-SOURCE.md` | Open-source and third-party licence notices |

### KrysBPM — BPMN Modelling (Beta)

**Current version:** v1.0.0-beta  
**Application:** [krysml.com/bpm](https://krysml.com/bpm/)  
**Beta release:** 20 November 2026

KrysBPM extends KrysML with a dedicated BPMN syntax parser, process graph engine, SVG renderer and BPMN 2.0 XML exporter.

Unlike KrysML, KrysBPM uses a modular JavaScript architecture. Its files are maintained together in the `bpm/` directory.

| File | Purpose |
|---|---|
| `bpm/index.html` | KrysBPM application and user interface, including embedded Dagre |
| `bpm/bpm-engine.js` | Parses process syntax and constructs process graphs |
| `bpm/bpm-svg.js` | Renders BPMN-style process diagrams as SVG |
| `bpm/bpmn-export.js` | Generates BPMN 2.0 XML with diagram layout information |

Exported BPMN files are non-executable by default. Advanced workflow behaviour and broader BPMN interoperability testing remain under development.

KrysBPM is a separate beta application and does not change the existing KrysML modelling functionality.



## Code of Conduct

As the owner of KrysML.com, I hold myself to the standards of the profession I trained in:

* **Competence** — the code is maintained, bugs get fixed, and I keep learning as the tool grows.
* **Honesty** — mistakes are owned, not hidden. What the tool can't do is stated plainly.
* **Safety** — nothing ships that would put your data or your work at risk.

This follows the [IET Rules of Conduct](https://www.theiet.org/about/governance/rules-of-conduct) and the [Engineering Council's Statement of Ethical Principles](https://www.engc.org.uk/ethics).

— Kris Martin, ICTTech TMIET

## Licence

Released under the MIT License. See `LICENSE`. Third-party notices are in `OPEN-SOURCE.md`.

Copyright (c) 2026 Kris Martin


KrysML.com Version 5.1.0 released 13th Nov 2026
KrysBPM Version 1.0.0-beta released 20th Nov 2026
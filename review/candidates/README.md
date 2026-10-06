# Candidate patterns

One YAML file per **proposed** pattern, named after the id it would have: `LG3.yaml`. A candidate is a *proposal for the clinical reviewer*, not data of the knowledge base ([library expansion design](../../docs/post-mvp/design/library-expansion.md) §5).
Start from [`TEMPLATE.yaml.txt`](TEMPLATE.yaml.txt).

```bash
.venv/bin/python -m scripts.review.dossier review/candidates/LG3.yaml     # → review/packs/dossiers/LG3.md, the page the reviewer decides on
.venv/bin/python -m scripts.kb.new_pattern LG3                            # → review/candidates/LG3/…, the skeleton of everything an accepted candidate needs
.venv/bin/python -m scripts.kb.admission --pairs                          # where the library stands against the admission checklist
```

The order is the design's: **dossier first, weights later.** The dossier measures the proposal against the library as it is (the engine's own scoring, the question bank, the registry of quotations and formulas, the red flags) and
says what it would cost. The reviewer answers *accept*, *reject* or *change* on the page; only an accepted candidate is scaffolded and authored, and then it goes through the checklist like every pattern — the build fails on any
machine-checkable row that does not hold. A new pattern is never waived.

`review/candidates/<id>/` (the scaffold's output) and `review/packs/` (the dossiers) are derived and git-ignored. The proposal files themselves are committed, so that a reviewer's decision can name the version it was made on.

# Published schemas

JSON Schemas (draft 2020-12) for the files the app hands to a person. A file is something the person holds: the app never uploads one and keeps no record of where it went.

| Schema | File | What it is | Task |
|---|---|---|---|
| [`tcm-summary-1.schema.json`](tcm-summary-1.schema.json) | `tcm-summary-YYYY-MM-DD.json` | The practitioner summary as data: what the printed summary page shows, as identifiers with labels in Traditional Chinese and English, in sections the person chooses | PM-17 |

The files under [`examples/`](examples/) are real output of the app's own test run (version stamps replaced by `example`) and are regenerated with `UPDATE_FIXTURES=1 pnpm --filter @tcm/web test summary-file`. `scripts/kb/tests/test_summary_schema.py` validates them, and every file the web tests generate for the 23 typical patients in the development and the release profile, against the schema with the Python `jsonschema` package the project already uses, and checks that the mistakes a reader must not accept are refused.

**Changes without a new version.** PM-29 added two optional properties to `exportedFrom` — `seasonModel` (`changxia` | `tuwang18`: which reading of the year stands behind the result's season) and `seasons` (`south` | `off`: present only when the season was not counted by the northern calendar). Files made before it do not have them and are still valid.

**For a reader of a summary file:** read `format` and `version` first; ignore fields you do not know (a field added later without changing `version` is optional); never rely on a section being present — the person chooses which go in; take codes from `id` and names from `label` (`en` is `null` where the knowledge base has no English text). A `release` file holds only what a release result can show (tier-A formulas, no amounts); a `dev` file may hold more and says so in `exportedFrom.profile`. The file is not a clinical record and carries its own disclaimer in `notice`.

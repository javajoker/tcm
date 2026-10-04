# Review records

One YAML file per reviewer decision ([content review §5](../../docs/content-review.md)), named after its id: `REV-2026-0001.yaml`. The build (`scripts/kb/build_review.py`) compiles them into
`data/review/records.json` and sets `status: reviewed` on the units they cover — **only** the build does that. Start from [`TEMPLATE.yaml.txt`](TEMPLATE.yaml.txt) or, better, from the record skeleton of a review pack (`pnpm review:pack <area>` → `review/packs/<area>/record-skeleton.yaml`), which fills in the unit ids and their current content hashes.

A record names the **content hash** of each unit as it was when the reviewer signed it off (after any agreed changes were applied and the knowledge base rebuilt). If the unit changes later, the hash
no longer matches, the record is reported as *stale* and the unit goes back to draft until it is reviewed again.

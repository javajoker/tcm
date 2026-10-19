# Agent Skills

Skills for Claude that are built from this repository. Each is a folder with its `SKILL.md`; what it needs from the app — a script, the knowledge base, a generated
reference — is added by its build, so **install the built skill, not this folder**.

## tcm-practitioner-reference

A reference formula for a licensed doctor's case (task PM-65; [design](../docs/post-mvp/design/practitioner-reference.md)). The doctor describes a patient — age, sex,
constitution, complaints, tongue, pulse, medicines, allergies, special needs — and Claude returns the herbs with their roles, reference grams within the Pharmacopoeia range,
the reasons for every change and the safety findings, in Traditional Chinese or English. Claude maps the description onto the knowledge base's vocabulary; the bundled
script — the app's own engine and practitioner pipeline — computes everything else. Claude never invents a herb or a gram.

- **Build:** `pnpm skill:build` writes `dist/skills/tcm-practitioner-reference/` and `dist/skills/tcm-practitioner-reference.skill` (git-ignored, derived; about 350 KB packed).
  It reads the build's restrictions like the app's build (`APP_DOSE_DISPLAY`, `APP_OVERRIDES`) and refuses where they serve no study reference. Nothing is downloaded.
- **Try it:** `node dist/skills/tcm-practitioner-reference/scripts/reference.mjs dist/skills/tcm-practitioner-reference/assets/example-case.json` (add `--lang en`).
- **Install:** in Claude Code, copy the built folder to `~/.claude/skills/` (or a project's `.claude/skills/`); in the Claude apps, add the `.skill` file as a custom skill in
  the settings (capabilities). The script needs Node.js 18 or later where it runs.
- **Status:** a draft, like the knowledge base it carries — its patterns, formulas, herb records and rules await the clinical and pharmacy reviews. Three questions are the
  owner's before it goes to doctors outside the project, among them a legal view ([decision register §2.11](../docs/post-mvp/decisions.md#211-the-owners-request-of-2026-10-16)).

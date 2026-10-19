// The practitioner reference's command (PM-65): the script the skill runs, bundled by `scripts/build-skill.ts` into `scripts/reference.mjs` beside its knowledge base.
//   node reference.mjs <case.json | ->  [--lang zh-Hant|en] [--json]     the reference of a case (a file, or the standard input)
//   node reference.mjs --vocabulary                                      the ids a case may use, in Markdown
//   node reference.mjs --version                                         the build and the knowledge base
// It reads the knowledge base beside it (`kb.json`, or `--kb <file>`) and the case; it fetches nothing, writes nothing and keeps nothing. Exit codes: 0 the report;
// 2 the case does not read (the errors, as JSON, for whoever wrote it); 3 a safety fact of the person is missing (what to ask, as JSON); 1 anything else.
import { readFileSync } from "node:fs";
import { practitionerKb, type PractitionerKbFile } from "../kbFile.ts";
import { dataOf, reportOf } from "../report.ts";
import { runCase } from "../run.ts";
import { vocabularyOf } from "../vocabulary.ts";

const USAGE = "usage: node reference.mjs <case.json | -> [--lang zh-Hant|en] [--json] | --vocabulary | --version  [--kb <file>]";

async function main(argv: readonly string[]): Promise<number> {
  const flag = (name: string): boolean => argv.includes(name);
  const option = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const kbPath = option("--kb") ?? new URL("./kb.json", import.meta.url);
  const file = JSON.parse(readFileSync(kbPath, "utf8")) as PractitionerKbFile;
  const kb = await practitionerKb(file);
  if (flag("--version")) { process.stdout.write(`${JSON.stringify({ build: file.build, kb: kb.version, profile: kb.config.profileName, role: kb.role })}\n`); return 0; }
  if (flag("--vocabulary")) { process.stdout.write(vocabularyOf(kb)); return 0; }
  const values = new Set(["--lang", "--kb"].map(option).filter((x): x is string => x !== undefined));
  const source = argv.find((a) => !a.startsWith("--") && !values.has(a));
  if (source === undefined) { process.stderr.write(`${USAGE}\n`); return 1; }
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(source === "-" ? 0 : source, "utf8"));
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ status: "invalid", errors: [{ path: "", message: `the case is not readable JSON: ${(e as Error).message}` }] }, null, 2)}\n`);
    return 2;
  }
  const lang = option("--lang");
  if (lang !== undefined) {
    if (lang !== "zh-Hant" && lang !== "en") { process.stderr.write(`--lang: zh-Hant or en\n${USAGE}\n`); return 1; }
    if (typeof input === "object" && input !== null && !Array.isArray(input)) input = { ...input, lang };
  }
  const run = runCase(kb, input, Date.now());
  if (run.status !== "ok") {
    process.stdout.write(`${JSON.stringify(dataOf(kb, run), null, 2)}\n`);
    return run.status === "invalid" ? 2 : 3;
  }
  const report = reportOf(kb, run);
  process.stdout.write(flag("--json") ? `${JSON.stringify({ ...dataOf(kb, run), report }, null, 2)}\n` : report);
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e: unknown) => { process.stderr.write(`${(e as Error).stack ?? String(e)}\n`); process.exitCode = 1; });

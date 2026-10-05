// Writes the kill worker over a build's `sw.js` (docs/post-mvp/design/offline-and-install.md §5, release process §7): deploy it to remove a faulty worker from every browser that visits.
//   node scripts/make-kill-sw.ts [dist]        (default apps/web/dist)
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { killWorkerSource } from "./sw-build.ts";

if (import.meta.main) {
  const dist = resolve(process.argv[2] ?? "apps/web/dist");
  writeFileSync(join(dist, "sw.js"), killWorkerSource());
  console.log(`wrote the kill worker to ${join(dist, "sw.js")}: deploy this directory to remove the offline copy from every browser that visits`);
}

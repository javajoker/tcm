// The boot script (docs/post-mvp/design/offline-and-install.md §3.5): a tiny classic script of its own, loaded before the application and independent of it, so that a start that fails anywhere — a chunk
// the offline copy no longer has, a module that throws, a script the browser cannot parse — is still counted (src/offline/boot.ts). The release build bundles it to `/boot.js` and puts it first in
// the page; the development build has no offline copy and no boot script.
import { bootStarted, bootEnvironment } from "./offline/boot.ts";

void bootStarted(bootEnvironment());

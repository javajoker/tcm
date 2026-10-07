// The gateway as a Worker (Cloudflare Workers, beside the Pages hosting — docs/post-mvp/design/ai-assisted-intake.md §3). Its variables and secrets are the environment of
// config.ts; changing one (AI_KILL = 1) turns the modules off without a release. Deploying it, and the provider's key, are the owner's step (task PM-49).
import { configFrom } from "./config.ts";
import type { Env } from "./config.ts";
import { createGateway } from "./gateway.ts";
import { providerFor } from "./provider.ts";

let gateway: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (gateway === undefined) {
      const config = configFrom(env);
      // eslint-disable-next-line no-console -- the Worker's log is its console; a line holds counts and codes only (LogLine)
      gateway = createGateway({ config, provider: providerFor(config), now: () => Date.now(), log: (line) => console.log(JSON.stringify(line)) });
    }
    return gateway(request);
  },
};

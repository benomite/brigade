// How the new kitchen launches an agent: `claude` in `kitchen-sandbox.ts`'s enclosure, or no launcher without one.
import { argumentsClaude, cookEnvironment } from "../claude-launch.ts";
import { kitchenEnclosure, type EnclosurePlace } from "./kitchen-sandbox.ts";
import { environnementClaude } from "../jeton-claude.ts";
import { variablesDeRelais } from "../reseau.ts";
import type { KitchenOptions } from "../kitchen/kitchen.ts";

// The station's gates file, and the project's port in it, read at each launch.
export type LaunchPlace = EnclosurePlace & { project: string; claude: string; portsFile?: string; portOf: () => number | null };

export function launcherOf(place: LaunchPlace): { launch: KitchenOptions["launch"] } | { refused: string } {
  const enclosure = kitchenEnclosure(place);
  if ("refused" in enclosure) return enclosure;
  return {
    launch: (_kind, cwd, write, calibration, input) => {
      // No BRIGADE_ variable and no GitHub token reach an agent: it reads its ticket from its input.
      const { GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...base } = cookEnvironment(place.env);
      const port = place.portOf();
      // On a station with gates, an agent never leaves without its project's.
      if (place.portsFile && port === null) throw new Error(`no network gate is open for ${place.project}: no agent leaves without one`);
      const env = environnementClaude({ ...base, ...(port === null ? {} : variablesDeRelais(port)) }, place.env);
      const launch = enclosure.wrap(place.claude, argumentsClaude(calibration), cwd, write);
      return { command: launch.commande, args: launch.args, input, cwd, env, secrets: {} };
    },
  };
}

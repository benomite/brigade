// How the kitchen launches one agent (cook, closer, reviewer, manager):
// `claude` with its calibration, inside its station's safeguards. On Linux,
// the `bwrap` partition (`cloison.ts`). On macOS, Claude Code's sandbox
// (`bac-a-sable/`): it writes only in its worktree (nowhere for a read-only
// launch) and reaches only the hosts of the project's network allowlist. A Mac
// without a usable sandbox gets no launcher: the project's kitchen launches no
// agent, and the reason says why.
import { argumentsClaude, environnementCook } from "../claude.ts";
import { configCloison, envelopper } from "../cloison.ts";
import type { Sondes } from "../bac-a-sable/detection.ts";
import { dansLeBacASableLocal, lireCaches, verifier, PLATEFORME_LOCALE, type BacASableLocal } from "../bac-a-sable/local.ts";
import { environnementClaude } from "../jeton-claude.ts";
import { DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE, variablesDeRelais, type Regle } from "../reseau.ts";
import type { Git, KitchenOptions } from "./kitchen.ts";

// The project's network allowlist, as its base branch declares it; unreadable or absent, the base hosts alone.
export async function projectHosts(git: Git, clone: string, base: string): Promise<Regle[]> {
  try {
    return reglesDuProjet(lireDeclaration(await git(clone, ["show", `origin/${base}:${DECLARATION_RESEAU}`])).hotes);
  } catch {
    return REGLES_DE_BASE;
  }
}

export type LaunchPlace = {
  project: string;
  env: NodeJS.ProcessEnv;
  claude: string;
  state: string;
  clone: string;
  worktrees: string;
  // Read at each launch: the allowlist changes with the base branch.
  hosts: () => Regle[];
  // What the sandbox detection looks at on this machine.
  probes: Sondes;
  // The station's gates file, and the project's port in it, read at each launch.
  portsFile?: string;
  portOf: () => number | null;
};

export function launcherOf(place: LaunchPlace): { launch: KitchenOptions["launch"] } | { refused: string } {
  const { env } = place;
  const cloison = configCloison(env, { repertoireEtat: place.state, clone: place.clone });
  let sandbox: BacASableLocal | null = null;
  if (place.probes.plateforme === PLATEFORME_LOCALE) {
    const lieux = { home: env.HOME, worktrees: place.worktrees, caches: lireCaches(env) };
    const verification = verifier(place.probes, lieux);
    if (!verification.ok) return { refused: `no agent launched: on macOS every agent runs inside Claude Code's sandbox, and it is not usable — ${verification.raison}` };
    sandbox = { version: verification.version, home: lieux.home as string, caches: lieux.caches, hotes: place.hosts };
  }
  return {
    launch: (_kind, cwd, write, calibration, input) => {
      // No BRIGADE_ variable and no GitHub token reach an agent: it reads its ticket from its input.
      const { GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...base } = environnementCook(env);
      const port = place.portOf();
      // On a station with gates, an agent never leaves without its project's.
      if (place.portsFile && port === null) throw new Error(`no network gate is open for ${place.project}: no agent leaves without one`);
      const agentEnv = environnementClaude({ ...base, ...(port === null ? {} : variablesDeRelais(port)) }, env);
      const args = dansLeBacASableLocal(sandbox, argumentsClaude(calibration), cwd, [], false, write);
      const launch = envelopper(cloison, { commande: place.claude, args }, { cwd, depot: write ? "ecriture" : "lecture" });
      return { command: launch.commande, args: launch.args, input, cwd, env: agentEnv, secrets: {} };
    },
  };
}

// The enclosure of the new kitchen's agents (`kitchen-launch.ts`): the `bwrap`
// partition on Linux (`cloison.ts`), unchanged; on macOS, Claude Code's
// sandbox, where each agent writes only in its worktree (nowhere for a
// read-only launch) and reaches only the hosts of the project's network
// allowlist. A Mac without a usable sandbox gets no enclosure: the project's
// kitchen launches no agent, and the reason says why.
import { configCloison, envelopper } from "../cloison.ts";
import { DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE, type Regle } from "../reseau.ts";
import type { Sondes } from "./detection.ts";
import { dansLeBacASableLocal, lireCaches, verifier, PLATEFORME_LOCALE, type BacASableLocal } from "./local.ts";

// The project's network allowlist, as its base branch declares it; unreadable or absent, the base hosts alone.
export async function projectHosts(git: (cwd: string, args: string[]) => Promise<string>, clone: string, base: string): Promise<Regle[]> {
  try {
    return reglesDuProjet(lireDeclaration(await git(clone, ["show", `origin/${base}:${DECLARATION_RESEAU}`])).hotes);
  } catch {
    return REGLES_DE_BASE;
  }
}

export type EnclosurePlace = {
  env: NodeJS.ProcessEnv;
  state: string;
  clone: string;
  worktrees: string;
  // Read at each launch: the allowlist changes with the base branch.
  hosts: () => Regle[];
  // What the sandbox detection looks at on this machine.
  probes: Sondes;
};

export type Wrap = (claude: string, args: string[], cwd: string, write: boolean) => { commande: string; args: string[] };

export function kitchenEnclosure(place: EnclosurePlace): { wrap: Wrap } | { refused: string } {
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
    wrap: (claude, args, cwd, write) => envelopper(cloison, { commande: claude, args: dansLeBacASableLocal(sandbox, args, cwd, [], false, write) }, { cwd, depot: write ? "ecriture" : "lecture" }),
  };
}

// The enclosure of the new kitchen's agents (`kitchen-launch.ts`): the `bwrap`
// partition on Linux (`cloison.ts`), unchanged; on macOS, Claude Code's
// sandbox, where each agent writes only in its worktree (nowhere for a
// read-only launch) and reaches only the hosts of the project's network
// allowlist. A Mac without a usable sandbox, or another station without
// `bwrap` (Windows, a Linux desktop), gets no enclosure: the project's kitchen
// launches no agent, and the reason says why.
import { configCloison, envelopper } from "../cloison.ts";
import { DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE, type Regle } from "../reseau.ts";
import type { Sondes } from "./detection.ts";
import { checkAnchor } from "./pf.ts";
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
    // The station's network is `pf`'s: no anchor, no cook.
    const anchor = checkAnchor(place.probes.ancrePf?.() ?? null);
    if (!anchor.ok) return { refused: `no agent launched: ${anchor.raison}` };
    sandbox = { sousPf: true, version: verification.version, home: lieux.home as string, caches: lieux.caches, hotes: place.hosts };
  } else if (cloison === null) {
    return { refused: `no agent launched: on ${place.probes.plateforme} every agent runs inside the bwrap partition, and BRIGADE_SANDBOX_BIN is not set` };
  }
  return {
    wrap: (claude, args, cwd, write) => envelopper(cloison, { commande: claude, args: dansLeBacASableLocal(sandbox, args, cwd, [], false, write) }, { cwd, depot: write ? "ecriture" : "lecture" }),
  };
}

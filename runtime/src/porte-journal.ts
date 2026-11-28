// Ce qu'une porte tient de la cuisine : sa liste blanche, que la cuisine publie
// dans `network.json`, et ses refus, qu'elle dit sur sa sortie. Les portes de
// la station (`station/portes.ts`) la lisent ainsi.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { AUTRES_HOTES, compterLesRefus, garderLaListe } from "./porte.ts";
import { DECLARATION_RESEAU, lireDeclaration, REGLES_DE_BASE, reglesDuProjet, type Regle } from "./reseau.ts";

// Ce que la liste se garde entre deux lectures du fichier. Un hôte
// fraîchement publié n'attend pas ce délai : la porte relit avant de refuser.
const RELECTURE_MS = 5000;
// Une relecture avant refus par seconde au plus : une rafale de refus ne fait
// pas relire le fichier à chaque connexion.
const RELECTURE_AVANT_REFUS_MS = 1000;

const dire = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// The allowlist the new kitchen publishes for its project, in its state
// directory (`kitchen/kitchen.ts`): `{ base, hosts, problems }`, like `network.declared`.
export const KITCHEN_ALLOWLIST = "network.json";

// Publishes what the base declares in `.claude/brigade/reseau` at `path`,
// where the project's gate reads it, only when it changed. `git` runs in the
// kitchen's clone. A failed read keeps the last list: it never closes the
// project's hosts.
export function allowlistPublisher(path: string, base: string, git: (args: string[]) => Promise<string>, log: (line: string) => void): () => Promise<void> {
  let unreadable: string | null = null;
  return async () => {
    try {
      await git(["fetch", "--quiet", "origin", base]).catch(() => "");
      const present = (await git(["ls-tree", `origin/${base}`, "--", DECLARATION_RESEAU])).trim() !== "";
      const { hotes, problemes } = lireDeclaration(present ? await git(["show", `origin/${base}:${DECLARATION_RESEAU}`]) : "");
      const declared = `${JSON.stringify({ base, hosts: hotes, problems: problemes })}\n`;
      unreadable = null;
      if (existsSync(path) && readFileSync(path, "utf8") === declared) return;
      writeFileSync(`${path}.${process.pid}`, declared, { mode: 0o644 });
      renameSync(`${path}.${process.pid}`, path);
      log(`network allowlist published — ${hotes.length} declared host${hotes.length === 1 ? "" : "s"}${problemes.length > 0 ? `, ${problemes.length} line${problemes.length === 1 ? "" : "s"} ignored` : ""}`);
    } catch (error) {
      if (dire(error) !== unreadable) log(`network declaration unreadable on ${base}, the last allowlist holds — ${dire(error)}`);
      unreadable = dire(error);
    }
  };
}

// La liste blanche du projet, lue du fichier que la cuisine publie (`published`).
// Avant sa première publication, le socle suffit à rapatrier le dépôt, d'où
// viendra le reste.
export function listePubliee(options: { avertir?: (message: string) => void; published?: string } = {}): (fraiches?: boolean) => Regle[] {
  return garderLaListe(
    (): Regle[] => {
      if (options.published !== undefined && existsSync(options.published)) {
        const { hosts } = JSON.parse(readFileSync(options.published, "utf8")) as { hosts?: unknown };
        if (!Array.isArray(hosts) || !hosts.every((hote) => typeof hote === "string")) throw new Error(`${options.published}: no list of hosts`);
        return reglesDuProjet(hosts);
      }
      return REGLES_DE_BASE;
    },
    { delaiMs: RELECTURE_MS, plancherFraisMs: RELECTURE_AVANT_REFUS_MS, avertir: options.avertir },
  );
}

// Ce qu'une porte fait d'un refus : une ligne de sa sortie, comptée — une par
// hôte et par dix minutes.
export function refusDeLaPorte(options: { dire?: (ligne: string) => void } = {}): (hote: string, port: number) => void {
  const ecrire = options.dire ?? ((ligne: string) => console.error(ligne));
  return compterLesRefus((refus) => {
    ecrire(`brigade : outgoing connection refused — ${refus.host === AUTRES_HOTES ? "other hosts still, no longer named" : `${refus.host}:${refus.port}`}${refus.count > 1 ? ` (${refus.count} attempts)` : ""}`);
  });
}

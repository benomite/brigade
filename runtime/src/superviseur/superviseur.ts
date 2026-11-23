// Le superviseur d'un projet (#3943, spec 2026-11-20-kitchen-spinning,
// section B) : à chaque observation du projet, il se réveille si l'une de ses
// causes tient (`declencheur.ts`), et remet alors au manager son dossier
// (`dossier.ts`) — un seul run par projet à la fois (`un-seul-run.ts`). Le
// manager rend ce qu'il a vu et l'un des six gestes du superviseur, que le run
// joue et dit en un seul commentaire sur le ticket où il a agi (`gestes.ts`,
// #3944). Il est branché sur la boucle du runtime par `brancher.ts` (#3945).
//
// Une même cause ne relance pas un run avant `REVEIL_REPRIS_MS` : un rail
// immobile, un ticket pris trois fois, une base rouge qui le restent ne font
// pas un run du manager à chaque réveil.
//
// Chaque geste fait entre au journal des gestes du superviseur (#4037), dans le
// répertoire d'état de ses sources, à l'heure de son horloge.
import { consignerGeste } from "../autonomie/agents/gestes.ts";
import { reveil, type FaitsDuProjet } from "./declencheur.ts";
import { dossierDuManager, type Dossier, type SourcesDuDossier } from "./dossier.ts";
import { jouerLeRun, type Decision, type GitHubDesGestes } from "./gestes.ts";
import { lancerUnSeulRun } from "./un-seul-run.ts";

export type OptionsDuSuperviseur = {
  projet: string;
  // Le dépôt GitHub du projet, `<propriétaire>/<nom>`.
  depot: string;
  sources: SourcesDuDossier & { github: GitHubDesGestes };
  manager: (dossier: Dossier) => Promise<Decision>;
  maintenant?: () => Date;
};

const REVEIL_REPRIS_MS = 30 * 60_000;

// Rend la promesse du run lancé, ou null quand rien ne part.
export function superviseur({ projet, depot, sources, manager, maintenant = () => new Date() }: OptionsDuSuperviseur): (faits: FaitsDuProjet) => Promise<void> | null {
  // La cause du dernier run lancé, et quand.
  let dernier: { cle: string; a: number } | null = null;
  return (faits) => {
    const instant = maintenant();
    const cause = reveil(faits, instant);
    const cle = JSON.stringify(cause);
    if (dernier !== null && dernier.cle === cle && instant.getTime() - dernier.a < REVEIL_REPRIS_MS) return null;
    const run = lancerUnSeulRun(projet, cause, async (lue) => {
      const decision = await manager(await dossierDuManager(sources, lue));
      const { gesture } = await jouerLeRun({ github: sources.github, depot, branche: sources.branche, maintenant: maintenant() }, lue, decision);
      if (gesture === null || sources.repertoireEtat === undefined) return;
      try {
        consignerGeste(sources.repertoireEtat, "supervisor", gesture, maintenant);
      } catch (erreur) {
        throw new Error(`its gesture was done but not logged (${gesture.line}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    });
    if (run !== null) dernier = { cle, a: instant.getTime() };
    return run;
  };
}

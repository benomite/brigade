// Le superviseur d'un projet (#3943, épique #3904) : à chaque observation du projet, il se réveille si l'une de ses
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
// répertoire d'état de ses sources, à l'heure de son horloge. Le run passe par
// la porte de son niveau d'autonomie (#4039, autonomie/agents/porte.ts) : sur
// « propose », il attend l'OK du chef ; sur « observe », il n'est que consigné.
import { OUTCOME } from "../autonomie/agents/gestes.ts";
import { porteDesGestes, type PorteDesGestes } from "../autonomie/agents/porte.ts";
import { reveil, type FaitsDuProjet, type Reveil } from "./declencheur.ts";
import { dossierDuManager, type Dossier, type SourcesDuDossier } from "./dossier.ts";
import { annonceDuGeste, direReveil, jouerLeRun, type Decision, type GitHubDesGestes } from "./gestes.ts";
import { lancerUnSeulRun } from "./un-seul-run.ts";

export type OptionsDuSuperviseur = {
  projet: string;
  // Le dépôt GitHub du projet, `<propriétaire>/<nom>`.
  depot: string;
  sources: SourcesDuDossier & { github: GitHubDesGestes };
  manager: (dossier: Dossier) => Promise<Decision>;
  maintenant?: () => Date;
  // La porte de ses gestes. Par défaut, celle du répertoire d'état de ses sources ; sans lui, ou nulle, le run se joue
  // sans porte ni journal.
  porte?: PorteDesGestes | null | undefined;
};

const REVEIL_REPRIS_MS = 30 * 60_000;

// Rend la promesse du run lancé, ou null quand rien ne part. `donne` : une cause
// comptée hors du déclencheur — un ticket sans progrès (#4027) —, à la place de la sienne.
export function superviseur({ projet, depot, sources, manager, maintenant = () => new Date(), porte = sources.repertoireEtat === undefined ? null : porteDesGestes({ repertoire: sources.repertoireEtat, projet, horloge: maintenant }) }: OptionsDuSuperviseur): (faits: FaitsDuProjet, donne?: Reveil) => Promise<void> | null {
  // La cause du dernier run lancé, et quand.
  let dernier: { cle: string; a: number } | null = null;
  return (faits, donne) => {
    const instant = maintenant();
    const cause = donne ?? reveil(faits, instant);
    const cle = JSON.stringify(cause);
    if (dernier !== null && dernier.cle === cle && instant.getTime() - dernier.a < REVEIL_REPRIS_MS) return null;
    const run = lancerUnSeulRun(projet, cause, async (lue) => {
      const decision = await manager(await dossierDuManager(sources, lue));
      const jouer = () => jouerLeRun({ github: sources.github, depot, branche: sources.branche, maintenant: maintenant() }, lue, decision);
      if (porte === null) {
        await jouer();
        return;
      }
      // Le run fait, son journal garde ce que le run dit avoir fait (`jouerLeRun`), et son issue.
      const annonce = { line: annonceDuGeste(decision.gesture), reason: direReveil(lue), outcome: OUTCOME.FIXED_BY_SELF };
      await porte.passer({ agent: "supervisor", reglable: "supervisor" }, annonce, jouer, ({ gesture }) => gesture);
    });
    if (run !== null) dernier = { cle, a: instant.getTime() };
    return run;
  };
}

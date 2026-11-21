// Le superviseur d'un projet (#3943, spec 2026-11-20-kitchen-spinning,
// section B) : à chaque observation du projet, il se réveille si l'une de ses
// causes tient (`declencheur.ts`), et remet alors au manager son dossier
// (`dossier.ts`) — un seul run par projet à la fois (`un-seul-run.ts`). Le
// manager rend ce qu'il a vu et l'un des six gestes du superviseur, que le run
// joue et dit en un seul commentaire sur le ticket où il a agi (`gestes.ts`,
// #3944).
// Le brancher à la station est le travail d'un ticket suivant de l'épique #3914.
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

// Rend la promesse du run lancé, ou null quand rien ne part.
export const superviseur =
  ({ projet, depot, sources, manager, maintenant = () => new Date() }: OptionsDuSuperviseur) =>
  (faits: FaitsDuProjet): Promise<void> | null =>
    lancerUnSeulRun(projet, reveil(faits, maintenant()), async (cause) => {
      const decision = await manager(await dossierDuManager(sources, cause));
      await jouerLeRun({ github: sources.github, depot, branche: sources.branche, maintenant: maintenant() }, cause, decision);
    });

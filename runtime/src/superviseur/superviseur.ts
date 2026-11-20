// Le superviseur d'un projet (#3943, spec 2026-11-20-kitchen-spinning,
// section B) : à chaque observation du projet, il se réveille si l'une de ses
// causes tient (`declencheur.ts`), et remet alors au manager son dossier
// (`dossier.ts`) — un seul run par projet à la fois (`un-seul-run.ts`).
// Le brancher à la station est le travail d'un ticket suivant de l'épique #3914.
import { reveil, type FaitsDuProjet } from "./declencheur.ts";
import { dossierDuManager, type Dossier, type SourcesDuDossier } from "./dossier.ts";
import { lancerUnSeulRun } from "./un-seul-run.ts";

export type OptionsDuSuperviseur = {
  projet: string;
  sources: SourcesDuDossier;
  manager: (dossier: Dossier) => Promise<void>;
  maintenant?: () => Date;
};

// Rend la promesse du run lancé, ou null quand rien ne part.
export const superviseur =
  ({ projet, sources, manager, maintenant = () => new Date() }: OptionsDuSuperviseur) =>
  (faits: FaitsDuProjet): Promise<void> | null =>
    lancerUnSeulRun(projet, reveil(faits, maintenant()), async (cause) => manager(await dossierDuManager(sources, cause)));

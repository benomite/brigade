// L'installation que l'étage commun regarde : la station de
// `BRIGADE_STATION_DIR`, les projets de sa configuration, et le carnet de
// chacun tel que la branche d'intégration le porte dans son clone. Lecture
// seule : rien ne s'écrit ici, ni dans un clone ni au journal d'un projet.
import { join } from "node:path";
import type { LeconRecue } from "../apprentissage/injection.ts";
import { CARNET_PATH, parseCarnet, type Carnet } from "../carnet/carnet.ts";
import { lireALaBase } from "../depot.ts";
import { avecLaBrancheDuDepot } from "../reglages-projet/en-vigueur.ts";
import { CONFIGURATION, environnementDuProjet, lireFichierDeConfiguration, type ProjetConfigure } from "../station/configuration.ts";
import { ecrireEtage, idsServis, leconsCommunes, lireEtage, servirUnTicket } from "./etage.ts";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les projets de l'installation : les lignes lisibles de sa configuration.
export function projetsDeLInstallation(racine: string): ProjetConfigure[] {
  return lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets;
}

export type CarnetsDeLInstallation = {
  carnets: Array<{ projet: string; carnet: Carnet }>;
  // Les projets dont le carnet ne se lit pas — pas de clone, un fichier
  // illisible : ils ne comptent pour aucune proposition, et c'est dit.
  illisibles: Array<{ projet: string; raison: string }>;
};

// Le carnet de chaque projet, à sa base. Un projet dont la base ne porte pas
// de carnet n'a aucune leçon promue.
export function carnetsDeLInstallation(racine: string, env: Record<string, string | undefined>): CarnetsDeLInstallation {
  const lus: CarnetsDeLInstallation = { carnets: [], illisibles: [] };
  for (const projet of projetsDeLInstallation(racine)) {
    try {
      const { BRIGADE_REPO_DIR: clone = "", BRIGADE_BASE_BRANCH: base } = avecLaBrancheDuDepot(environnementDuProjet(racine, projet, env));
      if (!base) throw new Error("its integration branch is set neither by its repository nor by its configuration line");
      const texte = lireALaBase({ clone, base }, CARNET_PATH);
      lus.carnets.push({ projet: projet.nom, carnet: texte === null ? { lessons: [] } : parseCarnet(texte) });
    } catch (erreur) {
      lus.illisibles.push({ projet: projet.nom, raison: message(erreur) });
    }
  }
  return lus;
}

// Les leçons de l'étage commun que reçoit un cook de cette installation, ou
// aucune hors d'une station (`racine` absente).
export function leconsDeLEtageCommun(racine: string | undefined): LeconRecue[] {
  if (!racine) return [];
  return leconsCommunes(lireEtage(racine), projetsDeLInstallation(racine).length);
}

// Ce que la pass demande à l'étage quand un ticket est servi : les ids qu'une
// rétro peut reconfirmer (aucun hors d'une station, ou si l'étage est illisible).
export function idsDeLEtageCommun(racine: string | undefined): string[] {
  if (!racine) return [];
  try {
    return idsServis(lireEtage(racine));
  } catch {
    return [];
  }
}

// Un ticket est servi, sa rétro a retenu `kept` : l'étage compte ce ticket, les
// leçons reconfirmées repartent, les autres vieillissent et expirent au besoin.
// Rend les ids qui viennent d'expirer. Un étage illisible n'est pas réécrit.
export function noterUnTicketServi(racine: string, kept: ReadonlyArray<{ kind: string; id?: string }>, expiration: number, date: string): string[] {
  const reconfirmees = kept.flatMap((e) => (e.kind === "reconfirm" && e.id !== undefined ? [e.id] : []));
  const { etage, expirees } = servirUnTicket(lireEtage(racine), { reconfirmees, expiration, date });
  ecrireEtage(racine, etage);
  return expirees.flatMap((l) => (l.id === undefined ? [] : [l.id]));
}

// La page d'un projet pas encore prêt (#3166) : « Add a project » ouvert par le « + », le dépôt `chef/cantine` choisi
// d'un clic — le compte peut y écrire. Sa lecture arrivée, sa page s'ouvre sur la question, à la place du rail : qui le
// cuit, puis sa mise en place s'il le faut, puis prêt. Le second de « cantine » est à droite ; le titre que `claude`
// donne à son terminal dit s'il tourne.
import { TITRE as TITRE_DE_LA_PR_DE_SETUP } from "../../../runtime/src/second-init/pr-de-setup.ts";
import type { Projet } from "../../../app/src/config.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COMPTE } from "./premier-lancement-commun.ts";

const CANTINE: Projet = { ...(PROJETS.find(({ nom }) => nom === "cantine") ?? PROJETS[0]!), depot: "chef/cantine", base: "main" };
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
// Ce que le second affiche : `claude` qui lit le dépôt, le titre de son terminal au travail (« ◐ »). Pas un vrai.
const ECRAN_DU_SECOND = ["\x1b]0;◐ Setting up cantine for Brigade\x07\x1b[1msecond · cantine\x1b[0m", "", "  Reading chef/cantine: its default branch, its test scripts, its folders…", ""].join("\r\n");

// Le choix recommandé de « qui le cuit » : le premier bouton — cet ordinateur, aucune station du compte n'étant en ligne.
export const CHOISIR_LE_RECOMMANDE: Etape = { cliquer: "#parcours-premier-projet .choix-de-station li:first-child button" };

// `pret` : ce que la lecture de la mise en place rend — prêt, ou ce qui manque. `prDeSetup` : la PR de mise en place
// ouverte, sa carte attend le chef dans Awaiting you (#3169).
// `depart` : ce que le second propose des issues ouvertes (#3268) — aucune, par défaut : la page va droit à la question.
// `premier` : ce que le second rédige du premier ticket, et ce que sa création rend (#3306).
export function parcoursPremierProjet(dit: string, pret: boolean, etapes: Etape[] = [], prDeSetup = false, depart: unknown = { aucune: true }, premier: Record<string, unknown> = {}): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: "#entree-ajout" }, { cliquer: '#ajout li[data-depot="chef/cantine"] button' }, ...etapes],
    donnees: () => {
      // Un dépôt qu'aucune station ne cuit encore : son rail lu sur GitHub, ni `status` ni `station` d'une station.
      const faits = RENDUS.cantine!.facts;
      const attend = prDeSetup ? [{ ticket: 6, titre: TITRE_DE_LA_PR_DE_SETUP, url: "https://github.com/chef/cantine/issues/6" }] : (faits.attend ?? []);
      const envois = cuisine({ cantine: { facts: { ...faits, attend, compteurs: { ...faits.compteurs, attend: attend.length } }, status: "", station: "" } });
      return {
        maintenant: MAINTENANT,
        reponses: {
          // Aucune station ne le sert encore : celles du compte lues, aucune n'a « cantine ».
          demarrage: { ...demarrage(configuration([CANTINE])), stations: { a: MAINTENANT, stations: [] } },
          compteGitHub: COMPTE,
          depotsDuChef: { depots: [{ depot: "chef/cantine", base: "main" }, { depot: "atelier-org/escale", base: "trunk" }] },
          ouvrirDUneStation: { state: "open", project: "cantine", repository: "chef/cantine", folder: "/Users/chef/Brigade/cantine", cloned: false },
          stationsDuCompte: { state: "listed", stations: [], unreadable: [] },
          projetsServis: { depots: [] },
          servirUnProjet: { depots: ["chef/cantine"] },
          checkRepoSetup: pret ? { ready: true, missingBindings: [], missingLabels: [] } : { ready: false, missingBindings: ["Branche d'intégration", "Gates", "Zones de fichiers"], missingLabels: ["fire", "taken"] },
          departDuProjet: depart,
          ...premier,
          espace: [SECOND],
        },
        envois: { ...envois, regarder: { ...envois.regarder, cantine: [...(envois.regarder?.cantine ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
      };
    },
  };
}

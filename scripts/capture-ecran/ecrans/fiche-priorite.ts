// La fiche de #22, `prio:2` dans la file de « parade » : `1` choisi, « change the priority » cliqué (#1739) — l'app a
// remplacé le label `prio:` de l'issue sur GitHub, sans la box ; la fiche le dit, et le rail redessiné par main.ts montre
// `prio:1`, tant que le tableau de la cuisine montre encore `prio:2`.
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { situationDe } from "../../../app/src/histoire.ts";
import { tenirPrioritesEcrites } from "../../../app/src/priorite.ts";
import { carteDe, configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { CARTE, FACTS, STATUS } from "./rail-file-commun.ts";

const PARADE = { ...(RENDUS.parade as Rendu), facts: FACTS, status: STATUS };

// Ce que le process principal rend du geste (main.ts, `gesteDeFiche`) : fait, ou refusé. `ecrite` : la priorité que
// l'app a écrite sur l'issue de #22, que main.ts fait montrer au rail — rien, en échec.
export function fichePriorite(dit: string, rendu: { fait: string; detail: string } | { refus: string; detail: string }, ecrite?: number): Ecran {
  const ecrites = tenirPrioritesEcrites();
  if (ecrite !== undefined) ecrites.ecrite("parade", 22, ecrite, 2);
  const montree = (projet: string) => ecrites.de(projet);
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [
      { cliquer: '#projets > button[title^="parade — "]' },
      { cliquer: CARTE(3) },
      { saisir: '#fiche li[data-geste="priorite"] select', texte: "1" },
      { cliquer: '#fiche li[data-geste="priorite"] button' },
    ],
    donnees: () => {
      const carte = carteDe(PARADE, "parade", 22, montree);
      return {
        maintenant: MAINTENANT,
        reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], situation: situationDe(carte), gestesDeFiche: gestesDeCarte(carte), gesteDeFiche: rendu },
        envois: cuisine({ ...RENDUS, parade: PARADE }, montree),
      };
    },
  };
}

export const ecran: Ecran = fichePriorite(
  "La fiche de #22, `prio:2` dans la file de « parade » : `1` choisi, « change the priority » cliqué (#1739) — le label changé sur GitHub, sans la box, la fiche montre `prio:1`",
  { fait: "priority changed on GitHub: #22 now carries `prio:1` — the box reorders the rail when it reads it", detail: "https://github.com/chef/parade/issues/22" },
  1,
);

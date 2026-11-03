// L'espace de « parade », son disjoncteur ouvert après trois échecs d'affilée (#2140, épique #2134) : la ligne du
// disjoncteur, en tête de TODO, avec son seul bouton « Resume » — un clic poste `/resume` sur l'issue
// `brigade:breaker-open` de la cuisine, sur GitHub. `status` porte la ligne `kitchen` et le bloc `awaiting` tels que le
// runtime les écrit (runtime/src/etat.ts, runtime/src/attend.ts) ; `facts`, l'état `retenue`.
// `todo-disjoncteur-reprise` : le même, « Resume » cliqué — l'app a posté le commentaire, la ligne dit « Resume requested ».
// `todo-disjoncteur-echec` : le même, GitHub n'a pas pris le commentaire — la ligne le dit, et « Resume » est rendu.
import type { RenduDeLaReprise } from "../../../app/src/github/breaker-resume.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;

const STATUS = [
  "project    parade",
  "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)",
  "",
  "awaiting   1 decision awaits the chef for 1 h 00",
  "  breaker  breaker open: 3 failures in a row (threshold 3) — #21: exit 1, 12 turns, 48000 tokens; #22: exit 1, 9 turns, 31000 tokens; #25: exit 1, 4 turns, 12000 tokens — no cook leaves any more — to do: `brigade parade guardrails resume` after looking at what fails",
  "end awaiting",
  ...PARADE.status.split("\n").slice(6),
].join("\n");

const PARADE_DISJONCTEE: Rendu = { ...PARADE, facts: { ...PARADE.facts, etat: "retenue" }, status: STATUS, manager: MANAGER_ALLUME };

// Ce que le process principal rend de « Resume » (main.ts, `reprendreLeDisjoncteur`) : absent, le bouton n'est pas cliqué.
export function todoDisjoncteur(dit: string, rendu?: RenduDeLaReprise): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, ...(rendu === undefined ? [] : [{ cliquer: ".ligne-disjoncteur button.recommande" }])],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], ...(rendu === undefined ? {} : { reprendreLeDisjoncteur: rendu }) },
      envois: cuisine({ ...RENDUS, parade: PARADE_DISJONCTEE }),
    }),
  };
}

export const ecran: Ecran = todoDisjoncteur("L'espace de « parade », son disjoncteur ouvert après trois échecs (#2140) : la ligne du disjoncteur en tête de TODO, et son bouton « Resume »");

// L'espace de « parade », sa bande d'alertes pleine (#907) : la cuisine retenue par la connexion Max
// tombée et par sa base rouge, le grant `merge` éteint seul — et le manager allumé. Ce que la box
// rend de plus que la cuisine figée tient dans `status` et l'état `retenue` de `facts`, mot pour mot.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

// Les lignes de tête de `status` que la bande lit (runtime/src/etat.ts, `decrireEtat`), en tête de celui de la cuisine figée —
// telles que le runtime les écrit depuis #928 : en anglais.
export const STATUS_EN_PANNE = [
  "projet     parade",
  "kitchen    held",
  "connection Max EXPIRED for 18 min on box/claude (session expired) — no ticket is taken any more: `claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”",
  "base       RED since 1 h 10 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "           replay its gates without waiting for a commit: brigade parade base replay",
  "grant      merge LAPSED 40 min ago — its deadline has passed: the pass stops at the open PR, nothing is merged without you any more",
  ...PARADE.status.split("\n").slice(2),
].join("\n");

export const PARADE_EN_PANNE: Rendu = { ...PARADE, facts: { ...PARADE.facts, etat: "retenue" }, status: STATUS_EN_PANNE, manager: MANAGER_ALLUME };

export const ecran: Ecran = {
  dit: "L'espace de « parade », sa bande d'alertes pleine : connexion Max tombée, base rouge, grant `merge` éteint seul, manager allumé",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_PANNE }),
  }),
};

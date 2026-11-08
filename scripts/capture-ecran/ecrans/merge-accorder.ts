// L'espace de « parade », son grant `merge` éteint de lui-même (#907), l'interrupteur cliqué : la
// confirmation d'accorder, telle que confirmation.ts la dit.
import { confirmationDe } from "../../../app/src/confirmation.ts";
import { configuration, CUISINE, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = PROJETS[0];
if (PARADE === undefined) throw new Error("pas de parade dans la cuisine figée");
const RENDU = RENDUS.parade as Rendu;

// Les lignes de tête de `status` que la bande lit (runtime/src/etat.ts, `decrireEtat`), en tête de celui de la cuisine figée —
// telles que le runtime les écrit depuis #928 : en anglais.
const STATUS_EN_PANNE = [
  "project    parade",
  "kitchen    held",
  "connection Max EXPIRED for 18 min on box/claude (session expired) — no ticket is taken any more: `claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”",
  "base       RED since 1 h 10 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "           replay its gates without waiting for a commit: brigade parade base replay",
  "grant      merge LAPSED 40 min ago — its deadline has passed: the pass stops at the open PR, nothing is merged without you any more",
  ...RENDU.status.split("\n").slice(2),
].join("\n");

const PARADE_EN_PANNE: Rendu = { ...RENDU, facts: { ...RENDU.facts, etat: "retenue" }, status: STATUS_EN_PANNE, manager: MANAGER_ALLUME };

export const ecran: Ecran = {
  dit: "L'espace de « parade », son grant `merge` éteint seul, l'interrupteur cliqué : la confirmation d'accorder",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#interrupteur-merge .bascule" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      confirmer: confirmationDe("grant-activer", PARADE, { faits: PARADE_EN_PANNE.facts, a: MAINTENANT }, "merge", CUISINE),
    },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_PANNE }),
  }),
};

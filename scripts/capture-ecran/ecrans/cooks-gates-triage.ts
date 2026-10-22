// L'onglet Cooks de « parade » avec le budget des gates et le triage, jour par jour (#1457, épique #1454) : le dernier
// passage face au budget, le run de la base et le ticket que la cuisine a ouvert seule, au-dessus de l'heure et du
// jour ; le triage replié sous les rôles. Le reste est `cooks-activite`.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as ACTIVITE } from "./cooks-activite.ts";
import { COUT_DES_GATES } from "./file-gates.ts";
import { FACTS as TRIAGE } from "./file-triage.ts";

const PARADE = RENDUS.parade as Rendu;
export const FACTS = { ...ACTIVITE, coutDesGates: COUT_DES_GATES, triage: (TRIAGE as { triage?: unknown }).triage } as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : ses gates face au budget (dernier passage, run de la base, ticket ouvert seul) puis l'heure et le jour, et le triage jour par jour replié sous les rôles",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};

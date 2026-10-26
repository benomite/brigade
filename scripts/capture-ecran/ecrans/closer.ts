// Le closer de « parade » (#990), section de son onglet Cooks sous ses gates depuis #1699 — il était Settings → Closer :
// ce que la dernière observation du closer a repéré, lu dans l'objet que `closing --json` écrit sur une ligne
// (runtime/src/fermeture-lecture/lecture.ts) — les merges depuis le dernier nettoyage, le rapport ajouté / retiré, les
// doublons et les exports morts. La lecture de l'onglet est `station`, `measures` puis `closing --json`
// (lecture-de-cooks.ts).
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COOKS, luDeCooks, OBSERVEE } from "./lecture-de-cooks.ts";

export { COOKS, OBSERVEE };

// Ce que la lecture de l'onglet Cooks envoie à la vue, `closing --json` rendant cet objet.
export const lu = (objet: unknown): Envoi => luDeCooks(objet);

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses gates, les quatre chiffres de la dernière observation du closer, la liste repliée",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { [COOKS]: [lu(OBSERVEE)] } },
  }),
};

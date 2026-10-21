// Ce que les écrans de la file sur le téléphone partagent (#1163) : la cuisine de `file-ou-cuit` — dans TODO, #12
// attend la décision du chef ; #14 cuit sur la box et #15 sur le Mac, qui le disent (`cuisson`, #1183) —, reçue par
// l'app Android appairée à la box, en largeur de téléphone. La vue est celle du desktop, et ce qu'elle reçoit est
// calculé par les mêmes modules : seul le démarrage est celui du téléphone — appairé, sans code d'app ni stations lues.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Donnees, type Etape, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS, STATUS } from "./file-ou-cuit.ts";
import { ADRESSE } from "./telephone-commun.ts";

// La case de `parade` dans la barre, en haut sur un téléphone : son espace s'ouvre sur Rail.
export const OUVRIR_PARADE: Etape = { cliquer: '#projets > button[title^="parade — "]' };
// L'onglet Cooks de son espace : Rail, Cooks, Second.
export const OUVRIR_COOKS: Etape = { cliquer: "#onglets-du-projet > button:nth-child(2)" };

export const FAITS: Faits = { ...FACTS, stations: (FACTS.stations ?? []).map((station) => ({ ...station, cuisson: "cooking", arreteeDepuis: null, refus: null })) };

export function donneesDeLaFile(): Donnees {
  const tout = demarrage(configuration(PROJETS));
  return {
    maintenant: MAINTENANT,
    reponses: {
      demarrage: { ...tout, configuration: { ...tout.configuration, chemin: "no projects file on this phone" }, code: undefined, stations: undefined, projetsDesStations: undefined, telephone: { appaire: true, station: "box", adresse: ADRESSE } },
      espace: [],
    },
    envois: cuisine({ ...RENDUS, parade: { ...(RENDUS.parade as Rendu), facts: FAITS, status: STATUS } }),
  };
}

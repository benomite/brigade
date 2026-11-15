// Une seule station par ordinateur (#3630, épique #3629). La station de cet ordinateur tourne en fond, sans l'app : lancée
// à l'ouverture de session, par l'app qui la trouve arrêtée, ou par l'installeur de docs/installation-station.md. Quel
// que soit celui qui la lance, un second process de station sur le même répertoire refuse de démarrer : deux stations
// d'un même répertoire serviraient deux fois les mêmes projets.
//
// Le verrou est celui des projets (../verrou.ts) : une transaction SQLite tenue toute la vie du process, que le noyau
// rend à sa mort — un `kill -9` ne laisse aucun verrou orphelin. Il est tenu sous `station-seule/` du répertoire.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { prendreVerrou, VerrouTenu, type Verrou } from "../verrou.ts";

const DOSSIER = "station-seule";
// Les verrous tenus par ce process. Retenus ici : un verrou que plus rien ne référence serait ramassé, sa base fermée, et
// la station suivante démarrerait à côté de celle qui tourne.
const tenus = new Set<Verrou>();

// Prend la station de ce répertoire pour ce process, ou dit qu'une autre la tient déjà. Un répertoire qui ne s'écrit
// pas lève : la station ne démarre pas non plus.
export function garderLaStationSeule(racine: string): Verrou | { refus: string } {
  const dossier = join(racine, DOSSIER);
  mkdirSync(dossier, { recursive: true });
  try {
    const verrou = prendreVerrou(dossier);
    const tenu: Verrou = {
      relacher() {
        tenus.delete(tenu);
        verrou.relacher();
      },
    };
    tenus.add(tenu);
    return tenu;
  } catch (erreur) {
    if (erreur instanceof VerrouTenu) return { refus: `une autre station tourne déjà sur ${racine} — une seule par ordinateur` };
    throw erreur;
  }
}

// Les projets d'une station, tels que son guichet les rend au téléphone
// appairé (#1411) : chacun de sa configuration, et la file de chacun.
//
// La file d'un projet est ce que l'app de l'ordinateur lit sur la station pour
// le même projet — `facts` et `status`, par le geste de la station
// (`station/geste.ts`) —, lu à la même source et de la même façon : la même
// ligne de configuration, le même environnement (`environnementDeLaCommande`),
// et les mêmes fonctions que ces deux commandes (`lireLesFaits`,
// `photoDuProjet`). Seul le process change : le guichet les lit dans celui de
// la station, sans en lancer un. Le téléphone et l'ordinateur qui lisent au
// même instant lisent donc la même file.
//
// La liste est celle de la configuration de la station, dans son ordre : un
// projet que la station refuse y est aussi, avec la raison du refus — le chef
// le voit de son téléphone comme de son ordinateur.
import { join } from "node:path";
import { lireLesFaits } from "../faits.ts";
import { CONFIGURATION, environnementDeLaCommande, lireFichierDeConfiguration } from "../station/configuration.ts";
import { photoDuProjet } from "../status.ts";

// `served` : la station le sert ; `refused` : elle refuse de le servir, et
// `reason` dit pourquoi ; `opening` : il vient d'entrer dans sa configuration,
// elle ne l'a pas encore ouvert.
export type EtatDuProjet = "served" | "refused" | "opening";

export type ProjetDuTelephone = { name: string; repository: string; state: EtatDuProjet; reason?: string };

// La file d'un projet : `facts`, l'objet que la commande écrit, et `status`,
// ce qu'elle écrit, au caractère près — ce que l'app de l'ordinateur lit.
export type FileDuProjet = { project: string; repository: string; facts: Record<string, unknown>; status: string };

export type ProjetsDuTelephone = {
  liste(): ProjetDuTelephone[];
  // La file du projet de ce nom, ou null s'il n'est pas de la configuration.
  // Lève `LectureImpossible` (`appel.ts`) quand son journal ne se lit pas.
  file(nom: string): FileDuProjet | null;
};

// Ce que la station sait de ce qu'elle sert (`station/station.ts`).
export type ServisParLaStation = { projets(): string[]; refuses(): Record<string, string> };

export type OptionsProjets = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // L'environnement de la station, que chaque projet hérite.
  env: Record<string, string | undefined>;
  station: ServisParLaStation;
  maintenant?: () => Date;
};

export function projetsDeLaStation(options: OptionsProjets): ProjetsDuTelephone {
  const { racine, env, station } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const configures = () => lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets;

  return {
    liste() {
      const servis = new Set(station.projets());
      const refuses = station.refuses();
      return configures().map(({ nom, depot }) => {
        if (servis.has(nom)) return { name: nom, repository: depot, state: "served" as const };
        const motif = refuses[nom];
        return motif === undefined ? { name: nom, repository: depot, state: "opening" as const } : { name: nom, repository: depot, state: "refused" as const, reason: motif };
      });
    },
    file(nom) {
      const projet = configures().find((candidat) => candidat.nom === nom);
      if (projet === undefined) return null;
      const sien = environnementDeLaCommande(racine, projet, env);
      const instant = maintenant();
      const facts = lireLesFaits(sien, instant);
      // Ce que `status` écrit : une ligne de sortie par ligne de la photo.
      const status = photoDuProjet(sien, { maintenant: instant })
        .map((ligne) => `${ligne}\n`)
        .join("");
      return { project: projet.nom, repository: projet.depot, facts, status };
    },
  };
}

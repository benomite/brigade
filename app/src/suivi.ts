// Le fichier des projets, suivi tant que l'app est ouverte : créé s'il manque,
// relu dès qu'il change. Une relecture refusée — un fichier qu'un éditeur est
// en train d'écrire — ne retire rien : les projets d'avant restent.
import { realpathSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { ajouterProjet, creerConfiguration, lireConfiguration, type Configuration, type Declare } from "./config.ts";

export function suivreConfiguration(options: {
  chemin: string;
  maison?: string;
  // `partis` : les projets d'avant qui ne sont plus dans la liste, ou plus dans le même dossier.
  surChangement(configuration: Configuration, partis: string[]): void;
}) {
  const { chemin, maison = homedir() } = options;
  // Tant que l'app n'a jamais eu le fichier, elle le crée — et le retente à chaque
  // relecture : une création refusée garde sa raison, et aboutit dès qu'elle le peut.
  let pose = false;
  let veille: FSWatcher | undefined;

  function lire(): Configuration {
    if (!pose) {
      const refus = creerConfiguration(chemin);
      if (refus !== undefined) return { chemin, projets: [], refus };
      pose = true;
    }
    veiller();
    return lireConfiguration(chemin, maison);
  }

  // C'est le dossier qui est veillé : un éditeur qui remplace le fichier au lieu
  // de l'écrire reste suivi. Et le vrai dossier, si le fichier est atteint par un
  // lien. Un fichier parti entre-temps n'a pas de vrai dossier : la relecture
  // suivante repose la veille.
  function veiller(): void {
    if (veille !== undefined) return;
    try {
      const vrai = realpathSync(chemin);
      veille = watch(dirname(vrai), (_, fichier) => {
        if (fichier === null || fichier === basename(vrai)) relire();
      });
    } catch {
      veille = undefined;
    }
  }

  function relire(): void {
    const lue = lire();
    const suivante: Configuration = lue.refus !== undefined && tenue.refus === undefined ? { chemin, projets: tenue.projets, nonRelu: lue.refus } : lue;
    // Un éditeur écrit en plusieurs fois, et la veille le dit autant de fois.
    if (JSON.stringify(suivante) === JSON.stringify(tenue)) return;
    const partis = tenue.projets.filter((avant) => !suivante.projets.some((apres) => apres.nom === avant.nom && apres.dossier === avant.dossier)).map(({ nom }) => nom);
    tenue = suivante;
    options.surChangement(tenue, partis);
  }

  let tenue = lire();

  return {
    configuration: (): Configuration => tenue,
    relire,
    // Rend la raison, si le projet n'a pas été ajouté.
    ajouter(projet: Declare): string | undefined {
      // L'ajout part de ce que le fichier dit maintenant, pas de ce que la veille en a vu.
      // Un fichier que l'app tient encore sans avoir pu le relire — supprimé, cassé —
      // n'est pas réécrit : ce serait y perdre les projets qu'elle affiche.
      relire();
      if (tenue.nonRelu !== undefined) return `l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — ${tenue.nonRelu}`;
      const refus = ajouterProjet(chemin, projet, maison);
      if (refus === undefined) relire();
      return refus;
    },
    fermer(): void {
      veille?.close();
    },
  };
}

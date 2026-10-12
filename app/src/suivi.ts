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
  const creation = creerConfiguration(chemin);
  let tenue: Configuration = creation === undefined ? lireConfiguration(chemin, maison) : { chemin, projets: [], refus: creation };

  function relire(): void {
    const lue = lireConfiguration(chemin, maison);
    const suivante: Configuration = lue.refus !== undefined && tenue.refus === undefined ? { chemin, projets: tenue.projets, nonRelu: lue.refus } : lue;
    // Un éditeur écrit en plusieurs fois, et la veille le dit autant de fois.
    if (JSON.stringify(suivante) === JSON.stringify(tenue)) return;
    const partis = tenue.projets.filter((avant) => !suivante.projets.some((apres) => apres.nom === avant.nom && apres.dossier === avant.dossier)).map(({ nom }) => nom);
    tenue = suivante;
    options.surChangement(tenue, partis);
  }

  // C'est le dossier qui est veillé : un éditeur qui remplace le fichier au lieu
  // de l'écrire reste suivi. Et le vrai dossier, si le fichier est atteint par un lien.
  let veille: FSWatcher | undefined;
  if (creation === undefined) {
    const vrai = realpathSync(chemin);
    veille = watch(dirname(vrai), (_, fichier) => {
      if (fichier === null || fichier === basename(vrai)) relire();
    });
  }

  return {
    configuration: (): Configuration => tenue,
    relire,
    // Rend la raison, si le projet n'a pas été ajouté.
    ajouter(projet: Declare): string | undefined {
      const refus = ajouterProjet(chemin, projet, maison);
      if (refus === undefined) relire();
      return refus;
    },
    fermer(): void {
      veille?.close();
    },
  };
}

// Le fichier des projets, suivi tant que l'app est ouverte : créé s'il manque,
// relu dès qu'il change. Une relecture refusée — un fichier qu'un éditeur est
// en train d'écrire — ne retire rien : les projets d'avant restent.
import { realpathSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { ajouterProject, changerBarDeMenus, changerCouleur, changerOrdinaires, changerSigle, colorerProjects, creerConfiguration, lireConfiguration, poserPreferences, preferencesDuFichier, rangerProject, retirerProject, type Configuration, type Declare } from "./config.ts";
import type { Role } from "./couleurs.ts";
import type { Preferences } from "./settings-perso/partage.ts";

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
  let standby: FSWatcher | undefined;

  function lire(): Configuration {
    if (!pose) {
      const refusal = creerConfiguration(chemin);
      if (refusal !== undefined) return { chemin, projets: [], refus: refusal };
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
    if (standby !== undefined) return;
    try {
      const vrai = realpathSync(chemin);
      standby = watch(dirname(vrai), (_, fichier) => {
        if (fichier === null || fichier === basename(vrai)) relire();
      });
    } catch {
      standby = undefined;
    }
  }

  function relire(): void {
    const lue = lire();
    const suivante: Configuration = lue.refus !== undefined && tenue.refus === undefined ? { ...tenue, nonRelu: lue.refus } : lue;
    // Un éditeur écrit en plusieurs fois, et la veille le dit autant de fois.
    if (JSON.stringify(suivante) === JSON.stringify(tenue)) return;
    const partis = tenue.projets.filter((avant) => !suivante.projets.some((apres) => apres.nom === avant.nom && apres.dossier === avant.dossier)).map(({ nom: name }) => name);
    tenue = suivante;
    options.surChangement(tenue, partis);
  }

  let tenue = lire();

  const nonRelu = () => `the app does not write to a file it could not re-read — ${tenue.nonRelu}`;
  // Une écriture part de ce que le fichier dit maintenant, pas de ce que la veille en a vu.
  // Un fichier que l'app tient encore sans avoir pu le relire — supprimé, cassé —
  // n'est pas réécrit : ce serait y perdre les projets qu'elle affiche.
  function ecrire(action: () => string | undefined): string | undefined {
    relire();
    if (tenue.nonRelu !== undefined) return nonRelu();
    const refusal = action();
    if (refusal === undefined) relire();
    return refusal;
  }

  return {
    configuration: (): Configuration => tenue,
    relire,
    // Rend la raison, si le projet n'a pas été ajouté.
    ajouter: (project: Declare) => ecrire(() => ajouterProject(chemin, project, maison)),
    // Tire et écrit les couleurs qui manquent aux projets du fichier — rien, s'il n'en manque
    // aucune. Rend la raison, si elles ne l'ont pas été.
    colorer: (hasard?: () => number) => ecrire(() => colorerProjects(chemin, maison, hasard)),
    // Change la couleur d'onglet ou d'accent d'un projet. Rend la raison, si elle ne l'a pas été.
    changerCouleur: (name: string, role: Role, couleur: string) => ecrire(() => changerCouleur(chemin, name, role, couleur, maison)),
    // Change le sigle d'un projet dans la barre — `null` le rend à celui que l'app tire de son nom. Rend la raison, s'il ne l'a pas été.
    changerSigle: (name: string, sigle: unknown) => ecrire(() => changerSigle(chemin, name, sigle, maison)),
    // Montre ou retire l'état de la cuisine de la barre des menus (bar-de-menus.ts). Rend la raison, si rien n'a été écrit.
    changerBarreDeMenus: (actif: unknown) => ecrire(() => changerBarDeMenus(chemin, actif, maison)),
    // Règle les tickets ordinaires du Mac pour un projet. Rend la raison, si rien n'a été écrit.
    changerOrdinaires: (name: string, actif: unknown, limit: unknown) => ecrire(() => changerOrdinaires(chemin, name, actif, limit, maison)),
    // Retire un projet du fichier, et rien d'autre : `surChangement` le dit parti. Rend la raison, s'il ne l'a pas été.
    retirer: (name: string) => ecrire(() => retirerProject(chemin, name, maison)),
    // Range un projet à la place `rang` de la liste : `surChangement` dit le nouvel ordre, et
    // personne de parti. Rend la raison, s'il ne l'a pas été.
    ranger: (name: string, rang: number) => ecrire(() => rangerProject(chemin, name, rang, maison)),
    // Les préférences personnelles du fichier tel qu'il est, ou pourquoi il n'est pas compris (config.ts).
    preferences: () => preferencesDuFichier(chemin, maison),
    // Pose les préférences lues dans le gist du chef (settings-perso/) : `surChangement` dit ce qui a
    // changé, comme pour un geste. Rend la raison, si elles ne l'ont pas été.
    poserPreferences: (preferences: Preferences) => ecrire(() => poserPreferences(chemin, preferences, maison)),
    fermer(): void {
      standby?.close();
    },
  };
}

// Le fichier des projets, suivi tant que l'app est ouverte : créé s'il manque,
// relu dès qu'il change. Une relecture refusée — un fichier qu'un éditeur est
// en train d'écrire — ne retire rien : les projets d'avant restent.
import { realpathSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { addProject, changeMenuBar, changeColor, changeOrdinary, changeAcronym, colorProjects, createConfiguration, readConfiguration, tidyProject, removeProject, type Configuration, type Declare } from "./config.ts";
import type { Role } from "./colors.ts";

export function followConfiguration(options: {
  chemin: string;
  maison?: string;
  // `partis` : les projets d'avant qui ne sont plus dans la liste, ou plus dans le même dossier.
  surChangement(configuration: Configuration, gone: string[]): void;
}) {
  const { chemin: path, maison: home = homedir() } = options;
  // Tant que l'app n'a jamais eu le fichier, elle le crée — et le retente à chaque
  // relecture : une création refusée garde sa raison, et aboutit dès qu'elle le peut.
  let pose = false;
  let standby: FSWatcher | undefined;

  function read(): Configuration {
    if (!pose) {
      const refusal = createConfiguration(path);
      if (refusal !== undefined) return { chemin: path, projets: [], refus: refusal };
      pose = true;
    }
    keepWatch();
    return readConfiguration(path, home);
  }

  // C'est le dossier qui est veillé : un éditeur qui remplace le fichier au lieu
  // de l'écrire reste suivi. Et le vrai dossier, si le fichier est atteint par un
  // lien. Un fichier parti entre-temps n'a pas de vrai dossier : la relecture
  // suivante repose la veille.
  function keepWatch(): void {
    if (standby !== undefined) return;
    try {
      const real = realpathSync(path);
      standby = watch(dirname(real), (_, file) => {
        if (file === null || file === basename(real)) reread();
      });
    } catch {
      standby = undefined;
    }
  }

  function reread(): void {
    const readEntry = read();
    const next: Configuration = readEntry.refus !== undefined && heldOne.refus === undefined ? { ...heldOne, nonRelu: readEntry.refus } : readEntry;
    // Un éditeur écrit en plusieurs fois, et la veille le dit autant de fois.
    if (JSON.stringify(next) === JSON.stringify(heldOne)) return;
    const gone = heldOne.projets.filter((before) => !next.projets.some((after) => after.nom === before.nom && after.dossier === before.dossier)).map(({ nom: name }) => name);
    heldOne = next;
    options.surChangement(heldOne, gone);
  }

  let heldOne = read();

  const notReread = () => `the app does not write to a file it could not re-read — ${heldOne.nonRelu}`;
  // Une écriture part de ce que le fichier dit maintenant, pas de ce que la veille en a vu.
  // Un fichier que l'app tient encore sans avoir pu le relire — supprimé, cassé —
  // n'est pas réécrit : ce serait y perdre les projets qu'elle affiche.
  function write(action: () => string | undefined): string | undefined {
    reread();
    if (heldOne.nonRelu !== undefined) return notReread();
    const refusal = action();
    if (refusal === undefined) reread();
    return refusal;
  }

  return {
    configuration: (): Configuration => heldOne,
    relire: reread,
    // Rend la raison, si le projet n'a pas été ajouté.
    ajouter: (project: Declare) => write(() => addProject(path, project, home)),
    // Tire et écrit les couleurs qui manquent aux projets du fichier — rien, s'il n'en manque
    // aucune. Rend la raison, si elles ne l'ont pas été.
    colorer: (chance?: () => number) => write(() => colorProjects(path, home, chance)),
    // Change la couleur d'onglet ou d'accent d'un projet. Rend la raison, si elle ne l'a pas été.
    changerCouleur: (name: string, role: Role, color: string) => write(() => changeColor(path, name, role, color, home)),
    // Change le sigle d'un projet dans la barre — `null` le rend à celui que l'app tire de son nom. Rend la raison, s'il ne l'a pas été.
    changerSigle: (name: string, acronym: unknown) => write(() => changeAcronym(path, name, acronym, home)),
    // Montre ou retire l'état de la cuisine de la barre des menus (menu-bar.ts). Rend la raison, si rien n'a été écrit.
    changerBarreDeMenus: (active: unknown) => write(() => changeMenuBar(path, active, home)),
    // Règle les tickets ordinaires du Mac pour un projet. Rend la raison, si rien n'a été écrit.
    changerOrdinaires: (name: string, active: unknown, limit: unknown) => write(() => changeOrdinary(path, name, active, limit, home)),
    // Retire un projet du fichier, et rien d'autre : `surChangement` le dit parti. Rend la raison, s'il ne l'a pas été.
    retirer: (name: string) => write(() => removeProject(path, name, home)),
    // Range un projet à la place `rang` de la liste : `surChangement` dit le nouvel ordre, et
    // personne de parti. Rend la raison, s'il ne l'a pas été.
    ranger: (name: string, rank: number) => write(() => tidyProject(path, name, rank, home)),
    fermer(): void {
      standby?.close();
    },
  };
}

// Ce que l'icône de fond (#3631) lit et lance, sans Electron : les projets que la station de cet ordinateur sert
// (workstation/kitchen-ici.ts, `servisPar`), les `facts` de chacun lus par son geste comme la veille de l'app les lit
// (box.ts, `lancerIci` ; facts.ts, `comprendre`), et les commandes de pause, d'arrêt et de leur retour (tray-background.ts).
//
// Une lecture qui échoue — la station ne répond pas, sa sortie n'est pas la forme des faits — laisse le projet sans
// faits : il est compté « not read », jamais pour « 0 ». Une commande qui échoue est rendue avec sa raison, et les
// suivantes partent quand même : chaque projet est à part.
import { failureDe, type Rendu } from "../box.ts";
import type { ProjectLu } from "../bar-de-menus.ts";
import { comprendre } from "../facts.ts";
import { commandsDuAction } from "./tray-background.ts";

// Ce qui lance une commande du geste pour un projet, sur la station de cet ordinateur.
export type Lancer = (project: string, command: string) => Promise<Rendu>;

// Les faits de chaque projet servi, lus l'un après l'autre.
export async function lireLesProjects(projects: readonly string[], lancer: Lancer): Promise<ProjectLu[]> {
  const lus: ProjectLu[] = [];
  for (const name of projects) {
    const rendu = await lancer(name, "facts");
    const compris = rendu.erreur === null ? comprendre(rendu.sortie) : undefined;
    lus.push({ nom: name, faits: compris === undefined || "informe" in compris ? undefined : compris });
  }
  return lus;
}

// Un geste joué sur chaque projet : ce qui a échoué, une ligne par commande — vide quand tout est passé.
export async function jouerLeAction(action: Parameters<typeof commandsDuAction>[0], projects: readonly ProjectLu[], lancer: Lancer, delayMs: number): Promise<string[]> {
  const commands = commandsDuAction(action, projects);
  if (commands.length === 0) return ["no project of this station could be read: nothing was sent"];
  const failures: string[] = [];
  for (const { projet: project, commande: command } of commands) {
    const rendu = await lancer(project, command);
    if (rendu.erreur !== null) failures.push(`${project}: ${command} failed — ${failureDe({ ...rendu, erreur: rendu.erreur }, delayMs).erreur}`);
  }
  return failures;
}

// « Start the station » depuis un projet de l'app (#3637) : le même `station start <station>` que le geste `demarrage` de
// l'icône de fond, joué pour ce seul projet. Rend la raison de ce qui a échoué, ou rien.
export async function demarrerLaStationDuProject(project: ProjectLu, lancer: Lancer, delayMs: number): Promise<{ refus?: string }> {
  const failures = await jouerLeAction("demarrage", [project], lancer, delayMs);
  return failures.length === 0 ? {} : { refus: failures.join("\n") };
}

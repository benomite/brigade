// Ce que l'icône de fond (#3631) lit et lance, sans Electron : les projets que la station de cet ordinateur sert
// (workstation/kitchen-here.ts, `servisPar`), les `facts` de chacun lus par son geste comme la veille de l'app les lit
// (box.ts, `lancerIci` ; facts.ts, `comprendre`), et les commandes d'arrêt et de son retour (tray-background.ts).
//
// Une lecture qui échoue — la station ne répond pas, sa sortie n'est pas la forme des faits — laisse le projet sans
// faits : il est compté « not read », jamais pour « 0 ». Une commande qui échoue est rendue avec sa raison, et les
// suivantes partent quand même : chaque projet est à part.
import { failureOf, type Rendered } from "../box.ts";
import type { ProjectRead } from "../menu-bar.ts";
import { understand } from "../facts.ts";
import { commandsOfAction } from "./tray-background.ts";

// Ce qui lance une commande du geste pour un projet, sur la station de cet ordinateur.
export type Launch = (project: string, command: string) => Promise<Rendered>;

// Les faits de chaque projet servi, lus l'un après l'autre.
export async function readTheProjects(projects: readonly string[], launch: Launch): Promise<ProjectRead[]> {
  const readOnes: ProjectRead[] = [];
  for (const name of projects) {
    const rendered = await launch(name, "facts");
    const understood = rendered.erreur === null ? understand(rendered.sortie) : undefined;
    readOnes.push({ nom: name, faits: understood === undefined || "informe" in understood ? undefined : understood });
  }
  return readOnes;
}

// Un geste joué sur chaque projet : ce qui a échoué, une ligne par commande — vide quand tout est passé.
export async function playTheAction(action: Parameters<typeof commandsOfAction>[0], projects: readonly ProjectRead[], launch: Launch, delayMs: number): Promise<string[]> {
  const commands = commandsOfAction(action, projects);
  if (commands.length === 0) return ["no project of this station could be read: nothing was sent"];
  const failures: string[] = [];
  for (const { projet: project, commande: command } of commands) {
    const rendered = await launch(project, command);
    if (rendered.erreur !== null) failures.push(`${project}: ${command} failed — ${failureOf({ ...rendered, erreur: rendered.erreur }, delayMs).erreur}`);
  }
  return failures;
}

// « Start the station » depuis un projet de l'app (#3637) : le même `station start <station>` que le geste `demarrage` de
// l'icône de fond, joué pour ce seul projet. Rend la raison de ce qui a échoué, ou rien.
export async function startTheStationOfProject(project: ProjectRead, launch: Launch, delayMs: number): Promise<{ refus?: string }> {
  const failures = await playTheAction("demarrage", [project], launch, delayMs);
  return failures.length === 0 ? {} : { refus: failures.join("\n") };
}

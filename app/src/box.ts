// La veille des cuisines : ce que l'app sait d'un projet, elle l'a lu en lançant
// à la place du chef les commandes qui existent, par la station de cet ordinateur. Elle rend leur
// sortie mot pour mot — rien n'y est cherché, découpé ni redit — et n'ajoute
// que deux faits, les siens : l'heure de la lecture et, quand elle a échoué,
// si c'est la station qui n'a pas été atteinte ou la commande qui n'a pas répondu.
// Elle rend alors ce qu'elle a obtenu, à la place de l'état : rien n'est gardé
// de la lecture d'avant.
import { execFile, type ExecFileException } from "node:child_process";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import type { Project } from "./config.ts";
import type { PauseOfReads } from "./board/read.ts";
import { count } from "./format.ts";

export type Output = { commande: string; texte: string };
// Une commande à lancer : son texte, ou ce qui le compose d'après les sorties lues avant elle
// dans la même lecture — `measures` sur la fenêtre que `station` vient de dire (reliability.ts).
export type Command = string | ((readEntries: readonly Output[]) => string);
// `atteinte` : la station a été jointe, et c'est la commande qui a échoué, ou qui
// n'a rien rendu. Fausse : rien ne le prouve — la commande n'a pas pu être lancée, ou
// il a fallu l'arrêter sans qu'elle ait dit jusqu'où elle était allée.
// `cas` : ce que le code de sortie prouve à lui seul, quand il prouve quelque
// chose — jamais ce que le texte dit. Ce qui a été écrit est dans `erreur`, comme le reste.
//   `projet-inconnu`  le geste a refusé le projet : la station ne le connaît pas sous ce nom
//   `sans-droit`      le geste a refusé celui qui le lance : son compte n'en a pas le droit
//   `commande-manque` une commande manque à la station — le geste lui-même
//   `node-inapte`     le geste a refusé de lancer le runtime : le `node` de la station ne démarre pas, ou n'est pas la version réclamée
export type Case = "projet-inconnu" | "sans-droit" | "commande-manque" | "node-inapte";
// `duTableau` : ce n'est pas la station d'ici qui a échoué, mais la lecture du projet sur GitHub (board/rail.ts,
// #1694) — `erreur` est alors sa raison, en une phrase.
export type Failure = { erreur: string; atteinte: boolean; cas: Case | null; duTableau?: true; pasPublie?: true; horsLigne?: true; pause?: PauseOfReads };
// `demande` : celle à laquelle la lecture répond, telle que `regarder` l'a reçue.
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Reading = { projet: string; demande: number; a: string } & ({ sorties: Output[] } | Failure);

// La station de cet ordinateur, telle que son geste s'y lance : le `node` qui le joue,
// le dossier du runtime et le répertoire de la station (`BRIGADE_STATION_DIR`) — ceux avec
// lesquels l'app la lance (workstation/station.ts).
export type Locale = { node: string; runtime: string; racine: string; env: Record<string, string | undefined> };
// Où se lit la cuisine d'un projet : la station de cet ordinateur.
export type Kitchen = { locale: Locale };
// Un projet tel qu'il se lit : son nom, et là où sa cuisine tourne à cet instant.
export type Read = { nom: string; cuisine: Kitchen };

// Ce qui règle une commande du geste : le délai passé lequel elle est arrêtée.
export type Settings = { delaiMs: number };
// Ce qu'une commande du geste a rendu, brut. `lance` : la ligne lancée, telle qu'elle se relit.
export type Rendered = { lance: string; erreur: ExecFileException | null; sortie: string; erreurs: string };

export type Standby = ReturnType<typeof openStandby>;

// Les codes qui disent un cas : 65, 68, 69 et 70 sont des refus du geste (docs/runtime/exploitation.md,
// « Piloter »).
const CASE: Readonly<Record<number, Case>> = { 65: "projet-inconnu", 68: "sans-droit", 69: "commande-manque", 70: "node-inapte" };

// Le nom tel que le shell le rendra au geste : en un seul argument,
// sans rien en exécuter. Un nom que le geste accepte part tel quel.
export const cite = (name: string) => (/^[a-z0-9-]+$/.test(name) ? name : `'${name.replaceAll("'", `'\\''`)}'`);

// Le point d'entrée du geste d'une station, dans le dossier du runtime : celui que `brigade`
// lance sur une station.
export const ACTION = join("src", "station", "geste.ts");

// Les mots d'une commande, tels qu'un shell les donnerait au geste : séparés par des blancs, un
// passage entre apostrophes reste entier — la forme que `cite` écrit.
export function words(command: string): string[] {
  const renderedOnes: string[] = [];
  let word: string | undefined;
  for (let rank = 0; rank < command.length; rank++) {
    const letter = command[rank] as string;
    if (/\s/.test(letter)) {
      if (word !== undefined) renderedOnes.push(word);
      word = undefined;
    } else if (letter === "'") {
      const end = command.indexOf("'", rank + 1);
      const until = end === -1 ? command.length : end;
      word = (word ?? "") + command.slice(rank + 1, until);
      rank = until;
    } else if (letter === "\\" && rank + 1 < command.length) {
      word = (word ?? "") + command[++rank];
    } else word = (word ?? "") + letter;
  }
  if (word !== undefined) renderedOnes.push(word);
  return renderedOnes;
}

// Une commande du geste, lancée une fois par la station de cet ordinateur : son geste, dans le dossier
// du runtime, avec le répertoire de la station — ce que `brigade <nom> <commande>` lance. Jamais
// d'exception : ce qui arrive est rendu, et c'est à qui l'a lancée de dire ce que ça prouve.
export function launchHere(locale: Locale, name: string, command: string, delayMs: number, signal?: AbortSignal): Promise<Rendered> {
  const args = [join(locale.runtime, ACTION), name, ...words(command)];
  return new Promise((resolve) => {
    execFile(locale.node, args, { windowsHide: true, cwd: locale.runtime, env: { ...locale.env, BRIGADE_STATION_DIR: locale.racine }, signal, timeout: delayMs, maxBuffer: 16 * 1024 * 1024 }, (error, output, errors) =>
      resolve({ lance: `$ ${locale.node} ${args.join(" ")}`, erreur: error, sortie: output, erreurs: errors }),
    );
  });
}

// Ce qu'une commande lancée ici prouve en échouant. La station est sur cet ordinateur : elle est
// atteinte, sauf quand son `node` n'a pas pu être lancé. Son code dit le cas du geste.
export function failureOf({ lance: launches, erreur: error, sortie: output, erreurs: errors }: Rendered & { erreur: ExecFileException }, delayMs: number): Failure {
  const suite = error.killed === true ? `no answer within ${count(delayMs / 1000)} s: the command was stopped` : typeof error.code === "number" ? `exit code ${error.code}` : error.message;
  const code = error.killed !== true && typeof error.code === "number" ? error.code : undefined;
  return {
    erreur: `${launches}\n${errors}${output}\n→ ${suite}`,
    atteinte: error.killed === true || typeof error.code === "number" || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    cas: (code !== undefined && CASE[code]) || null,
  };
}

// Une commande du geste, lancée une fois là où la cuisine du projet tourne : par la station de cet ordinateur.
export function launchThe(settings: Settings, { nom: name, cuisine: kitchen }: Read, command: string, signal?: AbortSignal): Promise<Rendered> {
  return launchHere(kitchen.locale, name, command, settings.delaiMs, signal);
}

export function openStandby(options: {
  // Entre la fin d'une lecture et le début de la suivante.
  intervalleMs: number;
  // Passé ce délai, une commande qui n'a pas fini est arrêtée.
  delaiMs: number;
  // Le passage de chaque projet : la dernière commande partie pour lui. Plusieurs
  // veilles qui se le partagent n'ouvrent, à elles toutes, qu'une commande à la
  // fois par projet. Absent, la veille a le sien.
  passage?: Map<string, Promise<unknown>>;
  // Où la cuisine d'un projet tourne, demandé à chaque lecture : un projet dont la cuisine passe
  // sur cet ordinateur, ou le quitte, est lu à sa nouvelle place dès la lecture suivante.
  // Rien : rien n'est lu de lui, cette fois.
  cuisine: (project: Project) => Kitchen | undefined;
  surLecture(reading: Reading): void;
}) {
  let tour: AbortController | undefined;
  const passage = options.passage ?? new Map<string, Promise<unknown>>();
  const kitchenOf = options.cuisine;

  // Chacune attend que la précédente du même projet ait fini, de quelque veille qu'elle soit.
  function launch(readOne: Read, command: string, signal: AbortSignal): Promise<Output | Failure> {
    const rendered = (passage.get(readOne.nom) ?? Promise.resolve()).then(() => joindre(readOne, command, signal));
    passage.set(readOne.nom, rendered);
    return rendered;
  }

  async function joindre(readOne: Read, command: string, signal: AbortSignal): Promise<Output | Failure> {
    const rendered = await launchThe(options, readOne, command, signal);
    const { erreur: error } = rendered;
    if (error === null) return { commande: command, texte: rendered.sortie };
    return failureOf({ ...rendered, erreur: error }, options.delaiMs);
  }

  // Les commandes partent l'une après l'autre, et la première qui échoue est
  // l'erreur : un projet ne lance qu'une commande à la fois.
  async function read(readOne: Read, commands: readonly Command[], signal: AbortSignal): Promise<{ sorties: Output[] } | Failure> {
    const outputs: Output[] = [];
    for (const wantedOne of commands) {
      const rendered = await launch(readOne, typeof wantedOne === "string" ? wantedOne : wantedOne(outputs), signal);
      if ("erreur" in rendered) return rendered;
      outputs.push(rendered);
    }
    return { sorties: outputs };
  }

  // Un projet : lu tout de suite, puis à chaque intervalle, sans rien attendre des autres — là où
  // sa cuisine tourne au moment de chaque lecture.
  async function follow(project: Project, commands: readonly Command[], request: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      const kitchen = kitchenOf(project);
      if (kitchen !== undefined) {
        const readEntry = await read({ nom: project.nom, cuisine: kitchen }, commands, signal);
        // Le chef regarde ailleurs, ou l'app ferme : cette lecture n'est plus à personne.
        if (signal.aborted) return;
        options.surLecture({ projet: project.nom, demande: request, a: new Date().toISOString(), ...readEntry });
      }
      await wait(options.intervalleMs, undefined, { signal }).catch(() => {});
      if (signal.aborted) return;
    }
  }

  function stop(): void {
    tour?.abort();
  }

  return {
    // Ce qui est affiché — un projet, ou chacun dans « Tous les projets » — et les commandes
    // à y lancer, dans l'ordre où la vue les montre. Rien d'autre n'est lu ; un
    // projet dont la cuisine n'est pas sur cet ordinateur ne
    // l'est pas, tant qu'elle n'y est pas. Chaque lecture porte la `demande` : celle
    // d'un écran quitté peut encore être en route quand la vue en montre un autre.
    regarder(projects: readonly Project[], commands: readonly Command[], request: number): void {
      stop();
      const { signal } = (tour = new AbortController());
      for (const project of projects) void follow(project, commands, request, signal);
    },

    fermer: stop,
  };
}

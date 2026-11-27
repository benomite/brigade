// Déménager la cuisine d'un projet depuis sa page, d'un geste : vers cet ordinateur, vers sa box,
// vers une autre station — sans le retirer ni le rajouter. L'app ne le fait pas elle-même : elle
// lance l'opération du runtime, sur cet ordinateur, avec le
// répertoire de sa station et les gists des stations appairées, et rend ce qu'elle a répondu.
//
// - **Déménagé** : la demande est écrite sur les deux stations ; le reste se fait entre elles, par
//   leurs gists, et le suivi de chacune dit où le projet cuit (projects.ts, `cuitSur`).
// - **Refusé** : la raison du runtime, en une phrase — vers cet ordinateur sans bac à sable, ce qui
//   lui manque —, et rien n'a changé. Rien n'échoue en silence : une commande mal appelée, GitHub
//   injoignable, un runtime qui ne se lance pas se disent aussi en une ligne, le détail au survol.
import { execFile } from "node:child_process";
import { join } from "node:path";

// Le point d'entrée de l'opération, dans le dossier du runtime.
export const MOVE = join("src", "demenagement", "demenager.ts");

// `detail` : ce que la commande a écrit d'autre — il se lit au survol, jamais à plat.
export type Move = { demenage: { projet: string; de: string; vers: string } } | { refus: string; detail?: string };
// L'opération : le projet, le gist de la station visée, et ceux de toutes les stations du chef ;
// `de`, le gist de la station qui remet sa cuisine — celle où la page le dit cuire —, quand l'app la
// connaît : plusieurs stations servent un projet (#2713), le runtime ne devine pas laquelle part.
export type Mover = (project: string, to: string, gists: readonly string[], of?: string) => Promise<Move>;

// Ce que le runtime a rendu, lu : sa ligne JSON, ou son code. Rien n'y est cru sur parole.
export function readRendered(code: number | null, output: string, errors: string): Move {
  const last = output.trim().split("\n").at(-1) ?? "";
  let readOne: Record<string, unknown> | undefined;
  try {
    readOne = JSON.parse(last) as Record<string, unknown>;
  } catch {
    readOne = undefined;
  }
  const detail = errors.trim();
  if (readOne?.moved === true && typeof readOne.from === "string" && typeof readOne.to === "string") return { demenage: { projet: typeof readOne.project === "string" ? readOne.project : "", de: readOne.from, vers: readOne.to } };
  if (readOne?.moved === false && typeof readOne.said === "string" && readOne.said.trim() !== "") return { refus: readOne.said.trim(), ...(detail === "" ? {} : { detail }) };
  const reason = code === 3 ? "GitHub could not be read or written: nothing was changed" : code === 2 ? "the runtime did not understand the request: nothing was changed" : `the runtime gave no answer${code === null ? "" : ` (exit code ${code})`}: nothing was changed`;
  const said = [detail, output.trim()].filter((piece) => piece !== "").join("\n");
  return { refus: reason, ...(said === "" ? {} : { detail: said }) };
}

export type SettingsOfMove = {
  // Le `node` qui joue le runtime, le dossier du runtime, et le répertoire de la station de cet
  // ordinateur (`BRIGADE_STATION_DIR`) — ceux avec lesquels l'app la lance (workstation/station.ts).
  node: string;
  runtime: string;
  racine: string;
  env: Record<string, string | undefined>;
  delaiMs: number;
};

// L'opération lancée une fois, sur cet ordinateur. Jamais d'exception : un échec est un refus.
export function moverOfRuntime(settings: SettingsOfMove): Mover {
  return (project, to, gists, of) =>
    new Promise((resolve) => {
      const args = [join(settings.runtime, MOVE), project, to, ...gists.filter((gist) => gist !== to), ...(of === undefined || of === to ? [] : ["--de", of])];
      execFile(settings.node, args, { windowsHide: true, cwd: settings.runtime, env: { ...settings.env, BRIGADE_STATION_DIR: settings.racine }, timeout: settings.delaiMs, maxBuffer: 4 * 1024 * 1024 }, (error, output, errors) => {
        if (error !== null && typeof error.code !== "number") {
          const why = error.killed === true ? `no answer within ${Math.round(settings.delaiMs / 1000)} s` : error.message;
          return resolve({ refus: "the runtime could not be launched on this computer: nothing was changed", detail: `${settings.node} ${args.join(" ")}\n${why}` });
        }
        resolve(readRendered(error === null ? 0 : (error.code as number), output, errors));
      });
    });
}

// Déménager la cuisine d'un projet depuis sa page, d'un geste : vers cet ordinateur, vers sa box,
// vers une autre station — sans le retirer ni le rajouter. L'app ne le fait pas elle-même : elle
// lance l'opération du runtime, sur cet ordinateur (runtime/src/demenagement/demenager.ts), avec le
// répertoire de sa station et les gists des stations appairées, et rend ce qu'elle a répondu.
//
// - **Déménagé** : la demande est écrite sur les deux stations ; le reste se fait entre elles, par
//   leurs gists, et le suivi de chacune dit où le projet cuit (projets.ts, `cuitSur`).
// - **Refusé** : la raison du runtime, en une phrase — vers cet ordinateur sans bac à sable, ce qui
//   lui manque —, et rien n'a changé. Rien n'échoue en silence : une commande mal appelée, GitHub
//   injoignable, un runtime qui ne se lance pas se disent aussi en une ligne, le détail au survol.
import { execFile } from "node:child_process";
import { join } from "node:path";

// Le point d'entrée de l'opération, dans le dossier du runtime.
export const DEMENAGER = join("src", "demenagement", "demenager.ts");

// `detail` : ce que la commande a écrit d'autre — il se lit au survol, jamais à plat.
export type Demenagement = { demenage: { projet: string; de: string; vers: string } } | { refus: string; detail?: string };
// L'opération : le projet, le gist de la station visée, et ceux de toutes les stations du chef.
export type Demenageur = (projet: string, vers: string, gists: readonly string[]) => Promise<Demenagement>;

// Ce que le runtime a rendu, lu : sa ligne JSON, ou son code. Rien n'y est cru sur parole.
export function lireRendu(code: number | null, sortie: string, erreurs: string): Demenagement {
  const derniere = sortie.trim().split("\n").at(-1) ?? "";
  let lu: Record<string, unknown> | undefined;
  try {
    lu = JSON.parse(derniere) as Record<string, unknown>;
  } catch {
    lu = undefined;
  }
  const detail = erreurs.trim();
  if (lu?.moved === true && typeof lu.from === "string" && typeof lu.to === "string") return { demenage: { projet: typeof lu.project === "string" ? lu.project : "", de: lu.from, vers: lu.to } };
  if (lu?.moved === false && typeof lu.said === "string" && lu.said.trim() !== "") return { refus: lu.said.trim(), ...(detail === "" ? {} : { detail }) };
  const raison = code === 3 ? "GitHub could not be read or written: nothing was changed" : code === 2 ? "the runtime did not understand the request: nothing was changed" : `the runtime gave no answer${code === null ? "" : ` (exit code ${code})`}: nothing was changed`;
  const dit = [detail, sortie.trim()].filter((morceau) => morceau !== "").join("\n");
  return { refus: raison, ...(dit === "" ? {} : { detail: dit }) };
}

export type ReglagesDuDemenagement = {
  // Le `node` qui joue le runtime, le dossier du runtime, et le répertoire de la station de cet
  // ordinateur (`BRIGADE_STATION_DIR`) — ceux avec lesquels l'app la lance (poste/station.ts).
  node: string;
  runtime: string;
  racine: string;
  env: Record<string, string | undefined>;
  delaiMs: number;
};

// L'opération lancée une fois, sur cet ordinateur. Jamais d'exception : un échec est un refus.
export function demenageurDuRuntime(reglages: ReglagesDuDemenagement): Demenageur {
  return (projet, vers, gists) =>
    new Promise((resoudre) => {
      const args = [join(reglages.runtime, DEMENAGER), projet, vers, ...gists.filter((gist) => gist !== vers)];
      execFile(reglages.node, args, { cwd: reglages.runtime, env: { ...reglages.env, BRIGADE_STATION_DIR: reglages.racine }, timeout: reglages.delaiMs, maxBuffer: 4 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
        if (erreur !== null && typeof erreur.code !== "number") {
          const pourquoi = erreur.killed === true ? `no answer within ${Math.round(reglages.delaiMs / 1000)} s` : erreur.message;
          return resoudre({ refus: "the runtime could not be launched on this computer: nothing was changed", detail: `${reglages.node} ${args.join(" ")}\n${pourquoi}` });
        }
        resoudre(lireRendu(erreur === null ? 0 : (erreur.code as number), sortie, erreurs));
      });
    });
}

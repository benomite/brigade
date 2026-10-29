// La file du projet, lue pour le second par un crochet `SessionStart` (startup, resume, compact) : à l'ouverture
// de la session et après chaque compaction, `claude` joue ce module, qui lit la file que la box du projet publie sur
// son tableau de la cuisine (« Kitchen board », runtime/src/tableau/rendu/bloc.ts, `laFileDuSecond`, #1843) et la rend
// comme contexte additionnel — le second la voit sans y penser (role.md, « On opening »). Rien que GitHub, par le `gh`
// du poste (#1845) : ni `ssh`, ni `hote`, ni box jointe.
//
// Le crochet n'est que dans les réglages du lancement de l'onglet Second (lancement.ts, `--settings`), qui le déclarent
// par crochet-de-la-file.ts : aucun fichier du projet ne le porte, une session `claude` ordinaire du même dossier ne le
// joue pas.
//
// La file publiée est rendue mot pour mot : le bloc `awaiting` de `status`, bords compris, puis l'état de la cuisine
// dans la forme de `status`. Une file qu'on n'a pas pu lire est dite telle, dans les mots de role.md, au lieu
// d'échouer en silence — et le crochet sort toujours en 0 : il ne bloque jamais la session.
import { execFile } from "node:child_process";
import { laFileDuSecond } from "../../../runtime/src/tableau/rendu/bloc.ts";
import { depotDeLOrigine } from "../ajout.ts";
import { corpsLu, type AppelGitHub } from "../tableau/client.ts";
import { lireLeTableauDuDepot } from "../tableau/lecture.ts";
import { EVENEMENT, type Cible } from "./crochet-de-la-file.ts";

export const DELAI_MS = 30_000;
// Ce que la lecture a rendu : la file publiée, et l'heure à laquelle la box a lu l'état qu'elle publie ; ou pourquoi
// rien ne se lit. `horsLigne` : GitHub n'a pas été joint du tout.
export type Lecture = { lue: true; depot: string; lu: string; texte: string } | { lue: false; raison: string; horsLigne?: true; sansDepot?: true };

// Ce que le crochet dit au second — la file, ou pourquoi elle n'est pas lue, dans les mots de role.md.
export function contexteDeLaFile(cible: Cible, lecture: Lecture): string {
  const entete = `The project's queue, read by the app at the start of this session (or after a compaction) from the Kitchen board the box of ${cible.nom} publishes on GitHub: the \`awaiting\` block of \`brigade ${cible.nom} status\`, word for word, then the kitchen's state. This is your reading: do not run it again.`;
  const non = (phrase: string, suite = "") => `${entete}\n\n${phrase}${suite === "" ? "" : `\n${suite}`}`;
  if (!lecture.lue && lecture.sansDepot === true) return non("file non lue : aucun dépôt GitHub pour ce projet — ni `depot` dans ~/.config/brigade/app.json, ni `origin` GitHub dans son dossier");
  if (!lecture.lue && lecture.horsLigne === true) return non("file non lue : GitHub pas joint", lecture.raison);
  if (!lecture.lue) return non("file non lue : tableau de la cuisine pas lu", lecture.raison);
  return `${entete} Published from the state the box read at ${lecture.lu}, on ${lecture.depot}.\n\n${lecture.texte.replace(/\s+$/, "")}`;
}

// Le format que `claude` attend d'un crochet `SessionStart` : du JSON sur la sortie standard.
export const sortieDuCrochet = (contexte: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: EVENEMENT, additionalContext: contexte } });

// Le `GET` de l'API de GitHub par le `gh` du poste — son compte, son jeton, son réseau. Un refus de GitHub est une
// réponse (son code, le corps qu'il a rendu) ; un `gh` absent, arrêté ou qui ne dit pas de code HTTP lève.
export function appelParGh(gh: string, delaiMs: number = DELAI_MS): AppelGitHub {
  return (chemin) =>
    new Promise((resoudre, rejeter) => {
      execFile(gh, ["api", chemin.replace(/^\//, "")], { windowsHide: true, timeout: delaiMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre({ status: 200, data: corpsLu(sortie) });
        const http = /\(HTTP (\d{3})\)/.exec(erreurs)?.[1];
        if (http !== undefined) return resoudre({ status: Number(http), data: corpsLu(sortie) });
        if (erreur.killed === true) return rejeter(new Error(`no answer in ${Math.round(delaiMs / 1000)} s`));
        if ((erreur as { code?: unknown }).code === "ENOENT") return rejeter(new Error(`\`${gh}\` is not on this machine`));
        rejeter(new Error(erreurs.trim().split("\n").at(-1) || erreur.message));
      });
    });
}

// La file que la box publie dans le corps du tableau de ce dépôt : le tableau est retrouvé comme l'app le retrouve
// (lecture.ts), et son corps lu par le lecteur que le runtime partage avec les apps.
export async function lireLaFile(appeler: AppelGitHub, depot: string): Promise<Lecture> {
  let issues: unknown;
  const lu = await lireLeTableauDuDepot({
    depot,
    appeler: async (chemin) => {
      const reponse = await appeler(chemin);
      issues = reponse.data;
      return reponse;
    },
  });
  if (!lu.lu) return { lue: false, raison: lu.raison, ...(lu.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  const issue = (Array.isArray(issues) ? (issues as Array<{ number?: unknown; body?: unknown }>) : []).find(({ number }) => number === lu.numero);
  const file = laFileDuSecond(typeof issue?.body === "string" ? issue.body : "");
  return file.lue ? { lue: true, depot, lu: file.lu, texte: file.texte } : { lue: false, raison: `The Kitchen board of ${depot} (issue ${lu.numero}) does not give the project's queue: ${file.raison}.` };
}

// Ce que le crochet écrit : toujours un contexte, même quand la file n'a pas pu être lue. `dossier` : celui de la
// session, dont l'`origin` donne le dépôt quand le fichier des projets ne le donne pas.
export async function jouer(gh: string, cible: Cible, dossier: string, delaiMs: number = DELAI_MS): Promise<string> {
  const depot = cible.depot || (await depotDeLOrigine(process.env.BRIGADE_GIT_BIN || "git", dossier));
  const lecture: Lecture = depot === undefined ? { lue: false, raison: "", sansDepot: true } : await lireLaFile(appelParGh(gh, delaiMs), depot);
  return sortieDuCrochet(contexteDeLaFile(cible, lecture));
}

// À la main : `node app/src/second/file.ts <nom> [<depot> [<gh>]]`, dans le dossier du projet, rend ce que `claude`
// recevrait.
if (import.meta.main) {
  const [nom, depot, gh] = process.argv.slice(2);
  try {
    process.stdout.write(`${await jouer(gh || "gh", { nom: nom ?? "", ...(depot ? { depot } : {}) }, process.cwd())}\n`);
  } catch (erreur) {
    process.stdout.write(`${sortieDuCrochet(`The project's queue could not be read: file non lue : ${erreur instanceof Error ? erreur.message : String(erreur)}`)}\n`);
  }
  process.exit(0);
}

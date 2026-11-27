// La file du projet, lue pour le second par un crochet `SessionStart` (startup, resume, compact) : à l'ouverture
// de la session et après chaque compaction, `claude` joue ce module, qui lit sur GitHub ce qui attend le chef et le rend
// comme contexte additionnel — le second la voit sans y penser (role.md, « On opening »). Rien que GitHub, par le `gh`
// du poste (#1845) : ni box jointe, ni station, ni tableau de la cuisine (#2460).
//
// La lecture est celle du TODO de l'app (board/wait-of-chef.ts) : les issues du dépôt, leurs labels, leurs
// commentaires — les mêmes entrées, chacune avec sa question et son geste, dans le même bloc `awaiting`, bords compris ;
// « nothing awaits the chef » quand rien n'attend. Le second et l'app ne se contredisent pas : ils lisent la même chose.
//
// Le crochet n'est que dans les réglages du lancement de l'onglet Second (launch.ts, `--settings`), qui le déclarent
// par hook-of-the-file.ts : aucun fichier du projet ne le porte, une session `claude` ordinaire du même dossier ne le
// joue pas.
//
// Une file qu'on n'a pas pu lire est dite telle, dans les mots de role.md, au lieu d'échouer en silence — et le crochet
// sort toujours en 0 : il ne bloque jamais la session.
import { execFile } from "node:child_process";
import { repositoryOfTheOrigin } from "../addition.ts";
import { blockOfChef, readWhatAwaitingTheChef } from "../board/wait-of-chef.ts";
import { bodyRead, type CallGitHub } from "../board/client.ts";
import { writingOnTheRepository } from "../board/writing.ts";
import { EVENT, type Target } from "./hook-of-the-file.ts";

// Ce que la lecture entière a pour se faire, toutes ses vagues d'appels comprises — sous le délai du crochet
// (hook-of-the-file.ts) : passé, `claude` tue le crochet, et le second n'aurait rien, pas même « file non lue ».
export const DELAY_MS = 30_000;
// Ce que la lecture a rendu : le bloc `awaiting` de ce qui attend le chef, et l'heure de la lecture ; ou pourquoi rien ne
// se lit. `horsLigne` : GitHub n'a pas été joint du tout.
export type Reading = { lue: true; depot: string; lu: string; texte: string } | { lue: false; raison: string; horsLigne?: true; sansDepot?: true };

// Ce que le crochet dit au second — la file, ou pourquoi elle n'est pas lue, dans les mots de role.md.
// `moment` : quand l'app l'a lue — au début de la session par défaut, ou après le merge de l'init (role-after-init.ts).
export function contextOfTheFile(target: Target, reading: Reading, moment = "at the start of this session (or after a compaction)"): string {
  const header = `The project's queue, read by the app ${moment} from GitHub only — the issues of the project, their labels and their comments, not the Kitchen board: what awaits the chef, the same items as the app's Todo, each with its question and its gesture, in the \`awaiting\` block of \`brigade ${target.nom} status\`. This is your reading: do not run it again.`;
  const not = (sentence: string, suite = "") => `${header}\n\n${sentence}${suite === "" ? "" : `\n${suite}`}`;
  if (!reading.lue && reading.sansDepot === true) return not("file non lue : aucun dépôt GitHub pour ce projet — ni `depot` dans ~/.config/brigade/app.json, ni `origin` GitHub dans son dossier");
  if (!reading.lue && reading.horsLigne === true) return not("file non lue : GitHub pas joint", reading.raison);
  if (!reading.lue) return not("file non lue : GitHub n'a pas rendu ce qui attend le chef", reading.raison);
  return `${header} Read at ${reading.lu}, on ${reading.depot}.\n\n${reading.texte.replace(/\s+$/, "")}`;
}

// Ce que le second sait d'un dépôt où le compte GitHub du poste ne peut pas écrire (#3163) : la ligne que la vue pose en
// tête du projet, et ce qu'elle implique pour lui — on lui parle pour comprendre, il ne change rien. Rien quand le compte
// y écrit, ou quand GitHub ne l'a pas dit (`ecritureSurLeDepot`).
export function contextOfTheWriting(repository: string, writing: boolean | null): string {
  if (writing !== false) return "";
  return `Read-only: your GitHub account cannot write to ${repository}. The chef can talk with you to understand what is happening on this project, but you cannot change anything there: no issue filed or edited, no label, no comment, no merge, no push. Say so at the top of your first answer, and again whenever the chef asks for a change there.`;
}

// Le format que `claude` attend d'un crochet `SessionStart` : du JSON sur la sortie standard.
export const outputOfHook = (context: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: EVENT, additionalContext: context } });

// Le `GET` de l'API de GitHub par le `gh` du poste — son compte, son jeton, son réseau. Un refus de GitHub est une
// réponse (son code, le corps qu'il a rendu) ; un `gh` absent, arrêté ou qui ne dit pas de code HTTP lève. La lecture de
// ce qui attend le chef fait plusieurs vagues d'appels (les listes, puis les commentaires, puis les poses de label) : tous
// partagent une échéance, `delaiMs` après la création de l'appel, et un appel qui la passe lève comme un GitHub muet.
export function callByGh(gh: string, delayMs: number = DELAY_MS): CallGitHub {
  const deadline = Date.now() + delayMs;
  const silent = () => new Error(`no answer in ${Math.round(delayMs / 1000)} s`);
  return (path) =>
    new Promise((resolve, rejeter) => {
      const remains = deadline - Date.now();
      if (remains <= 0) return rejeter(silent());
      execFile(gh, ["api", path.replace(/^\//, "")], { windowsHide: true, timeout: remains, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) => {
        if (error === null) return resolve({ status: 200, data: bodyRead(output) });
        const http = /\(HTTP (\d{3})\)/.exec(errors)?.[1];
        if (http !== undefined) return resolve({ status: Number(http), data: bodyRead(output) });
        if (error.killed === true) return rejeter(silent());
        if ((error as { code?: unknown }).code === "ENOENT") return rejeter(new Error(`\`${gh}\` is not on this computer`));
        rejeter(new Error(errors.trim().split("\n").at(-1) || error.message));
      });
    });
}

// Ce qui attend le chef dans ce dépôt, lu comme le TODO de l'app le lit, rendu dans le bloc `awaiting`.
export async function readTheFile(call: CallGitHub, repository: string, now: () => Date = () => new Date()): Promise<Reading> {
  const instant = now();
  const readEntry = await readWhatAwaitingTheChef({ depot: repository, appeler: call, maintenant: () => instant, enWaiting: true });
  if (!readEntry.lue) return { lue: false, raison: readEntry.raison, ...(readEntry.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  return { lue: true, depot: repository, lu: readEntry.lu, texte: blockOfChef({ ...readEntry, depot: repository }).join("\n") };
}

// Ce que le crochet écrit : toujours un contexte, même quand la file n'a pas pu être lue. `dossier` : celui de la
// session, dont l'`origin` donne le dépôt quand le fichier des projets ne le donne pas.
export async function play(gh: string, target: Target, folder: string, delayMs: number = DELAY_MS): Promise<string> {
  const repository = target.depot || (await repositoryOfTheOrigin(process.env.BRIGADE_GIT_BIN || "git", folder));
  if (repository === undefined) return outputOfHook(contextOfTheFile(target, { lue: false, raison: "", sansDepot: true }));
  const call = callByGh(gh, delayMs);
  const [reading, writing] = await Promise.all([readTheFile(call, repository), writingOnTheRepository(repository, call)]);
  const written = contextOfTheWriting(repository, writing);
  return outputOfHook(`${contextOfTheFile(target, reading)}${written === "" ? "" : `\n\n${written}`}`);
}

// À la main : `node app/src/second/file.ts <nom> [<depot> [<gh>]]`, dans le dossier du projet, rend ce que `claude`
// recevrait.
if (import.meta.main) {
  const [name, repository, gh] = process.argv.slice(2);
  try {
    process.stdout.write(`${await play(gh || "gh", { nom: name ?? "", ...(repository ? { depot: repository } : {}) }, process.cwd())}\n`);
  } catch (error) {
    process.stdout.write(`${outputOfHook(`The project's queue could not be read: file non lue : ${error instanceof Error ? error.message : String(error)}`)}\n`);
  }
  process.exit(0);
}

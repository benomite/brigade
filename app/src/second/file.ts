// La file du projet, lue pour le second par un crochet `SessionStart` (startup, resume, compact) : à l'ouverture
// de la session et après chaque compaction, `claude` joue ce module, qui lit sur GitHub ce qui attend le chef et le rend
// comme contexte additionnel — le second la voit sans y penser (role.md, « On opening »). Rien que GitHub, par le `gh`
// du poste (#1845) : ni box jointe, ni station, ni tableau de la cuisine (#2460).
//
// La lecture est celle du TODO de l'app (tableau/attente-du-chef.ts) : les issues du dépôt, leurs labels, leurs
// commentaires — les mêmes entrées, chacune avec sa question et son geste, dans le même bloc `awaiting`, bords compris ;
// « nothing awaits the chef » quand rien n'attend. Le second et l'app ne se contredisent pas : ils lisent la même chose.
//
// Le crochet n'est que dans les réglages du lancement de l'onglet Second (lancement.ts, `--settings`), qui le déclarent
// par crochet-de-la-file.ts : aucun fichier du projet ne le porte, une session `claude` ordinaire du même dossier ne le
// joue pas.
//
// Une file qu'on n'a pas pu lire est dite telle, dans les mots de role.md, au lieu d'échouer en silence — et le crochet
// sort toujours en 0 : il ne bloque jamais la session.
import { execFile } from "node:child_process";
import { depotDeLOrigine } from "../ajout.ts";
import { blocDuChef, lireCeQuiAttendLeChef } from "../tableau/attente-du-chef.ts";
import { corpsLu, type AppelGitHub } from "../tableau/client.ts";
import { ecritureSurLeDepot } from "../tableau/ecriture.ts";
import { EVENEMENT, type Cible } from "./crochet-de-la-file.ts";
import { lireLesStationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import type { StationsLues } from "../../../runtime/src/rail-bloque/rail-bloque.ts";
import { lireLeRailBloque } from "../vue/rail-bloque/rail-bloque.ts";

// Ce que la lecture entière a pour se faire, toutes ses vagues d'appels comprises — sous le délai du crochet
// (crochet-de-la-file.ts) : passé, `claude` tue le crochet, et le second n'aurait rien, pas même « file non lue ».
export const DELAI_MS = 30_000;
// Ce que la lecture a rendu : le bloc `awaiting` de ce qui attend le chef, et l'heure de la lecture ; ou pourquoi rien ne
// se lit. `horsLigne` : GitHub n'a pas été joint du tout.
export type Lecture = { lue: true; depot: string; lu: string; texte: string } | { lue: false; raison: string; horsLigne?: true; sansDepot?: true };

// Ce que le crochet dit au second — la file, ou pourquoi elle n'est pas lue, dans les mots de role.md.
// `moment` : quand l'app l'a lue — au début de la session par défaut, ou après le merge de l'init (role-apres-init.ts).
export function contexteDeLaFile(cible: Cible, lecture: Lecture, moment = "at the start of this session (or after a compaction)"): string {
  const entete = `The project's queue, read by the app ${moment} from GitHub only — the issues of the project, their labels and their comments, not the Kitchen board: what awaits the chef, the same items as the app's Todo, each with its question and its gesture, in the \`awaiting\` block of \`brigade ${cible.nom} status\`. This is your reading: do not run it again.`;
  const non = (phrase: string, suite = "") => `${entete}\n\n${phrase}${suite === "" ? "" : `\n${suite}`}`;
  if (!lecture.lue && lecture.sansDepot === true) return non("file non lue : aucun dépôt GitHub pour ce projet — ni `depot` dans ~/.config/brigade/app.json, ni `origin` GitHub dans son dossier");
  if (!lecture.lue && lecture.horsLigne === true) return non("file non lue : GitHub pas joint", lecture.raison);
  if (!lecture.lue) return non("file non lue : GitHub n'a pas rendu ce qui attend le chef", lecture.raison);
  return `${entete} Read at ${lecture.lu}, on ${lecture.depot}.\n\n${lecture.texte.replace(/\s+$/, "")}`;
}

// Ce que le second sait d'un dépôt où le compte GitHub du poste ne peut pas écrire (#3163) : la ligne que la vue pose en
// tête du projet, et ce qu'elle implique pour lui — on lui parle pour comprendre, il ne change rien. Rien quand le compte
// y écrit, ou quand GitHub ne l'a pas dit (`ecritureSurLeDepot`).
export function contexteDeLEcriture(depot: string, ecriture: boolean | null): string {
  if (ecriture !== false) return "";
  return `Read-only: your GitHub account cannot write to ${depot}. The chef can talk with you to understand what is happening on this project, but you cannot change anything there: no issue filed or edited, no label, no comment, no merge, no push. Say so at the top of your first answer, and again whenever the chef asks for a change there.`;
}

// Le format que `claude` attend d'un crochet `SessionStart` : du JSON sur la sortie standard.
export const sortieDuCrochet = (contexte: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: EVENEMENT, additionalContext: contexte } });

// Le `GET` de l'API de GitHub par le `gh` du poste — son compte, son jeton, son réseau. Un refus de GitHub est une
// réponse (son code, le corps qu'il a rendu) ; un `gh` absent, arrêté ou qui ne dit pas de code HTTP lève. La lecture de
// ce qui attend le chef fait plusieurs vagues d'appels (les listes, puis les commentaires, puis les poses de label) : tous
// partagent une échéance, `delaiMs` après la création de l'appel, et un appel qui la passe lève comme un GitHub muet.
export function appelParGh(gh: string, delaiMs: number = DELAI_MS): AppelGitHub {
  const echeance = Date.now() + delaiMs;
  const muet = () => new Error(`no answer in ${Math.round(delaiMs / 1000)} s`);
  return (chemin) =>
    new Promise((resoudre, rejeter) => {
      const reste = echeance - Date.now();
      if (reste <= 0) return rejeter(muet());
      execFile(gh, ["api", chemin.replace(/^\//, "")], { windowsHide: true, timeout: reste, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre({ status: 200, data: corpsLu(sortie) });
        const http = /\(HTTP (\d{3})\)/.exec(erreurs)?.[1];
        if (http !== undefined) return resoudre({ status: Number(http), data: corpsLu(sortie) });
        if (erreur.killed === true) return rejeter(muet());
        if ((erreur as { code?: unknown }).code === "ENOENT") return rejeter(new Error(`\`${gh}\` is not on this computer`));
        rejeter(new Error(erreurs.trim().split("\n").at(-1) || erreur.message));
      });
    });
}

// Ce qui attend le chef dans ce dépôt, lu comme le TODO de l'app le lit, rendu dans le bloc `awaiting`. `stations` : les
// stations du compte — avec elles, le rail bloqué (#3358) se lit aussi, et sa ligne vient sous la tête du bloc, la même
// que `brigade <project> status` écrit (runtime/src/rail-bloque/status.ts).
export async function lireLaFile(appeler: AppelGitHub, depot: string, maintenant: () => Date = () => new Date(), stations?: () => Promise<StationsLues>): Promise<Lecture> {
  const instant = maintenant();
  const [lue, railBloque] = await Promise.all([
    lireCeQuiAttendLeChef({ depot, appeler, maintenant: () => instant }),
    stations === undefined ? undefined : lireLeRailBloque({ depot, appeler, stations, maintenant: instant.getTime() }),
  ]);
  if (!lue.lue) return { lue: false, raison: lue.raison, ...(lue.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  return { lue: true, depot, lu: lue.lu, texte: blocDuChef({ ...lue, depot, ...(railBloque === undefined ? {} : { railBloque }) }).join("\n") };
}

// Les stations du compte, par le `gh` du poste (runtime/src/enregistrement-station/stations-du-compte.ts) — dans le délai
// du crochet : passé, elles sont dites illisibles, et la file se lit sans elles.
export function stationsParGh(gh: string, delaiMs: number = DELAI_MS): () => Promise<StationsLues> {
  return async () => {
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const muettes = new Promise<StationsLues>((resoudre) => {
      minuteur = setTimeout(() => resoudre({ illisibles: `no answer in ${Math.round(delaiMs / 1000)} s` }), delaiMs);
    });
    const lues = lireLesStationsDuCompte({ gh, delaiMs }).then((lu): StationsLues => (lu.state === "listed" ? { lues: lu.stations } : { illisibles: lu.reason }));
    try {
      return await Promise.race([lues, muettes]);
    } finally {
      clearTimeout(minuteur);
    }
  };
}

// Ce que le crochet écrit : toujours un contexte, même quand la file n'a pas pu être lue. `dossier` : celui de la
// session, dont l'`origin` donne le dépôt quand le fichier des projets ne le donne pas.
export async function jouer(gh: string, cible: Cible, dossier: string, delaiMs: number = DELAI_MS): Promise<string> {
  const depot = cible.depot || (await depotDeLOrigine(process.env.BRIGADE_GIT_BIN || "git", dossier));
  if (depot === undefined) return sortieDuCrochet(contexteDeLaFile(cible, { lue: false, raison: "", sansDepot: true }));
  const appeler = appelParGh(gh, delaiMs);
  const [lecture, ecriture] = await Promise.all([lireLaFile(appeler, depot, undefined, stationsParGh(gh, delaiMs)), ecritureSurLeDepot(depot, appeler)]);
  const ecrit = contexteDeLEcriture(depot, ecriture);
  return sortieDuCrochet(`${contexteDeLaFile(cible, lecture)}${ecrit === "" ? "" : `\n\n${ecrit}`}`);
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

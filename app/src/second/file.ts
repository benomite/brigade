// La file du projet, lue pour le second par un crochet `SessionStart` (startup, resume, compact) : à l'ouverture
// de la session et après chaque compaction, `claude` joue ce module, qui lance `brigade <nom> status` sur la box
// et rend sa sortie comme contexte additionnel — le second la voit sans y penser (role.md, « On opening »).
//
// Le crochet n'est que dans les réglages du lancement de l'onglet Second (lancement.ts, `--settings`) : aucun
// fichier du projet ne le porte, une session `claude` ordinaire du même dossier ne le joue pas.
//
// La sortie du geste est rendue mot pour mot. Une file qu'on n'a pas pu lire est dite telle, dans les mots de
// role.md, au lieu d'échouer en silence — et le crochet sort toujours en 0 : il ne bloque jamais la session.
import { execFile } from "node:child_process";
import { sep } from "node:path";
import { cite } from "../box.ts";
import type { Crochets } from "./lancement.ts";

export const EVENEMENT = "SessionStart";
// Les trois façons dont une session commence : neuve, reprise, ou après une compaction.
export const MATCHER = "startup|resume|compact";
export const DELAI_MS = 30_000;
const CONNEXION_S = 10;
// Le délai de `claude` pour le crochet, en secondes : celui de la lecture, et de la marge.
const DELAI_DU_CROCHET_S = 45;

export type Cible = { nom: string; hote?: string };
export type Lecture = { code: number | null; sortie: string; erreurs: string; delaiDepasse?: true };

// Ce que le crochet dit au second quand rien n'a pu être lu — les phrases de role.md, dans sa table.
export function contexteDeLaFile(cible: Cible, lecture: Lecture | undefined): string {
  const entete = `The project's queue, read by the app at the start of this session (or after a compaction) with \`brigade ${cible.nom} status\`. This is your reading: do not run it again.`;
  const non = (phrase: string, suite = "") => `${entete}\n\n${phrase}${suite === "" ? "" : `\n${suite}`}`;
  if (cible.hote === undefined || lecture === undefined) return non("file non lue : aucun runtime déclaré pour ce projet dans ~/.config/brigade/app.json");
  const ecrit = (lecture.erreurs.trim() || lecture.sortie.trim()).trim();
  if (lecture.delaiDepasse === true) return non("file non lue : aucune réponse en 30 s");
  if (lecture.code === null) return non("file non lue : la lecture n'a pas pu être lancée", ecrit);
  if (lecture.code === 255) return non("file non lue : box pas jointe", ecrit);
  if (lecture.code >= 64 && lecture.code <= 68) return non(`file non lue : box jointe, mais son geste a refusé (code ${lecture.code})`, ecrit);
  if (lecture.code !== 0) return non(`file non lue : box jointe, mais la commande a échoué (code ${lecture.code})`, ecrit);
  return `${entete}\n\n${lecture.sortie.replace(/\s+$/, "")}`;
}

// Le format que `claude` attend d'un crochet `SessionStart` : du JSON sur la sortie standard.
export const sortieDuCrochet = (contexte: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: EVENEMENT, additionalContext: contexte } });

// La lecture, par `ssh` comme le fait la veille (box.ts). Jamais d'exception : ce qui arrive est rendu.
export function lire(ssh: string, cible: Required<Cible>, delaiMs: number = DELAI_MS): Promise<Lecture> {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${CONNEXION_S}`, "--", cible.hote, `brigade ${cite(cible.nom)} status`];
  return new Promise((resoudre) => {
    execFile(ssh, args, { windowsHide: true, timeout: delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre({ code: 0, sortie, erreurs });
      if (erreur.killed === true) return resoudre({ code: null, sortie, erreurs, delaiDepasse: true });
      resoudre({ code: typeof erreur.code === "number" ? erreur.code : null, sortie, erreurs: erreurs || erreur.message });
    });
  });
}

// Ce que le crochet écrit : toujours un contexte, même quand la file n'a pas pu être lue.
export async function jouer(ssh: string, cible: Cible, delaiMs: number = DELAI_MS): Promise<string> {
  const lecture = cible.hote === undefined ? undefined : await lire(ssh, { nom: cible.nom, hote: cible.hote }, delaiMs);
  return sortieDuCrochet(contexteDeLaFile(cible, lecture));
}

// Citée pour le shell qui joue le crochet. Sous Windows, `claude` le joue par le `bash` de Git, qui lit `C:/…`.
const cite1 = (mot: string, separateur: string) => `'${(separateur === "\\" ? mot.replaceAll("\\", "/") : mot).replaceAll("'", `'\\''`)}'`;

// Le crochet des réglages du second : `node file.ts <nom> <hote> <ssh>`.
export function crochetsDeLaFile(options: { node: string; ssh: string; cible: Cible; script?: string; separateur?: string }): Crochets {
  const separateur = options.separateur ?? sep;
  const script = options.script ?? import.meta.filename;
  const mots = [options.node, script, options.cible.nom, options.cible.hote ?? "", options.ssh].map((mot) => cite1(mot, separateur));
  return { [EVENEMENT]: [{ matcher: MATCHER, hooks: [{ type: "command", command: mots.join(" "), timeout: DELAI_DU_CROCHET_S }] }] };
}

// À la main : `node app/src/second/file.ts <nom> [<hote> [<ssh>]]` rend ce que `claude` recevrait.
if (import.meta.main) {
  const [nom, hote, ssh] = process.argv.slice(2);
  try {
    process.stdout.write(`${await jouer(ssh || "ssh", { nom: nom ?? "", ...(hote ? { hote } : {}) })}\n`);
  } catch (erreur) {
    process.stdout.write(`${sortieDuCrochet(`The project's queue could not be read: file non lue : ${erreur instanceof Error ? erreur.message : String(erreur)}`)}\n`);
  }
  process.exit(0);
}

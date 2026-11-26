// Le rôle du second, redit à la session quand l'init du projet est mergée pendant qu'elle tourne (#2689).
//
// L'app donne le rôle au début de la session (role.md, et la file par le crochet `SessionStart` de file.ts). Le second
// y lit ses bindings dans le `## Équipe multi-agents` du `CLAUDE.md` que `claude` a chargé : une session ouverte sur un
// projet pas encore préparé n'en a pas : son lancement y démarre la mise en place (runtime/src/second-init/demarrage.ts, #3167),
// qui finit par une PR à merger.
// Une fois la PR de l'init mergée, rien ne le lui redisait : la même session répondait en assistant quelconque.
//
// Deux moments, deux crochets (hook-du-role.ts) :
// - `debut` (`SessionStart` : ouverture, reprise, compaction) note, pour cette session, si le `CLAUDE.md` du dossier
//   porte la section — ce que `claude` vient de charger. Rien d'autre : il ne lit pas GitHub.
// - `prompt` (`UserPromptSubmit`), pour une session née sans la section seulement, lit le `CLAUDE.md` de la branche
//   d'intégration sur GitHub, par le `gh` du poste. Dès qu'il y porte la section, il rend comme contexte additionnel le
//   texte du rôle, la section lue, et la file lue à neuf (file.ts) — une seule fois : la session est alors notée avec.
//   Une session née avec la section ne coûte rien à ses prompts : ni `gh`, ni sortie.
//
// La note d'une session est un fichier du dossier temporaire du poste, à son identifiant : rien n'est écrit dans le
// projet. Comme file.ts, le crochet sort toujours en 0 et ne bloque jamais la session ; ce qui échoue ne rend rien.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryDeLOrigine } from "../addition.ts";
import type { CallGitHub } from "../tableau/client.ts";
import type { Cible } from "./hook-de-la-file.ts";
import { callParGh, contextDeLaFile, DELAY_MS, lireLaFile, type Read } from "./file.ts";
import { ROLE_DU_SECOND } from "./launch.ts";
import { blockage } from "./blockage-du-second.ts";

export const SECTION = "## Équipe multi-agents";

// La section des bindings d'un `CLAUDE.md`, de son titre au titre de même niveau qui suit ; rien quand il n'en a pas.
export function sectionDesBindings(claudeMd: string): string | undefined {
  const lines = claudeMd.split(/\r?\n/);
  const debut = lines.findIndex((line) => line.trimEnd() === SECTION);
  if (debut < 0) return undefined;
  const fin = lines.findIndex((line, rang) => rang > debut && /^## /.test(line));
  return lines.slice(debut, fin < 0 ? undefined : fin).join("\n").trim();
}

// Ce que `claude` passe au crochet sur son entrée standard — seuls ces deux champs servent.
export type Entree = { session_id?: string; cwd?: string; prompt?: string };
// Ce qu'une session a de noté : `sans`, née sans la section et pas encore redite ; `avec`, rien à redire.
type Note = "avec" | "sans";

// `notes` : le dossier des notes — celui du dossier temporaire du poste, hors des essais.
export const NOTES = (): string => join(tmpdir(), "brigade-second-role");
const noteDe = (notes: string, session: string) => join(notes, session.replace(/[^\w.-]/g, "_"));

function lireNote(notes: string, session: string): Note | undefined {
  try {
    const note = readFileSync(noteDe(notes, session), "utf8").trim();
    return note === "avec" || note === "sans" ? note : undefined;
  } catch {
    return undefined;
  }
}

function noter(notes: string, session: string, note: Note): void {
  mkdirSync(notes, { recursive: true });
  writeFileSync(noteDe(notes, session), note);
}

// Au début de la session : la section est-elle dans le `CLAUDE.md` que `claude` a chargé ?
export function debut(entree: Entree, notes: string = NOTES()): void {
  if (!entree.session_id) return;
  let claudeMd = "";
  try {
    claudeMd = readFileSync(join(entree.cwd ?? process.cwd(), "CLAUDE.md"), "utf8");
  } catch {}
  noter(notes, entree.session_id, sectionDesBindings(claudeMd) === undefined ? "sans" : "avec");
}

// Le `CLAUDE.md` de la branche d'intégration, tel que GitHub le tient ; rien quand il ne le rend pas.
export async function claudeMdDeLaBase(appeler: CallGitHub, repository: string, base?: string): Promise<string | undefined> {
  const answer = await appeler(`/repos/${repository}/contents/CLAUDE.md${base ? `?ref=${encodeURIComponent(base)}` : ""}`);
  const contenu = (answer.data as { content?: unknown } | undefined)?.content;
  return answer.status === 200 && typeof contenu === "string" ? Buffer.from(contenu, "base64").toString("utf8") : undefined;
}

// Ce que le second reçoit quand la section apparaît : son rôle, ses bindings, la file lue à neuf.
export function contextDuRole(cible: Cible, role: string, section: string, read: Read): string {
  const ou = cible.base ? `its integration branch \`${cible.base}\`` : "its integration branch";
  return [
    `The project was set up for Brigade during this session: the pull request of \`/brigade:init\` is merged, and the \`${SECTION}\` section is now in the \`CLAUDE.md\` of ${ou}. You were the second from the start, and you still are: nothing has to be typed or invoked. The app gives you your role again, with the bindings read on GitHub and the project's queue read now. From this message on, hold this role and answer as the second: relay the queue as on opening.`,
    `Your role, as the app gives it at the start of the session:\n\n${role.trim()}`,
    `The project's bindings, read from \`CLAUDE.md\` on GitHub (your working copy may not have them yet):\n\n${section}`,
    contextDeLaFile(cible, read, "after the init was merged"),
  ].join("\n\n---\n\n");
}

// Le format que `claude` attend d'un crochet `UserPromptSubmit`.
export const sortieDuPrompt = (context: string): string => JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } });

// À un message du chef : rien, sauf pour une session née sans la section, dès que la branche d'intégration la porte.
export async function prompt(entree: Entree, cible: Cible, appeler: CallGitHub, notes: string = NOTES(), role: string = readFileSync(ROLE_DU_SECOND, "utf8")): Promise<string> {
  if (!entree.session_id || lireNote(notes, entree.session_id) !== "sans") return "";
  const repository = cible.depot || (await repositoryDeLOrigine(process.env.BRIGADE_GIT_BIN || "git", entree.cwd ?? process.cwd()));
  if (repository === undefined) return "";
  const claudeMd = await claudeMdDeLaBase(appeler, repository, cible.base);
  const section = claudeMd === undefined ? undefined : sectionDesBindings(claudeMd);
  if (section === undefined) return "";
  const read = await lireLaFile(appeler, repository);
  noter(notes, entree.session_id, "avec");
  return sortieDuPrompt(contextDuRole({ ...cible, depot: repository }, role, section, read));
}

const lireEntree = (): Entree => {
  try {
    return JSON.parse(readFileSync(0, "utf8")) as Entree;
  } catch {
    return {};
  }
};

// Joué par `claude` : `node role-apres-init.ts <debut|prompt> <nom> <depot> <base> <gh>`.
if (import.meta.main) {
  const [moment, name, repository, base, gh] = process.argv.slice(2);
  try {
    const entree = lireEntree();
    const cible: Cible = { nom: name ?? "", ...(repository ? { depot: repository } : {}), ...(base ? { base } : {}) };
    if (moment === "debut") debut(entree);
    else if (moment === "vue") {
      const sortie = blockage(entree, cible);
      if (sortie !== "") process.stdout.write(`${sortie}\n`);
    }
    else if (moment === "prompt") {
      const sortie = await prompt(entree, cible, callParGh(gh || "gh", DELAY_MS));
      if (sortie !== "") process.stdout.write(`${sortie}\n`);
    }
  } catch {}
  process.exit(0);
}

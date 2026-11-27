// Le rôle du second, redit à la session quand l'init du projet est mergée pendant qu'elle tourne (#2689).
//
// L'app donne le rôle au début de la session (role.md, et la file par le crochet `SessionStart` de file.ts). Le second
// y lit ses bindings dans le `## Équipe multi-agents` du `CLAUDE.md` que `claude` a chargé : une session ouverte sur un
// projet pas encore préparé n'en a pas : son lancement y démarre la mise en place (runtime/src/second-init/demarrage.ts, #3167),
// qui finit par une PR à merger.
// Une fois la PR de l'init mergée, rien ne le lui redisait : la même session répondait en assistant quelconque.
//
// Deux moments, deux crochets (hook-of-role.ts) :
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
import { repositoryOfTheOrigin } from "../addition.ts";
import type { CallGitHub } from "../board/client.ts";
import type { Target } from "./hook-of-the-file.ts";
import { callParGh, contextOfTheFile, DELAY_MS, readTheFile, type Reading } from "./file.ts";
import { ROLE_OF_SECOND } from "./launch.ts";
import { blockage } from "./blockage-of-second.ts";

export const SECTION = "## Équipe multi-agents";

// La section des bindings d'un `CLAUDE.md`, de son titre au titre de même niveau qui suit ; rien quand il n'en a pas.
export function sectionOfBindings(claudeMd: string): string | undefined {
  const lines = claudeMd.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === SECTION);
  if (start < 0) return undefined;
  const end = lines.findIndex((line, rank) => rank > start && /^## /.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}

// Ce que `claude` passe au crochet sur son entrée standard — seuls ces deux champs servent.
export type Entry = { session_id?: string; cwd?: string; prompt?: string };
// Ce qu'une session a de noté : `sans`, née sans la section et pas encore redite ; `avec`, rien à redire.
type Note = "avec" | "sans";

// `notes` : le dossier des notes — celui du dossier temporaire du poste, hors des essais.
export const NOTES = (): string => join(tmpdir(), "brigade-second-role");
const noteOf = (notes: string, session: string) => join(notes, session.replace(/[^\w.-]/g, "_"));

function readNote(notes: string, session: string): Note | undefined {
  try {
    const note = readFileSync(noteOf(notes, session), "utf8").trim();
    return note === "avec" || note === "sans" ? note : undefined;
  } catch {
    return undefined;
  }
}

function note(notes: string, session: string, note: Note): void {
  mkdirSync(notes, { recursive: true });
  writeFileSync(noteOf(notes, session), note);
}

// Au début de la session : la section est-elle dans le `CLAUDE.md` que `claude` a chargé ?
export function start(entry: Entry, notes: string = NOTES()): void {
  if (!entry.session_id) return;
  let claudeMd = "";
  try {
    claudeMd = readFileSync(join(entry.cwd ?? process.cwd(), "CLAUDE.md"), "utf8");
  } catch {}
  note(notes, entry.session_id, sectionOfBindings(claudeMd) === undefined ? "sans" : "avec");
}

// Le `CLAUDE.md` de la branche d'intégration, tel que GitHub le tient ; rien quand il ne le rend pas.
export async function claudeMdOfTheBase(call: CallGitHub, repository: string, base?: string): Promise<string | undefined> {
  const answer = await call(`/repos/${repository}/contents/CLAUDE.md${base ? `?ref=${encodeURIComponent(base)}` : ""}`);
  const content = (answer.data as { content?: unknown } | undefined)?.content;
  return answer.status === 200 && typeof content === "string" ? Buffer.from(content, "base64").toString("utf8") : undefined;
}

// Ce que le second reçoit quand la section apparaît : son rôle, ses bindings, la file lue à neuf.
export function contextOfRole(target: Target, role: string, section: string, reading: Reading): string {
  const or = target.base ? `its integration branch \`${target.base}\`` : "its integration branch";
  return [
    `The project was set up for Brigade during this session: the pull request of \`/brigade:init\` is merged, and the \`${SECTION}\` section is now in the \`CLAUDE.md\` of ${or}. You were the second from the start, and you still are: nothing has to be typed or invoked. The app gives you your role again, with the bindings read on GitHub and the project's queue read now. From this message on, hold this role and answer as the second: relay the queue as on opening.`,
    `Your role, as the app gives it at the start of the session:\n\n${role.trim()}`,
    `The project's bindings, read from \`CLAUDE.md\` on GitHub (your working copy may not have them yet):\n\n${section}`,
    contextOfTheFile(target, reading, "after the init was merged"),
  ].join("\n\n---\n\n");
}

// Le format que `claude` attend d'un crochet `UserPromptSubmit`.
export const outputOfPrompt = (context: string): string => JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } });

// À un message du chef : rien, sauf pour une session née sans la section, dès que la branche d'intégration la porte.
export async function prompt(entry: Entry, target: Target, call: CallGitHub, notes: string = NOTES(), role: string = readFileSync(ROLE_OF_SECOND, "utf8")): Promise<string> {
  if (!entry.session_id || readNote(notes, entry.session_id) !== "sans") return "";
  const repository = target.depot || (await repositoryOfTheOrigin(process.env.BRIGADE_GIT_BIN || "git", entry.cwd ?? process.cwd()));
  if (repository === undefined) return "";
  const claudeMd = await claudeMdOfTheBase(call, repository, target.base);
  const section = claudeMd === undefined ? undefined : sectionOfBindings(claudeMd);
  if (section === undefined) return "";
  const reading = await readTheFile(call, repository);
  note(notes, entry.session_id, "avec");
  return outputOfPrompt(contextOfRole({ ...target, depot: repository }, role, section, reading));
}

const readEntry = (): Entry => {
  try {
    return JSON.parse(readFileSync(0, "utf8")) as Entry;
  } catch {
    return {};
  }
};

// Joué par `claude` : `node role-after-init.ts <debut|prompt> <nom> <depot> <base> <gh>`.
if (import.meta.main) {
  const [moment, name, repository, base, gh] = process.argv.slice(2);
  try {
    const entry = readEntry();
    const target: Target = { nom: name ?? "", ...(repository ? { depot: repository } : {}), ...(base ? { base } : {}) };
    if (moment === "debut") start(entry);
    else if (moment === "vue") {
      const output = blockage(entry, target);
      if (output !== "") process.stdout.write(`${output}\n`);
    }
    else if (moment === "prompt") {
      const output = await prompt(entry, target, callParGh(gh || "gh", DELAY_MS));
      if (output !== "") process.stdout.write(`${output}\n`);
    }
  } catch {}
  process.exit(0);
}

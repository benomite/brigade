// The held gestures, as the chef's TODO (#4271, epic #4209). The gate (autonomie/agents/porte.ts) holds a gesture on
// `propose` and keeps it in `autonomy-pending.json` the moment it holds it. This module reads that file and says each
// gesture the chef has to OK as one record — id, kind, summary, reason, approve command, held at — for three readers:
//   - `status`, whose `awaiting` block shows one line per held gesture, and whose `rail` line says how many wait for
//     the chef's OK when the rail is empty;
//   - the app, which lists them (`gestesTenus`) and approves one (`approuverGesteTenu`), the same gesture as
//     `brigade <project> manager approve <id>` — which goes through it too;
//   - the split's hold point (decoupage.ts), which posts one comment on the held epic per hold (`annoncerUneFois`).
//
// Nothing here holds or does a gesture: the gate does, and the running runtime does an approved one at its next tick.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approuverGeste, gestesEnAttente, type GesteEnAttente } from "../autonomie/agents/porte.ts";
import { geste } from "../geste.ts";
import { ecrireAtomique } from "../relais.ts";

// A gesture that waits for the chef's OK. `kind`: what it is, in the glossary's words (`epic split`, `closing pass`);
// `summary`: what it does, in one line (`split #4129 into 3 tickets`); `agent`: who holds it (`manager`, `closer`).
export type GesteTenu = { id: number; kind: string; summary: string; reason: string; approveCommand: string; heldAt: string; agent: string };

// What `status` reads: the held gestures, or why they cannot be read — never an empty list in place of a file that
// cannot be read.
export type LectureDesTenus = { tenus: GesteTenu[]; illisible: string | null };

// Where the chef approves a held gesture in the app.
export const DANS_L_APP = "in the app, on its line in the project's TODO";

const SPLIT = /^split the epic (#\d+) into (\d+) tickets?$/;

const KINDS: Record<string, string> = { manager: "epic split", closer: "closing pass" };

export function gesteTenu({ id, agent, line, reason, at }: GesteEnAttente, env?: NodeJS.ProcessEnv): GesteTenu {
  const split = SPLIT.exec(line);
  return {
    id,
    kind: split !== null ? "epic split" : (KINDS[agent] ?? `${agent} gesture`),
    summary: split !== null ? `split ${split[1]} into ${split[2]} tickets` : line,
    reason,
    approveCommand: geste(`manager approve ${id}`, env),
    heldAt: at,
    agent,
  };
}

// The gestures of the project whose state directory is `repertoire` that wait for the chef's OK, oldest first. An
// approved one waits for the runtime's next tick, not for the chef: it is no longer in the list. A pending file that
// cannot be read throws.
export function gestesTenus(repertoire: string, env?: NodeJS.ProcessEnv): GesteTenu[] {
  return gestesEnAttente(repertoire)
    .filter(({ approved }) => !approved)
    .map((attente) => gesteTenu(attente, env));
}

// The chef's OK to a held gesture: the same as `brigade <project> manager approve <id>`. The gesture is marked
// approved, the running runtime does it at its next tick, once, and it leaves the list. An id held nowhere throws, and
// nothing is written.
export function approuverGesteTenu(repertoire: string, id: number, env?: NodeJS.ProcessEnv): GesteTenu {
  return gesteTenu(approuverGeste(repertoire, id), env);
}

export function lireLesTenus(repertoire: string | undefined, env?: NodeJS.ProcessEnv): LectureDesTenus {
  if (repertoire === undefined) return { tenus: [], illisible: null };
  try {
    return { tenus: gestesTenus(repertoire, env), illisible: null };
  } catch (erreur) {
    return { tenus: [], illisible: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

// The lines of the `awaiting` block, one per held gesture: its summary, its reason, and how to approve it.
export function lignesDesTenus({ tenus, illisible }: LectureDesTenus, depuis: (instant: string) => string): string[] {
  return [
    ...tenus.map(({ id, summary, reason, approveCommand, heldAt }) => `held ${id}  for ${depuis(heldAt)}  ${summary} — ${reason} — waits for your OK: \`${approveCommand}\`, or ${DANS_L_APP}`),
    ...(illisible === null ? [] : [`held gestures cannot be read — ${illisible} — \`${geste("manager")}\` lists them`]),
  ];
}

const compter = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? `${un} waits` : `${plusieurs} wait`} for your OK`;

// What the `rail` line says when it is empty and gestures are held: `3 splits wait for your OK`. Null when none is.
export function direLesTenusDuRail({ tenus }: LectureDesTenus): string | null {
  const splits = tenus.filter(({ kind }) => kind === "epic split").length;
  const passes = tenus.filter(({ kind }) => kind === "closing pass").length;
  const autres = tenus.length - splits - passes;
  const parts = [
    ...(splits === 0 ? [] : [compter(splits, "split", "splits")]),
    ...(passes === 0 ? [] : [compter(passes, "closing pass", "closing passes")]),
    ...(autres === 0 ? [] : [compter(autres, "gesture", "gestures")]),
  ];
  return parts.length === 0 ? null : parts.join(" · ");
}

// The comment on the held epic's issue: held for the chef, the approve command, the place in the app.
export const MARQUEUR_TENUE = "<!-- brigade:held -->";
export function commentaireDeTenue({ summary, reason, approveCommand }: GesteTenu): string {
  return [
    MARQUEUR_TENUE,
    `**Held for the chef** — the manager's ${summary} waits for your OK (${reason}). Its tickets are not created until you approve it.`,
    "",
    `- on the box: \`${approveCommand}\``,
    `- ${DANS_L_APP}`,
  ].join("\n");
}

// The holds already announced, one key per hold (`<id>@<held at>`): an id freed by an approval and given again to a new
// hold is a new hold.
const FICHIER_DES_ANNONCES = "held-announced.json";
const cle = ({ id, heldAt }: GesteTenu) => `${id}@${heldAt}`;

function annonces(repertoire: string): string[] {
  const fichier = join(repertoire, FICHIER_DES_ANNONCES);
  if (!existsSync(fichier)) return [];
  const lu: unknown = JSON.parse(readFileSync(fichier, "utf8"));
  if (!Array.isArray(lu) || !lu.every((une) => typeof une === "string")) throw new Error(`${fichier} is not a list of held gestures announced`);
  return lu;
}

// Posts the comment of the gesture held under `id` once per hold: a second poll, or a restart, posts nothing. A post
// that fails throws and is not recorded: the next poll tries it again. A file of announces that cannot be read throws,
// and nothing is posted — a comment is never posted twice on a guess.
export async function annoncerUneFois(repertoire: string, id: number, poster: (tenu: GesteTenu) => Promise<unknown>, env?: NodeJS.ProcessEnv): Promise<boolean> {
  const tenu = gestesTenus(repertoire, env).find((un) => un.id === id);
  if (tenu === undefined) return false;
  const deja = annonces(repertoire);
  if (deja.includes(cle(tenu))) return false;
  await poster(tenu);
  // Only the holds still pending are kept: the file does not grow.
  const enCours = new Set(gestesEnAttente(repertoire).map((attente) => cle(gesteTenu(attente, env))));
  ecrireAtomique(join(repertoire, FICHIER_DES_ANNONCES), `${JSON.stringify([...deja.filter((une) => enCours.has(une)), cle(tenu)], null, 2)}\n`);
  return true;
}

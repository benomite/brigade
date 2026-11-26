// Le départ d'un projet qu'« Add a project » vient d'ouvrir (#3268, premier geste du parcours de départ) : le second sait
// déjà proposer ce qu'on met sur le rail quand un projet arrive avec des issues ouvertes — mais dans son terminal. Ce module
// le rend à la vue : les issues ouvertes du dépôt, les propositions du second, et la mise sur le rail du choix du chef.
//
// Rien n'est refait de ce que le second fait. Le triage est le sien : la section « A project just set up » de son rôle
// (second/role.md, `triageDuSecond`) est donnée telle quelle à `claude -p`, avec les issues — la même consigne, donc la même
// échelle (`prio:1` à `prio:3`) et le même motif en une ligne. La mise sur le rail est son geste : `product`, `prio:<n>` et
// `fire` posés sur l'issue, la priorité par `changerLaPriorite` (priorite.ts) comme sur une fiche.
// Rien n'est inventé quand une lecture échoue : une issue, une réponse du triage ou un label qui ne se lit pas ou ne se pose
// pas se dit, avec sa cause ; aucune priorité par défaut.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { refusDe, type AppelGitHub } from "./tableau/client.ts";
import { changerLaPriorite, type ClientDeLaPriorite } from "./priorite.ts";
import { ROLE_DU_SECOND } from "./second/lancement.ts";

// Les priorités du triage du second : `prio:1`, `prio:2`, `prio:3` (role.md, « Prioritize »).
export const PRIORITES_DU_TRIAGE: readonly number[] = [1, 2, 3];
// Au-delà, le triage est abandonné : le critère du ticket est de moins de deux minutes, triage compris.
export const DELAI_DU_TRIAGE_MS = 100_000;
const PAGES_MAX = 50;

export type Ligne = { ticket: number; titre: string; priorite: number; raison: string };
// Ce que la vue reçoit : `ouvertes`, le nombre d'issues ouvertes du dépôt (les pull requests ne comptent pas) et les
// lignes proposées — celles qui ne sont pas déjà sur le rail ; `aucune`, pas d'issue ouverte ; `sans`, ce qui n'a pas pu se lire.
export type Depart = { ouvertes: number; lignes: Ligne[] } | { aucune: true } | { sans: string; detail?: string };

type Issue = { number: number; title: string; body: string; labels: string[] };

// Lance `claude` avec ce texte sur son entrée standard — un prompt de cent issues ne tient pas dans un argument sur Windows.
export type LancerLeTriage = (commande: string, args: readonly string[], entree: string, dossier: string, delaiMs: number) => Promise<{ code: number | null; sortie: string; erreur: string }>;

export const lancerLeTriage: LancerLeTriage = (commande, args, entree, dossier, delaiMs) =>
  new Promise((resoudre) => {
    const enfant = spawn(commande, [...args], { cwd: dossier, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let sortie = "";
    let erreur = "";
    const garde = setTimeout(() => {
      erreur += `no answer within ${Math.round(delaiMs / 1000)} s`;
      enfant.kill();
    }, delaiMs);
    enfant.stdout.setEncoding("utf8").on("data", (bout: string) => (sortie += bout));
    enfant.stderr.setEncoding("utf8").on("data", (bout: string) => (erreur += bout));
    enfant.on("error", (cause) => {
      clearTimeout(garde);
      resoudre({ code: null, sortie, erreur: erreur + cause.message });
    });
    enfant.on("close", (code) => {
      clearTimeout(garde);
      resoudre({ code, sortie, erreur });
    });
    enfant.stdin.on("error", () => {});
    enfant.stdin.end(entree);
  });

// La section du rôle du second qui dit quoi proposer sur un projet qui arrive avec des issues : de son titre au titre suivant.
const TITRE_DE_LA_SECTION = "## A project just set up: an empty rail with open issues";
export function triageDuSecond(role: string): string | undefined {
  const lignes = role.split(/\r?\n/);
  const debut = lignes.findIndex((ligne) => ligne.trimEnd() === TITRE_DE_LA_SECTION);
  if (debut < 0) return undefined;
  const fin = lignes.findIndex((ligne, rang) => rang > debut && /^## /.test(ligne));
  return lignes.slice(debut, fin < 0 ? undefined : fin).join("\n").trim();
}

// Les issues ouvertes d'un dépôt, toutes les pages. Une page qui ne se lit pas : rien n'est rendu à moitié.
export async function lireLesIssuesOuvertes(lire: AppelGitHub, depot: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (let page = 1; page <= PAGES_MAX; page++) {
    const reponse = await lire(`/repos/${depot}/issues?state=open&per_page=100&page=${page}`);
    if (reponse.status !== 200) throw refusDe(`the reading of the open issues of ${depot}`, reponse);
    if (!Array.isArray(reponse.data)) throw new Error(`GitHub did not answer with a list of issues for ${depot}`);
    for (const lue of reponse.data as Record<string, unknown>[]) {
      if (typeof lue !== "object" || lue === null || "pull_request" in lue) continue;
      const labels = Array.isArray(lue.labels) ? lue.labels.flatMap((label: unknown) => (typeof label === "string" ? [label] : typeof (label as { name?: unknown })?.name === "string" ? [(label as { name: string }).name] : [])) : [];
      if (typeof lue.number !== "number" || typeof lue.title !== "string") throw new Error(`GitHub gave an issue of ${depot} without a number or a title`);
      issues.push({ number: lue.number, title: lue.title, body: typeof lue.body === "string" ? lue.body : "", labels });
    }
    if (reponse.data.length < 100) return issues;
  }
  throw new Error(`${depot} has more than ${PAGES_MAX * 100} open issues: they were not all read`);
}

const CORPS_MAX = 600;
function consigne(triage: string, issues: readonly Issue[]): string {
  const liste = issues.map(({ number, title, body, labels }) => ({ number, title, labels, body: body.length > CORPS_MAX ? `${body.slice(0, CORPS_MAX)}…` : body }));
  return [
    "Here is how the second proposes what to put on the rail of a project that arrives with open issues:",
    "",
    triage,
    "",
    "Do only its step 1, on the open issues below, which are already read and already without `fire` — run no command, ask no question, set no label.",
    `Answer with nothing but a JSON array, one object per issue: {"number": <issue number>, "prio": 1 | 2 | 3, "reason": "<the reason for that priority, in one line>"}.`,
    "",
    JSON.stringify(liste),
  ].join("\n");
}

// Ce que le triage a répondu, lu : une ligne par issue qu'il a nommée et que la liste portait. Une réponse qui ne se lit pas
// est une erreur, jamais une liste vide ou des priorités par défaut.
export function lireLaReponse(sortie: string, issues: readonly Issue[]): Ligne[] {
  const debut = sortie.indexOf("[");
  const fin = sortie.lastIndexOf("]");
  let lu: unknown;
  try {
    if (debut < 0 || fin < debut) throw new Error("no JSON list in it");
    lu = JSON.parse(sortie.slice(debut, fin + 1));
  } catch (erreur) {
    throw new Error(`the triage's answer is not a JSON list (${erreur instanceof Error ? erreur.message : String(erreur)})`);
  }
  if (!Array.isArray(lu)) throw new Error("the triage's answer is not a JSON list");
  const parNumero = new Map(issues.map((issue) => [issue.number, issue]));
  const lignes = new Map<number, Ligne>();
  for (const un of lu as Record<string, unknown>[]) {
    const issue = typeof un?.number === "number" ? parNumero.get(un.number) : undefined;
    const priorite = Number(un?.prio);
    const raison = typeof un?.reason === "string" ? un.reason.replace(/\s+/g, " ").trim() : "";
    if (issue === undefined || !PRIORITES_DU_TRIAGE.includes(priorite) || raison === "" || lignes.has(issue.number)) continue;
    lignes.set(issue.number, { ticket: issue.number, titre: issue.title, priorite, raison });
  }
  if (lignes.size === 0) throw new Error("the triage's answer names no issue of the list with a priority 1, 2 or 3 and a reason");
  return issues.flatMap(({ number }) => lignes.get(number) ?? []);
}

export type OptionsDuDepart = { depot: string; dossier: string; lire: AppelGitHub; claude: string; lancer?: LancerLeTriage; role?: string; delaiMs?: number };

// Lit les issues ouvertes du dépôt et fait trier par le second celles qui ne sont pas sur le rail.
export async function proposerLeDepart({ depot, dossier, lire, claude, lancer = lancerLeTriage, role, delaiMs = DELAI_DU_TRIAGE_MS }: OptionsDuDepart): Promise<Depart> {
  let issues: Issue[];
  try {
    issues = await lireLesIssuesOuvertes(lire, depot);
  } catch (erreur) {
    return { sans: `the open issues of ${depot} were not read on GitHub`, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (issues.length === 0) return { aucune: true };
  const aTrier = issues.filter(({ labels }) => !labels.includes("fire"));
  if (aTrier.length === 0) return { ouvertes: issues.length, lignes: [] };
  let triage: string | undefined;
  try {
    triage = triageDuSecond(role ?? readFileSync(ROLE_DU_SECOND, "utf8"));
  } catch (erreur) {
    return { sans: "the second's role was not read, so its triage cannot be asked", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (triage === undefined) return { sans: "the second's role has no section for a project that arrives with open issues", detail: TITRE_DE_LA_SECTION };
  const rendu = await lancer(claude, ["-p"], consigne(triage, aTrier), dossier, delaiMs);
  if (rendu.code !== 0) return { sans: "the second's triage did not answer", detail: rendu.erreur.trim() || `claude stopped with code ${String(rendu.code)}` };
  try {
    return { ouvertes: issues.length, lignes: lireLaReponse(rendu.sortie, aTrier) };
  } catch (erreur) {
    return { sans: "the second's triage answered something the app cannot read", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

// Le geste du second, pour les lignes restantes : sur chaque issue, sa priorité (`prio:<n>`, l'autre retirée), puis `product` et
// `fire`. Une ligne qui échoue est dite avec sa cause et les autres continuent ; `fait` : celles qui sont sur le rail.
export type Mise = { fait: number[]; refus: { ticket: number; refus: string; detail: string }[] };
export async function mettreSurLeRail({ depot, lignes, client }: { depot: string; lignes: unknown; client: ClientDeLaPriorite }): Promise<Mise> {
  const mise: Mise = { fait: [], refus: [] };
  if (!Array.isArray(lignes)) return { ...mise, refus: [{ ticket: 0, refus: "nothing was put on the rail: the screen sent no list", detail: "" }] };
  for (const ligne of lignes as Partial<Ligne>[]) {
    const ticket = ligne?.ticket as number;
    const rendu = await changerLaPriorite({ depot, ticket, valeur: typeof ligne?.priorite === "number" ? String(ligne.priorite) : undefined, client });
    if ("refus" in rendu) {
      mise.refus.push({ ticket, refus: rendu.refus, detail: rendu.detail });
      continue;
    }
    try {
      const posee = await client.ecrire("POST", `/repos/${depot}/issues/${ticket}/labels`, { labels: ["product", "fire"] });
      if (posee.status !== 200) throw refusDe("the labels `product` and `fire`", posee);
      mise.fait.push(ticket);
    } catch (erreur) {
      mise.refus.push({ ticket, refus: `#${ticket} is not on the rail: GitHub did not put \`product\` and \`fire\` on it`, detail: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }
  return mise;
}

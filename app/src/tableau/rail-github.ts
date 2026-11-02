// Les états du rail lus sur GitHub seul (#2059, épique #2053) : l'état de chaque ticket du rail est celui que
// `etatDuTicket` tire de l'issue (ses labels), de sa PR et du statut de la base (runtime/src/github-etat/etats.ts) —
// ni boîte, ni relais, ni journal de station. Deux lecteurs qui voient les mêmes labels et la même PR disent le même
// état. Le tableau de la cuisine (lecture.ts) dit quels tickets sont sur le rail, leur titre et leur ordre ; leur mot d'état,
// lui, est refait ici, comme les envois le sont (envois.ts), à chaque lecture du tableau.
//
// Les mots sont ceux du rail (faits.ts, `TONS_DE_TICKET`) ; `base rouge` est celui d'un ticket en pass dont la base est
// rouge. Un ticket que la box dit pris, en pass ou en WAITING et que GitHub ne dit d'aucun des quatre repasse « en attente » ;
// tout autre mot de la box (servi, 86, BLOQUÉ) est gardé : GitHub n'a pas d'état pour eux.
//
// Les lectures sont conditionnelles (`If-None-Match`) : un 304 ne coûte rien au quota, la réponse gardée est reprise.
import { etatDeLaBase, etatDuTicket, type EtatDeLaBase, type EtatDuTicket, type IssueLue } from "../../../runtime/src/github-etat/etats.ts";
import type { AppelGitHub } from "./client.ts";
import type { TableauLu } from "./lecture.ts";

const MOT_EN_FILE = "en attente";
export const MOT_DE_L_ETAT: Readonly<Record<EtatDuTicket, string>> = { taken: "pris", pass: "en pass", waiting: "WAITING", "base-red": "base rouge" };
// Les mots de la box que GitHub dit à sa place.
const MOTS_DES_QUATRE = new Set(["pris", "en pass", "WAITING", "base rouge"]);

export type IssueDuRail = { number: number; labels: string[]; state: "open" | "closed"; pr: IssueLue["pr"] };

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);

// Le ticket qu'une PR livre : son nom de branche `cook/<n>-…`, ou un `Closes #n` de son corps.
export function ticketDeLaPR(tete: string, corps: string): number | null {
  const branche = /^cook\/(\d+)(?:-|$)/.exec(tete)?.[1];
  const ferme = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(corps)?.[1];
  const numero = Number(branche ?? ferme);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

// Les checks d'un commit, d'après les *check runs* de GitHub. Une conclusion vide : le check court encore.
export function etatDeLaBaseGithub(runs: readonly Brut[]): EtatDeLaBase | null {
  const rouges = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
  return etatDeLaBase(runs.map((run): { outcome: "green" | "red" | "pending" } => ({ outcome: typeof run.conclusion !== "string" ? "pending" : rouges.has(run.conclusion) ? "red" : "green" })));
}

// Ce que GitHub a rendu à chaque chemin, avec son ETag : une relecture le redemande (`If-None-Match`), et un 304 ne
// coûte rien au quota — la réponse gardée est reprise.
export type MemoireDesLectures = Map<string, { etag: string; data: unknown }>;

export function lectureConditionnelle(appeler: AppelGitHub, memoire: MemoireDesLectures): AppelGitHub {
  return async (chemin) => {
    const gardee = memoire.get(chemin);
    const reponse = await appeler(chemin, gardee === undefined ? undefined : { "If-None-Match": gardee.etag });
    if (reponse.status === 304 && gardee !== undefined) return { status: 200, data: gardee.data, etag: gardee.etag };
    if (reponse.status === 200 && reponse.etag !== undefined) memoire.set(chemin, { etag: reponse.etag, data: reponse.data });
    else if (reponse.status !== 200) memoire.delete(chemin);
    return reponse;
  };
}


// Le mot d'état de chaque ticket ouvert que GitHub dit de l'un des quatre : rien ne se lit, `null`.
export async function lesEtatsSurGithub(options: { depot: string; appeler: AppelGitHub; memoire?: MemoireDesLectures }): Promise<Map<number, string> | null> {
  const { depot } = options;
  const appeler = options.memoire === undefined ? options.appeler : lectureConditionnelle(options.appeler, options.memoire);
  try {
    const issues = await appeler(`/repos/${depot}/issues?state=open&per_page=100&sort=created&direction=asc`);
    const prs = await appeler(`/repos/${depot}/pulls?state=open&per_page=100`);
    if (issues.status !== 200 || prs.status !== 200) return null;
    const livrees = new Map<number, IssueLue["pr"]>();
    for (const pr of liste(prs.data)) {
      const ticket = ticketDeLaPR(String(objet(pr.head)?.ref ?? ""), typeof pr.body === "string" ? pr.body : "");
      if (ticket !== null && !livrees.has(ticket)) livrees.set(ticket, { state: pr.state === "open" ? "open" : "closed", merged: pr.merged_at != null });
    }
    const duRail: IssueDuRail[] = liste(issues.data)
      .filter((issue) => issue.pull_request === undefined && typeof issue.number === "number")
      .map((issue) => ({ number: issue.number as number, labels: liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : [])), state: "open", pr: livrees.get(issue.number as number) ?? null }));
    // La base ne se lit que si un ticket est en pass : c'est le seul que sa couleur touche.
    let base: EtatDeLaBase | null = null;
    if (duRail.some(({ labels, pr }) => labels.includes("in-pass") && pr !== null)) {
      const defaut = await appeler(`/repos/${depot}`);
      const branche = objet(defaut.data)?.default_branch;
      if (defaut.status === 200 && typeof branche === "string") {
        const runs = await appeler(`/repos/${depot}/commits/${encodeURIComponent(branche)}/check-runs?per_page=100`);
        if (runs.status === 200) base = etatDeLaBaseGithub(liste(objet(runs.data)?.check_runs));
      }
    }
    const etats = new Map<number, string>();
    for (const { number, labels, state, pr } of duRail) {
      const etat = etatDuTicket({ state, labels, pr }, base);
      if (etat !== null) etats.set(number, MOT_DE_L_ETAT[etat]);
    }
    return etats;
  } catch {
    return null;
  }
}

// Le tableau lu, dont chaque ticket du rail porte l'état que GitHub en dit. GitHub qui ne répond pas : le tableau tel quel.
export async function avecLesEtatsGithub(lu: TableauLu, appeler: AppelGitHub, memoire?: MemoireDesLectures): Promise<TableauLu> {
  const rail = lu.faits?.rail;
  if (!Array.isArray(rail)) return lu;
  const etats = await lesEtatsSurGithub({ depot: lu.depot, appeler, ...(memoire === undefined ? {} : { memoire }) });
  if (etats === null) return lu;
  const refait = rail.map((carte: unknown) => {
    const { ticket, etat } = (carte ?? {}) as { ticket?: unknown; etat?: unknown };
    if (typeof ticket !== "number" || typeof etat !== "string") return carte;
    const dit = etats.get(ticket) ?? (MOTS_DES_QUATRE.has(etat) ? MOT_EN_FILE : etat);
    return dit === etat ? carte : { ...(carte as object), etat: dit };
  });
  return { ...lu, faits: { ...lu.faits, rail: refait } };
}

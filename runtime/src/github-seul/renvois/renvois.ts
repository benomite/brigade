// Les renvois d'une livraison rouge ou refusée, quand GitHub est le seul état
// de la cuisine (épique #2209, ticket #2211) : le port de l'ancien chemin
// (`pass.ts`, `renvois.ts`, `remontee-a-la-cuisine.ts`) sur des faits GitHub.
//
// - Une CI rouge sur la tête de la PR, ou une relecture qui demande des
//   changements sur cette tête, renvoie le ticket à un cook : la raison
//   s'écrit sur l'issue, que le cook lit, et `in-pass` tombe — le ticket
//   redevient libre, la station qui le prend reprend sa branche, sous sa PR.
// - Après `RENVOIS_MAX` renvois, plus aucun cook : le ticket est remis au
//   manager, qui ouvre un ticket `fix` sur la cause, calibré un cran au-dessus
//   du ticket, et le ticket attend ce `fix` (`waiting`).
// - Ce qui ne peut plus monter — calibrage au plafond, ticket qui est lui-même
//   un `fix` de la cuisine, ticket déjà remis une fois — sort de la cuisine
//   (`served-elsewhere`) : un humain décide, et l'issue dit pourquoi.
//
// Rien n'est tenu ici : le compte des renvois se relit des commentaires de
// l'issue, à chaque appel, et survit à l'arrêt de la station comme au passage
// d'une station à l'autre. Une livraison (une tête de PR) ne compte qu'une
// fois, même jugée rouge par la CI et par la relecture.
import { DE_CONFIANCE } from "../../alimenter.ts";
import { calibrage as calibrageDesLabels, EFFORTS, type Calibrage } from "../../calibrage.ts";
import { dernierVerdict } from "../../github-etat/fusion.ts";
import { LABEL_IN_PASS, LABEL_WAITING } from "../../github-etat/etats.ts";
import { HORS_CUISINE, LABEL } from "../../github.ts";
import { monter, PLAFOND_PAR_DEFAUT, type Plafond } from "../../reagir.ts";

// Combien de fois une livraison repart au cook avant d'être remise au
// manager : la règle de l'ancien chemin (`RENVOIS_MAX` de `pass.ts`).
export const RENVOIS_MAX = 2;

// L'effort le plus haut que la cuisine pose sans le chef, comme sur l'ancien
// chemin (`EFFORT_MAX_DE_LA_CUISINE`) : `xhigh` et `max` coûtent trop cher.
export const EFFORT_MAX_DE_LA_CUISINE = "high";

// Le ticket `fix` que le manager ouvre : ses labels hors calibrage, comme sur
// l'ancien chemin (`LABELS_DU_FIX`).
export const LABEL_FIX = "fix";
export const PRIO_DU_FIX = "prio:1";

const MARQUE_DE_RENVOI = /^<!-- brigade:renvoi n=(\d+)(?: sha=([0-9a-f]+))? -->/;
const MARQUE_DE_REMISE = /^<!-- brigade:au-manager fix=(\d+) sha=([0-9a-f]+) -->/;
// La marque d'un ticket `fix` de la cuisine, la même que l'ancien chemin
// (`marqueDeRemontee`) : un `fix` n'en ouvre pas d'autre.
const MARQUE_DE_FIX = /^\s*<!--\s*brigade:remontee (\d+)\s*-->\s*$/m;
export const marqueDeFix = (ticket: number) => `<!-- brigade:remontee ${ticket} -->`;

// Un commentaire tel que les renvois le lisent, sur l'issue comme sur la PR.
export type CommentaireLu = { id: number; body: string; association: string; createdAt: string };

// Un check de la CI tel que la raison d'un rouge le dit.
export type CheckLu = { name: string; outcome: string; url?: string | null };

// Ce que les renvois demandent au client GitHub de la station, et rien de plus.
export type GitHubDuRenvoi = {
  // Les commentaires d'une issue ou d'une PR, dans l'ordre où GitHub les rend.
  commentaires(numero: number): Promise<CommentaireLu[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  // Les checks de la CI sur le commit `sha`.
  ci(sha: string): Promise<CheckLu[]>;
  // Le corps de l'issue, où un `fix` de la cuisine porte sa marque.
  corpsDuTicket(numero: number): Promise<string>;
};

// La remise au manager : il ouvre le ticket `fix`, sous son identité, et rend
// son numéro.
export type ManagerDuRenvoi = {
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
};

export type ContexteDuRenvoi = {
  github: GitHubDuRenvoi;
  manager: ManagerDuRenvoi;
  // La station qui renvoie, telle que ses commentaires la nomment.
  station: string;
  // Jusqu'où le calibrage du `fix` peut monter : le plafond du projet.
  plafond?: Plafond;
};

// Le ticket renvoyé : une issue en pass.
export type TicketRenvoye = { number: number; title: string; labels: string[] };

// Ce qui refuse la livraison : la CI rouge sur la tête de la PR, ou la
// relecture qui y demande des changements.
export type Refus = { genre: "ci-rouge" | "relecture"; pr: number; sha: string };

// Ce que les renvois ont fait. `renvoi` : le ticket repart chez un cook, au
// renvoi `n`. `au-manager` : remis au manager, son `fix` ouvert au calibrage
// monté. `served-elsewhere` : un humain décide, pour `raison`. `rien` : rien à
// renvoyer — la CI n'est pas rouge, la relecture n'a pas refusé cette tête.
export type Coup =
  | { coup: "renvoi"; n: number; raison: string }
  | { coup: "au-manager"; n: number; raison: string; fix: number; de: Calibrage; vers: Calibrage }
  | { coup: "served-elsewhere"; n: number; raison: string }
  | { coup: "rien"; raison: string };

type Renvoi = { n: number; sha: string | null; id: number };
type Remise = { fix: number; sha: string };

const deConfiance = (commentaires: CommentaireLu[]) => commentaires.filter((commentaire) => DE_CONFIANCE.includes(commentaire.association));

// Les renvois que l'issue porte, dans l'ordre où GitHub les rend.
export function renvoisLus(commentaires: CommentaireLu[]): Renvoi[] {
  return deConfiance(commentaires).flatMap((commentaire) => {
    const marque = MARQUE_DE_RENVOI.exec(commentaire.body);
    return marque === null ? [] : [{ n: Number(marque[1]), sha: marque[2] ?? null, id: commentaire.id }];
  });
}

// Les remises au manager que l'issue porte.
export function remisesLues(commentaires: CommentaireLu[]): Remise[] {
  return deConfiance(commentaires).flatMap((commentaire) => {
    const marque = MARQUE_DE_REMISE.exec(commentaire.body);
    return marque === null ? [] : [{ fix: Number(marque[1]), sha: marque[2] as string }];
  });
}

// Le ticket `fix` dont ce corps est la correction, ou null.
export function ticketDuFix(corps: string): number | null {
  const lu = MARQUE_DE_FIX.exec(corps)?.[1];
  return lu === undefined ? null : Number(lu);
}

const rangDEffort = (effort: string) => EFFORTS.indexOf(effort as (typeof EFFORTS)[number]);

// Le calibrage un cran au-dessus — l'effort d'abord, puis le modèle —, dans la
// limite du plafond et jamais au-delà de `high`, comme sur l'ancien chemin
// (`calibrageAuDessus`). Null : rien ne peut monter.
export function calibrageAuDessus(pose: Calibrage, plafond: Plafond = PLAFOND_PAR_DEFAUT): Calibrage | null {
  const effort = rangDEffort(plafond.effort) > rangDEffort(EFFORT_MAX_DE_LA_CUISINE) ? EFFORT_MAX_DE_LA_CUISINE : plafond.effort;
  const cible = monter(pose, { model: plafond.model, effort }, { model: true, effort: true });
  return cible === null || rangDEffort(cible.effort) > rangDEffort(EFFORT_MAX_DE_LA_CUISINE) ? null : cible;
}

const court = (sha: string) => sha.slice(0, 7);
const dit = ({ model, effort }: Calibrage) => `\`${model}\` / \`${effort}\``;

// Pourquoi la livraison est refusée, tel que le cook le lit ; null si rien ne
// la refuse sur cette tête.
async function raisonDuRefus(refus: Refus, github: GitHubDuRenvoi): Promise<string | null> {
  if (refus.genre === "ci-rouge") {
    const rouges = (await github.ci(refus.sha)).filter(({ outcome }) => outcome === "red");
    if (rouges.length === 0) return null;
    const lignes = rouges.map(({ name, url }) => `- \`${name}\`${url ? ` — ${url}` : ""}`);
    return [`the CI is red on \`${court(refus.sha)}\` (PR #${refus.pr}):`, ...lignes].join("\n");
  }
  const commentaires = await github.commentaires(refus.pr);
  const verdict = dernierVerdict(commentaires);
  if (verdict === null || verdict.verdict !== "request-changes" || verdict.sha !== refus.sha) return null;
  // Le motif suit le marqueur et sa ligne « Changes requested by station … ».
  const motif = commentaires.find(({ id }) => id === verdict.commentaire)?.body.split("\n").slice(2).join("\n").trim() || `see PR #${refus.pr}`;
  return `the review requested changes on \`${court(refus.sha)}\` (PR #${refus.pr}):\n\n${motif}`;
}

// Ce que les renvois précédents ont dit, tel que le `fix` le cite.
const raisonsPrecedentes = (commentaires: CommentaireLu[]) =>
  deConfiance(commentaires).flatMap(({ body }) => (MARQUE_DE_RENVOI.test(body) ? [body.split("\n").slice(1).join("\n").trim()] : []));

function corpsDuFix(ticket: TicketRenvoye, n: number, de: Calibrage, vers: Calibrage, raisons: string[]): string {
  const vu = raisons.flatMap((raison) => [...raison.split("\n").map((ligne) => `> ${ligne}`), ""]);
  return [
    marqueDeFix(ticket.number),
    "",
    "## Context",
    "",
    `The delivery of #${ticket.number} (${ticket.title}) is still not mergeable after ${n - 1} sends back to a cook, calibrated ${dit(de)}. No cook takes #${ticket.number} again: it waits (\`${LABEL_WAITING}\`) for this ticket, calibrated one step above, ${dit(vers)}.`,
    "",
    "## What the kitchen saw",
    "",
    ...(vu.length === 0 ? [`Read the comments on #${ticket.number}.`, ""] : vu),
    "## Acceptance criteria",
    "",
    "- The cause is found where it lives — the delivery, the base, a test, the CI, the tooling, the runtime — and fixed there; or, if it cannot be, this issue says why.",
    `- #${ticket.number} is mergeable again, or this issue says what it still lacks.`,
    "",
    "---",
    "",
    `_Opened by the manager after the sends back of #${ticket.number}, with no gesture from the chef. Calibrated ${dit(vers)}, one step above ${dit(de)}, \`${PRIO_DU_FIX}\`._`,
  ].join("\n");
}

// Pourquoi rien ne peut plus monter, tel que l'issue le dit.
function raisonDeSortie(pose: Calibrage | null, estUnFix: boolean, dejaRemis: Remise | undefined, plafond: Plafond): string {
  if (dejaRemis !== undefined) return `it was already handed to the manager once (fix ticket #${dejaRemis.fix}), and it is still not mergeable`;
  if (estUnFix) return "it is itself a fix ticket of the kitchen: another fix ticket would not end";
  if (pose === null) return `its calibration is incomplete (\`model:\` / \`effort:\`): nothing to raise`;
  return `its calibration (${dit(pose)}) is already the highest the kitchen sets — the project's ceiling (${dit(plafond)}), and never above \`${EFFORT_MAX_DE_LA_CUISINE}\``;
}

// Le point d'entrée de la boucle GitHub seul : une livraison du ticket en pass
// est rouge (`ci-rouge`) ou refusée (`relecture`). Renvoie le ticket à un cook
// avec la raison, ou, ses renvois épuisés, le remet au manager — ou le sort de
// la cuisine si rien ne peut plus monter. Rejouée sur la même tête, elle ne
// compte pas un renvoi de plus et n'ouvre pas un second `fix` : elle refait
// les labels que l'appel d'avant n'a pas pu poser.
export async function renvoyerLaLivraison(ticket: TicketRenvoye, refus: Refus, contexte: ContexteDuRenvoi): Promise<Coup> {
  const { github, manager, station } = contexte;
  const plafond = contexte.plafond ?? PLAFOND_PAR_DEFAUT;
  const issue = ticket.number;
  const commentaires = await github.commentaires(issue);
  const renvois = renvoisLus(commentaires);
  const remises = remisesLues(commentaires);
  const libere = async () => {
    if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(issue, LABEL_IN_PASS);
  };

  // Cette tête a déjà été renvoyée, ou remise : rien ne se compte deux fois.
  const dejaRenvoyee = renvois.find(({ sha }) => sha === refus.sha);
  const dejaRemise = remises.find(({ sha }) => sha === refus.sha);
  if (dejaRemise !== undefined) {
    if (!ticket.labels.includes(LABEL_WAITING)) await github.labelliser(issue, [LABEL_WAITING]);
    await libere();
    return { coup: "rien", raison: `this delivery was already handed to the manager (fix ticket #${dejaRemise.fix})` };
  }
  if (dejaRenvoyee !== undefined) {
    await libere();
    return { coup: "rien", raison: `this delivery was already sent back (${dejaRenvoyee.n}/${RENVOIS_MAX})` };
  }

  const raison = await raisonDuRefus(refus, github);
  if (raison === null) return { coup: "rien", raison: refus.genre === "ci-rouge" ? "no check is red on this head" : "the review did not request changes on this head" };

  const n = renvois.length + 1;
  if (renvois.length < RENVOIS_MAX) {
    await github.commenter(issue, `<!-- brigade:renvoi n=${n} sha=${refus.sha} -->\nStation \`${station}\`: sent back to a cook (${n}/${RENVOIS_MAX}) — ${raison}\n\nThe next cook takes up the branch of PR #${refus.pr}, fixes what is said above, and delivers again.`);
    await libere();
    return { coup: "renvoi", n, raison };
  }

  // Les renvois sont épuisés : plus aucun cook ne le prend.
  const lu = calibrageDesLabels(ticket.labels);
  const pose = lu.model !== null && lu.effort !== null ? { model: lu.model, effort: lu.effort } : null;
  const estUnFix = ticketDuFix(await github.corpsDuTicket(issue)) !== null;
  const vers = pose === null || estUnFix || remises.length > 0 ? null : calibrageAuDessus(pose, plafond);
  if (pose === null || vers === null) {
    const pourquoi = raisonDeSortie(pose, estUnFix, remises[0], plafond);
    await github.commenter(issue, `<!-- brigade:renvoi n=${n} sha=${refus.sha} -->\nStation \`${station}\`: still not mergeable after ${n - 1} sends back — ${raison}\n\nTaken off the kitchen (\`${HORS_CUISINE}\`): ${pourquoi}. A human decides.`);
    await github.labelliser(issue, [HORS_CUISINE]);
    await libere();
    return { coup: "served-elsewhere", n, raison: pourquoi };
  }
  // `waiting` d'abord : entre la création du `fix` et son commentaire, aucune
  // station ne relit le ticket en pass ni ne le reprend.
  await github.labelliser(issue, [LABEL_WAITING]);
  const fix = await manager.creerIssue({
    titre: `Find why the delivery of #${issue} stays not mergeable after ${RENVOIS_MAX} sends back`,
    corps: corpsDuFix(ticket, n, pose, vers, [...raisonsPrecedentes(commentaires), raison]),
    labels: [LABEL, LABEL_FIX, PRIO_DU_FIX, `model:${vers.model}`, `effort:${vers.effort}`],
  });
  await github.commenter(
    issue,
    `<!-- brigade:au-manager fix=${fix} sha=${refus.sha} -->\nStation \`${station}\`: still not mergeable after ${RENVOIS_MAX} sends back — ${raison}\n\nNo cook takes it again: handed to the manager, who opened the fix ticket #${fix}, calibrated ${dit(vers)}, one step above ${dit(pose)}. This ticket waits for it (\`${LABEL_WAITING}\`).`,
  );
  await libere();
  return { coup: "au-manager", n, raison, fix, de: pose, vers };
}

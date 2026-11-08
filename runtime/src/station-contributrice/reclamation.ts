// La prise d'un ticket par une station contributrice (#2935, épique #2927) :
// une station qui n'a pas l'écriture sur le dépôt ne peut ni poser `taken`, ni
// s'assigner l'issue — GitHub ne lui laisse que le commentaire. Elle prend donc
// un ticket en postant un commentaire de prise signé de son compte, puis relit
// l'issue : la plus ancienne prise encore valable l'emporte, et toute station
// qui relit l'issue lit le même gagnant.
//
// - Une prise ne compte que si le compte qui la poste est celui qu'elle nomme :
//   tout le monde peut commenter une issue publique, personne ne prend au nom
//   d'un autre.
// - Elle tient jusqu'à son lâcher (un commentaire de lâcher de la même station,
//   du même compte), ou jusqu'à son échéance, `BAIL_DE_PRISE_MS` après qu'elle
//   a été postée : une station qui s'est tue ne garde pas le ticket. La station
//   qui cuisine plus longtemps reposte sa prise avant l'échéance (`renouveler`).
// - Une station qui perd lâche aussitôt sa prise : un lâcher n'annule que les
//   prises de sa station, et la sienne tiendrait sinon le ticket dès que la
//   gagnante le lâche.
//
// Ce module ne lit et n'écrit que par le client de GitHub qu'on lui passe.
import type { Commentaire } from "../github.ts";

// Ce qu'une prise tient au plus sans être renouvelée.
export const BAIL_DE_PRISE_MS = 6 * 60 * 60_000;

const NOM_DE_STATION = /^[A-Za-z0-9._/-]+$/;
const LOGIN = /^[A-Za-z0-9-]+$/;
const MARQUE_DE_PRISE = /^<!-- brigade:reclame station=([A-Za-z0-9._/-]+) login=([A-Za-z0-9-]+) -->/;
const MARQUE_DE_LACHER = /^<!-- brigade:rend station=([A-Za-z0-9._/-]+) login=([A-Za-z0-9-]+) -->/;

export const corpsDeReclamation = (station: string, login: string) =>
  `<!-- brigade:reclame station=${station} login=${login} -->\nClaimed by contributor station \`${station}\` (@${login}), which cooks it in its fork.`;
export const corpsDeRendu = (station: string, login: string) => `<!-- brigade:rend station=${station} login=${login} -->\nReleased by contributor station \`${station}\` (@${login}).`;

// Ce que la prise demande au client de GitHub, et rien de plus.
export type GitHubDeLaReclamation = {
  // Les commentaires de l'issue, du plus ancien au plus récent.
  commentaires(numero: number): Promise<Commentaire[]>;
  commenter(numero: number, corps: string): Promise<void>;
};

// La prise qui tient le ticket : la station, son compte, quand elle a été postée.
export type Reclamation = { station: string; login: string; createdAt: string };

export type ContexteDeReclamation = { github: GitHubDeLaReclamation; station: string; login: string; maintenant: () => Date; bailMs?: number };

const memeCompte = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Qui tient le ticket à `maintenant`, d'après les commentaires de l'issue.
// Deux commentaires de la même seconde se départagent par l'ordre où GitHub les rend.
export function reclamant(commentaires: readonly Commentaire[], maintenant: number, bailMs = BAIL_DE_PRISE_MS): Reclamation | null {
  type Fait = { instant: number; rang: number; genre: "prise" | "lacher"; station: string; login: string; createdAt: string };
  const faits: Fait[] = [];
  commentaires.forEach((commentaire, rang) => {
    const instant = Date.parse(commentaire.createdAt);
    if (Number.isNaN(instant)) return;
    const prise = MARQUE_DE_PRISE.exec(commentaire.body);
    const lacher = prise === null ? MARQUE_DE_LACHER.exec(commentaire.body) : null;
    const marque = prise ?? lacher;
    if (marque === null) return;
    const [, station = "", login = ""] = marque;
    if (!memeCompte(commentaire.author, login)) return;
    faits.push({ instant, rang, genre: prise === null ? "lacher" : "prise", station, login, createdAt: commentaire.createdAt });
  });
  faits.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  const valables: Fait[] = [];
  for (const fait of faits) {
    if (fait.genre === "prise") valables.push(fait);
    else for (let i = valables.length - 1; i >= 0; i -= 1) if (valables[i]?.station === fait.station && memeCompte(valables[i]?.login ?? "", fait.login)) valables.splice(i, 1);
  }
  const tient = valables.find((fait) => maintenant - fait.instant < bailMs);
  return tient === undefined ? null : { station: tient.station, login: tient.login, createdAt: tient.createdAt };
}

const estLaMienne = (tient: Reclamation | null, { station, login }: Pick<ContexteDeReclamation, "station" | "login">) => tient !== null && tient.station === station && memeCompte(tient.login, login);

async function lire(numero: number, { github, maintenant, bailMs }: ContexteDeReclamation): Promise<Reclamation | null> {
  return reclamant(await github.commentaires(numero), maintenant().getTime(), bailMs);
}

// Prend le ticket : si personne ne le tient, poste la prise, puis relit l'issue
// — c'est la relecture qui dit qui l'emporte. Déjà tenu par une autre, n'écrit rien.
export async function reclamer(numero: number, contexte: ContexteDeReclamation): Promise<{ prise: boolean; tenant: Reclamation | null }> {
  if (!NOM_DE_STATION.test(contexte.station)) throw new Error(`station name not usable in a claim comment: ${JSON.stringify(contexte.station)}`);
  if (!LOGIN.test(contexte.login)) throw new Error(`GitHub login not usable in a claim comment: ${JSON.stringify(contexte.login)}`);
  let tient = await lire(numero, contexte);
  if (tient !== null) return { prise: estLaMienne(tient, contexte), tenant: tient };
  await contexte.github.commenter(numero, corpsDeReclamation(contexte.station, contexte.login));
  tient = await lire(numero, contexte);
  const prise = estLaMienne(tient, contexte);
  // Perdue, sa prise est retirée : sans quoi elle tiendrait le ticket dès que
  // la gagnante le lâche, pour une station qui est passée à un autre.
  if (!prise) await contexte.github.commenter(numero, corpsDeRendu(contexte.station, contexte.login));
  return { prise, tenant: tient };
}

// Reposte la prise que la station tient, quand plus de la moitié de son bail
// est passée : sans elle, le ticket s'offrirait aux autres pendant que son cook
// travaille. Rend faux si la station ne le tient plus — lâché ou échu.
export async function renouveler(numero: number, contexte: ContexteDeReclamation): Promise<boolean> {
  const tient = await lire(numero, contexte);
  if (!estLaMienne(tient, contexte)) return false;
  const age = contexte.maintenant().getTime() - Date.parse((tient as Reclamation).createdAt);
  if (age >= (contexte.bailMs ?? BAIL_DE_PRISE_MS) / 2) await contexte.github.commenter(numero, corpsDeReclamation(contexte.station, contexte.login));
  return true;
}

// Lâche le ticket que la station tient. Rend faux, sans rien écrire, si elle ne le tient pas.
export async function rendre(numero: number, contexte: ContexteDeReclamation): Promise<boolean> {
  if (!estLaMienne(await lire(numero, contexte), contexte)) return false;
  await contexte.github.commenter(numero, corpsDeRendu(contexte.station, contexte.login));
  return true;
}

// Un commentaire de prise ou de lâcher de station contributrice : il n'a rien à
// dire au cook, et sort du ticket qu'on lui remet.
export const estUneReclamation = (corps: string) => MARQUE_DE_PRISE.test(corps) || MARQUE_DE_LACHER.test(corps);

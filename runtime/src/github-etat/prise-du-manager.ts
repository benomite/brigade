// La prise du travail du manager sur une issue (#2568) : plusieurs stations
// servent un projet, et chacune y fait tourner son manager. Avant de juger,
// découper, requalifier une issue ou d'y dire un écart, une station prend
// l'issue sur GitHub, comme un cook prend un ticket (`prise.ts`) : elle poste un
// commentaire de prise, et le plus ancien l'emporte — l'instant que GitHub lui
// donne, puis son rang quand deux tombent dans la même seconde. Les autres
// laissent l'issue tranquille.
//
// Une prise vaut pour un état de l'issue (`etat` : l'empreinte de son titre, de
// son corps et des commentaires de confiance, celle de ses jugements) : le
// travail d'un état n'est fait qu'une fois, par une seule station, et un état
// nouveau — le chef édite le corps, ou répond — est un travail nouveau, qui se
// prend à son tour.
//
// Une prise tient :
// - pour toujours, une fois le travail fait : la station qui la tient réécrit
//   son commentaire en commentaire de travail fait (`finir`). Aucune autre ne
//   refait ce travail-là ;
// - sinon `BAIL_DU_MANAGER_MS` après son instant : une station qui s'arrête au
//   milieu du travail le rend ainsi à une autre, qui le prend après lui.
// Aucune station n'est la principale : une prise périmée compte pour rien, et
// la première prise encore vive l'emporte, d'où qu'elle vienne.
import { randomUUID } from "node:crypto";
import { DE_CONFIANCE } from "../alimenter.ts";

// Ce que dure une prise dont le travail n'est pas dit fait : plus qu'un
// jugement ou un découpage (un lancement est plafonné à 60 min par défaut),
// comme le `pending` des gates d'une tête.
export const BAIL_DU_MANAGER_MS = 90 * 60_000;

const NOM_DE_STATION = /^[A-Za-z0-9._/-]+$/;
const ETAT = /^[0-9a-f]+$/;
const MARQUE = /^<!-- brigade:manager-prise station=([A-Za-z0-9._/-]+) etat=([0-9a-f]+) jeton=([0-9a-f]+)( fait)? -->/;

// Ce que la prise demande au client de GitHub du manager, et rien de plus.
export type GitHubDuTravail = {
  // Les commentaires de l'issue, dans l'ordre où GitHub les a reçus.
  commentaires(numero: number): Promise<Array<{ body: string; association: string; createdAt: string }>>;
  commenter(numero: number, corps: string): Promise<void>;
  remplacerCommentaire(numero: number, ancien: string, nouveau: string): Promise<boolean>;
};

// La prise qui tient le travail d'un état : la station, le commentaire qui le
// dit, et si le travail est fait.
export type TenantDuTravail = { station: string; corps: string; fait: boolean; createdAt: string };

export type ContexteDuTravail = { github: GitHubDuTravail; station: string; maintenant: () => Date; bailMs?: number };

const ligne = (station: string, etat: string, jeton: string, fait: boolean) => `<!-- brigade:manager-prise station=${station} etat=${etat} jeton=${jeton}${fait ? " fait" : ""} -->`;
export const corpsDePriseDuManager = (station: string, etat: string, jeton: string) => `${ligne(station, etat, jeton, false)}\nManager work on this issue claimed by station \`${station}\`.`;
export const corpsDeTravailFait = (station: string, etat: string, jeton: string) => `${ligne(station, etat, jeton, true)}\nManager work on this issue done by station \`${station}\`.`;

// Un commentaire de prise du manager, fait ou non : il ne compte pas dans
// l'état d'une issue, que sa prise changerait sinon.
export const estUnePriseDuManager = (corps: string) => MARQUE.test(corps);

// Qui tient le travail de cet état, d'après les commentaires de l'issue : la
// première prise vive, dans l'ordre de GitHub. Nul si personne.
export function tenantDuTravail(commentaires: Array<{ body: string; association: string; createdAt: string }>, etat: string, maintenant: number, bailMs = BAIL_DU_MANAGER_MS): TenantDuTravail | null {
  const prises = commentaires.flatMap((commentaire, rang) => {
    // Tout le monde peut commenter une issue publique ; seul le dépôt prend son travail.
    if (!DE_CONFIANCE.includes(commentaire.association)) return [];
    const marque = MARQUE.exec(commentaire.body);
    const instant = Date.parse(commentaire.createdAt);
    if (!marque || marque[2] !== etat || Number.isNaN(instant)) return [];
    return [{ instant, rang, tenant: { station: marque[1] as string, corps: commentaire.body, fait: marque[4] !== undefined, createdAt: commentaire.createdAt } }];
  });
  prises.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  return prises.find(({ instant, tenant }) => tenant.fait || instant + bailMs > maintenant)?.tenant ?? null;
}

export async function lireTenantDuTravail(numero: number, etat: string, { github, maintenant, bailMs }: Omit<ContexteDuTravail, "station">): Promise<TenantDuTravail | null> {
  return tenantDuTravail(await github.commentaires(numero), etat, maintenant().getTime(), bailMs);
}

// Prend le travail de cet état pour la station : si personne ne le tient, poste
// sa prise et relit l'issue. Déjà tenu, par elle ou par une autre, n'écrit rien.
// `prise` : cette station le tient — fait ou non, c'est son journal qui dit ce
// qui lui reste à faire.
export async function prendreLeTravail(numero: number, etat: string, contexte: ContexteDuTravail): Promise<{ prise: boolean; tenant: TenantDuTravail | null }> {
  const { github, station } = contexte;
  if (!NOM_DE_STATION.test(station)) throw new Error(`station name not usable in a claim comment: ${JSON.stringify(station)}`);
  if (!ETAT.test(etat)) throw new Error(`issue state not usable in a claim comment: ${JSON.stringify(etat)}`);
  let tient = await lireTenantDuTravail(numero, etat, contexte);
  if (tient === null) {
    await github.commenter(numero, corpsDePriseDuManager(station, etat, randomUUID().slice(0, 8)));
    tient = await lireTenantDuTravail(numero, etat, contexte);
  }
  return { prise: tient?.station === station, tenant: tient };
}

// Dit le travail fait : la prise de la station devient pour toujours celle de
// cet état. Rend faux si son commentaire n'est plus sur l'issue — retiré par le
// chef : il n'y a rien à dire fait.
export async function finirLeTravail(numero: number, tenant: TenantDuTravail, github: GitHubDuTravail): Promise<boolean> {
  if (tenant.fait) return true;
  const marque = MARQUE.exec(tenant.corps);
  if (!marque) return false;
  return github.remplacerCommentaire(numero, tenant.corps, corpsDeTravailFait(marque[1] as string, marque[2] as string, marque[3] as string));
}

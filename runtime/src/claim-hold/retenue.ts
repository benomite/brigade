// La retenue d'un ticket à sa prise (#4217) : sur BOBL-tech/mirrorlab #923, le 2026-11-24, le ticket était mis de côté
// par ses échecs et en WAITING, et la même station l'a repris une minute plus tard. Un ticket parqué (#4129 : `parked`,
// `chef-todo` ou un label d'avant parked) est retenu : aucune station ne le prend. Sa retenue ne tombe que sur l'un de
// trois événements :
//   - sa date de relance passe — seul un ticket parqué jusqu'à une date reprend à sa date (`reprendALaDate`) ;
//   - un fait nouveau est ajouté sur le ticket : un commentaire d'un auteur du dépôt, posté après la marque qui le
//     parque, qui n'est pas un commentaire marqué de la cuisine (`<!-- brigade:… -->`) — une prise, un échec, une
//     reprise du manager, une trace du superviseur n'en sont pas ;
//   - le chef agit : il retire le label qui le parque. Parqué pour le chef (`chef-todo`), seul ce geste le libère :
//     sa réponse se lit par sa carte.
// Un ticket arrêté pour de bon, ses essais au total épuisés (essais.ts), est retenu jusqu'à ce que le chef agisse.
import { attenteDeLIssue, DE_CONFIANCE, LABEL_PARKED, reprendALaDate } from "../attente-github/marque.ts";
import { CHEF_TODO, LABELS_D_AVANT_PARKED } from "../github-etat/etats.ts";
import { arretEnCours, type RetraitLu } from "./essais.ts";

type CommentaireLu = { body: string; association: string };

// Les labels qui parquent un ticket pour quelqu'un d'autre que le chef : un fait nouveau ou leur date les fait tomber.
export const LABELS_DE_LA_RETENUE: readonly string[] = [LABEL_PARKED, ...LABELS_D_AVANT_PARKED];

const MARQUE_DE_LA_CUISINE = /^\s*<!-- brigade:/;

// Un fait nouveau sur le ticket : un commentaire d'un auteur du dépôt, après la plus récente marque qui le parque, que
// la cuisine n'a pas marqué. Sans marque lisible, rien ne date le parking : aucun commentaire n'est nouveau.
export function faitNouveau(commentaires: readonly CommentaireLu[]): boolean {
  const marque = commentaires.findLastIndex((c) => attenteDeLIssue([c]) !== null);
  if (marque === -1) return false;
  return commentaires.slice(marque + 1).some((c) => DE_CONFIANCE.includes(c.association) && c.body.trim() !== "" && !MARQUE_DE_LA_CUISINE.test(c.body));
}

// Ce qui retient le ticket, d'après ses labels et ses commentaires : la raison, dite en anglais ; null s'il est libre.
// `fin` : ses labels le parquent encore, mais l'un des trois événements est arrivé — la prise les retire.
export type Retenue = { retenu: string } | { retenu: null; fin: "date" | "fact" | null };

function retenueDesLabels(labels: readonly string[], commentaires: readonly CommentaireLu[], maintenant: Date): Retenue {
  if (labels.includes(CHEF_TODO)) return { retenu: `it is parked for the chef (\`${CHEF_TODO}\`): only the chef lifts it` };
  const parque = LABELS_DE_LA_RETENUE.filter((label) => labels.includes(label));
  if (parque.length === 0) return { retenu: null, fin: null };
  const attente = attenteDeLIssue(commentaires);
  if (attente !== null && reprendALaDate(attente, maintenant)) return { retenu: null, fin: "date" };
  if (faitNouveau(commentaires)) return { retenu: null, fin: "fact" };
  const dit = parque.map((label) => `\`${label}\``).join(", ");
  return { retenu: attente === null ? `it is parked (${dit}), and nothing has ended its hold` : `it is parked (${dit}), waiting for ${attente.who}, and neither its date, a new fact nor the chef has ended its hold` };
}

// La retenue à la prise : l'arrêt pour de bon d'abord, puis les labels. `retraits` ne se lit que si un arrêt est posté.
export async function retenueALaPrise(
  labels: readonly string[],
  commentaires: readonly (CommentaireLu & { createdAt: string })[],
  retraits: () => Promise<RetraitLu[]>,
  maintenant: Date,
): Promise<Retenue> {
  const arret = await arretEnCours(commentaires, retraits);
  if (arret !== null) return { retenu: `it stopped for good after ${arret} tries in total: only the chef lifts it` };
  return retenueDesLabels(labels, commentaires, maintenant);
}

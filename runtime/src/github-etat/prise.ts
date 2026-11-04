// La prise d'un ticket quand GitHub est le seul état de la cuisine (spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : une station prend
// un ticket en postant un commentaire de prise sur son issue. Le plus ancien
// commentaire de prise l'emporte — l'instant que GitHub lui donne, puis son id
// quand deux tombent dans la même seconde —, et toute station qui relit l'issue
// lit le même gagnant. Ni relais, ni boîte, ni journal ne décident : ce module
// ne lit et n'écrit que par le client de GitHub qu'on lui passe.
//
// Une prise tient jusqu'à ce qu'on la lâche, sur l'issue :
// - par un commentaire de lâcher, que poste la station qui tient (`lacher`) ;
// - par le retrait du label `taken`, ou de `fire` — le geste du chef.
// Un lâcher annule toutes les prises postées avant lui, la gagnante comme
// celles qui avaient perdu : seule une prise postée après lui peut l'emporter.
// Une station qui s'arrête sans lâcher garde donc le ticket. Le bail — la
// reprise d'un ticket dont la station s'est tue — n'est pas de ce module.
//
// Une station qui perd n'écrit rien de plus : sa prise, postée après la
// gagnante, ne compte pas, et le prochain lâcher l'annule avec les autres.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, type Issue } from "../github.ts";

// Le label que porte un ticket pris : l'issue dit au chef qu'une station le tient.
export const PRIS = "taken";

// Les labels dont le retrait lâche la prise.
const LABELS_QUI_LACHENT = [PRIS, LABEL];

// Le nom d'une station, tel qu'il s'écrit dans le marqueur.
const NOM_DE_STATION = /^[A-Za-z0-9._/-]+$/;
const MARQUE_DE_PRISE = /^<!-- brigade:prise station=([A-Za-z0-9._/-]+) -->/;
const MARQUE_DE_LACHER = /^<!-- brigade:lache station=([A-Za-z0-9._/-]+) -->/;

// Un commentaire d'issue tel que la prise le lit : `id` est celui que GitHub
// lui donne, croissant avec l'ordre où il les reçoit.
export type CommentaireDePrise = { id: number; body: string; association: string; createdAt: string };

// Le retrait d'un label de l'issue, tel que l'historique de ses événements le date.
export type RetraitDeLabel = { label: string; createdAt: string };

// Ce que la prise demande au client de GitHub, et rien de plus.
export type GitHubDeLaPrise = {
  // Les commentaires de l'issue, dans l'ordre où GitHub les rend.
  commentaires(numero: number): Promise<CommentaireDePrise[]>;
  // Les retraits de labels de l'issue.
  retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
};

// La prise qui tient le ticket : la station, et le commentaire qui le dit.
export type Tenant = { station: string; commentaire: number; createdAt: string };

// `prise` : cette station tient le ticket. `tenant` : qui le tient, elle ou une
// autre ; nul si personne — sa prise n'est pas encore lisible, par exemple.
export type Resultat = { prise: boolean; tenant: Tenant | null };

export type Contexte = { github: GitHubDeLaPrise; station: string };

export const corpsDePrise = (station: string) => `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`;
export const corpsDeLacher = (station: string) => `<!-- brigade:lache station=${station} -->\nReleased by station \`${station}\`.`;

type Fait = { instant: number; rang: number; genre: "prise"; station: string; commentaire: number; createdAt: string } | { instant: number; rang: number; genre: "lacher" };

// Qui tient le ticket, d'après ce que l'issue porte, dans quelque ordre qu'on
// le lise. Les faits se rangent par instant, puis par id de commentaire ; un
// retrait de label, qui n'a pas d'id parmi les commentaires, passe après les
// commentaires de sa seconde : dans le doute, le lâcher l'emporte, et la
// station dont la prise tombe ainsi la reposte.
export function tenant(commentaires: CommentaireDePrise[], retraits: RetraitDeLabel[]): Tenant | null {
  const faits: Fait[] = [];
  for (const commentaire of commentaires) {
    // Tout le monde peut commenter une issue publique ; seul le dépôt prend ses tickets.
    if (!DE_CONFIANCE.includes(commentaire.association)) continue;
    const instant = Date.parse(commentaire.createdAt);
    if (Number.isNaN(instant)) continue;
    const prise = MARQUE_DE_PRISE.exec(commentaire.body);
    if (prise) faits.push({ instant, rang: commentaire.id, genre: "prise", station: prise[1] as string, commentaire: commentaire.id, createdAt: commentaire.createdAt });
    else if (MARQUE_DE_LACHER.test(commentaire.body)) faits.push({ instant, rang: commentaire.id, genre: "lacher" });
  }
  for (const retrait of retraits) {
    const instant = Date.parse(retrait.createdAt);
    if (LABELS_QUI_LACHENT.includes(retrait.label) && !Number.isNaN(instant)) faits.push({ instant, rang: Number.POSITIVE_INFINITY, genre: "lacher" });
  }
  faits.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  let tient: Tenant | null = null;
  for (const fait of faits) {
    if (fait.genre === "lacher") tient = null;
    else if (tient === null) tient = { station: fait.station, commentaire: fait.commentaire, createdAt: fait.createdAt };
  }
  return tient;
}

// Qui tient le ticket, lu sur l'issue.
export async function lireTenant(numero: number, github: GitHubDeLaPrise): Promise<Tenant | null> {
  const [commentaires, retraits] = await Promise.all([github.commentaires(numero), github.retraitsDeLabels(numero)]);
  return tenant(commentaires, retraits);
}

// Prend le ticket pour la station : si personne ne le tient, poste sa prise,
// relit l'issue, et y pose `taken` si elle l'emporte. Déjà tenu par une autre,
// n'écrit rien ; par elle, n'écrit que `taken` s'il manque.
export async function prendre(issue: Pick<Issue, "number" | "labels">, { github, station }: Contexte): Promise<Resultat> {
  if (!NOM_DE_STATION.test(station)) throw new Error(`station name not usable in a claim comment: ${JSON.stringify(station)}`);
  let tient = await lireTenant(issue.number, github);
  if (tient === null) {
    await github.commenter(issue.number, corpsDePrise(station));
    tient = await lireTenant(issue.number, github);
  }
  const prise = tient?.station === station;
  if (prise && !issue.labels.includes(PRIS)) await github.labelliser(issue.number, [PRIS]);
  return { prise, tenant: tient };
}

// Lâche le ticket que la station tient : un commentaire de lâcher, puis le
// retrait de `taken`. Rend faux, sans rien écrire, si elle ne le tient pas.
export async function lacher(issue: Pick<Issue, "number" | "labels">, { github, station }: Contexte): Promise<boolean> {
  const tient = await lireTenant(issue.number, github);
  if (tient?.station !== station) return false;
  await github.commenter(issue.number, corpsDeLacher(station));
  if (issue.labels.includes(PRIS)) await github.delabelliser(issue.number, PRIS);
  return true;
}

// Retire le `taken` d'un ticket que personne ne tient : le reste d'un lâcher
// dont le retrait a échoué. Sans ce retrait, le ticket reste exclu de ceux à
// prendre. Rend vrai si le label est parti. Un ticket tenu, par elle ou par une
// autre, n'est pas touché ; un label déjà parti entre la lecture et le retrait
// (GitHub répond 404) n'est pas une erreur.
export async function purger(issue: Pick<Issue, "number" | "labels">, { github }: Pick<Contexte, "github">): Promise<boolean> {
  if (!issue.labels.includes(PRIS)) return false;
  if ((await lireTenant(issue.number, github)) !== null) return false;
  try {
    await github.delabelliser(issue.number, PRIS);
  } catch (erreur) {
    if (!/\b404\b|not found/i.test(erreur instanceof Error ? erreur.message : String(erreur))) throw erreur;
  }
  return true;
}

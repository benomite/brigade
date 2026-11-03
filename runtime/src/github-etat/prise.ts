// La prise d'un ticket quand GitHub est le seul état de la cuisine (spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : une station prend
// un ticket en postant un commentaire de prise sur son issue. Le plus ancien
// commentaire de prise l'emporte — l'instant que GitHub lui donne, puis son id
// quand deux tombent dans la même seconde —, et toute station qui relit
// l'issue lit le même gagnant, dans quelque ordre qu'elle lise ses
// commentaires. Ni relais, ni boîte, ni journal ne décident : ce module ne lit
// et n'écrit que par le client de GitHub qu'on lui passe.
//
// Une prise tient jusqu'à ce qu'on la lâche, sur l'issue :
// - par un commentaire de lâcher qui nomme la station qui tient — celui que
//   poste `lacher`, ou le chef ;
// - par le retrait du label `taken`, ou de `fire` — le geste du chef, et celui
//   de la station qui livre en pass.
// Un lâcher annule toutes les prises postées avant lui, la gagnante comme
// celles qui avaient perdu : seule une prise postée après lui peut l'emporter.
// Une station qui s'arrête sans lâcher garde donc le ticket. Le bail — la
// reprise d'un ticket dont la station s'est tue — n'est pas de ce module.
//
// Une station qui perd n'écrit rien de plus : sa prise, postée après la
// gagnante, ne compte pas, et le prochain lâcher l'annule avec les autres.
import { LABEL, type Issue } from "../github.ts";
import { LABEL_TAKEN } from "./etats.ts";

// Les labels dont le retrait lâche la prise.
const LABELS_QUI_LACHENT = [LABEL_TAKEN, LABEL];

// Ceux dont un commentaire fait foi, comme pour un verdict : la liste de
// `DE_CONFIANCE` (`alimenter.ts`), que son test tient égale à celle-ci —
// l'importer tirerait ici le rail et le journal. Tout le monde peut commenter
// une issue publique ; seul le dépôt prend ses tickets.
export const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Le nom d'une station, tel qu'il s'écrit dans le marqueur.
const NOM_DE_STATION = /^[A-Za-z0-9._-]+$/;
const MARQUE_DE_PRISE = /^<!-- brigade:prise station=([A-Za-z0-9._-]+) -->/;
const MARQUE_DE_LACHER = /^<!-- brigade:lache station=([A-Za-z0-9._-]+) -->/;

// Un commentaire de l'issue tel que la prise le lit : `id` croît avec l'ordre
// où GitHub les a reçus.
export type CommentaireDePrise = { id: number; body: string; association: string; createdAt: string };

// Le retrait d'un label de l'issue, tel que l'historique de ses événements le
// date : l'état courant de ses labels ne dit pas quand il a eu lieu.
export type RetraitDeLabel = { label: string; createdAt: string };

// Ce que la prise demande au client de GitHub, et rien de plus.
export type GitHubDeLaPrise = {
  // Les commentaires de l'issue.
  commentaires(numero: number): Promise<CommentaireDePrise[]>;
  // Les retraits de labels de l'issue (`issues/<n>/events`, `unlabeled`).
  retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
};

// La prise qui tient le ticket : la station, et le commentaire qui le dit.
export type Tenant = { station: string; commentaire: number; createdAt: string };

// `prise` : cette station tient le ticket. `tenant` : qui le tient, elle ou
// une autre ; nul si personne — sa prise vient d'être lâchée, par exemple.
export type Resultat = { prise: boolean; tenant: Tenant | null };

// La prise d'une station, telle que la station GitHub seul la reçoit
// (`Prise`, `brigade-github.ts`).
export type PriseDeLaStation = {
  prendre(issue: Pick<Issue, "number" | "labels">): Promise<Resultat>;
  lacher(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
};

export const corpsDePrise = (station: string) => `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`;
export const corpsDeLacher = (station: string) => `<!-- brigade:lache station=${station} -->\nReleased by station \`${station}\`.`;

type Fait = { instant: number; rang: number } & ({ genre: "prise"; tenant: Tenant } | { genre: "lacher"; station: string | null });

// Qui tient le ticket, d'après ce que l'issue porte, dans quelque ordre qu'on
// le lise. Les faits se rangent par instant, puis par id de commentaire ; un
// retrait de label, qui n'a pas d'id parmi les commentaires, passe après les
// commentaires de sa seconde : dans le doute, le lâcher l'emporte, et la
// station dont la prise tombe ainsi la reposte. Un commentaire de lâcher ne
// lâche que la station qu'il nomme : celui d'une station qui ne tient plus
// rien ne retire pas le ticket à celle qui l'a pris depuis.
export function tenant(commentaires: CommentaireDePrise[], retraits: RetraitDeLabel[]): Tenant | null {
  const faits: Fait[] = [];
  for (const commentaire of commentaires) {
    if (!DE_CONFIANCE.includes(commentaire.association)) continue;
    const instant = Date.parse(commentaire.createdAt);
    if (Number.isNaN(instant)) continue;
    const prise = MARQUE_DE_PRISE.exec(commentaire.body);
    const lacher = MARQUE_DE_LACHER.exec(commentaire.body);
    if (prise) faits.push({ instant, rang: commentaire.id, genre: "prise", tenant: { station: prise[1] as string, commentaire: commentaire.id, createdAt: commentaire.createdAt } });
    else if (lacher) faits.push({ instant, rang: commentaire.id, genre: "lacher", station: lacher[1] as string });
  }
  for (const retrait of retraits) {
    const instant = Date.parse(retrait.createdAt);
    if (LABELS_QUI_LACHENT.includes(retrait.label) && !Number.isNaN(instant)) faits.push({ instant, rang: Number.POSITIVE_INFINITY, genre: "lacher", station: null });
  }
  faits.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  let tient: Tenant | null = null;
  for (const fait of faits) {
    if (fait.genre === "prise") tient ??= fait.tenant;
    else if (fait.station === null || fait.station === tient?.station) tient = null;
  }
  return tient;
}

// Qui tient le ticket, lu sur l'issue.
export async function lireTenant(numero: number, github: GitHubDeLaPrise): Promise<Tenant | null> {
  const [commentaires, retraits] = await Promise.all([github.commentaires(numero), github.retraitsDeLabels(numero)]);
  return tenant(commentaires, retraits);
}

// La prise de la station `station`, sur le client `github`.
//
// `prendre` : si personne ne tient le ticket, poste la prise, relit l'issue,
// et y pose `taken` si elle l'emporte. Déjà tenu par une autre, n'écrit rien ;
// par elle, n'écrit que `taken` s'il manque.
//
// `lacher` : si elle tient le ticket, un commentaire de lâcher, puis le
// retrait de `taken`. Rend faux, sans rien écrire, si elle ne le tient pas.
export function priseDeLaStation(github: GitHubDeLaPrise, station: string): PriseDeLaStation {
  if (!NOM_DE_STATION.test(station)) throw new Error(`station name not usable in a claim comment: ${JSON.stringify(station)}`);
  return {
    async prendre(issue) {
      let tient = await lireTenant(issue.number, github);
      if (tient === null) {
        await github.commenter(issue.number, corpsDePrise(station));
        tient = await lireTenant(issue.number, github);
      }
      const prise = tient?.station === station;
      if (prise && !issue.labels.includes(LABEL_TAKEN)) await github.labelliser(issue.number, [LABEL_TAKEN]);
      return { prise, tenant: tient };
    },
    async lacher(issue) {
      if ((await lireTenant(issue.number, github))?.station !== station) return false;
      await github.commenter(issue.number, corpsDeLacher(station));
      if (issue.labels.includes(LABEL_TAKEN)) await github.delabelliser(issue.number, LABEL_TAKEN);
      return true;
    },
  };
}

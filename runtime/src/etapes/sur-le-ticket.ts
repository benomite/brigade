// Les étapes d'un ticket sur GitHub (#4278) : la fiche de la base qui les
// déclare, la marque d'étape que l'issue montre au chef, et le passage d'une
// étape à la suivante quand la pass l'a acceptée.
//
// Un ticket à étapes vit sous une seule branche et une seule PR. Chaque étape
// est une livraison sur cette PR, que la pass juge comme toute autre : un refus
// la renvoie à un cook et compte dans les essais du ticket (`renvoyer`, un seul
// compte pour toutes ses étapes) ; acceptée — relue, CI verte, prête au merge —,
// elle ne se merge pas tant qu'il reste une étape : la marque passe à la
// suivante, la PR reçoit un verdict qui demande l'étape suivante, et le ticket
// quitte le pass pour un cook. Seule la dernière étape acceptée se merge.
import { DE_CONFIANCE } from "../alimenter.ts";
import { lireALaBase } from "../depot.ts";
import { avancerEtape, decrireEtape, etapesDuTicket, etapesParSorte, sorteDuTicket, type EtatDeEtapes } from "../etapes-du-ticket.ts";
import { CHEMIN_DE_LA_FICHE } from "../fiche-projet/defauts.ts";
import { ficheDuTexte } from "../fiche-projet/fiche.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { approuvee, corpsDeVerdict, type CommentaireDeVerdict } from "../github-etat/fusion.ts";

// Le marqueur de la marque d'étape, en tête de son commentaire sur l'issue.
export const MARQUE_D_ETAPE = "<!-- brigade:etape ";

type Commentaire = { body: string; association: string };
type GitHubDesEtapes = {
  commentaires(numero: number): Promise<Commentaire[]>;
  commenter(numero: number, corps: string): Promise<unknown>;
};

// Les étapes d'un ticket, telles que la fiche de la base les déclare pour sa
// sorte — un de ses labels. Sans clone où la lire, ou sans fiche, une seule
// étape : le projet n'en déclare aucune. Une fiche refusée, ou une base que
// `git` ne lit pas, lève : rien ne se décide sur des étapes qu'on n'a pas lues.
export function etapesALaBase(clone: string | undefined, base: string, labels: readonly string[]): string[] {
  const contenu = clone === undefined ? null : lireALaBase({ clone, base }, CHEMIN_DE_LA_FICHE);
  const stages = contenu === null ? {} : etapesParSorte(ficheDuTexte(contenu).stages);
  return etapesDuTicket({ projet: { stages }, sorte: sorteDuTicket(labels, stages) });
}

// Le commentaire de la marque : l'étape courante, et la tête dont
// l'acceptation y a mené (aucune pour la première).
export const corpsDeMarque = (etat: EtatDeEtapes, sha: string | null) => `${MARQUE_D_ETAPE}n=${etat.courante + 1}${sha === null ? "" : ` sha=${sha}`} -->\n**Stage mark: ${decrireEtape(etat)}**`;

// La dernière marque posée sur l'issue par le dépôt : l'index de l'étape
// courante, et la tête acceptée qui y a mené. Null si aucune.
export function marqueDuTicket(commentaires: readonly Commentaire[]): { courante: number; sha: string | null } | null {
  const lue = commentaires.findLast((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_D_ETAPE));
  const champs = lue === undefined ? null : /^<!-- brigade:etape n=(\d+)(?: sha=([0-9a-f]+))? -->/.exec(lue.body);
  if (champs === null) return null;
  return { courante: Number(champs[1]) - 1, sha: champs[2] ?? null };
}

// L'index courant que la marque dit, borné aux étapes que la fiche déclare
// aujourd'hui : une fiche qui en a retiré laisse le ticket à sa dernière.
const courante = (marque: { courante: number } | null, etapes: readonly string[]) => Math.max(0, Math.min(marque?.courante ?? 0, etapes.length - 1));

// Au départ du cook : la marque de l'étape qu'il fait, posée sur l'issue si
// elle n'y est pas encore — la première —, rendue pour sa consigne. Null pour
// un ticket à une étape, qui n'a aucune marque.
export async function etapeDuCook(github: GitHubDesEtapes, ticket: number, etapes: string[]): Promise<string | null> {
  const etat: EtatDeEtapes = { etapes, courante: 0, essais: 0 };
  if (decrireEtape(etat) === "") return null;
  const marque = marqueDuTicket(await github.commentaires(ticket));
  if (marque === null) await github.commenter(ticket, corpsDeMarque(etat, null));
  return decrireEtape({ ...etat, courante: courante(marque, etapes) });
}

// À la pass, une livraison d'un ticket à étapes : vrai quand elle passe à
// l'étape suivante au lieu de se merger — `acceptee`, la pass vient de
// l'accepter et il reste une étape après la courante ; ou bien la marque dit
// déjà ce passage sur cette tête, et la station finit ce qu'un tour précédent
// n'a pas fini. Le ticket quitte alors le pass, et sa PR reçoit le verdict qui
// demande l'étape suivante : la livraison du cook suivant est relue à son tour.
// Faux pour un ticket à une étape, à sa dernière étape, ou tant que la pass
// n'a pas accepté : rien ne change, la pass suit son cours.
export async function passerALEtapeSuivante(
  github: { commentaires(numero: number): Promise<CommentaireDeVerdict[]>; commenter(numero: number, corps: string): Promise<unknown>; delabelliser(numero: number, label: string): Promise<unknown> },
  { ticket, pr, etapes, station, acceptee }: { ticket: number; pr: { number: number; sha: string }; etapes: string[]; station: string; acceptee: boolean },
): Promise<boolean> {
  if (etapes.length < 2) return false;
  const marque = marqueDuTicket(await github.commentaires(ticket));
  let etat: EtatDeEtapes = { etapes, courante: courante(marque, etapes), essais: 0 };
  if (marque?.sha !== pr.sha) {
    if (!acceptee) return false;
    const suite = avancerEtape(etat, { verdict: "green" });
    if (suite.courante === etat.courante) return false;
    // La marque d'abord, avec la tête acceptée : un tour qui s'arrête après
    // elle se reprend ici sans repasser une seconde fois à l'étape suivante.
    await github.commenter(ticket, corpsDeMarque(suite, pr.sha));
    etat = suite;
  }
  const finie = { ...etat, courante: etat.courante - 1 };
  await github.delabelliser(ticket, LABEL_IN_PASS);
  if (approuvee(await github.commentaires(pr.number)))
    await github.commenter(pr.number, corpsDeVerdict(station, pr.sha, { verdict: "request-changes", motif: `The pass accepted ${decrireEtape(finie)}. Next: ${decrireEtape(etat)} — the next cook does it on this branch, and the pass reviews it before any merge.` }));
  return true;
}

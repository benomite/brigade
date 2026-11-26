// Parked (#4272, épique #4129, règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) : le seul état d'un
// ticket qui attend quelqu'un. Sa fiche — `{ ticket, who, for, until, step }` — dit qui il attend (une personne, ou le
// chef), pour quoi (un texte), jusqu'à quand (une date ou un fait), et l'étape où il était (au backlog, en cuisson, à la
// pass). D'autres tickets bâtissent sur cette fiche : ses champs ne changent pas de nom.
//   - `park(ticket, who, for, until)` : ouvert à toute étape ; l'étape courante est rangée dans la fiche.
//   - `unpark(ticket, reason)` : la date venue, le fait arrivé ou la personne qui répond — le ticket reprend exactement
//     l'étape rangée, et sa fiche s'efface.
//   - `prenable(role, ticket)` : tant qu'il est parqué, ni station, ni réparation, ni superviseur ne le prend.
// Sur GitHub, la fiche est l'issue même : le label `parked` (ou `chef-todo` pour le chef), le commentaire marqué qui dit
// qui, pour quoi et jusqu'à quand (attente-github/marque.ts), et les labels d'étape qui restent (`taken`, `in-pass`).
// `parkedDuTour` en fait la fiche du tour, que la prise de la station, la réparation et les gestes du superviseur lisent.
import { attenteDeLIssue, direRelance, LE_CHEF } from "../attente-github/marque.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import type { Commentaire } from "../github.ts";

// Les trois étapes d'un ticket : au backlog, en cuisson, à la pass.
export type Etape = "backlog" | "cooking" | "pass";
// Ceux qui prennent un ticket : la station (un cook, la pass, un merge), la réparation de son tour, le superviseur.
export type Role = "station" | "repair" | "supervisor";
// Ce qui fait reprendre un ticket parqué : sa date venue, son fait arrivé, la réponse de celui qu'il attend.
export type RaisonDeReprise = "date" | "fact" | "answer";

// La fiche d'un ticket parqué. `who`, `for`, `until` : null quand l'issue ne les dit pas — un label `parked` sans
// commentaire marqué ; rien n'est inventé à leur place.
export type FicheParked = { ticket: number; who: string | null; for: string | null; until: string | null; step: Etape };

// Le chef, tel que la fiche le nomme.
export const CHEF = "chef";

export type Parked = {
  park(ticket: number, who: string, pour: string, until: string): FicheParked;
  unpark(ticket: number, reason: RaisonDeReprise): FicheParked | undefined;
  lire(ticket: number): FicheParked | undefined;
  prenable(role: Role, ticket: number): boolean;
};

// L'étape qu'un ticket GitHub tient par ses labels : `in-pass` à la pass, `taken` en cuisson, sinon au backlog.
export const etapeDesLabels = (labels: readonly string[]): Etape => (labels.includes(LABEL_IN_PASS) ? "pass" : labels.includes(LABEL_TAKEN) ? "cooking" : "backlog");

// `etapes` : l'étape courante de chaque ticket, que `unpark` remet. `fiches` : les tickets déjà parqués.
export function ouvrirParked({ etapes, fiches = new Map() }: { etapes: Map<number, Etape>; fiches?: Map<number, FicheParked> }): Parked {
  return {
    park(ticket, who, pour, until) {
      const step = etapes.get(ticket);
      if (step === undefined) throw new Error(`#${ticket} is at no step: nothing was parked`);
      const deja = fiches.get(ticket);
      // Parqué deux fois, l'étape rangée serait perdue : la première fiche tient.
      if (deja !== undefined) throw new Error(`#${ticket} is already parked — waits for ${deja.who ?? "someone the issue does not name"}: nothing was parked`);
      const [qui, quoi, jusqua] = [who.trim(), pour.trim(), until.trim()];
      if (qui === "") throw new Error(`#${ticket} is not parked without saying who it waits for`);
      if (quoi === "") throw new Error(`#${ticket} is not parked without saying for what`);
      if (jusqua === "") throw new Error(`#${ticket} is not parked without saying until when: a date or a fact`);
      const fiche: FicheParked = { ticket, who: qui, for: quoi, until: jusqua, step };
      fiches.set(ticket, fiche);
      return { ...fiche };
    },
    unpark(ticket, _reason) {
      const fiche = fiches.get(ticket);
      if (fiche === undefined) return undefined;
      etapes.set(ticket, fiche.step);
      fiches.delete(ticket);
      return { ...fiche };
    },
    lire(ticket) {
      const fiche = fiches.get(ticket);
      return fiche === undefined ? undefined : { ...fiche };
    },
    // La même règle pour les trois rôles : parqué, personne ne le prend.
    prenable: (_role, ticket) => !fiches.has(ticket),
  };
}

// La fiche d'une issue parquée, lue de ses labels et du plus récent commentaire marqué d'un auteur du dépôt ; undefined
// quand elle n'est pas parquée. Parquée pour le chef, `who` est `chef`.
export function ficheDeLIssue(ticket: number, labels: readonly string[], commentaires: readonly Pick<Commentaire, "body" | "association">[]): FicheParked | undefined {
  if (!estParque(labels)) return undefined;
  const attente = attenteDeLIssue(commentaires);
  const step = etapeDesLabels(labels);
  if (attente === null) return { ticket, who: null, for: null, until: null, step };
  return { ticket, who: attente.who === LE_CHEF ? CHEF : attente.who, for: attente.what, until: attente.fact ?? direRelance(attente.followUp), step };
}

// La fiche du tour : les issues qu'un tour de station vient de lire, chacune à son étape, les parquées avec leur fiche
// — lue de leurs labels seuls : le tour ne relit pas leurs commentaires, qui, pour quoi et jusqu'à quand restent null.
export function parkedDuTour(issues: readonly { number: number; labels: readonly string[] }[]): Parked {
  const etapes = new Map<number, Etape>();
  const fiches = new Map<number, FicheParked>();
  for (const { number, labels } of issues) {
    etapes.set(number, etapeDesLabels(labels));
    const fiche = ficheDeLIssue(number, labels, []);
    if (fiche !== undefined) fiches.set(number, fiche);
  }
  return ouvrirParked({ etapes, fiches });
}

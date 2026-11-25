// Pourquoi la cuisine ne cuit pas (#4214, épique #4112) : le 2026-11-25, la vue du projet de BOBL-tech/espace disait un
// arrêt sans cause (STOPPED) et une panne de file, quand ses trois tickets `fire` attendaient tous le chef ou un tiers —
// une décision chez le client, deux en attente. Une cuisine sans rien de faisable n'est pas en panne : elle est au repos.
//
// Ce module ne lit rien : il juge ce qu'on lui donne, et cherche la cause dans cet ordre — le rail (main rouge, une boucle
// de relances), les labels, les décisions ouvertes, les attentes, les stations. Il la nomme en une phrase, jamais par ce
// qu'il n'a pas vu. Une panne porte toujours une action : ce que la cuisine a déjà fait (`done`), ou un seul bouton.
// Un fait qu'on ne lui donne pas (null) n'est jamais une cause : il passe au suivant.
import { LABELS_D_ECART, MOTS_DU_GESTE, type Geste } from "../attente-du-rail/stations.ts";

// Un ticket `fire` : ses labels, une décision ouverte, une attente (sur qui, quand on le sait).
export type TicketDeLaPanne = { numero: number; labels: readonly string[]; decisionOuverte: boolean; enAttente: boolean; enAttenteDe?: string };
export type StationDeLaPanne = { nom: string; enMarche: boolean };
// `mainRouge`, `boucleDeRelance` : null quand l'appelant ne les a pas lus. `reparationDeMain` : le ticket qui la répare ;
// `ticketEnBoucle` : le ticket que la cuisine a sorti de sa boucle.
export type RailDeLaPanne = { mainRouge: boolean | null; boucleDeRelance: boolean | null; reparationDeMain?: number; ticketEnBoucle?: number };
// `stations` : celles qui servent le projet ; null quand elles ne se lisent pas.
export type EntreeDeLaPanne = { rail: RailDeLaPanne; stations: readonly StationDeLaPanne[] | null; tickets: readonly TicketDeLaPanne[] };

export type Reparation = Geste | "reparer-main";
export type ActionDeLaPanne = { kind: "done"; text: string } | { kind: "button"; label: string; id: Reparation } | null;
export type Diagnostic = { state: "fault" | "idle"; cause: string; action: ActionDeLaPanne };
// `ready` : un ticket est faisable et rien ne le retient — rien à dire au chef.
export type Bilan = Diagnostic | { state: "ready"; cause: string; action: null };

const LABEL_FIRE = "fire";
const EN_CUISINE = ["taken", "in-pass"];
const LABEL_WAITING = "waiting";
const LABELS_DE_DECISION = ["decision", "question"];

const bouton = (id: Reparation, label: string): ActionDeLaPanne => ({ kind: "button", label, id });
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// Ce qui retient un ticket `fire` hors de la cuisine, ou null s'il est faisable.
type Retenue = "decision" | "hold" | "label";
function retenueDe(ticket: TicketDeLaPanne): Retenue | null {
  if (ticket.decisionOuverte || ticket.labels.some((label) => LABELS_DE_DECISION.includes(label))) return "decision";
  if (ticket.enAttente || ticket.labels.includes(LABEL_WAITING)) return "hold";
  if (ticket.labels.some((label) => LABELS_D_ECART.includes(label))) return "label";
  return null;
}

// Ce que chaque retenue compte, dans la phrase du repos : « 1 open decision, 2 on hold ».
function detail(retenues: readonly Retenue[]): string {
  const combien = (sorte: Retenue) => retenues.filter((une) => une === sorte).length;
  const parts = [
    combien("decision") > 0 ? pluriel(combien("decision"), "open decision") : null,
    combien("hold") > 0 ? `${combien("hold")} on hold` : null,
    combien("label") > 0 ? `${combien("label")} set aside by a label` : null,
  ];
  return parts.filter((part) => part !== null).join(", ");
}

export function diagnostiquer(entree: EntreeDeLaPanne): Bilan {
  const { rail } = entree;
  // 1 le rail : main rouge, puis une boucle de relances.
  if (rail.mainRouge === true) {
    const action = rail.reparationDeMain === undefined ? bouton("reparer-main", "Open a repair ticket for main") : { kind: "done" as const, text: `the kitchen repairs it on #${rail.reparationDeMain}` };
    return { state: "fault", cause: "the main branch is red, so no delivery merges", action };
  }
  if (rail.boucleDeRelance === true) {
    const quel = rail.ticketEnBoucle === undefined ? "a ticket" : `#${rail.ticketEnBoucle}`;
    return { state: "fault", cause: `the kitchen relaunched ${quel} in a loop`, action: { kind: "done", text: `the kitchen put ${quel} in WAITING, out of the loop` } };
  }
  // 2 les labels : seuls les tickets `fire` sont à cuire ; un ticket pris ou en pass, la cuisine cuit.
  const feux = entree.tickets.filter(({ labels }) => labels.includes(LABEL_FIRE));
  if (feux.length === 0) return { state: "idle", cause: "nothing to cook: the rail holds no `fire` ticket", action: null };
  const enCuisine = feux.find(({ labels }) => labels.some((label) => EN_CUISINE.includes(label)));
  if (enCuisine !== undefined) return { state: "ready", cause: `the kitchen is cooking #${enCuisine.numero}`, action: null };
  // 3 et 4 les décisions ouvertes et les attentes : rien de faisable, la cuisine est au repos.
  const faisables = feux.filter((ticket) => retenueDe(ticket) === null);
  const [premier] = faisables;
  if (premier === undefined) {
    const retenues = feux.flatMap((ticket) => retenueDe(ticket) ?? []);
    const attendent = feux.length > 1 ? `${feux.length} tickets wait` : "1 ticket waits";
    return { state: "idle", cause: `nothing to cook: ${attendent} on you or on a third party (${detail(retenues)})`, action: null };
  }
  // 5 les stations : un ticket est faisable, et aucune ne le prend.
  if (entree.stations === null) return { state: "ready", cause: `#${premier.numero} is workable`, action: null };
  if (entree.stations.length === 0) return { state: "fault", cause: `no station serves this project, so no cook takes #${premier.numero}`, action: bouton("ajouter-a-une-station", MOTS_DU_GESTE["ajouter-a-une-station"]) };
  const enMarche = entree.stations.filter((station) => station.enMarche);
  if (enMarche.length === 0) {
    const noms = entree.stations.map(({ nom }) => nom);
    return { state: "fault", cause: `${noms.length > 1 ? "stations" : "station"} ${noms.join(", ")} ${noms.length > 1 ? "are" : "is"} down, so no cook takes #${premier.numero}`, action: bouton("demarrer-la-station", MOTS_DU_GESTE["demarrer-la-station"]) };
  }
  return { state: "ready", cause: `#${premier.numero} is workable and station ${enMarche.map(({ nom }) => nom).join(", ")} takes it`, action: null };
}

// Les lignes de `status` : l'état et sa cause, puis l'action — ce que la cuisine a fait, ou le bouton de l'app. Aucune
// quand la cuisine peut cuire.
export function lignesDeLaPanne(bilan: Bilan): string[] {
  if (bilan.state === "ready") return [];
  const titre = "kitchen".padEnd(11);
  const action = bilan.action === null ? [] : [`${"".padEnd(11)}${bilan.action.kind === "done" ? `done: ${bilan.action.text}` : `button: ${bilan.action.label}`}`];
  return [`${titre}${bilan.state}: ${bilan.cause}`, ...action];
}

// Le séjour d'un ticket pris dans sa colonne, lu du journal (#1893). `since` du rail repart à chaque
// `ticket.taken` : un cook arrêté (garde-fou, échec, redémarrage du runtime) puis relancé
// remettait l'âge de la carte à zéro. Le séjour, lui, commence à la première prise qui est entrée dans la
// colonne et court à travers les relances qui suivent la fin d'un cook (`cook.exited`, `cook.interrupted`) ;
// il recommence quand le ticket a quitté la colonne — pass, 86, WAITING, servi, parti — puis y est rentré.
//
// Les essais sont les prises de ce séjour, de la plus ancienne à la courante : chacun dit pourquoi il s'est
// arrêté, ou qu'il tourne encore. Rien n'est écrit : tout se relit des événements du ticket.
import type { Base } from "./base.ts";

// `depuis` : la prise. `jusqua` : la fin du cook, nulle tant qu'il tourne. `arret` : pourquoi il s'est arrêté —
// le motif du garde-fou quand il en a posé un (`duration`, `idle`…), sinon l'issue du cook (`failed`, `ok`…), la
// cause de son arrêt par la cuisine (`stop`, `move`) ou `interrupted` (le cook est mort avec le runtime) ; nul
// pour l'essai en cours. `enCours` : c'est le cook courant.
export type Essai = { depuis: string; jusqua: string | null; arret: string | null; enCours: boolean };
export type Sejour = { depuis: string; essais: Essai[] };

// Les événements qui sortent un ticket de la colonne des pris : il y revient pour un nouveau séjour.
const SORTIES = ["ticket.arrived", "ticket.released", "ticket.passing", "ticket.served", "ticket.86", "ticket.left", "ticket.waiting", "ticket.resumed"];
const LUS = ["ticket.taken", "cook.exited", "cook.interrupted", "guard.tripped", ...SORTIES];

type Ligne = { ticket: number; at: string; type: string; payload: string };

// Le séjour en cours de chacun de ces tickets pris. Un ticket dont le dernier événement n'est pas une prise
// (le rail dit « pris », le journal autre chose) n'y est pas : on garde alors le `since` du rail.
export function sejoursEnColonne(base: Base, tickets: number[]): Map<number, Sejour> {
  const sejours = new Map<number, Sejour>();
  if (tickets.length === 0) return sejours;
  const lignes = base.lire<Ligne>(
    `SELECT ticket, at, type, payload FROM events
     WHERE ticket IN (SELECT value FROM json_each(?1)) AND type IN (SELECT value FROM json_each(?2))
     ORDER BY seq`,
    JSON.stringify(tickets),
    JSON.stringify(LUS),
  );
  const motifs = new Map<string, string>(); // run → motif du garde-fou
  const courants = new Map<number, { sejour: Sejour; rendu: boolean }>();
  for (const { ticket, at, type, payload } of lignes) {
    const p = JSON.parse(payload) as Record<string, unknown>;
    const courant = courants.get(ticket);
    if (type === "guard.tripped") {
      if (typeof p.run === "string" && typeof p.reason === "string") motifs.set(p.run, p.reason);
    } else if (type === "ticket.taken") {
      const essai: Essai = { depuis: at, jusqua: null, arret: null, enCours: true };
      if (courant !== undefined && courant.rendu) {
        courant.sejour.essais.push(essai);
        courant.rendu = false;
      } else courants.set(ticket, { sejour: { depuis: at, essais: [essai] }, rendu: false });
    } else if (type === "cook.exited" || type === "cook.interrupted") {
      const essai = courant?.sejour.essais.at(-1);
      if (courant === undefined || essai === undefined || !essai.enCours) continue;
      const motif = typeof p.run === "string" ? motifs.get(p.run) : undefined;
      Object.assign(essai, { jusqua: at, arret: type === "cook.interrupted" ? "interrupted" : (motif ?? (typeof p.cause === "string" ? p.cause : String(p.outcome))), enCours: false });
      courant.rendu = true;
    } else courants.delete(ticket);
  }
  for (const [ticket, { sejour }] of courants) if (sejour.essais.at(-1)?.enCours) sejours.set(ticket, sejour);
  return sejours;
}

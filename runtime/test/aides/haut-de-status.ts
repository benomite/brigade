// L'état de la box d'avant la traduction du haut de `status` (#928), et l'état d'exemple qu'on
// bâtit dessus. Le journal d'avant est rejoué sans être édité ; l'exemple y ajoute des événements.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

export const ETAT_D_AVANT = join(import.meta.dirname, "../fixtures/etat-d-avant-927");
export const LU_LE = new Date("2026-10-12T10:04:00.000Z");
export const STATION = "box/claude";

// Le journal de l'état d'avant, rejoué dans un répertoire neuf : chaque événement à son instant,
// dans son ordre. `noter` en ajoute, à l'instant donné. Rien de l'état d'avant n'est édité.
export function etatDAvant(t: TestContext, repertoire = repertoireTemporaire(t)) {
  let instant = new Date(0);
  const journal = ouvrirJournal(repertoire, { maintenant: () => instant });
  t.after(() => journal.fermer());
  for (const ligne of readFileSync(join(ETAT_D_AVANT, "evenements.ndjson"), "utf8").trim().split("\n")) {
    const { at, project, ticket, type, author, payload, dedupKey } = JSON.parse(ligne);
    instant = new Date(at);
    journal.ajouter({ project, ticket, type, author, payload, ...(dedupKey === undefined ? {} : { dedupKey }) });
  }
  const noter = (hhmm: string, fait: Fait, ticket: number | null = null, author = "runtime") => {
    instant = new Date(`2026-10-12T${hhmm}:00.000Z`);
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  };
  return { journal, noter };
}

// L'état d'exemple : tout ce qui arrête la cuisine, sur l'état d'avant. La station est annoncée, puis
// sa connexion Max tombe, la base rouge a son ticket de réparation.
export function exemple(t: TestContext, repertoire?: string) {
  const { journal, noter } = etatDAvant(t, repertoire);
  noter("10:00", { type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter("10:00", { type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  noter("10:00", { type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, null, `station:${STATION}`);
  noter("10:00", { type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts: [], base: "ba5e0001ffff" } }, 24, `station:${STATION}`);
  noter("10:00", { type: "aside.blocked", payload: { station: STATION, reason: "secrets-unavailable", base: "base-1" } }, 24);
  noter("10:00", { type: "base.checked", payload: { sha: "abc1234def", outcome: "red", gates: { outcome: "red", code: 1, failures: ["FAIL  tests"], tail: "" }, tickets: [] } }, null, "pass");
  noter("10:00", { type: "base.repair-opening", payload: { sha: "abc1234def" } }, null, "pass");
  noter("10:00", { type: "base.repair-opened", payload: { sha: "abc1234def", failures: ["FAIL  tests"], reconciled: false } }, 30, "pass");
  noter("10:00", { type: "ticket.arrived", payload: { title: "Réparer la base", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/30" } }, 30, "github");
  noter("10:01", { type: "grant.activated", payload: { action: "merge", until: "2026-10-12T10:30:00.000Z" } }, null, "chef");
  noter("10:02", { type: "backup.completed", payload: { name: "2026-10-09T10-00-00Z", lastSeq: 7, events: 7, streams: 0 } }, null, "sauvegarde");
  return journal;
}


// Ce que #1826 change à ce que l'état d'avant donnait : sa remontée de #18 (`returns-exhausted`)
// est technique, elle n'attend plus le chef. Elle quitte `attend` — et `retenues`, où elle retenait
// #33 —, et sa ligne du rail dit que la cuisine la reprend. Le reste est ce qu'il était.
export const REMONTEE_D_AVANT = 18;
export const RAISON_DE_LA_REMONTEE = "la cuisine le reprend (returns-exhausted), pas le chef";
type FactsLus = {
  compteurs: { attend: number };
  rail: Array<{ ticket: number; attente?: { raison: string } | null }>;
  attend: Array<{ ticket: number }>;
  retenues?: Array<{ ticket: number }>;
};
export function depuis1826<F extends FactsLus>(avant: F): F {
  const attend = avant.attend.filter(({ ticket }) => ticket !== REMONTEE_D_AVANT);
  return {
    ...avant,
    compteurs: { ...avant.compteurs, attend: avant.compteurs.attend - (avant.attend.length - attend.length) },
    rail: avant.rail.map((ticket) => (ticket.ticket === REMONTEE_D_AVANT && ticket.attente ? { ...ticket, attente: { ...ticket.attente, raison: RAISON_DE_LA_REMONTEE } } : ticket)),
    attend,
    ...(avant.retenues === undefined ? {} : { retenues: avant.retenues.filter(({ ticket }) => ticket !== REMONTEE_D_AVANT) }),
  };
}

// Ce que #1834 change à ce que l'état d'avant donnait : un ticket que la cuisine a mis de côté, ou qui en
// attend un autre parti sans être servi, n'attend jamais le chef — leurs entrées (`86`, `capacite`,
// `absente`, `bloque`, `repris`) quittent `attend` et `retenues`, et le ticket qui en attendait un autre,
// BLOQUÉ par ce départ, est en attente sur le rail. Le motif d'un retour de WAITING (`revenu`) n'est plus
// donné. Le reste est ce qu'il était.
export const SORTES_RETIREES_EN_1834 = ["86", "capacite", "absente", "bloque", "repris"];
type FactsDAvant1834 = {
  compteurs: { attend: number };
  rail: Array<{ ticket: number; etat: string; revenu?: unknown }>;
  attend: Array<{ ticket: number; decision?: { quoi: string } }>;
  retenues?: Array<{ ticket: number }>;
};
export function depuis1834<F extends FactsDAvant1834>(avant: F): F {
  const retires = new Map(avant.attend.filter(({ decision }) => SORTES_RETIREES_EN_1834.includes(decision?.quoi ?? "")).map(({ ticket, decision }) => [ticket, decision?.quoi]));
  const attend = avant.attend.filter(({ ticket }) => !retires.has(ticket));
  return {
    ...avant,
    compteurs: { ...avant.compteurs, attend: avant.compteurs.attend - retires.size },
    rail: avant.rail.map(({ revenu: _revenu, ...ticket }) => (retires.get(ticket.ticket) === "bloque" && ticket.etat === "BLOQUÉ" ? { ...ticket, etat: "en attente" } : ticket)),
    attend,
    ...(avant.retenues === undefined ? {} : { retenues: avant.retenues.filter(({ ticket }) => !retires.has(ticket)) }),
  };
}

// Ce que #1877 change à ce que l'état d'avant donnait : la carte d'une livraison à relire dit en mots
// simples ce qu'elle change et ce que sa relecture a trouvé, avec un seul bouton, « Merge ». Celle de
// l'état d'avant touche à ses juges sans verdict consigné : aucun second juge ne la jugera, elle reste au
// chef, et sa carte le dit en mots fixes. Le reste est ce qu'il était.
type CarteDAvant = { resume: string; question: string | null; choix: Array<{ texte: string; suite: string }> };
type FactsDAvant1877 = { attend: Array<{ ticket: number; decision?: { quoi: string; motif: string | null; cause: string | null }; carte?: CarteDAvant }> };
export function depuis1877<F extends FactsDAvant1877>(avant: F): F {
  const aRelire = (decision: FactsDAvant1877["attend"][number]["decision"]) => decision?.quoi === "merge" && decision.motif === "review-required" && decision.cause === "judge-modified";
  return {
    ...avant,
    attend: avant.attend.map((entree) =>
      aRelire(entree.decision) && entree.carte
        ? {
            ...entree,
            carte: { ...entree.carte, resume: `The delivery of #${entree.ticket} changes how deliveries are checked. Its review found nothing blocking, and only you can merge it.`, question: null, choix: [{ texte: "Merge", suite: "merge" }] },
          }
        : entree,
    ),
  };
}

// Les raisons qui mettent un ticket de côté (#1834) : chacune dit ce qui l'en
// sort seule, et aucune ne fait de carte au chef. Le chef n'a rien mis de côté :
// il ne sait pas mieux que la cuisine quand la raison est tombée. Le runtime
// n'en écrit plus (#2061) : les journaux d'avant les portent, et le rail les relit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mettreEnAttente } from "../src/attente.ts";
import { attentesDuChef } from "../src/attend.ts";
import { motifSansStation, motifStationAbsente } from "../src/capacites.ts";
import { carteDuTicket } from "../src/carte-todo/cartes.ts";
import { ATTEND_UN_TIERS, SANS_STATION, STATION_ABSENTE } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { ATTENTE_D_UN_TICKET, MISES_DE_COTE, miseDeCoteDu } from "../src/mise-de-cote.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date("2026-10-27T12:00:00.000Z");
const PROJET = "brigade";

test("chaque raison dit qui met de côté, et ce qui remet le ticket sur le rail sans personne — jamais le chef qui le remettrait", () => {
  for (const [motif, { par, retour }] of [...Object.entries(MISES_DE_COTE), ["attend", ATTENTE_D_UN_TICKET] as const]) {
    assert.ok(par.length > 0 && retour.length > 0, motif);
    assert.doesNotMatch(retour, /chef (puts|sends) it back|ask(s)? the chef/, motif);
  }
  // Un motif qu'un préfixe ouvre se retrouve par son préfixe.
  assert.equal(miseDeCoteDu(motifSansStation({ capacites: ["gpu"], ensemble: false })), MISES_DE_COTE[SANS_STATION]);
  assert.equal(miseDeCoteDu(motifStationAbsente(["box/m1"])), MISES_DE_COTE[STATION_ABSENTE]);
  assert.equal(miseDeCoteDu("inconnu"), null);
});

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: () => MAINTENANT });
  return { journal, rail };
}

function poser(journal: Journal, ticket: number, attend: number[] = []) {
  journal.ajouter({
    project: PROJET,
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + ticket * 1000).toISOString(),
      url: `https://github.com/acme/brigade/issues/${ticket}`,
      card: { waitsFor: attend, zone: [`zone/${ticket}`], problems: [] },
    },
  });
}

// Le motif tel que le rail le porte : celui qu'un préfixe ouvre, complété.
const motifEcrit = (motif: string) => (motif === SANS_STATION ? motifSansStation({ capacites: ["gpu"], ensemble: false }) : motif === STATION_ABSENTE ? motifStationAbsente(["box/m1"]) : motif);

test("aucune raison de mise de côté ne fait de carte au chef : le ticket reste sur le rail, avec sa raison", (t) => {
  const { journal, rail } = cuisine(t);
  const raisons = Object.entries(MISES_DE_COTE);
  raisons.forEach(([motif, { heure }], i) => {
    const ticket = 100 + i;
    poser(journal, ticket);
    if (motif === ATTEND_UN_TIERS) mettreEnAttente(journal, PROJET, ticket, { quoi: "le devis signé", qui: "le client" }, MAINTENANT);
    else rail.quatreVingtSix(ticket, { motif: motifEcrit(motif), ...(heure ? { retour: new Date(MAINTENANT.getTime() + 3_600_000) } : {}) });
  });

  const lus = lireRail(journal.base);
  raisons.forEach(([motif], i) => {
    const ticket = 100 + i;
    assert.equal(ticketDuRail(journal.base, ticket)?.state, "86", motif);
    assert.equal(carteDuTicket(journal.base, ticket), null, `${motif} : une carte au chef`);
  });
  assert.deepEqual(attentesDuChef(journal.base, lus, MAINTENANT), []);
});

test("un ticket qui en attend un autre ne va jamais au chef : ouvert, il l'attend sur le rail ; fermé sans être servi, l'attente tombe ; servi, aussi", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 12);
  poser(journal, 13);
  poser(journal, 14, [12, 13]);
  const de14 = () => ticketDuRail(journal.base, 14);

  // #12 quitte le rail, l'issue encore ouverte : #14 l'attend toujours.
  journal.ajouter({ project: PROJET, ticket: 12, author: "github", type: "ticket.left", payload: { reason: "unfired" } });
  assert.deepEqual(de14()?.awaits.map(({ ticket, left }) => [ticket, left?.reason ?? null]), [[12, "unfired"], [13, null]]);
  assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT), []);

  // Fermée sans avoir été servie : la cuisine ne l'attend plus, et le rail le dit.
  journal.ajouter({ project: PROJET, ticket: 12, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  assert.deepEqual(de14()?.awaits.map(({ ticket }) => ticket), [13]);
  assert.deepEqual(de14()?.dropped.map(({ ticket, reason }) => [ticket, reason]), [[12, "closed"]]);
  assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT), []);

  // #13 servi : plus rien ne retient #14.
  assert.equal(rail.prendre("box/claude")?.ticket, 13);
  rail.envoyerEnPass(13, "box/claude");
  rail.servir(13);
  assert.deepEqual(de14()?.awaits, []);
});

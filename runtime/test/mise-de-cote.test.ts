// Les raisons qui mettent un ticket de côté (#1834) : chacune dit ce qui l'en
// sort seule, et aucune ne fait de carte au chef. Le chef n'a rien mis de côté :
// il ne sait pas mieux que la cuisine quand la raison est tombée.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { mettreEnAttente } from "../src/attente.ts";
import { attentesDuChef } from "../src/attend.ts";
import { motifSansStation, motifStationAbsente } from "../src/capacites.ts";
import { carteDuTicket } from "../src/carte-todo/cartes.ts";
import { ENCORE_ROUGE, NON_JUGEE } from "../src/events/pass.ts";
import { ATTEND_UN_TIERS, REDECOUPE, SANS_STATION, STATION_ABSENTE } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { ATTENTE_D_UN_TICKET, MISES_DE_COTE, miseDeCoteDu } from "../src/mise-de-cote.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { REMONTE } from "../src/reaction.ts";
import { FICHE_ILLISIBLE, SANS_CALIBRAGE, SECRETS_INDISPONIBLES } from "../src/station.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date("2026-10-27T12:00:00.000Z");
const PROJET = "brigade";
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// Chaque motif que le code passe à un 86, tel qu'il l'écrit, et la raison de la
// liste dont il relève. Un motif écrit ailleurs sans y être fait rougir le test.
const MOTIFS_DU_CODE: Record<string, string[]> = {
  SANS_CALIBRAGE: [SANS_CALIBRAGE],
  FICHE_ILLISIBLE: [FICHE_ILLISIBLE],
  REFUS: ["refused"],
  QUOTA: ["quota"],
  SETUP_EN_ECHEC: ["setup-failed"],
  WORKTREE_IMPOSSIBLE: ["worktree-failed"],
  TICKET_ILLISIBLE: ["ticket-unreadable"],
  SECRETS_INDISPONIBLES: [SECRETS_INDISPONIBLES],
  "motifSansStation(absent)": [SANS_STATION],
  "motifStationAbsente(absentes)": [STATION_ABSENTE],
  "`pass:${NON_JUGEE}`": [`pass:${NON_JUGEE}`],
  "`pass:${ENCORE_ROUGE}`": [`pass:${ENCORE_ROUGE}`],
  REDECOUPE: [REDECOUPE],
  // reaction.ts, `arreter` : le manager redécoupe, ou remonte.
  raison: [REDECOUPE, REMONTE],
  // station.ts, `ecarter` : le motif qu'on lui passe (les trois ci-dessus).
  motif: [],
};

// Les motifs passés à `quatreVingtSix` et à `ecarter`, dans tout le code.
function motifsEcrits(): string[] {
  const fichiers = (readdirSync(SRC, { recursive: true }) as string[]).filter((nom) => nom.endsWith(".ts"));
  return fichiers.flatMap((nom) => {
    const code = readFileSync(join(SRC, nom), "utf8");
    return [...code.matchAll(/quatreVingtSix\([^,]+,\s*\{\s*motif:\s*(`[^`]*`|[^,}]+?)\s*[,}]/g), ...code.matchAll(/\becarter\(station,\s*numero,\s*([^,)]+?)\s*[,)]/g)].map((trouve) => trouve[1] ?? "");
  });
}

test("la liste des mises de côté couvre chaque motif que le runtime écrit, et rien d'autre", () => {
  const ecrits = motifsEcrits();
  assert.ok(ecrits.length >= 14, `trop peu de motifs trouvés : ${ecrits.join(", ")}`);
  for (const ecrit of ecrits) assert.ok(Object.hasOwn(MOTIFS_DU_CODE, ecrit), `motif écrit sans être dans la liste : ${ecrit}`);
  // WAITING n'est pas un `quatreVingtSix` : la projection le pose sur `ticket.waiting`.
  const couverts = new Set([...Object.values(MOTIFS_DU_CODE).flat(), ATTEND_UN_TIERS]);
  assert.deepEqual([...couverts].sort(), Object.keys(MISES_DE_COTE).sort());
});

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

  // #13 servi : plus rien ne retient #14, un cook le prend.
  assert.equal(rail.prendre("box/claude")?.ticket, 13);
  rail.envoyerEnPass(13, "box/claude");
  rail.servir(13);
  assert.deepEqual(de14()?.awaits, []);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);
});

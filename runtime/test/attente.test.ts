// WAITING au journal de la box (d'avant #4129) : un ticket qui attendait un
// tiers, et non le chef. Parquer un ticket s'écrit désormais sur son issue
// (attente-github/) ; le journal d'une box garde ses attentes d'avant — mises
// (`ticket.waiting`), reprises (`ticket.resumed`, vers « todo » : l'état d'avant
// l'attente ; vers « kitchen » : c'est arrivé) —, et le rail, `status` et TODO
// les relisent : ni l'une ni l'autre sortie ne passe par TODO (#1834), et il ne
// tient pas sa zone. Ici, ces relectures.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { RELANCE_PAR_DEFAUT_MS } from "../src/attente.ts";
import { attentesDuChef, decrireAttentes } from "../src/attend.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ATTEND_UN_TIERS, PAR_LE_CHEF } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { lireRail, ticketDuRail, type TicketRail } from "../src/projections/rail.ts";
import { etatLu, GesteRefuse } from "../src/rail.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date("2026-10-14T12:00:00.000Z");
const PROJET = "brigade";

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: () => MAINTENANT });
  return { repertoire, journal, rail };
}

function poser(journal: Journal, ticket: number, zone: string[] = [`zone/${ticket}`]) {
  journal.ajouter({
    project: PROJET,
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + journal.dernierSeq() * 1000).toISOString(),
      url: `https://github.com/acme/brigade/issues/${ticket}`,
      card: { waitsFor: [], zone, problems: [] },
    },
  });
}

// L'attente telle que le geste d'avant #4129 l'écrivait au journal : quoi, de qui, la relance — dans sept jours sans elle.
function attendre(journal: Journal, ticket: number, relance?: Date, { quoi = "sa validation écrite du devis", qui = "le client" } = {}): TicketRail {
  const followUp = (relance ?? new Date(MAINTENANT.getTime() + RELANCE_PAR_DEFAUT_MS)).toISOString();
  journal.ajouter({ project: PROJET, ticket, author: "chef", type: "ticket.waiting", payload: { what: quoi, who: qui, followUp } });
  return ticketDuRail(journal.base, ticket) as TicketRail;
}

// Sa sortie par le chef, telle qu'elle s'écrivait : « reprendre » (`todo`) ou « c'est arrivé » (`kitchen`).
function sortir(journal: Journal, ticket: number, to: "todo" | "kitchen"): TicketRail {
  journal.ajouter({ project: PROJET, ticket, author: "chef", type: "ticket.resumed", payload: { to, why: PAR_LE_CHEF } });
  return ticketDuRail(journal.base, ticket) as TicketRail;
}

const todo = (journal: Journal) => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT);
const ligne = (journal: Journal, ticket: number) => decrireEtat(lireEtat(journal, MAINTENANT), MAINTENANT).find((l) => l.startsWith(`  #${ticket}  `)) ?? "";

test("une relance donnée est tenue ; redire l'attente la met à jour sans changer depuis quand", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 8);
  const premiere = attendre(journal, 8, new Date(2026, 9, 28));
  assert.equal(new Date(premiere.waitingFor?.followUp ?? "").getTime(), new Date(2026, 9, 28).getTime());

  const seconde = attendre(journal, 8, new Date("2026-10-17T12:00:00.000Z"), { quoi: "sa signature", qui: "le juriste" });
  assert.deepEqual([seconde.waitingFor?.what, seconde.waitingFor?.who, seconde.waitingFor?.since], ["sa signature", "le juriste", premiere.waitingFor?.since]);
  assert.equal(seconde.waitingFor?.followUp, "2026-10-17T12:00:00.000Z");
});

test("un ticket en WAITING n'est pas dans TODO, et ne tient pas sa zone", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8, ["runtime/src"]);
  poser(journal, 9, ["runtime/src/rail.ts"]);
  // Mis de côté faute de calibrage, il n'attend pas le chef (#1834) ; mis en WAITING, non plus.
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  assert.deepEqual(todo(journal), []);
  attendre(journal, 8);
  assert.deepEqual(todo(journal), []);
  assert.deepEqual(decrireAttentes(todo(journal), () => "1 min")[0], `${"awaiting".padEnd(11)}nothing awaits the chef`);
  // Sa zone ne retient pas celui qui la recouvre.
  assert.deepEqual(ticketDuRail(journal.base, 9)?.held, []);
});

test("« reprendre » : un ticket mis de côté reprend l'état d'avant l'attente, sans passer par TODO", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  attendre(journal, 8);

  const lu = sortir(journal, 8, "todo");
  assert.deepEqual([lu.state, lu.reason, lu.until, lu.waitingFor], ["86", "no-calibration", null, null]);
  assert.deepEqual(todo(journal), []);
  assert.deepEqual(journal.tout().at(-1)?.payload, { to: "todo", why: "chef" });
});

test("« c'est arrivé, on repart » : le ticket en WAITING repart en cuisine sans passer par TODO", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 8);
  rail.quatreVingtSix(8, { motif: "no-calibration" });
  attendre(journal, 8);

  const lu = sortir(journal, 8, "kitchen");
  assert.deepEqual([lu.state, lu.reason, lu.waitingFor, etatLu(lu)], ["waiting", null, null, "en attente"]);
  assert.deepEqual(journal.tout().at(-1)?.payload, { to: "kitchen", why: "chef" });
  // Jamais devant le chef entre les deux : aucun fait ne l'y a mis.
  assert.deepEqual(todo(journal), []);
  assert.deepEqual(
    journal.duTicket(8).map((e) => e.type),
    ["ticket.arrived", "ticket.86", "ticket.waiting", "ticket.resumed"],
  );
});

test("la relance atteinte laisse le ticket en WAITING, sans carte dans TODO : seule sa ligne WAITING montre la date passée", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 8);
  const relance = new Date(2026, 9, 21);
  attendre(journal, 8, relance);
  const horloge = new Date(relance.getTime() + 3_600_000);
  const lu = ticketDuRail(journal.base, 8);
  assert.equal(etatLu(lu as NonNullable<typeof lu>), "WAITING");
  assert.equal(lu?.reason, ATTEND_UN_TIERS);
  assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base), horloge), []);
  const tiers = faits(lireEtat(journal, horloge), horloge).rail.find((r) => r.ticket === 8)?.tiers;
  assert.equal(tiers?.relance, relance.toISOString());
});

test("une sortie de WAITING que l'ancienne version écrivait seule (relance, commentaire) n'en sort pas le ticket, rejouée ou non ; celle du chef, si", (t) => {
  const { journal } = cuisine(t);
  for (const ticket of [8, 9, 10]) poser(journal, ticket);
  attendre(journal, 8);
  attendre(journal, 9);
  attendre(journal, 10);
  // Ce que l'ancienne version écrivait : la relance, puis un commentaire du client.
  journal.ajouter({ project: PROJET, ticket: 8, author: "runtime", type: "ticket.resumed", payload: { to: "todo", why: "relance du 27/10 : pas de réponse" } });
  journal.ajouter({ project: PROJET, ticket: 9, author: "runtime", type: "ticket.resumed", payload: { to: "todo", why: "nouveau sur l'issue — de client" } });
  sortir(journal, 10, "todo");

  const lus = () =>
    [8, 9, 10].map((ticket) => {
      const lu = ticketDuRail(journal.base, ticket);
      return [ticket, lu?.state, lu?.reason ?? null, lu?.waitingFor?.who ?? null, lu?.waitingFor?.what ?? null];
    });
  const attendu = [
    [8, "86", ATTEND_UN_TIERS, "le client", "sa validation écrite du devis"],
    [9, "86", ATTEND_UN_TIERS, "le client", "sa validation écrite du devis"],
    [10, "waiting", null, null, null],
  ];
  assert.deepEqual(lus(), attendu);
  assert.deepEqual(todo(journal), []);
  journal.reconstruire();
  assert.deepEqual(lus(), attendu);
});

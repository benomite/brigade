// Ce que le superviseur observe du tour GitHub seul (#3945, `superviseur/tour.ts`) : son
// client enveloppé, chaque lecture et chaque écriture du tour y laisse ce que le
// déclencheur lit — le dernier merge, les cuisinables et depuis quand, les prises
// sans livrer, `main` rouge et depuis quand —, sans un appel de plus à GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";

const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const ticket = (number: number, labels: string[] = CALIBRE, autres: Partial<TicketLu> = {}): TicketLu => ({ number, title: `Ticket ${number}`, labels, state: "open", ...autres });

// Un client du tour dont le test dicte les tickets, les checks de la base et les merges ; il garde ce qu'on lui écrit.
function clientDicte() {
  const dicte = {
    tickets: [] as TicketLu[],
    checks: [] as Array<{ outcome: "green" | "red" | "pending"; name?: string; url?: string }>,
    merge: { fait: true } as { fait: true } | { fait: false; motif: string },
    commentaires: [] as Array<[number, string]>,
  };
  const client = {
    fires: async () => dicte.tickets,
    checksDeLaBase: async () => dicte.checks,
    merger: async () => dicte.merge,
    commenter: async (numero: number, corps: string) => void dicte.commentaires.push([numero, corps]),
  } as unknown as GitHubDuTour;
  return { dicte, client };
}

function suivi() {
  let instant = A("10:00");
  const tour = suivreLeTour(() => new Date(instant));
  const { dicte, client } = clientDicte();
  return { tour, dicte, github: tour.envelopper(client), a: (hhmm: string) => void (instant = A(hhmm)) };
}

test("avant tout tour : rien d'observé", () => {
  const { tour } = suivi();
  assert.deepEqual(tour.faits(), { dernierMerge: null, cuisinables: [], prises: [], mainRougeDepuis: null });
  assert.deepEqual([tour.checks(), tour.sauts()], [null, []]);
});

test("les cuisinables : les tickets calibrés qu'une station prendrait, depuis le premier tour qui les a vus attendre", async () => {
  const { dicte, github, tour, a } = suivi();
  dicte.tickets = [
    ticket(1),
    ticket(2, ["fire", "model:opus"]),
    ticket(3, [...CALIBRE, "taken"]),
    ticket(4, [...CALIBRE, "in-pass"]),
    ticket(5, [...CALIBRE, "waiting"]),
    ticket(6, [...CALIBRE, "blocked-on-human"]),
    ticket(7, [...CALIBRE, "chef-todo"]),
    ticket(8, [...CALIBRE, "set-aside:failures"]),
    ticket(9, CALIBRE, { epique: true }),
    ticket(10, CALIBRE, { besoin: 11 }),
    ticket(11),
  ];
  assert.equal(await github.fires(), dicte.tickets);
  a("10:05");
  // #11 est le besoin d'où #10 est né : il n'attend pas un cook (#2618).
  dicte.tickets = [ticket(12), ticket(1), ticket(10, CALIBRE, { besoin: 11 }), ticket(11)];
  await github.fires();
  assert.deepEqual(tour.faits().cuisinables, [
    { ticket: 1, depuis: A("10:00") },
    { ticket: 10, depuis: A("10:00") },
    { ticket: 12, depuis: A("10:05") },
  ]);
  // Pris, il ne l'est plus ; revenu, il recommence d'attendre.
  a("10:10");
  dicte.tickets = [ticket(1, [...CALIBRE, "taken"])];
  await github.fires();
  assert.deepEqual(tour.faits().cuisinables, []);
  a("10:15");
  dicte.tickets = [ticket(1)];
  await github.fires();
  assert.deepEqual(tour.faits().cuisinables, [{ ticket: 1, depuis: A("10:15") }]);
});

test("le dernier merge : un merge que le tour a fait, ou un ticket en pass qui a quitté les tickets ouverts", async () => {
  const { dicte, github, tour, a } = suivi();
  dicte.tickets = [ticket(1, [...CALIBRE, "in-pass"]), ticket(2)];
  await github.fires();
  a("10:05");
  await github.fires();
  assert.equal(tour.faits().dernierMerge, null);
  // Un merge refusé n'en est pas un.
  dicte.merge = { fait: false, motif: "conflict" };
  assert.deepEqual(await github.merger(1001, "abc"), { fait: false, motif: "conflict" });
  assert.equal(tour.faits().dernierMerge, null);
  a("10:10");
  // Une autre station a mergé #1 : il n'est plus ouvert.
  dicte.tickets = [ticket(2)];
  await github.fires();
  assert.equal(tour.faits().dernierMerge, A("10:10"));
  a("10:20");
  dicte.merge = { fait: true };
  await github.merger(1002, "def");
  assert.equal(tour.faits().dernierMerge, A("10:20"));
});

test("les prises sans livrer : le compte `n=` que la station écrit au cook arrêté, oublié quand le ticket n'est plus ouvert", async () => {
  const { dicte, github, tour } = suivi();
  dicte.tickets = [ticket(4), ticket(5)];
  await github.fires();
  await github.commenter(4, "<!-- brigade:echec n=2 -->\nStation `box/claude`: the cook stopped without a delivery — boom");
  await github.commenter(5, "Station `box/claude`: taken.");
  await github.commenter(4, "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — boom");
  assert.equal(dicte.commentaires.length, 3);
  assert.deepEqual(tour.faits().prises, [{ ticket: 4, prises: 3 }]);
  dicte.tickets = [ticket(5)];
  await github.fires();
  assert.deepEqual(tour.faits().prises, []);
});

test("`main` rouge : depuis le premier tour qui a lu un check rouge, nul dès qu'aucun ne l'est ; les checks lus, nom et issue", async () => {
  const { dicte, github, tour, a } = suivi();
  dicte.checks = [{ name: "tests", outcome: "green" }];
  await github.checksDeLaBase();
  assert.equal(tour.faits().mainRougeDepuis, null);
  a("10:05");
  dicte.checks = [{ name: "tests", outcome: "red", url: "https://github.com/acme/shop/actions/runs/5/job/6" }, { name: "types", outcome: "pending" }];
  assert.equal(await github.checksDeLaBase(), dicte.checks);
  a("10:20");
  await github.checksDeLaBase();
  assert.equal(tour.faits().mainRougeDepuis, A("10:05"));
  assert.deepEqual(tour.checks(), [{ name: "tests", outcome: "red" }, { name: "types", outcome: "pending" }]);
  dicte.checks = [{ name: "tests", outcome: "green" }];
  await github.checksDeLaBase();
  assert.equal(tour.faits().mainRougeDepuis, null);
});

test("un cuisinable que la porte de prise a sauté parce qu'il n'attend que des tickets en cuisson n'attend pas : ni cuisinable, ni dans ce qu'elle a dit (#3647)", async () => {
  const { dicte, github, tour } = suivi();
  dicte.tickets = [ticket(1), ticket(2), ticket(3), ticket(4, [...CALIBRE, "taken"]), ticket(5)];
  await github.fires();
  tour.sauter(3, "#3 waits for #4", [4]);
  tour.sauter(2, "#2 waits for #4 and #5", [4, 5]);
  tour.sauter(1, "#1: no station provides `gpu`");
  tour.sauter(4, "#4 is taken");
  assert.deepEqual(tour.faits().cuisinables.map(({ ticket }) => ticket), [1, 2, 5]);
  assert.deepEqual(tour.sauts(), ["#1: no station provides `gpu`", "#2 waits for #4 and #5"]);
  // Au tour suivant, ce que la porte a dit se lit jusqu'à ce qu'elle repasse (#3761) ; un tour sans saut, et il tombe.
  await github.fires();
  assert.deepEqual(tour.sauts(), ["#1: no station provides `gpu`", "#2 waits for #4 and #5"]);
  await github.fires();
  assert.deepEqual(tour.sauts(), []);
  assert.deepEqual(tour.faits().cuisinables.map(({ ticket }) => ticket), [1, 2, 3, 5]);
});

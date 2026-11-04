// Des livraisons jugées de front (#2000) : sur une cuisine complète — rail,
// garde-fous, station, pass, un faux `claude`, un GitHub de test —, les
// livraisons dont les zones ne se recouvrent pas sont jugées en même temps, au
// plus autant que le plafond des jugements simultanés ; celle qui n'a pas de
// zone, ou qui a écrit hors de la sienne, est jugée seule. La CI de chaque
// commit est à la main du test : en cours, sauf pour ceux qu'il a libérés.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Check } from "../../src/events/pass.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { principal as montrerPass } from "../../src/montrer-pass.ts";
import { passDuTicket } from "../../src/projections/pass.ts";
import type { Depot } from "../../src/depot.ts";
import { CALIBRE, chef, cuisine, issue } from "../aides/cuisine.ts";
import { appeler, jusqua } from "../outils.ts";

const EN_COURS: Check[] = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];

// Ce que le faux cook écrit, sur chaque branche : un chemin commun du projet,
// qu'aucune zone ne possède.
const COMMUNS = ["travail.txt"];

type Ticket = { numero: number; zone: string | null; dehors?: string };

// Une cuisine sous grant. Les tickets sont servis dans l'ordre où le test les
// donne — leur création —, chacun avec sa fiche (`zone` nulle : sans fiche) ;
// `dehors` : un fichier que sa livraison écrit hors de sa zone. La base avance
// d'un commit à chaque merge : `base-<merges faits>`.
function service(t: TestContext, tickets: Ticket[], options: { jugements?: number; cooks?: number } = {}) {
  const issues = tickets.map(({ numero }, rang) => issue(numero, CALIBRE, { createdAt: `2026-10-01T00:00:${String(rang + 1).padStart(2, "0")}Z` }));
  const dehors = new Map(tickets.flatMap(({ numero, dehors: fichier }) => (fichier === undefined ? [] : [[numero, fichier]])));
  let merges = () => 0;
  const lieu = cuisine(t, {
    tickMs: 25,
    pass: true,
    issues,
    communs: COMMUNS,
    cooks: options.cooks ?? tickets.length,
    jugements: options.jugements,
    depot: (depot: Depot): Depot => ({
      ...depot,
      rapatrier: async () => (await depot.rapatrier(), `base-${merges()}`),
      changes: (branche) => {
        const numero = [...dehors.keys()].find((n) => branche.startsWith(`cook/${n}-`));
        return numero === undefined ? depot.changes(branche) : [...depot.changes(branche), dehors.get(numero) ?? ""];
      },
    }),
  });
  for (const { numero, zone } of tickets) if (zone !== null) lieu.gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, `- zone : ${zone}`].join("\n"));
  chef(lieu.repertoire, "grant.activated");
  const { journal, gh } = lieu;
  const liberes = new Set<number>();
  gh.github.ci = async (sha) => ([...liberes].some((numero) => passDuTicket(journal.base, numero)?.sha === sha) ? [] : EN_COURS);
  const phase = (numero: number) => passDuTicket(journal.base, numero)?.phase;
  const premier = (numero: number, type: string) => journal.duTicket(numero).find((e) => e.type === type)?.seq;
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  merges = () => compter("merge.done");
  const laisserTourner = () => {
    const vus = compter("runtime.ticked");
    return jusqua(() => compter("runtime.ticked") >= vus + 3);
  };
  // Ce que dit `pass`, ou `pass <n>`, comme le chef le lirait pendant que le runtime tourne.
  const pass = async (...args: string[]) => {
    const appel = appeler(montrerPass, args, { BRIGADE_STATE_DIR: lieu.repertoire });
    assert.equal(await appel.fin, 0);
    return appel.sortie();
  };
  // Le temps de chaque pass : de son début à son merge, en rangs du journal.
  const passes = () =>
    tickets.flatMap(({ numero }) => {
      const debut = premier(numero, "pass.started");
      return debut === undefined ? [] : [{ numero, debut, fin: premier(numero, "merge.done") ?? Number.MAX_SAFE_INTEGER }];
    });
  // Le plus de passes à la fois, d'un bout à l'autre du journal.
  const auPlusDeFront = () => {
    const bornes = passes().flatMap(({ debut, fin }) => [[debut, 1], [fin, -1]] as const).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let enCours = 0;
    let auPlus = 0;
    for (const [, pas] of bornes) auPlus = Math.max(auPlus, (enCours += pas));
    return auPlus;
  };
  // Ce qui s'est jugé en même temps qu'elle.
  const deFront = (numero: number) => {
    const elle = passes().find((p) => p.numero === numero);
    return elle === undefined ? [] : passes().filter((p) => p.numero !== numero && p.debut < elle.fin && elle.debut < p.fin).map((p) => p.numero);
  };
  return { ...lieu, phase, premier, compter, laisserTourner, pass, passes, auPlusDeFront, deFront, liberer: (numero: number) => void liberes.add(numero) };
}

describe("des livraisons jugées de front", { concurrency: 3 }, () => {
  test("trois livraisons aux zones disjointes sont jugées en même temps, `pass` les dit toutes jugées, et toutes sont mergées", async (t) => {
    const { journal, gh, phase, premier, compter, pass, liberer, auPlusDeFront } = service(t, [
      { numero: 14, zone: "runtime/src/rail" },
      { numero: 15, zone: "runtime/src/pass" },
      { numero: 16, zone: "scripts" },
    ]);
    await jusqua(() => [14, 15, 16].every((numero) => phase(numero) === "judging"));

    // Toutes ont commencé, aucune n'a de verdict : elles se jugent de front.
    assert.equal(journal.tout().some((e) => e.type === "pass.judged"), false);
    const liste = await pass();
    for (const numero of [14, 15, 16]) assert.match(liste, new RegExp(`^#${numero} {2}being judged`, "m"));
    assert.doesNotMatch(liste, /waiting for its turn/);

    // Un merge prend son temps chez GitHub : assez pour qu'un autre, jugé de
    // front, partirait sans le verrou des merges sur la base d'avant.
    const merger = gh.github.merger;
    gh.github.merger = async (numero, sha) => (await new Promise((resoudre) => setTimeout(resoudre, 30)), merger(numero, sha));
    for (const numero of [14, 15, 16]) liberer(numero);
    await jusqua(() => [14, 15, 16].every((numero) => premier(numero, "merge.done") !== undefined));
    assert.equal(auPlusDeFront(), 3);
    // Jugées de front sur la même base, chacune n'est mergée que sur celle
    // de son dernier verdict : celles mergées après une autre se sont rejugées
    // sur la base où l'autre l'avait été.
    const evenements = journal.tout();
    for (const merge of evenements.filter((e) => e.type === "merge.done")) {
      const verdict = evenements.findLast((e) => e.type === "pass.judged" && e.ticket === merge.ticket && e.seq < merge.seq)?.payload as { verdict: string; base: string } | undefined;
      const avant = evenements.filter((e) => e.type === "merge.done" && e.seq < merge.seq).length;
      assert.deepEqual([verdict?.verdict, verdict?.base], ["green", `base-${avant}`], `#${merge.ticket}`);
    }
    assert.ok(compter("pass.judged") > 3, "une livraison au moins s'est rejugée sur la base qui a bougé");
  });

  test("avec un plafond de deux, jamais plus de deux jugements à la fois : la troisième attend une place libre, et la prend quand une se libère", async (t) => {
    const { phase, premier, pass, liberer, laisserTourner, auPlusDeFront } = service(
      t,
      [
        { numero: 14, zone: "runtime/src/rail" },
        { numero: 15, zone: "runtime/src/pass" },
        { numero: 16, zone: "scripts" },
      ],
      { jugements: 2 },
    );
    await jusqua(() => [14, 15, 16].filter((numero) => phase(numero) === "judging").length === 2 && [14, 15, 16].some((numero) => phase(numero) === "delivered"));
    await laisserTourner();
    const jugees = [14, 15, 16].filter((numero) => phase(numero) === "judging");
    const [attend] = [14, 15, 16].filter((numero) => !jugees.includes(numero));
    assert.equal(jugees.length, 2);
    assert.equal(phase(attend!), "delivered");
    // Celles dans leur pass sont nommées dans l'ordre de leur livraison.
    const ditDeLaTroisieme = await pass(String(attend));
    assert.match(ditDeLaTroisieme, new RegExp(`^#${attend} {2}delivered, waiting for its turn — #\\d+, #\\d+ are in their pass, next in line — waiting for a free slot: 2 judgements at once at most`));
    assert.deepEqual([...(ditDeLaTroisieme.match(/— (#\d+), (#\d+) are/) ?? [])].slice(1).sort(), jugees.map((numero) => `#${numero}`).sort());

    liberer(jugees[0]!);
    await jusqua(() => premier(attend!, "pass.started") !== undefined);
    for (const numero of [14, 15, 16]) liberer(numero);
    await jusqua(() => [14, 15, 16].every((numero) => premier(numero, "merge.done") !== undefined));
    assert.equal(auPlusDeFront(), 2);
  });

  test("une livraison sans zone se juge seule : elle ne commence pas tant qu'une autre est jugée, et rien d'autre ne l'est pendant qu'elle l'est", async (t) => {
    // Un cook à la fois : livrées dans l'ordre, 14 d'abord, pendant que sa pass tourne.
    const { phase, premier, pass, liberer, laisserTourner, deFront, passes } = service(
      t,
      [
        { numero: 14, zone: "runtime/src/rail" },
        { numero: 15, zone: null },
        { numero: 16, zone: "scripts" },
      ],
      { cooks: 1 },
    );
    await jusqua(() => phase(14) === "judging" && phase(15) === "delivered" && phase(16) === "delivered");
    await laisserTourner();
    // 15 attend que 14 sorte de sa pass ; 16, ailleurs, ne la double pas.
    assert.deepEqual([phase(14), phase(15), phase(16)], ["judging", "delivered", "delivered"]);
    assert.match(await pass("15"), /^#15 {2}delivered, waiting for its turn — #14 is in its pass, next in line — judged alone: it declares no zone/);
    assert.match(await pass("16"), /waiting for its turn — #14 is in its pass, 1 ahead of it — #15, ahead of it, is judged alone/);

    // 14 mergée, 15 entre seule dans sa pass : 16 l'attend.
    liberer(14);
    await jusqua(() => phase(15) === "judging");
    await laisserTourner();
    assert.equal(phase(16), "delivered");
    assert.match(await pass("16"), /waiting for its turn — #15 is in its pass, next in line — #15 is judged alone/);

    liberer(15);
    liberer(16);
    await jusqua(() => [14, 15, 16].every((numero) => premier(numero, "merge.done") !== undefined));
    assert.deepEqual(deFront(15), [], JSON.stringify(passes()));
    assert.deepEqual(passes().map(({ numero }) => numero).sort(), [14, 15, 16]);
  });

  test("une livraison qui a écrit hors de sa zone se juge seule, elle aussi", async (t) => {
    const { phase, premier, pass, liberer, laisserTourner, deFront, passes } = service(
      t,
      [
        { numero: 14, zone: "runtime/src/rail" },
        { numero: 15, zone: "runtime/src/pass", dehors: "docs/runtime/pass-merge.md" },
        { numero: 16, zone: "scripts" },
      ],
      { cooks: 1 },
    );
    await jusqua(() => phase(14) === "judging" && phase(15) === "delivered" && phase(16) === "delivered");
    await laisserTourner();
    assert.deepEqual([phase(14), phase(15), phase(16)], ["judging", "delivered", "delivered"]);
    assert.match(await pass("15"), /waiting for its turn — #14 is in its pass, next in line — judged alone: it wrote outside its zone/);

    for (const numero of [14, 15, 16]) liberer(numero);
    await jusqua(() => [14, 15, 16].every((numero) => premier(numero, "merge.done") !== undefined));
    assert.deepEqual(deFront(15), [], JSON.stringify(passes()));
  });

  test("avec un plafond d'un, la pass juge une livraison à la fois, dans l'ordre de leur livraison, comme avant", async (t) => {
    const { journal, phase, premier, pass, liberer, laisserTourner, auPlusDeFront } = service(
      t,
      [
        { numero: 14, zone: "runtime/src/rail" },
        { numero: 15, zone: "runtime/src/pass" },
        { numero: 16, zone: "scripts" },
      ],
      { jugements: 1, cooks: 1 },
    );
    await jusqua(() => phase(14) === "judging" && phase(15) === "delivered" && phase(16) === "delivered");
    await laisserTourner();
    assert.match(await pass("15"), /waiting for its turn — #14 is in its pass, next in line — waiting for a free slot: 1 judgement at once at most/);
    assert.match(await pass("16"), /waiting for its turn — #14 is in its pass, 1 ahead of it/);

    for (const numero of [14, 15, 16]) liberer(numero);
    await jusqua(() => [14, 15, 16].every((numero) => premier(numero, "merge.done") !== undefined));
    const ordre = journal
      .tout()
      .filter((e) => e.type === "pass.started" || e.type === "pass.judged")
      .map((e) => `${e.type === "pass.started" ? "début" : "verdict"} #${e.ticket}`);
    assert.deepEqual(ordre, ["début #14", "verdict #14", "début #15", "verdict #15", "début #16", "verdict #16"]);
    assert.equal(auPlusDeFront(), 1);
  });
});

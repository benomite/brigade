// The kitchen wakes the product role on its own (#1955): at a tick, when the
// rail is empty, within a daily cap, off in one gesture, and said by `status`.
// The role itself is a double here: what is proven is when it runs, and what
// the log and `status` say of it.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../../../src/evenements.ts";
import type { FinDeCook, GardeFous } from "../../../src/garde-fous.ts";
import { ouvrirJournal, type Journal } from "../../../src/journal.ts";
import { brancherCadence, ouvrirCadence, type OptionsCadence } from "../../../src/produit/cadence/cadence.ts";
import { commanderCadence, principal as produit } from "../../../src/produit/cadence/interrupteur.ts";
import { configCadence } from "../../../src/produit/cadence/reglages.ts";
import { DEPOSE_PAR, lanceurDuRole, lirePropositions, type DemandeAuRole } from "../../../src/produit/cadence/role.ts";
import type { CauseReveil, Runtime } from "../../../src/runtime.ts";
import { photoDuProjet } from "../../../src/status.ts";
import { appeler, jusqua, repertoireTemporaire } from "../../outils.ts";

const HEURE_MS = 3_600_000;
const DEBUT = Date.parse("2026-11-01T10:00:00.000Z");

// A project's log with a clock the test sets, and a runtime whose ticks it
// triggers by hand.
function projet(t: TestContext, nom = "brigade") {
  const repertoire = repertoireTemporaire(t);
  let instant = DEBUT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: nom, ticket, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const runtime: Runtime = {
    projet: nom,
    journal,
    surReveil: (ecouter) => (ecouteurs.add(ecouter), () => ecouteurs.delete(ecouter)),
    arreter: () => ecouteurs.clear(),
  };
  return {
    repertoire,
    journal,
    runtime,
    noter,
    maintenant: () => new Date(instant),
    // Moves the clock `heures` hours from the start.
    a: (heures: number) => void (instant = DEBUT + heures * HEURE_MS),
    reveiller: (cause: CauseReveil) => ecouteurs.forEach((ecouter) => ecouter(cause)),
    arriver: (ticket: number) =>
      noter(
        { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [], problems: [] } } },
        ticket,
        "github",
      ),
  };
}

// A role that files `parRun` issues at each run, and counts what GitHub says
// was filed that day.
function role(parRun = 1) {
  const demandes: DemandeAuRole[] = [];
  const deposes = new Map<string, number>();
  let numero = 100;
  const options = {
    lancer: async (demande: DemandeAuRole) => {
      demandes.push(demande);
      const filed = Array.from({ length: Math.min(parRun, demande.restant) }, () => ++numero);
      deposes.set(demande.jour, (deposes.get(demande.jour) ?? 0) + filed.length);
      return { run: `product-${demandes.length}`, outcome: "done" as const, filed, detail: null };
    },
    deposesLe: async (jour: string) => deposes.get(jour) ?? 0,
    enRetard: async () => [] as number[],
  };
  return { demandes, deposes, options };
}

const faits = (journal: Journal, type: string) => journal.tout().filter((evenement) => evenement.type === type);
const ligneProduit = (repertoire: string, maintenant: Date) => photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant }).find((ligne) => ligne.startsWith("product "));

test("rail vide, aucune interface ouverte, rôle allumé : un tick le lance une fois ; un rail qui porte un ticket ne le lance pas", async (t) => {
  const p = projet(t);
  const r = role();
  const servi = brancherCadence(p.runtime, { ...configCadence({}), ...r.options, maintenant: p.maintenant });
  t.after(() => servi.arreter("test"));

  // Un réveil du journal n'est pas un tick : rien ne part.
  p.reveiller("log");
  p.reveiller("tick");
  await jusqua(() => faits(p.journal, "product.ran").length === 1);
  assert.equal(r.demandes.length, 1);
  assert.deepEqual(r.demandes[0], { raison: "rail-empty", enRetard: [], restant: 3, jour: "2026-11-01" });
  assert.deepEqual(faits(p.journal, "product.ran")[0]?.payload, {
    run: "product-1",
    reason: "rail-empty",
    outcome: "done",
    day: "2026-11-01",
    filed: [101],
    filedToday: 1,
    cap: 3,
    overdue: [],
    detail: null,
  });

  // Un ticket sur le rail : passé l'intervalle, un tick ne lance rien.
  p.arriver(7);
  p.a(5);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, maintenant: p.maintenant });
  assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "rail-busy" });
  assert.equal(r.demandes.length, 1);
});

test("un ticket en WAITING ne compte pas : le rail est vide pour un cook, le rôle part", async (t) => {
  const p = projet(t);
  const r = role();
  p.arriver(7);
  p.noter({ type: "ticket.waiting", payload: { what: "the customer's answer", who: "the customer", followUp: "2026-11-02T18:00:00.000Z" } }, 7, "chef");
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, maintenant: p.maintenant });
  assert.equal((await cadence.tour())?.quoi, "lancer");
  assert.equal(r.demandes.length, 1);
});

test("une issue du dehors sans réponse depuis plus d'un jour réveille le rôle sur un rail occupé", async (t) => {
  const p = projet(t);
  const r = role();
  p.arriver(7);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, enRetard: async () => [42], maintenant: p.maintenant });
  assert.deepEqual(await cadence.tour(), { quoi: "lancer", raison: "outside-issue-overdue", enRetard: [42], deposes: 0 });
  assert.deepEqual(r.demandes[0], { raison: "outside-issue-overdue", enRetard: [42], restant: 3, jour: "2026-11-01" });
});

test("sur un rail occupé, les issues du dehors se sondent une fois l'heure, pas à chaque tick", async (t) => {
  const p = projet(t);
  const r = role();
  p.arriver(7);
  let sondages = 0;
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, enRetard: async () => (sondages++, []), maintenant: p.maintenant });
  for (const heures of [0, 0.25, 0.5, 0.75, 1, 1.5]) {
    p.a(heures);
    assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "rail-busy" });
  }
  assert.equal(sondages, 2);
});

test("l'intervalle borne les lancements : un tick avant lui ne relance pas, un tick après, si", async (t) => {
  const p = projet(t);
  const r = role(0);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({ BRIGADE_PRODUCT_INTERVAL_HOURS: "2" }), ...r.options, maintenant: p.maintenant });
  await cadence.tour();
  p.a(1.5);
  assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "too-soon" });
  p.a(2);
  assert.equal((await cadence.tour())?.quoi, "lancer");
  assert.equal(r.demandes.length, 2);
});

test("le plafond du jour atteint : les ticks suivants ne déposent rien, le journal le dit une fois ; le lendemain, le dépôt reprend", async (t) => {
  const p = projet(t);
  const r = role(2);
  const dits: string[] = [];
  const options: OptionsCadence = { ...configCadence({ BRIGADE_PRODUCT_INTERVAL_HOURS: "1" }), ...r.options, maintenant: p.maintenant, avertir: (texte) => dits.push(texte) };
  const cadence = ouvrirCadence(p.runtime, options);

  // Deux, puis un : ce que le plafond laisse, jamais plus.
  await cadence.tour();
  p.a(1);
  await cadence.tour();
  assert.deepEqual(r.demandes.map(({ restant }) => restant), [3, 1]);
  assert.equal(r.deposes.get("2026-11-01"), 3);

  // Plafond atteint : rien ne part, et le journal le dit — une fois.
  p.a(2);
  assert.deepEqual(await cadence.tour(), { quoi: "plafond", deposes: 3 });
  p.a(3);
  assert.deepEqual(await cadence.tour(), { quoi: "plafond", deposes: 3 });
  assert.equal(r.demandes.length, 2);
  assert.deepEqual(
    faits(p.journal, "product.cap-reached").map(({ payload }) => payload),
    [{ day: "2026-11-01", filedToday: 3, cap: 3 }],
  );
  assert.deepEqual(dits, ["brigade : product role — daily cap reached (3/3 filed on 2026-11-01, UTC): nothing more is filed today"]);
  assert.equal(ligneProduit(p.repertoire, p.maintenant()), "product    ON — 3/3 filed today (2026-11-01, UTC), last run 2026-11-01T11:00:00.000Z");

  // Le lendemain : le compte repart de zéro, le rôle aussi.
  p.a(24);
  assert.equal((await cadence.tour())?.quoi, "lancer");
  assert.deepEqual(r.demandes.at(-1), { raison: "rail-empty", enRetard: [], restant: 3, jour: "2026-11-02" });
});

test("le plafond se compte sur GitHub : des issues `filed-by:product` déjà déposées ce jour-là, à la main, le réduisent", async (t) => {
  const p = projet(t);
  const r = role(5);
  r.deposes.set("2026-11-01", 2);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, maintenant: p.maintenant });
  await cadence.tour();
  assert.deepEqual(r.demandes.map(({ restant }) => restant), [1]);
  assert.equal((faits(p.journal, "product.ran")[0]?.payload as { filedToday?: number } | undefined)?.filedToday, 3);
});

test("éteint d'un geste, le rôle ne part plus, ni sur un tick ; rallumé du même geste, il reprend", async (t) => {
  const p = projet(t);
  const r = role(0);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({ BRIGADE_PRODUCT_INTERVAL_HOURS: "1" }), ...r.options, maintenant: p.maintenant });

  const eteindre = appeler(produit, ["off"], { BRIGADE_STATE_DIR: p.repertoire });
  assert.equal(await eteindre.fin, 0);
  assert.match(eteindre.sortie(), /^brigade : product role off: the kitchen no longer wakes it/);
  for (const heures of [0, 2, 30]) {
    p.a(heures);
    assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "off" });
  }
  assert.equal(r.demandes.length, 0);
  assert.match(ligneProduit(p.repertoire, p.maintenant()) ?? "", /^product {4}OFF since \S+ \(by chef\) — 0\/3 filed today \(2026-11-02, UTC\), last run never$/);
  const encore = appeler(produit, ["off"], { BRIGADE_STATE_DIR: p.repertoire });
  assert.equal(await encore.fin, 0);
  assert.match(encore.sortie(), /nothing to switch off/);

  const rallumer = appeler(produit, ["on"], { BRIGADE_STATE_DIR: p.repertoire });
  assert.equal(await rallumer.fin, 0);
  assert.match(rallumer.sortie(), /^brigade : product role on/);
  assert.equal((await cadence.tour())?.quoi, "lancer");
  assert.equal(r.demandes.length, 1);

  const montrer = appeler(produit, [], { BRIGADE_STATE_DIR: p.repertoire });
  assert.equal(await montrer.fin, 0);
  assert.match(montrer.sortie(), /^product {4}ON — 0\/3 filed today/);
  for (const mauvais of [["toggle"], ["on", "off"]]) {
    const refus = appeler(produit, mauvais, { BRIGADE_STATE_DIR: p.repertoire });
    assert.equal(await refus.fin, 2);
    assert.match(refus.sortie(), /usage/);
  }
});

test("le projet éteint, ou la cuisine arrêtée par le chef, retient le rôle comme le reste", async (t) => {
  const p = projet(t);
  const r = role();
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({}), ...r.options, maintenant: p.maintenant });
  p.noter({ type: "project.switched-off", payload: {} }, null, "chef");
  assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "project-off" });
  p.noter({ type: "project.switched-on", payload: {} }, null, "chef");
  p.noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  assert.deepEqual(await cadence.tour(), { quoi: "rien", pourquoi: "project-off" });
  assert.equal(r.demandes.length, 0);
});

test("`status` dit le rôle : allumé, `N/plafond` déposées aujourd'hui et le dernier lancement — ou `never`", async (t) => {
  const p = projet(t);
  assert.equal(ligneProduit(p.repertoire, p.maintenant()), "product    ON — 0/3 filed today (2026-11-01, UTC), last run never");
  // `status` en entier, par sa commande : la ligne y est.
  const sortie = appeler((await import("../../../src/status.ts")).principal, [], { BRIGADE_STATE_DIR: p.repertoire });
  assert.equal(await sortie.fin, 0);
  assert.match(sortie.sortie(), /^product {4}(ON|OFF)/m);

  const r = role(2);
  const cadence = ouvrirCadence(p.runtime, { ...configCadence({ BRIGADE_PRODUCT_DAILY_CAP: "5" }), ...r.options, maintenant: p.maintenant });
  p.a(1);
  await cadence.tour();
  assert.equal(ligneProduit(p.repertoire, p.maintenant()), "product    ON — 2/5 filed today (2026-11-01, UTC), last run 2026-11-01T11:00:00.000Z");
  // Le lendemain : rien de déposé encore, le dernier lancement reste dit.
  assert.equal(ligneProduit(p.repertoire, new Date(DEBUT + 25 * HEURE_MS)), "product    ON — 0/5 filed today (2026-11-02, UTC), last run 2026-11-01T11:00:00.000Z");
});

test("chaque projet a son plafond : un second projet au plafond de 1 s'arrête à 1, le premier va jusqu'à 3", async (t) => {
  const premier = projet(t, "brigade");
  const second = projet(t, "compta");
  const r1 = role(1);
  const r2 = role(1);
  const c1 = ouvrirCadence(premier.runtime, { ...configCadence({ BRIGADE_PRODUCT_INTERVAL_HOURS: "1" }), ...r1.options, maintenant: premier.maintenant });
  const c2 = ouvrirCadence(second.runtime, { ...configCadence({ BRIGADE_PRODUCT_DAILY_CAP: "1", BRIGADE_PRODUCT_INTERVAL_HOURS: "1" }), ...r2.options, maintenant: second.maintenant });
  for (const heures of [0, 1, 2, 3]) {
    premier.a(heures);
    second.a(heures);
    await c1.tour();
    await c2.tour();
  }
  assert.equal(r1.deposes.get("2026-11-01"), 3);
  assert.equal(r2.deposes.get("2026-11-01"), 1);
  assert.deepEqual(faits(second.journal, "product.cap-reached").map(({ payload }) => payload), [{ day: "2026-11-01", filedToday: 1, cap: 1 }]);
  assert.deepEqual(faits(premier.journal, "product.cap-reached").map(({ payload }) => payload), [{ day: "2026-11-01", filedToday: 3, cap: 3 }]);
  assert.match(ligneProduit(second.repertoire, second.maintenant()) ?? "", / 1\/1 filed today/);
  assert.match(ligneProduit(premier.repertoire, premier.maintenant()) ?? "", / 3\/3 filed today/);
});

test("les réglages : 3 par jour et 4 h par défaut ; une valeur mal écrite refuse le démarrage", () => {
  assert.deepEqual(configCadence({}), { plafond: 3, intervalleMs: 4 * HEURE_MS });
  assert.deepEqual(configCadence({ BRIGADE_PRODUCT_DAILY_CAP: "0", BRIGADE_PRODUCT_INTERVAL_HOURS: "0.5" }), { plafond: 0, intervalleMs: HEURE_MS / 2 });
  for (const env of [{ BRIGADE_PRODUCT_DAILY_CAP: "-1" }, { BRIGADE_PRODUCT_DAILY_CAP: "trois" }, { BRIGADE_PRODUCT_INTERVAL_HOURS: "0" }, { BRIGADE_PRODUCT_INTERVAL_HOURS: "25" }]) {
    assert.throws(() => configCadence(env), /invalid BRIGADE_PRODUCT_/);
  }
});

test("le rôle ne dépose jamais plus que ce que le plafond laisse, chaque issue avec `filed-by:product` et sa `prio:`", async (t) => {
  const repertoire = repertoireTemporaire(t);
  mkdirSync(join(repertoire, "runs"));
  const reponse = JSON.stringify({
    issues: [
      { title: "Onboarding stalls at the token step", body: "Three tickets set aside for it (#12, #14, #15).", prio: 1 },
      { title: "", body: "no title", prio: 2 },
      { title: "Second", body: "Evidence: #20", prio: 2 },
      { title: "Third", body: "Evidence: #21", prio: 3 },
    ],
  });
  const lancer: GardeFous["lancer"] = (demande) => {
    writeFileSync(join(repertoire, "runs", `${demande.run}.jsonl`), `${JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 1, result: reponse })}\n`);
    const fin: FinDeCook = { code: 0, signal: null, turns: 1, tokens: 10, durationMs: 1000, arret: null, erreur: null, outcome: "ok" };
    return { run: demande.run ?? "", pid: 1, arreter: () => {}, fin: Promise.resolve(fin) };
  };
  const creees: { titre: string; corps: string; labels: string[] }[] = [];
  const lanceur = lanceurDuRole(
    { lancer },
    {
      github: { creerIssue: async (issue) => (creees.push(issue), 200 + creees.length) },
      depotGitHub: "acme/brigade",
      repertoireEtat: repertoire,
      bin: "claude",
      calibrage: () => ({ model: "sonnet", effort: "medium" }),
      ouvertes: async () => [],
    },
  );
  const fait = await lanceur({ raison: "rail-empty", enRetard: [], restant: 2, jour: "2026-11-01" });
  assert.deepEqual(fait && { ...fait, run: null }, { run: null, outcome: "done", filed: [201, 202], detail: "1 proposal beyond the cap, not filed" });
  assert.deepEqual(creees.map(({ titre, labels }) => [titre, labels]), [
    ["Onboarding stalls at the token step", [DEPOSE_PAR, "prio:1"]],
    ["Second", [DEPOSE_PAR, "prio:2"]],
  ]);
  assert.match(creees[0]?.corps ?? "", /Filed by the second, woken by the kitchen while the chef was away: the rail is empty\._$/);
});

test("une réponse du rôle qui ne se lit pas ne dépose rien, et dit pourquoi", () => {
  assert.deepEqual(lirePropositions(null), { illisible: "no answer" });
  assert.deepEqual(lirePropositions("nothing to file"), { illisible: "no JSON object in the answer" });
  assert.deepEqual(lirePropositions('{"proposals": []}'), { illisible: "no `issues` list in the answer" });
  assert.deepEqual(lirePropositions('{"issues": []}'), { propositions: [] });
  assert.deepEqual(lirePropositions('{"issues": [{"title": "A", "body": "B", "prio": 9}]}'), { propositions: [] });
});

test("la commande refuse un répertoire sans journal, et un journal vide", async (t) => {
  const vide = repertoireTemporaire(t);
  const sans = appeler(produit, ["off"], { BRIGADE_STATE_DIR: vide });
  assert.equal(await sans.fin, 1);
  assert.match(sans.sortie(), /no log in/);
  const journal = ouvrirJournal(vide);
  t.after(() => journal.fermer());
  assert.throws(() => commanderCadence(journal, "off", new Date()), /empty log/);
});

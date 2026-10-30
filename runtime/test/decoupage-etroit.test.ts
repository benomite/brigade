// Un découpage aux zones larges, ou qui lie par `attend` des tickets aux zones
// disjointes, est refusé et refait une fois (#1800) ; et deux tickets aux zones
// disjointes cuisent en même temps, deux qui se recouvrent l'un après l'autre.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirDecoupage, type Atelier, type Reponse } from "../src/decoupage.ts";
import { defautsDeDecoupage, lireDecoupage, type Decoupe } from "../src/decouper.ts";
import type { TicketPrevu } from "../src/events/manager.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { BAIL_MS } from "./aides/cuisine.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const prevu = (zone: string[], waitsFor: number[] = []): TicketPrevu => ({ title: "t", context: "", criteria: ["c"], waitsFor, zone, model: "sonnet", effort: "low", calibration: "x" });

test("un découpage de zones étroites et indépendantes n'a aucun défaut", () => {
  assert.deepEqual(defautsDeDecoupage([prevu(["runtime/src/a.ts"]), prevu(["runtime/test/a.test.ts"]), prevu(["docs/a.md"])]), []);
  // Une attente entre zones qui se recouvrent est légitime.
  assert.deepEqual(defautsDeDecoupage([prevu(["runtime/src/a.ts"]), prevu(["runtime/src"], [1])]), []);
});

test("une zone qui est un dossier de produit entier est refusée, sous toutes ses écritures", () => {
  for (const zone of ["runtime", "runtime/", "./app", "docs/"]) {
    const defauts = defautsDeDecoupage([prevu([zone])]);
    assert.equal(defauts.length, 1, zone);
    assert.match(defauts[0] ?? "", /^ticket 1 : sa zone est le dossier entier/);
  }
  // Un sous-dossier n'est pas un dossier de produit.
  assert.deepEqual(defautsDeDecoupage([prevu(["runtime/src"])]), []);
});

test("deux tickets aux zones disjointes liés par `attend` sont refusés", () => {
  const defauts = defautsDeDecoupage([prevu(["runtime/src/a.ts"]), prevu(["docs/a.md"], [1])]);
  assert.equal(defauts.length, 1);
  assert.match(defauts[0] ?? "", /ticket 2 attend le ticket 1, mais leurs zones sont disjointes/);
});

function reponseDe(tickets: TicketPrevu[]): Reponse<Decoupe> {
  return { run: "r", valeur: { quoi: "tickets", reason: "m", order: "o", tickets } };
}

function atelier(t: TestContext, rendus: Reponse<Decoupe>[]) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const consignes: string[] = [];
  const avertis: string[] = [];
  const github = { issue: async () => ({ state: "closed" }) } as unknown as Atelier["github"];
  const a: Atelier = {
    journal,
    github,
    depotGitHub: "acme/brigade",
    fichiers: () => [],
    noter: (ticket, fait) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait }),
    demander: (async (_sujet: unknown, consigne: string) => {
      consignes.push(consigne);
      return rendus.shift() ?? null;
    }) as Atelier["demander"],
    peutJuger: () => true,
    arrete: () => false,
    eteint: () => false,
    avertir: (message) => avertis.push(message),
    signature: () => "",
  };
  return { decoupage: ouvrirDecoupage(a), consignes, avertis, journal };
}

const EPIQUE = { number: 30, title: "Epic", body: "corps", labels: ["epic"], association: "OWNER", state: "open" } as never;

test("un découpage refusé est refait une fois, avec les défauts dits ; le second est retenu", async (t) => {
  const mauvais = reponseDe([prevu(["runtime"]), prevu(["docs/a.md"], [1])]);
  const bon = reponseDe([prevu(["runtime/src/a.ts"]), prevu(["docs/a.md"])]);
  const { decoupage, consignes, avertis, journal } = atelier(t, [mauvais, bon]);
  await decoupage.traiter(EPIQUE, []);
  assert.equal(consignes.length, 2);
  assert.doesNotMatch(consignes[0] ?? "", /refusé par le code/);
  assert.match(consignes[1] ?? "", /refusé par le code[\s\S]*dossier entier `runtime\/`[\s\S]*zones sont disjointes/);
  assert.deepEqual(avertis, []);
  const retenu = journal.tout().find((e) => e.type === "manager.split");
  assert.deepEqual((retenu?.payload as { tickets: TicketPrevu[] }).tickets.map((x) => x.zone), [["runtime/src/a.ts"], ["docs/a.md"]]);
});

test("un bon découpage n'est demandé qu'une fois ; un second mauvais est retenu avec un avertissement, sans troisième demande", async (t) => {
  const bon = atelier(t, [reponseDe([prevu(["runtime/src/a.ts"])])]);
  await bon.decoupage.traiter(EPIQUE, []);
  assert.equal(bon.consignes.length, 1);

  const mauvais = reponseDe([prevu(["app"])]);
  const tetu = atelier(t, [mauvais, mauvais, mauvais]);
  await tetu.decoupage.traiter(EPIQUE, []);
  assert.equal(tetu.consignes.length, 2);
  assert.equal(tetu.avertis.length, 1);
  assert.ok(tetu.journal.tout().some((e) => e.type === "manager.split"));
});


test("deux tickets aux zones disjointes partent ensemble, deux qui se recouvrent l'un après l'autre", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: BAIL_MS, maintenant: () => new Date("2026-10-30T10:00:00.000Z") });
  const poser = (ticket: number, zone: string[]) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `T${ticket}`, priority: null, createdAt: `2026-10-01T00:00:0${ticket % 10}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card: { waitsFor: [], zone, problems: [] } },
    });
  poser(1, ["runtime/src/a.ts"]);
  poser(2, ["docs/a.md"]);
  poser(3, ["runtime/src/a.ts", "runtime/src/b.ts"]);
  poser(4, ["app/src/x.ts"]);
  const pris = [rail.prendre("box/claude")?.ticket, rail.prendre("box/claude")?.ticket, rail.prendre("box/claude")?.ticket, rail.prendre("box/claude")?.ticket];
  // 1, 2 et 4 cuisent ensemble ; 3 recouvre 1 : il attend.
  assert.deepEqual(pris, [1, 2, 4, undefined]);
});

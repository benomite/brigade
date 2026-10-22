// La file de la pass : des cartes livrées pendant qu'une pass tourne attendent
// leur tour, et sont jugées une à une, dans l'ordre où elles ont été livrées —
// pas dans celui de leurs numéros (#1423).
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Check } from "../src/events/pass.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { CALIBRE, chef, cuisine, issue } from "./aides/cuisine.ts";
import { appeler, jusqua } from "./outils.ts";

// Une CI qui n'a pas conclu : la pass de la livraison tourne tant qu'elle l'attend.
const EN_COURS: Check[] = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];

// Une cuisine sous grant dont les cartes sont prises dans l'ordre où elles
// sont données — leur création —, et la CI de chaque commit à la main du test :
// en cours, sauf pour ceux qu'il a libérés.
function service(t: TestContext, numeros: number[]) {
  const issues = numeros.map((numero, rang) => issue(numero, CALIBRE, { createdAt: `2026-10-01T00:00:${String(rang + 1).padStart(2, "0")}Z` }));
  const lieu = cuisine(t, { pass: true, issues });
  chef(lieu.repertoire, "grant.activated");
  const { journal, gh } = lieu;
  const liberes = new Set<number>();
  gh.github.ci = async (sha) => ([...liberes].some((numero) => passDuTicket(journal.base, numero)?.sha === sha) ? [] : EN_COURS);
  const premier = (numero: number, type: string) => journal.duTicket(numero).find((e) => e.type === type)?.seq;
  // Ce que dit `pass <n>`, comme le chef le lirait pendant que le runtime tourne.
  const pass = async (numero: number) => {
    const appel = appeler(montrerPass, [String(numero)], { BRIGADE_STATE_DIR: lieu.repertoire });
    assert.equal(await appel.fin, 0);
    return appel.sortie();
  };
  // Les débuts et les verdicts de la pass, dans l'ordre du journal.
  const passes = () =>
    journal
      .tout()
      .filter((e) => e.type === "pass.started" || e.type === "pass.judged")
      .map((e) => `${e.type === "pass.started" ? "début" : "verdict"} #${e.ticket}`);
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  // Laisse passer quelques ticks : de quoi voir ce que la pass ne fait pas.
  const laisserTourner = () => {
    const vus = compter("runtime.ticked");
    return jusqua(() => compter("runtime.ticked") >= vus + 3);
  };
  return { ...lieu, liberer: (numero: number) => void liberes.add(numero), premier, pass, passes, laisserTourner };
}

describe("la file de la pass", { concurrency: 3 }, () => {
  test("trois cartes livrées pendant qu'une pass tourne attendent qu'elle finisse, puis sont jugées une à une, dans l'ordre de leur livraison", async (t) => {
    // 17 d'abord ; puis 20, 18 et 19, dans cet ordre-là.
    const { journal, liberer, premier, pass, passes, laisserTourner } = service(t, [17, 20, 18, 19]);
    const phase = (numero: number) => passDuTicket(journal.base, numero)?.phase;

    // La pass de 17 tourne — elle attend sa CI — pendant que les trois autres sont livrées.
    await jusqua(() => [20, 18, 19].every((numero) => premier(numero, "cook.reported") !== undefined));
    await laisserTourner();
    assert.equal(phase(17), "judging");
    assert.deepEqual([20, 18, 19].map(phase), ["delivered", "delivered", "delivered"]);
    assert.deepEqual(passes(), ["début #17"]);
    // Livrées dans cet ordre : 20, puis 18, puis 19.
    const livraisons = [20, 18, 19].map((numero) => premier(numero, "ticket.passing") ?? 0);
    assert.deepEqual([...livraisons].sort((a, b) => a - b), livraisons);

    // Le chef lit qu'elles attendent leur tour, derrière 17, et à quelle place.
    assert.match(await pass(20), /^#20 {2}delivered, waiting for its turn — #17 is in its pass, next in line/);
    assert.match(await pass(18), /waiting for its turn — #17 is in its pass, 1 ahead of it/);
    assert.match(await pass(19), /waiting for its turn — #17 is in its pass, 2 ahead of it/);
    assert.doesNotMatch(await pass(17), /waiting for its turn/);

    // La CI de 17 conclut : elle est jugée et mergée, et c'est le tour de 20 — qui attend la sienne.
    liberer(17);
    await jusqua(() => premier(20, "pass.started") !== undefined);
    await laisserTourner();
    assert.deepEqual(passes(), ["début #17", "verdict #17", "début #20"]);
    assert.ok(premier(17, "merge.done") !== undefined);
    const vingt = await pass(20);
    assert.match(vingt, /^#20 {2}being judged/);
    assert.match(vingt, /judging https:\/\/github\.com\/\S+ on /);
    assert.doesNotMatch(vingt, /waiting for its turn/);
    assert.match(await pass(18), /waiting for its turn — #20 is in its pass, next in line/);

    // Puis 18, puis 19 : jamais deux pass à la fois.
    liberer(20);
    liberer(18);
    liberer(19);
    await jusqua(() => [18, 19].every((numero) => premier(numero, "merge.done") !== undefined));
    assert.deepEqual(passes(), ["début #17", "verdict #17", "début #20", "verdict #20", "début #18", "verdict #18", "début #19", "verdict #19"]);
    assert.deepEqual([17, 20, 18, 19].map((numero) => journal.duTicket(numero).filter((e) => e.type === "pass.judged").map((e) => (e.payload as { verdict: string }).verdict)), [["green"], ["green"], ["green"], ["green"]]);
  });

  test("une carte livrée quand aucune pass ne tourne est jugée aussitôt, sans attendre son tour", async (t) => {
    const { liberer, premier, pass, passes } = service(t, [17]);
    liberer(17);
    await jusqua(() => premier(17, "merge.done") !== undefined);

    assert.deepEqual(passes(), ["début #17", "verdict #17"]);
    assert.doesNotMatch(await pass(17), /waiting for its turn/);
  });

  test("une livraison qui ne commence pas — GitHub bute sur sa PR — ne tient pas la file : les suivantes sont jugées", async (t) => {
    const { journal, gh, liberer, premier, avertissements } = service(t, [17, 18]);
    const lire = gh.github.prDeBranche;
    const branche17 = () => passDuTicket(journal.base, 17)?.branch;
    gh.github.prDeBranche = async (branche) => {
      if (branche === branche17()) throw new Error("gh api : HTTP 502");
      return lire(branche);
    };
    liberer(18);
    await jusqua(() => premier(18, "merge.done") !== undefined);

    assert.equal(premier(17, "pass.started"), undefined);
    assert.equal(passDuTicket(journal.base, 17)?.phase, "delivered");
    assert.ok(avertissements.some((ligne) => /la pass a buté sur le ticket #17 — gh api : HTTP 502/.test(ligne)));
  });
});

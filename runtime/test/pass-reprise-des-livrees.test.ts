// Après un redémarrage du runtime, les cartes « livrées, à juger » reprennent
// leur chemin dans la pass, reconstruites depuis le journal : jugées une à une,
// dans l'ordre de leur livraison, et sans rejuger celles qui l'étaient déjà (#1424).
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Check } from "../src/events/pass.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { CALIBRE, chef, cuisine, issue } from "./aides/cuisine.ts";
import { appeler, jusqua } from "./outils.ts";

const EN_COURS: Check[] = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];

// Une première vie sans pass : les cartes sont livrées, et personne ne les juge.
function premiereVie(t: TestContext, numeros: number[]) {
  const issues = numeros.map((numero, rang) => issue(numero, CALIBRE, { createdAt: `2026-10-01T00:00:${String(rang + 1).padStart(2, "0")}Z` }));
  const vie = cuisine(t, { issues });
  chef(vie.repertoire, "grant.activated");
  return vie;
}

// La seconde vie, avec la pass, sur les mêmes lieux ; la CI des commits non libérés reste en cours.
function secondeVie(t: TestContext, lieux: ReturnType<typeof cuisine>["lieux"] | undefined, numeros: number[]) {
  const issues = numeros.map((numero, rang) => issue(numero, CALIBRE, { createdAt: `2026-10-01T00:00:${String(rang + 1).padStart(2, "0")}Z` }));
  const vie = cuisine(t, { lieux, pass: true, issues });
  chef(vie.repertoire, "grant.activated");
  const { journal, gh } = vie;
  const liberes = new Set<number>();
  gh.github.ci = async (sha) => ([...liberes].some((numero) => passDuTicket(journal.base, numero)?.sha === sha) ? [] : EN_COURS);
  const evenements = (numero: number, type: string) => journal.duTicket(numero).filter((e) => e.type === type);
  const pass = async (numero: number) => {
    const appel = appeler(montrerPass, [String(numero)], { BRIGADE_STATE_DIR: vie.repertoire });
    assert.equal(await appel.fin, 0);
    return appel.sortie();
  };
  return { ...vie, evenements, pass, liberer: (numero: number) => void liberes.add(numero) };
}

describe("la pass après un redémarrage", { concurrency: 2 }, () => {
  test("des cartes livrées par une vie sans pass sont jugées par la suivante, dans l'ordre de leur livraison", async (t) => {
    const numeros = [17, 20, 18, 19];
    const premiere = premiereVie(t, numeros);
    await jusqua(() => numeros.every((numero) => premiere.types(numero).includes("ticket.passing")));
    premiere.runtime.arreter("test");

    const { journal, evenements, pass, liberer } = secondeVie(t, premiere.lieux, numeros);
    numeros.forEach(liberer);
    await jusqua(() => numeros.every((numero) => evenements(numero, "merge.done").length > 0));

    const jugements = journal.tout().filter((e) => e.type === "pass.judged").map((e) => e.ticket);
    assert.deepEqual(jugements, numeros);
    const demarrage = journal.tout().filter((e) => e.type === "runtime.started").at(-1)!.seq;
    for (const numero of numeros) assert.ok(evenements(numero, "pass.started")[0]!.seq > demarrage);
    for (const numero of numeros) assert.doesNotMatch(await pass(numero), /delivered, to be judged/);
  });

  test("une pass interrompue au milieu : les cartes déjà jugées ne le sont pas deux fois, celle qui était en cours reprend et n'est jugée qu'une fois", async (t) => {
    const numeros = [17, 18, 19];
    // Une première vie avec la pass : 17 est jugée et mergée, 18 attend sa CI, 19 attend son tour.
    const premiere = secondeVie(t, undefined, numeros);
    premiere.liberer(17);
    await jusqua(() => premiere.evenements(17, "merge.done").length > 0 && premiere.evenements(18, "pass.started").length > 0);
    assert.equal(premiere.evenements(18, "pass.judged").length, 0);
    premiere.runtime.arreter("test");

    const { evenements, pass, liberer } = secondeVie(t, premiere.lieux, numeros);
    numeros.forEach(liberer);
    await jusqua(() => [18, 19].every((numero) => evenements(numero, "merge.done").length > 0));

    const comptes = (numero: number) => ["pass.started", "pass.judged", "merge.done"].map((type) => evenements(numero, type).length);
    assert.deepEqual(comptes(17), [1, 1, 1]);
    // Celle qui était en cours reprend où elle en était : un seul début, un seul verdict.
    assert.deepEqual(comptes(18), [1, 1, 1]);
    assert.deepEqual(comptes(19), [1, 1, 1]);
    for (const numero of numeros) assert.doesNotMatch(await pass(numero), /delivered, to be judged/);
  });
});

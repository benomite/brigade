// #4044 : l'ordre de merge — lien par dépendance déclarée, lien par fichier commun, cycle, ordre jamais inventé, lecture qui échoue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lireLOrdreDuRail } from "../../src/ordre-de-merge/lecture.ts";
import { ordreDeMerge } from "../../src/ordre-de-merge/ordre.ts";

const T = (minute: number) => `2026-11-23T09:${String(minute).padStart(2, "0")}:00Z`;
const aucune = new Map<number, number[]>();

describe("ordreDeMerge", () => {
  test("a declared dependency comes first, whatever the numbers", () => {
    assert.deepEqual([...ordreDeMerge({ declarees: new Map([[4, [9]]]), livraisons: [] })], [[4, [9]]]);
  });

  test("two deliveries with a common file: the one that reached the pass first comes first", () => {
    const livraisons = [{ ticket: 3, fichiers: ["a.ts"], enPassLe: T(30) }, { ticket: 7, fichiers: ["a.ts", "b.ts"], enPassLe: T(10) }];
    assert.deepEqual([...ordreDeMerge({ declarees: aucune, livraisons })], [[3, [7]]]);
  });

  test("at the same instant, the lower number comes first", () => {
    const livraisons = [{ ticket: 8, fichiers: ["a.ts"], enPassLe: T(10) }, { ticket: 5, fichiers: ["a.ts"], enPassLe: T(10) }];
    assert.deepEqual([...ordreDeMerge({ declarees: aucune, livraisons })], [[8, [5]]]);
  });

  test("no common file, no link; a delivery whose pass entry is unknown is never ordered by its files", () => {
    assert.deepEqual([...ordreDeMerge({ declarees: aucune, livraisons: [{ ticket: 1, fichiers: ["a.ts"], enPassLe: T(1) }, { ticket: 2, fichiers: ["b.ts"], enPassLe: T(2) }] })], []);
    assert.deepEqual([...ordreDeMerge({ declarees: aucune, livraisons: [{ ticket: 1, fichiers: ["a.ts"], enPassLe: T(1) }, { ticket: 2, fichiers: ["a.ts"], enPassLe: null }] })], []);
  });

  test("several earlier tickets are listed in order; a link that would close a cycle is not laid", () => {
    assert.deepEqual([...ordreDeMerge({ declarees: new Map([[6, [4, 3]]]), livraisons: [] })], [[6, [3, 4]]]);
    const cycle = ordreDeMerge({ declarees: new Map([[1, [2]], [2, [1]]]), livraisons: [] });
    assert.deepEqual([...cycle], [[1, [2]]]);
    // La dépendance déclarée (#2 après #1) l'emporte sur l'ordre d'arrivée des fichiers (#1 arrivée la première, #2 après).
    const mixte = ordreDeMerge({ declarees: new Map([[1, [2]]]), livraisons: [{ ticket: 1, fichiers: ["a.ts"], enPassLe: T(1) }, { ticket: 2, fichiers: ["a.ts"], enPassLe: T(2) }] });
    assert.deepEqual([...mixte], [[1, [2]]]);
  });
});

describe("lireLOrdreDuRail", () => {
  const prs = [1, 2].map((n) => ({ number: 100 + n, head: { ref: `cook/${n}-github` } }));
  const lireAvec = (echec: RegExp | null) => async (chemin: string): Promise<unknown> => {
    if (echec?.test(chemin)) throw new Error("HTTP 502");
    if (/\/pulls\?/.test(chemin)) return prs;
    if (/\/pulls\/\d+\/files/.test(chemin)) return [{ filename: "a.ts" }];
    if (/\/issues\/(\d+)\/events/.test(chemin)) return [{ event: "labeled", label: { name: "in-pass" }, created_at: T(Number(/issues\/(\d+)/.exec(chemin)?.[1])) }];
    return [];
  };
  const lire = (echec: RegExp | null) => lireLOrdreDuRail({ depot: "o/r", lire: lireAvec(echec), declarees: aucune, enPass: [1, 2] });

  test("reads the files and the pass entry of each delivery", async () => {
    assert.deepEqual([...(await lire(null))], [[2, [1]]]);
  });

  test("a read that fails links nothing instead of inventing an order", async () => {
    assert.deepEqual([...(await lire(/\/pulls\?/))], []);
    assert.deepEqual([...(await lire(/\/pulls\/102\/files/))], []);
    assert.deepEqual([...(await lire(/\/events/))], []);
  });
});

describe("the card line", () => {
  const carte = (apres?: number[]) => ({ ticket: 6, etat: "pass" as const, entreLe: null, depend: [], ...(apres === undefined ? {} : { apres }) });
  test("one line names the earlier tickets; no earlier ticket, no line", async () => {
    const { lignesDesCartes } = await import("../../src/attente-du-rail/raison.ts");
    assert.deepEqual(lignesDesCartes([carte([4])]), { 6: "after #4 — waiting for its merge" });
    assert.deepEqual(lignesDesCartes([carte([3, 4])]), { 6: "after #3, #4 — waiting for their merge" });
    assert.deepEqual(lignesDesCartes([carte()]), {});
  });
});

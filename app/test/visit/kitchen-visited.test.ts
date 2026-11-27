// La cuisine que la visite montre, côté process principal (#4087, visit.ts) : benomite/brigade seule, lue par la
// lecture du rail d'un projet et rangée comme lui ; ce qui ne se lit pas rend sa raison ; et le canal qui la porte à la vue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { ReadOfBoardOfRepository } from "../../src/board/read.ts";
import { REPOSITORY_OF_THE_VISIT, readTheKitchenVisited } from "../../src/visit.ts";
import { REPOSITORY_OF_THE_VISIT as REPOSITORY_OF_THE_VUE } from "../../src/vue/visit/visit.js";

const A = "2026-11-24T10:00:00.000Z";
const entry = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/benomite/brigade/issues/${ticket}`, activite: null, attente: null });
const READ: ReadOfBoardOfRepository = {
  lu: true,
  depot: REPOSITORY_OF_THE_VISIT,
  luLe: A,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: A, dernierTick: A, dernierEvenement: null, compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [entry(21, "en attente"), entry(30, "pris")], cooks: [], attend: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

test("benomite/brigade lue : son rail, rangé en colonnes comme celui d'un projet", async () => {
  const readOnes: string[] = [];
  const readEntry = await readTheKitchenVisited(REPOSITORY_OF_THE_VISIT, async (repository) => {
    readOnes.push(repository);
    return READ;
  });
  assert.deepEqual(readOnes, ["benomite/brigade"]);
  if (!("tableau" in readEntry)) return assert.fail(`pas de tableau : ${readEntry.sans}`);
  const taken = readEntry.tableau.rail.colonnes.find(({ nom: name }) => name === "Taken");
  assert.deepEqual(taken?.cartes.map(({ ticket }) => ticket), [30]);
});

test("la vue et le process principal visitent le même dépôt ; un autre ne se lit pas", async () => {
  assert.equal(REPOSITORY_OF_THE_VUE, REPOSITORY_OF_THE_VISIT);
  let readOne = false;
  const readEntry = await readTheKitchenVisited("chef/mine", async () => {
    readOne = true;
    return READ;
  });
  assert.deepEqual(readEntry, { sans: "Only benomite/brigade can be visited." });
  assert.equal(readOne, false);
});

test("une lecture ratée rend sa raison ; une lecture qui lève aussi — jamais un tableau inventé", async () => {
  const failure: ReadOfBoardOfRepository = { lu: false, depot: REPOSITORY_OF_THE_VISIT, luLe: A, raison: "GitHub could not be reached to read the rail of benomite/brigade.", horsLigne: true };
  assert.deepEqual(await readTheKitchenVisited(REPOSITORY_OF_THE_VISIT, async () => failure), { sans: failure.raison });
  assert.deepEqual(
    await readTheKitchenVisited(REPOSITORY_OF_THE_VISIT, async () => {
      throw new Error("token missing");
    }),
    { sans: "The rail of benomite/brigade was not read: token missing" },
  );
});

test("le process principal porte la lecture à la vue, par la lecture du rail et ce qui attend un humain, sans clone", () => {
  const principal = readFileSync(join(import.meta.dirname, "../../src/main.ts"), "utf8");
  const channel = principal.slice(principal.indexOf('ipcMain.handle("lireLaCuisineVisitee"'), principal.indexOf("// Les labels d'une issue, lus et changés depuis une fiche"));
  assert.match(channel, /readTheKitchenVisited\(repository, async \(aims\) => \{/);
  assert.match(channel, /readTheBoardOfRepository\(\{ depot: aims, appeler: callUnderBudget/);
  assert.match(channel, /withWhatAwaitingTheChef\(readOne, readConditional\(callUnderBudget/);
  assert.doesNotMatch(channel, /ouvrirDUneStation|clone|ajouter/i);
  const bridge = readFileSync(join(import.meta.dirname, "../../src/preload.cjs"), "utf8");
  assert.match(bridge, /lireLaCuisineVisitee: \(repository\) => ipcRenderer\.invoke\("lireLaCuisineVisitee", repository\)/);
});

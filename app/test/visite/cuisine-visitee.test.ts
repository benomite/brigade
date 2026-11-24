// La cuisine que la visite montre, côté process principal (#4087, visite.ts) : benomite/brigade seule, lue par la
// lecture du rail d'un projet et rangée comme lui ; ce qui ne se lit pas rend sa raison ; et le canal qui la porte à la vue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { LectureDuTableauDuDepot } from "../../src/tableau/lecture.ts";
import { DEPOT_DE_LA_VISITE, lireLaCuisineVisitee } from "../../src/visite.ts";
import { DEPOT_DE_LA_VISITE as DEPOT_DE_LA_VUE } from "../../src/vue/visite/visite.js";

const A = "2026-11-24T10:00:00.000Z";
const entree = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: `https://github.com/benomite/brigade/issues/${ticket}`, activite: null, attente: null });
const LU: LectureDuTableauDuDepot = {
  lu: true,
  depot: DEPOT_DE_LA_VISITE,
  luLe: A,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: A, dernierTick: A, dernierEvenement: null, compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [entree(21, "en attente"), entree(30, "pris")], cooks: [], attend: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

test("benomite/brigade lue : son rail, rangé en colonnes comme celui d'un projet", async () => {
  const lus: string[] = [];
  const lue = await lireLaCuisineVisitee(DEPOT_DE_LA_VISITE, async (depot) => {
    lus.push(depot);
    return LU;
  });
  assert.deepEqual(lus, ["benomite/brigade"]);
  if (!("tableau" in lue)) return assert.fail(`pas de tableau : ${lue.sans}`);
  const taken = lue.tableau.rail.colonnes.find(({ nom }) => nom === "Taken");
  assert.deepEqual(taken?.cartes.map(({ ticket }) => ticket), [30]);
});

test("la vue et le process principal visitent le même dépôt ; un autre ne se lit pas", async () => {
  assert.equal(DEPOT_DE_LA_VUE, DEPOT_DE_LA_VISITE);
  let lu = false;
  const lue = await lireLaCuisineVisitee("chef/mine", async () => {
    lu = true;
    return LU;
  });
  assert.deepEqual(lue, { sans: "Only benomite/brigade can be visited." });
  assert.equal(lu, false);
});

test("une lecture ratée rend sa raison ; une lecture qui lève aussi — jamais un tableau inventé", async () => {
  const echec: LectureDuTableauDuDepot = { lu: false, depot: DEPOT_DE_LA_VISITE, luLe: A, raison: "GitHub could not be reached to read the rail of benomite/brigade.", horsLigne: true };
  assert.deepEqual(await lireLaCuisineVisitee(DEPOT_DE_LA_VISITE, async () => echec), { sans: echec.raison });
  assert.deepEqual(
    await lireLaCuisineVisitee(DEPOT_DE_LA_VISITE, async () => {
      throw new Error("token missing");
    }),
    { sans: "The rail of benomite/brigade was not read: token missing" },
  );
});

test("le process principal porte la lecture à la vue, par la lecture du rail et ce qui attend un humain, sans clone", () => {
  const principal = readFileSync(join(import.meta.dirname, "../../src/main.ts"), "utf8");
  const canal = principal.slice(principal.indexOf('ipcMain.handle("lireLaCuisineVisitee"'), principal.indexOf('ipcMain.handle("railDuProjet"'));
  assert.match(canal, /lireLaCuisineVisitee\(depot, async \(vise\) => \{/);
  assert.match(canal, /lireLeTableauDuDepot\(\{ depot: vise, appeler: appelerSousBudget/);
  assert.match(canal, /avecCeQuiAttendLeChef\(lu, lectureConditionnelle\(appelerSousBudget/);
  assert.doesNotMatch(canal, /ouvrirDUneStation|clone|ajouter/i);
  const pont = readFileSync(join(import.meta.dirname, "../../src/preload.cjs"), "utf8");
  assert.match(pont, /lireLaCuisineVisitee: \(depot\) => ipcRenderer\.invoke\("lireLaCuisineVisitee", depot\)/);
});

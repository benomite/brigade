// Une capacité hors du catalogue, tapée par le chef dans « What it provides »
// (#1959, épique #1950) : le nom tapé devient celui qui se déclare, ou il est
// refusé — vide, illisible, déjà dans le formulaire —, puis se déclare sur une
// station, comme une case du catalogue. Sur un journal qui porte un ticket en
// WAITING faute de station, et `installation stations set`, la commande que
// l'app joue au « Save ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { capaciteLibre, nomDeCapaciteLibre } from "../../src/capacite-libre/capacite-libre.ts";
import { CAPACITE } from "../../src/capacites.ts";
import { principal as stations } from "../../src/declarer-stations.ts";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { cuisine } from "../aides/cuisine.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { appeler } from "../outils.ts";

const DEUX = lireStations({ BRIGADE_STATIONS: "box/claude:2:code+raisonnement,box/playwright:2:navigateur-headless" });
const DU_FORMULAIRE = ["code", "raisonnement", "navigateur-headless", "docker", "chrome-connecté"];

describe("le nom tapé d'une capacité hors du catalogue", () => {
  test("il se déclare sans blanc autour, ses blancs intérieurs en tirets, sans les accents graves recopiés d'une carte, et sa casse gardée", () => {
    assert.deepEqual(capaciteLibre("  enregistrement-ecran\t", DU_FORMULAIRE), { capacite: "enregistrement-ecran" });
    assert.deepEqual(capaciteLibre("machine vierge  comptes tiers", DU_FORMULAIRE), { capacite: "machine-vierge-comptes-tiers" });
    assert.deepEqual(capaciteLibre(" `enregistrement-ecran` ", DU_FORMULAIRE), { capacite: "enregistrement-ecran" });
    assert.deepEqual(capaciteLibre("Xcode", DU_FORMULAIRE), { capacite: "Xcode" });
    // Un accent tapé décomposé est celui que les stations comparent.
    assert.deepEqual(capaciteLibre("caméra".normalize("NFD"), DU_FORMULAIRE), { capacite: "caméra" });
    for (const nom of ["enregistrement-ecran", "machine-vierge-comptes-tiers", "Xcode", "caméra"]) assert.ok(CAPACITE.test(nom), nom);
  });

  test("un nom vide est refusé, et le dit", () => {
    for (const ecrite of ["", "   ", "\t\n", "``", " ` ` "]) {
      assert.equal(nomDeCapaciteLibre(ecrite), "", JSON.stringify(ecrite));
      assert.deepEqual(capaciteLibre(ecrite, DU_FORMULAIRE), { refus: "Nothing added: type the capability's name first." }, JSON.stringify(ecrite));
    }
  });

  test("un nom déjà dans le formulaire est refusé — coché ou non, tapé autrement —, et le dit", () => {
    assert.deepEqual(capaciteLibre("docker", DU_FORMULAIRE), { refus: "Nothing added: “docker” is already in the form — tick its box." });
    assert.deepEqual(capaciteLibre(" `code` ", DU_FORMULAIRE), { refus: "Nothing added: “code” is already in the form — tick its box." });
    assert.deepEqual(capaciteLibre("chrome connecté", DU_FORMULAIRE), { refus: "Nothing added: “chrome-connecté” is already in the form — tick its box." });
    assert.deepEqual(capaciteLibre("chrome-connecté".normalize("NFD"), DU_FORMULAIRE), { refus: "Nothing added: “chrome-connecté” is already in the form — tick its box." });
    // Une casse différente est une autre capacité : le runtime les compare telles quelles.
    assert.deepEqual(capaciteLibre("Docker", DU_FORMULAIRE), { capacite: "Docker" });
  });

  test("un nom que le runtime ne lirait pas est refusé, et la forme attendue est dite", () => {
    for (const ecrite of ["a+b", "-tiret", "deux:points", "a,b", "slash/nom", "point."]) {
      const rendu = capaciteLibre(ecrite, DU_FORMULAIRE);
      assert.ok("refus" in rendu, ecrite);
      assert.match(rendu.refus, /^Nothing added: “.+” is not a capability name — letters, digits and hyphens \(code, navigateur-headless\)\.$/, ecrite);
    }
  });
});

describe("la capacité tapée, déclarée sur une station", { concurrency: 2 }, () => {
  test("le ticket en WAITING qui l'attendait le dit sur sa ligne, et le nom tapé se déclare sur la station au « Save »", async (t) => {
    const { repertoire, journal, heure } = cuisine(t, { decisions: true, stations: DEUX });
    // Le journal d'avant : #14 demande la capacité qu'aucune station ne fournit, il attend en WAITING.
    journal.ajouter({
      project: "brigade",
      ticket: 14,
      author: "github",
      type: "ticket.arrived",
      payload: { title: "Ticket 14", priority: null, createdAt: "2026-10-08T09:00:00Z", url: "https://exemple.test/14", card: { waitsFor: [], zone: [], problems: [], requires: ["enregistrement-ecran"] } },
    });
    ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: heure.maintenant }).quatreVingtSix(14, { motif: "no-station: enregistrement-ecran" });
    const ligne = () => decrireEtat(lireEtat(journal), heure.maintenant()).find((lue) => lue.startsWith("  #14 ")) ?? "";
    assert.match(ligne(), /WAITING {2}- {2}awaiting a station that provides `enregistrement-ecran`/);

    // Le chef tape le nom dans le formulaire de box/playwright, l'ajoute, et enregistre : l'app joue `stations set`.
    const tapee = capaciteLibre(" enregistrement ecran ", DU_FORMULAIRE);
    assert.deepEqual(tapee, { capacite: "enregistrement-ecran" });
    const sauve = appeler(stations, ["set", "box/playwright", "2", `navigateur-headless+${"capacite" in tapee ? tapee.capacite : ""}`], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await sauve.fin, 0, sauve.sortie());
    assert.match(sauve.sortie(), /box\/playwright réglée/);
    const lu = appeler(stations, ["--json"], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lu.fin, 0);
    const { declarees } = JSON.parse(lu.sortie()) as { declarees: { nom: string; fournit: string[] }[] };
    assert.deepEqual(declarees.find(({ nom }) => nom === "box/playwright")?.fournit, ["navigateur-headless", "enregistrement-ecran"]);
  });

  test("déclarée sur une station, la capacité est offerte aux autres : la donner à une seconde ne change rien à la première", async (t) => {
    const { repertoire } = cuisine(t, { decisions: true, stations: DEUX });
    for (const [station, fournit] of [
      ["box/playwright", "navigateur-headless+enregistrement-ecran"],
      ["box/claude", "code+raisonnement+enregistrement-ecran"],
    ] as const) {
      const sauve = appeler(stations, ["set", station, "2", fournit], { BRIGADE_STATE_DIR: repertoire });
      assert.equal(await sauve.fin, 0, sauve.sortie());
    }
    const lu = appeler(stations, ["--json"], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lu.fin, 0);
    const { declarees } = JSON.parse(lu.sortie()) as { declarees: { nom: string; fournit: string[] }[] };
    assert.deepEqual(
      declarees.map(({ nom, fournit }) => [nom, fournit]),
      [
        ["box/claude", ["code", "raisonnement", "enregistrement-ecran"]],
        ["box/playwright", ["navigateur-headless", "enregistrement-ecran"]],
      ],
    );
  });
});

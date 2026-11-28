// L'accueil (#870) : une ligne par projet, une par station, et la ligne de santé — chacune dite en
// quelques mots de l'app, sa pastille posée d'après des règles fixes, et rien de brut : ni commande,
// ni texte d'erreur. Ce qui se calcule ici ; ce que la vue en pose est dans accueil-vue.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lineOfProject, type ReadFacts, type ProjectOfTheHome } from "../src/home.ts";
import type { Facts } from "../src/facts.ts";
import type { StationVue, SeenOfStations } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";
const NOW = Date.parse(A);
const PROJECT: ProjectOfTheHome = { nom: "brigade", servi: true };

const readOnes = (facts: Facts): ReadFacts => ({ a: A, faits: facts });
const cook = (ticket: number, station = "parade-box") => ({ ticket, titre: `ticket ${ticket}`, station });
// Le bloc `attend` tel que `status` l'écrit (l'ancien runtime/src/attend.ts, `decrireAttentes`).
const ONE = "attend     1 décision attend le chef depuis 2 j\n  #867  depuis 2 j  merge à faire  Titre\nfin attend\n";
const FIVE = "attend     5 décisions attendent le chef — la plus ancienne depuis 2 j\n  #1  depuis 2 j  merge\nfin attend\n";
const BASE_RED = [
  "nothing cooks: base red since 3 h 05 ago, repair #655 in progress",
  "kitchen    held",
  "base       RED since 3 h 05 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "",
  "rail       …",
].join("\n");
// La même, comme la box l'écrivait avant #928 : l'app la lit toujours.
const BASE_RED_IN_FRENCH = [
  "rien ne cuit : base rouge depuis 3 h 05, réparation #655 en cours",
  "cuisine    retenue",
  "base       ROUGE depuis 3 h 05 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge",
  "",
  "rail       …",
].join("\n");

// Rien de ce qui se lit sur l'accueil n'est une commande, ni le texte brut d'une erreur.
const withoutNothingOfRaw = (text: string) => {
  assert.doesNotMatch(text, /\b(brigade|gh|git|sudo|systemctl|claude)\s+\S/, text);
  assert.doesNotMatch(text, /api\.github\.com|HTTP \d{3}|exit code|`/, text);
};

describe("la ligne d'un projet : sa pastille, et ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {




  test("rien de lu n'est dit sain : gris, sans station, pas encore lu, ou une lecture que l'app ne comprend pas", () => {
    assert.equal(lineOfProject({ ...PROJECT, servi: false }, undefined, undefined).ton, "gris");
    assert.deepEqual(lineOfProject(PROJECT, undefined, undefined).dit, "first read in progress…");
    assert.equal(lineOfProject(PROJECT, { a: A, illisible: true }, undefined).ton, "gris");
  });
});

const station = (fields: Partial<StationVue> = {}): StationVue => ({
  id: "g1",
  nom: "parade-box",
  machine: "Linux 6.1.0-47-amd64",
  etat: "en-ligne",
  ligne: "",
 
  dit: "online",
  version: "code 0123456789ab",
  projets: ["brigade", "espace", "calculus"],
  max: "connectee",
  ...fields,
});

describe("la ligne d'une station : son état, ce qu'elle fait, ses projets — sa machine et sa version au survol seulement", () => {





});

const READ: SeenOfStations = { a: A, stations: [station()] };

describe("la ligne de santé : Max et GitHub, verte et discrète quand tout va, une phrase quand l'un cloche", () => {



});

describe("l'accueil tenu : chaque lecture rend l'accueil à redessiner, rien quand il ne change pas", () => {
});

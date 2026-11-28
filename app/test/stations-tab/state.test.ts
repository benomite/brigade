// L'onglet Stations d'un projet (#3195) : la ligne du haut, dans exactement un de quatre états — « Cooked by », « Moving from
// A to B », la station qui le sert hors ligne, « No station cooks » —, verte seulement quand une station en ligne le cuit ou
// attend son prochain ticket. Les stations qui le servent ont une carte, elles seules. Un déménagement pas fini au bout
// d'une minute dit ce qui le bloque : l'horloge est passée en argument, aucun test n'attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MoveInProgress } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { BLOCKED, displacementTracking, IN_DISPLACEMENT, topOf, OUTSIDE_LINE, nameOfTaking, NOT_ANNOUNCED, NOBODY, sentenceOfTop, servingOf, ONE_MINUTE_MS, type Serving } from "../../src/vue/stations-tab/state.js";
import { yourOfTop } from "../../src/vue/stations-tab/stations-tab.js";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const station = (id: string, name: string, projects: string[], state: StationVue["etat"] = "en-ligne", machine = "Linux 6.1.0"): StationVue => ({
  id,
  nom: name,
  machine,
  etat: state,
  ligne: "",
 
  dit: state === "en-ligne" ? "online" : "offline for 3 h",
  version: "2.4.0",
  projets: projects,
  max: null,
});
const BOX = station("gbox", "parade-box", ["parade"]);
const MAC = station("gmac", "macbook", [], "en-ligne", "macOS 25.0.0");
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "parade-box/claude" });

// Copy of the name a registered station takes tickets under (formerly runtime/src/stations-github/stations.ts,
// `machineDe` + `stationDe`): the machine's name in lowercase, runs of other characters made one dash, then `/claude`.
const machineDe = (name: string) => name.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";
const stationDe = (name: string) => `${machineDe(name)}/claude`;

describe("la ligne du haut : un seul de quatre états (#3195)", () => {


  test("la station qui le sert est hors ligne : elle le cuit, mais rien ne cuit — et depuis quand ; pas de vert", () => {
    const servingOnes = servingOf({ projet: "parade", stations: [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], locale: "gmac", maintenant: NOW });
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(top.etat, "hors-ligne");
    assert.equal(sentenceOfTop(top), OUTSIDE_LINE("parade-box", "offline for 3 h"));
    assert.match(sentenceOfTop(top), /nothing cooks$/);
    assert.equal(top.vert, false);
    assert.notEqual(yourOfTop(top), "vert");
  });


  test("aucune station ne le sert : « No station cooks this project », sans vert", () => {
    const servingOnes = servingOf({ projet: "parade", stations: [MAC, station("gpc", "pc", ["cantine"])], locale: "gmac", maintenant: NOW });
    assert.deepEqual(servingOnes, []);
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(sentenceOfTop(top), NOBODY);
    assert.equal(top.vert, false);
  });

  test("un déménagement en route l'emporte : « Moving from A to B: waiting for … », depuis quand, sans vert", () => {
    const published: MoveInProgress = { de: "parade-box", vers: "macbook", demandeLe: "2026-11-11T11:59:30.000Z", etape: "demandee", dit: "" };
    const without = servingOf({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: NOW });
    const displacement = displacementTracking({ publie: published, servantes: without, stations: [BOX, MAC] });
    assert.notEqual(displacement, null);
    const top = topOf({ servantes: without, deplacement: displacement, maintenant: NOW });
    assert.equal(top.etat, "deplacement");
    assert.equal(sentenceOfTop(top), "Moving from parade-box to macbook: waiting for macbook to take the kitchen over, since 11:59 UTC");
    assert.equal(top.vert, false);
    assert.equal(yourOfTop(top), "jaune");
  });

  test("une station qui ne sert que d'autres projets, ou aucun : aucune carte, et rien ne la nomme", () => {
    const servingOnes = servingOf({ projet: "parade", stations: [station("gat", "atelier", []), station("gpc", "pc", ["cantine"])], maintenant: NOW });
    assert.deepEqual(servingOnes, []);
  });

});

describe("les cartes : les stations qui servent le projet, elles seules (#3195)", () => {

  test("une station que le projet déclare, que rien d'autre ne nomme : sa carte dit qu'elle ne s'est pas annoncée, sans vert", () => {
    const servingOnes = servingOf({ projet: "parade", declarees: [{ nom: "pc/claude", distante: true }], maintenant: NOW });
    assert.deepEqual(servingOnes.map(({ nom: name, etat: state, dit: said }) => ({ nom: name, etat: state, dit: said })), [{ nom: "pc/claude", etat: "illisible", dit: NOT_ANNOUNCED }]);
    assert.equal(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW }).vert, false);
  });


  test("le nom de prise d'une station est celui que le runtime lui donne", () => {
    for (const name of ["parade-box", "MacBook Pro de Benoît", "--", "PC_du_salon"]) assert.equal(nameOfTaking(name), stationDe(name));
  });
});

describe("le déménagement suivi, de son départ à son arrivée (#3195)", () => {
  // Le chef vient de choisir macbook : rien n'est encore publié, l'onglet suit sa demande.
  const request = { de: "parade-box", vers: "macbook", depuis: NOW };
  const top = (stations: StationVue[], now: number, published: MoveInProgress | null = null) => {
    const without = servingOf({ projet: "parade", stations, locale: "gmac", maintenant: now });
    const displacement = displacementTracking({ publie: published, demande: request, servantes: without, stations });
    const servingOnes = displacement === null ? without : servingOf({ projet: "parade", stations, locale: "gmac", vers: displacement.vers, maintenant: now });
    return { haut: topOf({ servantes: servingOnes, deplacement: displacement, maintenant: now }), servantes: servingOnes };
  };

  test("choisie, la station visée : « Moving from A to B: waiting for … » depuis le clic, et sa carte dit qu'elle démarre", () => {
    const { haut: line1, servantes: servingOnes } = top([BOX, MAC], NOW);
    assert.equal(sentenceOfTop(line1), IN_DISPLACEMENT("parade-box", "macbook", "macbook to take the kitchen over", NOW));
    assert.equal(line1.etat === "deplacement" && line1.bloque, null);
    assert.deepEqual(servingOnes.map(({ nom: name, etat: state }) => [name, state]), [["macbook", "demarre"], ["parade-box", "en-ligne"]]);
  });

  test("pas fini au bout d'une minute, il dit ce qui le bloque — la station visée hors ligne", () => {
    const before = top([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], NOW + ONE_MINUTE_MS - 1).haut;
    assert.equal(before.etat === "deplacement" && before.bloque, null);
    const after = top([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], NOW + ONE_MINUTE_MS).haut;
    assert.equal(after.etat, "deplacement");
    assert.equal(after.etat === "deplacement" && after.bloque, "macbook is offline: it takes the kitchen over when it is back");
    assert.equal(BLOCKED("x"), "Not done after a minute: x");
  });

  test("pas fini au bout d'une minute, les deux en ligne : ce que la station en dit, sinon celle qui ne répond pas, et depuis quand", () => {
    const published: MoveInProgress = { de: "parade-box", vers: "macbook", demandeLe: new Date(NOW).toISOString(), etape: "acceptee", dit: "" };
    const silentOne = top([BOX, MAC], NOW + 3 * ONE_MINUTE_MS, published).haut;
    assert.equal(silentOne.etat === "deplacement" && silentOne.attend, "parade-box to close its kitchen");
    assert.equal(silentOne.etat === "deplacement" && silentOne.bloque, "parade-box has not answered for 3 min");
    const saidOne = top([BOX, MAC], NOW + 3 * ONE_MINUTE_MS, { ...published, etape: "remise", dit: "its sandbox is not ready" }).haut;
    assert.equal(saidOne.etat === "deplacement" && saidOne.bloque, "its sandbox is not ready");
  });


  test("refusé par la station visée, il n'est plus en route : la ligne revient à la station qui le cuit", () => {
    const refuses: MoveInProgress = { de: "parade-box", vers: "macbook", demandeLe: new Date(NOW).toISOString(), etape: "refusee", dit: "no sandbox here" };
    const without: Serving[] = servingOf({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: NOW });
    assert.equal(displacementTracking({ publie: refuses, demande: request, servantes: without, stations: [BOX, MAC] }), null);
    assert.equal(topOf({ servantes: without, deplacement: null, maintenant: NOW }).etat, "cuit");
  });
});



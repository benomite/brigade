// L'onglet Stations d'un projet (#3195) : la ligne du haut, dans exactement un de quatre états — « Cooked by », « Moving from
// A to B », la station qui le sert hors ligne, « No station cooks » —, verte seulement quand une station en ligne le cuit ou
// attend son prochain ticket. Les stations qui le servent ont une carte, elles seules. Un déménagement pas fini au bout
// d'une minute dit ce qui le bloque : l'horloge est passée en argument, aucun test n'attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LineOfStation } from "../../src/cooking.ts";
import type { MoveInProgress } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import {
  BLOCKED,
  COOKED_BY,
  displacementTracking,
  IN_DISPLACEMENT,
  topOf,
  OUTSIDE_LINE,
  nameOfTaking,
  NOT_ANNOUNCED,
  FIRE_QUEUED,
  NOBODY,
  sentenceOfTop,
  RESTARTS,
  REFUSING,
  servingOf,
  ONE_MINUTE_MS,
  type Serving,
} from "../../src/vue/stations-tab/state.js";
import { yourOfTop } from "../../src/vue/stations-tab/stations-tab.js";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const station = (id: string, name: string, projects: string[], state: StationVue["etat"] = "en-ligne", machine = "Linux 6.1.0"): StationVue => ({
  id,
  nom: name,
  machine,
  etat: state,
  ligne: "",
  pannes: [],
  dit: state === "en-ligne" ? "online" : "offline for 3 h",
  version: "2.4.0",
  projets: projects,
  max: null,
});
const BOX = station("gbox", "parade-box", ["parade"]);
const MAC = station("gmac", "macbook", [], "en-ligne", "macOS 25.0.0");
const line = (name: string, state: string, more: Partial<LineOfStation> = {}): LineOfStation => ({ station: name, distante: true, etat: state, dit: "", survol: "", cooks: [], agents: [], ...more });
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "parade-box/claude" });

// Copy of the name a registered station takes tickets under (formerly runtime/src/stations-github/stations.ts,
// `machineDe` + `stationDe`): the machine's name in lowercase, runs of other characters made one dash, then `/claude`.
const machineDe = (name: string) => name.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";
const stationDe = (name: string) => `${machineDe(name)}/claude`;

describe("la ligne du haut : un seul de quatre états (#3195)", () => {
  test("une station en ligne le sert : « Cooked by <station> · online · N cooks at work », vert", () => {
    const servingOnes = servingOf({ projet: "parade", lignes: [line("parade-box/claude", "cooking", { presente: true, cooks: [cook(14), cook(15)] })], stations: [BOX, MAC], locale: "gmac", maintenant: NOW });
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(top.etat, "cuit");
    assert.equal(sentenceOfTop(top), "Cooked by parade-box · online · 2 cooks at work");
    assert.equal(yourOfTop(top), "vert");
  });

  test("en ligne sans rien tenir, elle est prête à cuire : « idle, nothing on the rail », vert aussi", () => {
    const servingOnes = servingOf({ projet: "parade", stations: [BOX], maintenant: NOW });
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(sentenceOfTop(top), COOKED_BY(["parade-box"], 0));
    assert.match(sentenceOfTop(top), /idle, nothing on the rail$/);
    assert.equal(top.vert, true);
  });

  test("la station qui le sert est hors ligne : elle le cuit, mais rien ne cuit — et depuis quand ; pas de vert", () => {
    const servingOnes = servingOf({ projet: "parade", stations: [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], locale: "gmac", maintenant: NOW });
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(top.etat, "hors-ligne");
    assert.equal(sentenceOfTop(top), OUTSIDE_LINE("parade-box", "offline for 3 h"));
    assert.match(sentenceOfTop(top), /nothing cooks$/);
    assert.equal(top.vert, false);
    assert.notEqual(yourOfTop(top), "vert");
  });

  test("tue sur GitHub, une station choisie pour le projet dit depuis quand elle s'est tue", () => {
    const servingOnes = servingOf({ projet: "parade", lignes: [line("box/claude", "silent", { presente: false, vueLe: "2026-11-11T09:00:00.000Z" })], maintenant: NOW });
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(sentenceOfTop(top), OUTSIDE_LINE("box/claude", "offline for 3 h"));
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

  test("une station du projet qui le refuse : sa carte dit qu'elle le refuse, et pourquoi ; rien ne cuit, pas de vert", () => {
    const servingOnes = servingOf({ projet: "parade", lignes: [line("atelier/claude", "refused", { dit: "This computer cannot run the project's cooks." })], maintenant: NOW });
    assert.deepEqual(servingOnes.map(({ nom: name, etat: state, dit: said, note }) => ({ nom: name, etat: state, dit: said, note })), [{ nom: "atelier/claude", etat: "refuse", dit: REFUSING, note: "This computer cannot run the project's cooks." }]);
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(sentenceOfTop(top), "atelier/claude cooks this project, but it is refusing it: nothing cooks");
    assert.equal(top.vert, false);
  });
});

describe("les cartes : les stations qui servent le projet, elles seules (#3195)", () => {
  test("cet ordinateur d'abord ; une box toujours allumée, un autre ordinateur ; ce que chacune tient", () => {
    const servingOnes = servingOf({
      projet: "parade",
      lignes: [line("parade-box/claude", "cooking", { presente: true, cooks: [cook(14)] })],
      stations: [BOX, { ...MAC, projets: ["parade"] }, station("gpc", "pc-du-salon", ["parade"], "hors-ligne", "Windows 11")],
      locale: "gmac",
      maintenant: NOW,
    });
    assert.deepEqual(
      servingOnes.map(({ nom: name, ici: here, sorte: kind, etat: state, cooks }) => ({ nom: name, ici: here, sorte: kind, etat: state, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { nom: "macbook", ici: true, sorte: "ici", etat: "en-ligne", cooks: [] },
        { nom: "parade-box", ici: false, sorte: "box", etat: "en-ligne", cooks: [14] },
        { nom: "pc-du-salon", ici: false, sorte: "ordinateur", etat: "hors-ligne", cooks: [] },
      ],
    );
  });

  test("une station que le projet déclare, que rien d'autre ne nomme : sa carte dit qu'elle ne s'est pas annoncée, sans vert", () => {
    const servingOnes = servingOf({ projet: "parade", declarees: [{ nom: "pc/claude", distante: true }], maintenant: NOW });
    assert.deepEqual(servingOnes.map(({ nom: name, etat: state, dit: said }) => ({ nom: name, etat: state, dit: said })), [{ nom: "pc/claude", etat: "illisible", dit: NOT_ANNOUNCED }]);
    assert.equal(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW }).vert, false);
  });

  test("chaque station une fois : la ligne de `facts`, rattachée à sa station appairée — celle de ce poste quand le projet y cuit —, et la déclaration par son nom", () => {
    const servingOnes = servingOf({
      projet: "parade",
      lignes: [line("mac/claude", "cooking", { distante: false, presente: true }), line("parade-box/claude", "cooking", { presente: true })],
      stations: [{ ...MAC, projets: ["parade"] }, BOX],
      declarees: [{ nom: "parade-box/claude", distante: true }, { nom: "mac/claude", distante: false }, { nom: "pc/claude", distante: true }],
      locale: "gmac",
      ici: true,
      maintenant: NOW,
    });
    assert.deepEqual(servingOnes.map(({ id, nom: name, prise: taking, ici: here }) => [id, name, taking, here]), [["gmac", "macbook", "mac/claude", true], ["gbox", "parade-box", "parade-box/claude", false], ["", "pc/claude", undefined, false]]);
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

  test("fini — la station visée le sert, l'autre plus — : la ligne passe à « Cooked by B »", () => {
    const { haut: end } = top([{ ...BOX, projets: [] }, { ...MAC, projets: ["parade"] }], NOW + 30_000);
    assert.equal(end.etat, "cuit");
    assert.equal(sentenceOfTop(end), COOKED_BY(["macbook"], 0));
  });

  test("refusé par la station visée, il n'est plus en route : la ligne revient à la station qui le cuit", () => {
    const refuses: MoveInProgress = { de: "parade-box", vers: "macbook", demandeLe: new Date(NOW).toISOString(), etape: "refusee", dit: "no sandbox here" };
    const without: Serving[] = servingOf({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: NOW });
    assert.equal(displacementTracking({ publie: refuses, demande: request, servantes: without, stations: [BOX, MAC] }), null);
    assert.equal(topOf({ servantes: without, deplacement: null, maintenant: NOW }).etat, "cuit");
  });
});

// Une station qui fait tourner le projet sans le servir ne le cuit pas (#3399) : celle de cet ordinateur le sert quand sa
// liste de projets servis porte son dépôt (`iciSert`), quoi que disent sa ligne de cuisson et son document.
describe("cet ordinateur fait tourner le projet sans le servir (#3399)", () => {
  // La cuisine du projet tourne ici : `facts` nomme la ligne de ce Mac, acceptée et au repos.
  const HERE = { projet: "parade", lignes: [line("macbook/claude", "idle", { distante: false, presente: true })], stations: [MAC], locale: "gmac", ici: true, maintenant: NOW };

  test("sa liste ne porte pas le projet : aucune carte, et « No station cooks this project · 8 fire tickets waiting », jamais « Cooked by »", () => {
    const servingOnes = servingOf({ ...HERE, iciSert: false });
    assert.deepEqual(servingOnes, []);
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW, fire: 8 });
    assert.equal(top.etat, "personne");
    assert.equal(sentenceOfTop(top), "No station cooks this project · 8 fire tickets waiting");
    assert.equal(sentenceOfTop(top).includes("Cooked by"), false);
    assert.equal(top.vert, false);
  });

  test("même tue ou nommée par son document, elle ne le cuit pas — ni « cooks this project, but it is offline »", () => {
    for (const lines of [[line("macbook/claude", "silent", { distante: false, presente: false })], [line("macbook/claude", "cooking", { distante: false, presente: true })]]) {
      assert.deepEqual(servingOf({ ...HERE, lignes: lines, stations: [{ ...MAC, projets: ["parade"] }], iciSert: false }), []);
    }
    // Déclarée par le projet sans s'être annoncée, celle de ce poste n'a pas de carte non plus.
    assert.deepEqual(servingOf({ ...HERE, lignes: [], declarees: [{ nom: "macbook/claude", distante: false }], iciSert: false }), []);
  });

  test("les autres stations restent ce qu'elles disent : la box qui le sert le cuit", () => {
    const servingOnes = servingOf({ ...HERE, lignes: [...HERE.lignes, line("parade-box/claude", "idle", { presente: true })], stations: [BOX, MAC], iciSert: false });
    assert.deepEqual(servingOnes.map(({ nom: name }) => name), ["parade-box"]);
    assert.equal(sentenceOfTop(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW })), COOKED_BY(["parade-box"], 0));
  });

  test("sa liste porte le projet : ce Mac le cuit, qu'une ligne de cuisson le nomme ou non", () => {
    for (const lines of [HERE.lignes, []]) {
      const servingOnes = servingOf({ ...HERE, lignes: lines, iciSert: true });
      assert.deepEqual(servingOnes.map(({ nom: name, ici: here, etat: state }) => ({ nom: name, ici: here, etat: state })), [{ nom: "macbook", ici: true, etat: "en-ligne" }]);
      assert.equal(sentenceOfTop(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW, fire: 8 })), "Cooked by macbook · online · idle, nothing on the rail");
    }
  });

  test("sa liste pas lue : rien n'est décidé à sa place, la ligne de cuisson dit ce qu'elle dit", () => {
    assert.deepEqual(servingOf(HERE), servingOf({ ...HERE, iciSert: true }));
    assert.equal(sentenceOfTop(topOf({ servantes: servingOf(HERE), deplacement: null, maintenant: NOW })), COOKED_BY(["macbook"], 0));
  });

  test("le nombre de tickets `fire` se dit au singulier comme au pluriel ; non lu, il ne se dit pas", () => {
    assert.equal(FIRE_QUEUED(1), "1 fire ticket waiting");
    assert.equal(FIRE_QUEUED(0), "0 fire tickets waiting");
    assert.equal(sentenceOfTop(topOf({ servantes: [], deplacement: null, maintenant: NOW })), NOBODY);
  });
});

describe("la station de cet ordinateur redémarre pour une mise à jour (#3637)", () => {
  // Son signe de vie a du retard : la cuisson la dit hors ligne alors que son process est en train d'être remplacé.
  const HERE = { projet: "parade", lignes: [line("macbook/claude", "idle", { distante: false, presente: false })], stations: [MAC], locale: "gmac", ici: true, maintenant: NOW };

  test("sans redémarrage, elle est hors ligne : rien ne cuit", () => {
    const top = topOf({ servantes: servingOf(HERE), deplacement: null, maintenant: NOW });
    assert.equal(top.etat, "hors-ligne");
  });

  test("la ligne du haut dit « restarting: update to <version> », en jaune, jamais « offline » ni « nothing cooks »", () => {
    const servingOnes = servingOf({ ...HERE, redemarre: "2.5.0" });
    assert.deepEqual(servingOnes.map(({ nom: name, ici: here, etat: state, dit: said }) => ({ nom: name, ici: here, etat: state, dit: said })), [{ nom: "macbook", ici: true, etat: "redemarre", dit: "restarting: update to 2.5.0" }]);
    const top = topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW });
    assert.equal(top.etat, "redemarre");
    assert.equal(sentenceOfTop(top), `macbook cooks this project, it is ${RESTARTS("2.5.0")}`);
    assert.doesNotMatch(sentenceOfTop(top), /offline|nothing cooks/);
    assert.equal(yourOfTop(top), "jaune");
  });

  test("une station qui sert le projet et qui est en ligne l'emporte : « Cooked by »", () => {
    const servingOnes = servingOf({ ...HERE, lignes: [...HERE.lignes, line("parade-box/claude", "idle", { presente: true })], stations: [BOX, MAC], redemarre: "2.5.0" });
    assert.equal(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW }).etat, "cuit");
  });

  test("une autre station hors ligne le reste : seule celle de cet ordinateur se relance", () => {
    const servingOnes = servingOf({ projet: "parade", lignes: [line("parade-box/claude", "idle", { presente: false })], stations: [BOX, MAC], locale: "gmac", maintenant: NOW, redemarre: "2.5.0" });
    assert.equal(topOf({ servantes: servingOnes, deplacement: null, maintenant: NOW }).etat, "hors-ligne");
  });
});

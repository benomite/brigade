// L'onglet Stations d'un projet (#3195) : la ligne du haut, dans exactement un de quatre états — « Cooked by », « Moving from
// A to B », la station qui le sert hors ligne, « No station cooks » —, verte seulement quand une station en ligne le cuit ou
// attend son prochain ticket. Les stations qui le servent ont une carte, elles seules. Un déménagement pas fini au bout
// d'une minute dit ce qui le bloque : l'horloge est passée en argument, aucun test n'attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LineDeStation } from "../../src/cooking.ts";
import type { DemenagementEnCours } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { stationDe } from "../../../runtime/src/stations-github/stations.ts";
import {
  BLOCKED,
  CUIT_PAR,
  deplacementSuivi,
  EN_DEPLACEMENT,
  hautDe,
  OUTSIDE_LINE,
  nameDeTaking,
  PAS_ANNONCEE,
  FIRE_QUEUED,
  PERSONNE,
  phraseDuHaut,
  REDEMARRE,
  REFUSANT,
  servantesDe,
  UNE_MINUTE_MS,
  type Servante,
} from "../../src/vue/stations-tab/state.js";
import { tonDuHaut } from "../../src/vue/stations-tab/stations-tab.js";

const MAINTENANT = Date.parse("2026-11-11T12:00:00.000Z");
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
const line = (name: string, state: string, plus: Partial<LineDeStation> = {}): LineDeStation => ({ station: name, distante: true, etat: state, dit: "", survol: "", cooks: [], agents: [], ...plus });
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "parade-box/claude" });

describe("la ligne du haut : un seul de quatre états (#3195)", () => {
  test("une station en ligne le sert : « Cooked by <station> · online · N cooks at work », vert", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [line("parade-box/claude", "cooking", { presente: true, cooks: [cook(14), cook(15)] })], stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(haut.etat, "cuit");
    assert.equal(phraseDuHaut(haut), "Cooked by parade-box · online · 2 cooks at work");
    assert.equal(tonDuHaut(haut), "vert");
  });

  test("en ligne sans rien tenir, elle est prête à cuire : « idle, nothing on the rail », vert aussi", () => {
    const servantes = servantesDe({ projet: "parade", stations: [BOX], maintenant: MAINTENANT });
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), CUIT_PAR(["parade-box"], 0));
    assert.match(phraseDuHaut(haut), /idle, nothing on the rail$/);
    assert.equal(haut.vert, true);
  });

  test("la station qui le sert est hors ligne : elle le cuit, mais rien ne cuit — et depuis quand ; pas de vert", () => {
    const servantes = servantesDe({ projet: "parade", stations: [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], locale: "gmac", maintenant: MAINTENANT });
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(haut.etat, "hors-ligne");
    assert.equal(phraseDuHaut(haut), OUTSIDE_LINE("parade-box", "offline for 3 h"));
    assert.match(phraseDuHaut(haut), /nothing cooks$/);
    assert.equal(haut.vert, false);
    assert.notEqual(tonDuHaut(haut), "vert");
  });

  test("tue sur GitHub, une station choisie pour le projet dit depuis quand elle s'est tue", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [line("box/claude", "silent", { presente: false, vueLe: "2026-11-11T09:00:00.000Z" })], maintenant: MAINTENANT });
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), OUTSIDE_LINE("box/claude", "offline for 3 h"));
  });

  test("aucune station ne le sert : « No station cooks this project », sans vert", () => {
    const servantes = servantesDe({ projet: "parade", stations: [MAC, station("gpc", "pc", ["cantine"])], locale: "gmac", maintenant: MAINTENANT });
    assert.deepEqual(servantes, []);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), PERSONNE);
    assert.equal(haut.vert, false);
  });

  test("un déménagement en route l'emporte : « Moving from A to B: waiting for … », depuis quand, sans vert", () => {
    const published: DemenagementEnCours = { de: "parade-box", vers: "macbook", demandeLe: "2026-11-11T11:59:30.000Z", etape: "demandee", dit: "" };
    const sans = servantesDe({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });
    const deplacement = deplacementSuivi({ publie: published, servantes: sans, stations: [BOX, MAC] });
    assert.notEqual(deplacement, null);
    const haut = hautDe({ servantes: sans, deplacement, maintenant: MAINTENANT });
    assert.equal(haut.etat, "deplacement");
    assert.equal(phraseDuHaut(haut), "Moving from parade-box to macbook: waiting for macbook to take the kitchen over, since 11:59 UTC");
    assert.equal(haut.vert, false);
    assert.equal(tonDuHaut(haut), "jaune");
  });

  test("une station qui ne sert que d'autres projets, ou aucun : aucune carte, et rien ne la nomme", () => {
    const servantes = servantesDe({ projet: "parade", stations: [station("gat", "atelier", []), station("gpc", "pc", ["cantine"])], maintenant: MAINTENANT });
    assert.deepEqual(servantes, []);
  });

  test("une station du projet qui le refuse : sa carte dit qu'elle le refuse, et pourquoi ; rien ne cuit, pas de vert", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [line("atelier/claude", "refused", { dit: "This computer cannot run the project's cooks." })], maintenant: MAINTENANT });
    assert.deepEqual(servantes.map(({ nom: name, etat: state, dit, note }) => ({ nom: name, etat: state, dit, note })), [{ nom: "atelier/claude", etat: "refuse", dit: REFUSANT, note: "This computer cannot run the project's cooks." }]);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), "atelier/claude cooks this project, but it is refusing it: nothing cooks");
    assert.equal(haut.vert, false);
  });
});

describe("les cartes : les stations qui servent le projet, elles seules (#3195)", () => {
  test("cet ordinateur d'abord ; une box toujours allumée, un autre ordinateur ; ce que chacune tient", () => {
    const servantes = servantesDe({
      projet: "parade",
      lignes: [line("parade-box/claude", "cooking", { presente: true, cooks: [cook(14)] })],
      stations: [BOX, { ...MAC, projets: ["parade"] }, station("gpc", "pc-du-salon", ["parade"], "hors-ligne", "Windows 11")],
      locale: "gmac",
      maintenant: MAINTENANT,
    });
    assert.deepEqual(
      servantes.map(({ nom: name, ici, sorte, etat: state, cooks }) => ({ nom: name, ici, sorte, etat: state, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { nom: "macbook", ici: true, sorte: "ici", etat: "en-ligne", cooks: [] },
        { nom: "parade-box", ici: false, sorte: "box", etat: "en-ligne", cooks: [14] },
        { nom: "pc-du-salon", ici: false, sorte: "ordinateur", etat: "hors-ligne", cooks: [] },
      ],
    );
  });

  test("une station que le projet déclare, que rien d'autre ne nomme : sa carte dit qu'elle ne s'est pas annoncée, sans vert", () => {
    const servantes = servantesDe({ projet: "parade", declarees: [{ nom: "pc/claude", distante: true }], maintenant: MAINTENANT });
    assert.deepEqual(servantes.map(({ nom: name, etat: state, dit }) => ({ nom: name, etat: state, dit })), [{ nom: "pc/claude", etat: "illisible", dit: PAS_ANNONCEE }]);
    assert.equal(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT }).vert, false);
  });

  test("chaque station une fois : la ligne de `facts`, rattachée à sa station appairée — celle de ce poste quand le projet y cuit —, et la déclaration par son nom", () => {
    const servantes = servantesDe({
      projet: "parade",
      lignes: [line("mac/claude", "cooking", { distante: false, presente: true }), line("parade-box/claude", "cooking", { presente: true })],
      stations: [{ ...MAC, projets: ["parade"] }, BOX],
      declarees: [{ nom: "parade-box/claude", distante: true }, { nom: "mac/claude", distante: false }, { nom: "pc/claude", distante: true }],
      locale: "gmac",
      ici: true,
      maintenant: MAINTENANT,
    });
    assert.deepEqual(servantes.map(({ id, nom: name, prise: taking, ici }) => [id, name, taking, ici]), [["gmac", "macbook", "mac/claude", true], ["gbox", "parade-box", "parade-box/claude", false], ["", "pc/claude", undefined, false]]);
  });

  test("le nom de prise d'une station est celui que le runtime lui donne", () => {
    for (const name of ["parade-box", "MacBook Pro de Benoît", "--", "PC_du_salon"]) assert.equal(nameDeTaking(name), stationDe(name));
  });
});

describe("le déménagement suivi, de son départ à son arrivée (#3195)", () => {
  // Le chef vient de choisir macbook : rien n'est encore publié, l'onglet suit sa demande.
  const request = { de: "parade-box", vers: "macbook", depuis: MAINTENANT };
  const haut = (stations: StationVue[], maintenant: number, published: DemenagementEnCours | null = null) => {
    const sans = servantesDe({ projet: "parade", stations, locale: "gmac", maintenant });
    const deplacement = deplacementSuivi({ publie: published, demande: request, servantes: sans, stations });
    const servantes = deplacement === null ? sans : servantesDe({ projet: "parade", stations, locale: "gmac", vers: deplacement.vers, maintenant });
    return { haut: hautDe({ servantes, deplacement, maintenant }), servantes };
  };

  test("choisie, la station visée : « Moving from A to B: waiting for … » depuis le clic, et sa carte dit qu'elle démarre", () => {
    const { haut: line1, servantes } = haut([BOX, MAC], MAINTENANT);
    assert.equal(phraseDuHaut(line1), EN_DEPLACEMENT("parade-box", "macbook", "macbook to take the kitchen over", MAINTENANT));
    assert.equal(line1.etat === "deplacement" && line1.bloque, null);
    assert.deepEqual(servantes.map(({ nom: name, etat: state }) => [name, state]), [["macbook", "demarre"], ["parade-box", "en-ligne"]]);
  });

  test("pas fini au bout d'une minute, il dit ce qui le bloque — la station visée hors ligne", () => {
    const avant = haut([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], MAINTENANT + UNE_MINUTE_MS - 1).haut;
    assert.equal(avant.etat === "deplacement" && avant.bloque, null);
    const apres = haut([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], MAINTENANT + UNE_MINUTE_MS).haut;
    assert.equal(apres.etat, "deplacement");
    assert.equal(apres.etat === "deplacement" && apres.bloque, "macbook is offline: it takes the kitchen over when it is back");
    assert.equal(BLOCKED("x"), "Not done after a minute: x");
  });

  test("pas fini au bout d'une minute, les deux en ligne : ce que la station en dit, sinon celle qui ne répond pas, et depuis quand", () => {
    const published: DemenagementEnCours = { de: "parade-box", vers: "macbook", demandeLe: new Date(MAINTENANT).toISOString(), etape: "acceptee", dit: "" };
    const muette = haut([BOX, MAC], MAINTENANT + 3 * UNE_MINUTE_MS, published).haut;
    assert.equal(muette.etat === "deplacement" && muette.attend, "parade-box to close its kitchen");
    assert.equal(muette.etat === "deplacement" && muette.bloque, "parade-box has not answered for 3 min");
    const dite = haut([BOX, MAC], MAINTENANT + 3 * UNE_MINUTE_MS, { ...published, etape: "remise", dit: "its sandbox is not ready" }).haut;
    assert.equal(dite.etat === "deplacement" && dite.bloque, "its sandbox is not ready");
  });

  test("fini — la station visée le sert, l'autre plus — : la ligne passe à « Cooked by B »", () => {
    const { haut: fin } = haut([{ ...BOX, projets: [] }, { ...MAC, projets: ["parade"] }], MAINTENANT + 30_000);
    assert.equal(fin.etat, "cuit");
    assert.equal(phraseDuHaut(fin), CUIT_PAR(["macbook"], 0));
  });

  test("refusé par la station visée, il n'est plus en route : la ligne revient à la station qui le cuit", () => {
    const refuse: DemenagementEnCours = { de: "parade-box", vers: "macbook", demandeLe: new Date(MAINTENANT).toISOString(), etape: "refusee", dit: "no sandbox here" };
    const sans: Servante[] = servantesDe({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });
    assert.equal(deplacementSuivi({ publie: refuse, demande: request, servantes: sans, stations: [BOX, MAC] }), null);
    assert.equal(hautDe({ servantes: sans, deplacement: null, maintenant: MAINTENANT }).etat, "cuit");
  });
});

// Une station qui fait tourner le projet sans le servir ne le cuit pas (#3399) : celle de cet ordinateur le sert quand sa
// liste de projets servis porte son dépôt (`iciSert`), quoi que disent sa ligne de cuisson et son document.
describe("cet ordinateur fait tourner le projet sans le servir (#3399)", () => {
  // La cuisine du projet tourne ici : `facts` nomme la ligne de ce Mac, acceptée et au repos.
  const ICI = { projet: "parade", lignes: [line("macbook/claude", "idle", { distante: false, presente: true })], stations: [MAC], locale: "gmac", ici: true, maintenant: MAINTENANT };

  test("sa liste ne porte pas le projet : aucune carte, et « No station cooks this project · 8 fire tickets waiting », jamais « Cooked by »", () => {
    const servantes = servantesDe({ ...ICI, iciSert: false });
    assert.deepEqual(servantes, []);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT, fire: 8 });
    assert.equal(haut.etat, "personne");
    assert.equal(phraseDuHaut(haut), "No station cooks this project · 8 fire tickets waiting");
    assert.equal(phraseDuHaut(haut).includes("Cooked by"), false);
    assert.equal(haut.vert, false);
  });

  test("même tue ou nommée par son document, elle ne le cuit pas — ni « cooks this project, but it is offline »", () => {
    for (const lines of [[line("macbook/claude", "silent", { distante: false, presente: false })], [line("macbook/claude", "cooking", { distante: false, presente: true })]]) {
      assert.deepEqual(servantesDe({ ...ICI, lignes: lines, stations: [{ ...MAC, projets: ["parade"] }], iciSert: false }), []);
    }
    // Déclarée par le projet sans s'être annoncée, celle de ce poste n'a pas de carte non plus.
    assert.deepEqual(servantesDe({ ...ICI, lignes: [], declarees: [{ nom: "macbook/claude", distante: false }], iciSert: false }), []);
  });

  test("les autres stations restent ce qu'elles disent : la box qui le sert le cuit", () => {
    const servantes = servantesDe({ ...ICI, lignes: [...ICI.lignes, line("parade-box/claude", "idle", { presente: true })], stations: [BOX, MAC], iciSert: false });
    assert.deepEqual(servantes.map(({ nom: name }) => name), ["parade-box"]);
    assert.equal(phraseDuHaut(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT })), CUIT_PAR(["parade-box"], 0));
  });

  test("sa liste porte le projet : ce Mac le cuit, qu'une ligne de cuisson le nomme ou non", () => {
    for (const lines of [ICI.lignes, []]) {
      const servantes = servantesDe({ ...ICI, lignes: lines, iciSert: true });
      assert.deepEqual(servantes.map(({ nom: name, ici, etat: state }) => ({ nom: name, ici, etat: state })), [{ nom: "macbook", ici: true, etat: "en-ligne" }]);
      assert.equal(phraseDuHaut(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT, fire: 8 })), "Cooked by macbook · online · idle, nothing on the rail");
    }
  });

  test("sa liste pas lue : rien n'est décidé à sa place, la ligne de cuisson dit ce qu'elle dit", () => {
    assert.deepEqual(servantesDe(ICI), servantesDe({ ...ICI, iciSert: true }));
    assert.equal(phraseDuHaut(hautDe({ servantes: servantesDe(ICI), deplacement: null, maintenant: MAINTENANT })), CUIT_PAR(["macbook"], 0));
  });

  test("le nombre de tickets `fire` se dit au singulier comme au pluriel ; non lu, il ne se dit pas", () => {
    assert.equal(FIRE_QUEUED(1), "1 fire ticket waiting");
    assert.equal(FIRE_QUEUED(0), "0 fire tickets waiting");
    assert.equal(phraseDuHaut(hautDe({ servantes: [], deplacement: null, maintenant: MAINTENANT })), PERSONNE);
  });
});

describe("la station de cet ordinateur redémarre pour une mise à jour (#3637)", () => {
  // Son signe de vie a du retard : la cuisson la dit hors ligne alors que son process est en train d'être remplacé.
  const ICI = { projet: "parade", lignes: [line("macbook/claude", "idle", { distante: false, presente: false })], stations: [MAC], locale: "gmac", ici: true, maintenant: MAINTENANT };

  test("sans redémarrage, elle est hors ligne : rien ne cuit", () => {
    const haut = hautDe({ servantes: servantesDe(ICI), deplacement: null, maintenant: MAINTENANT });
    assert.equal(haut.etat, "hors-ligne");
  });

  test("la ligne du haut dit « restarting: update to <version> », en jaune, jamais « offline » ni « nothing cooks »", () => {
    const servantes = servantesDe({ ...ICI, redemarre: "2.5.0" });
    assert.deepEqual(servantes.map(({ nom: name, ici, etat: state, dit }) => ({ nom: name, ici, etat: state, dit })), [{ nom: "macbook", ici: true, etat: "redemarre", dit: "restarting: update to 2.5.0" }]);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(haut.etat, "redemarre");
    assert.equal(phraseDuHaut(haut), `macbook cooks this project, it is ${REDEMARRE("2.5.0")}`);
    assert.doesNotMatch(phraseDuHaut(haut), /offline|nothing cooks/);
    assert.equal(tonDuHaut(haut), "jaune");
  });

  test("une station qui sert le projet et qui est en ligne l'emporte : « Cooked by »", () => {
    const servantes = servantesDe({ ...ICI, lignes: [...ICI.lignes, line("parade-box/claude", "idle", { presente: true })], stations: [BOX, MAC], redemarre: "2.5.0" });
    assert.equal(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT }).etat, "cuit");
  });

  test("une autre station hors ligne le reste : seule celle de cet ordinateur se relance", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [line("parade-box/claude", "idle", { presente: false })], stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT, redemarre: "2.5.0" });
    assert.equal(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT }).etat, "hors-ligne");
  });
});

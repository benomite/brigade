// L'onglet Stations d'un projet (#3195) : la ligne du haut, dans exactement un de quatre états — « Cooked by », « Moving from
// A to B », la station qui le sert hors ligne, « Nobody cooks » —, verte seulement quand une station en ligne le cuit ou
// attend son prochain ticket. Les stations qui le servent ont une carte, elles seules. Un déménagement pas fini au bout
// d'une minute dit ce qui le bloque : l'horloge est passée en argument, aucun test n'attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LigneDeStation } from "../../src/cuisson.ts";
import type { DemenagementEnCours } from "../../src/projets/projets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { stationDe } from "../../../runtime/src/stations-github/stations.ts";
import {
  BLOQUE,
  CUIT_PAR,
  deplacementSuivi,
  EN_DEPLACEMENT,
  hautDe,
  HORS_LIGNE,
  nomDePrise,
  PAS_ANNONCEE,
  PERSONNE,
  phraseDuHaut,
  REFUSANT,
  servantesDe,
  UNE_MINUTE_MS,
  type Servante,
} from "../../src/vue/stations-tab/etat.js";
import { tonDuHaut } from "../../src/vue/stations-tab/stations-tab.js";

const MAINTENANT = Date.parse("2026-11-11T12:00:00.000Z");
const station = (id: string, nom: string, projets: string[], etat: StationVue["etat"] = "en-ligne", machine = "Linux 6.1.0"): StationVue => ({
  id,
  nom,
  machine,
  etat,
  ligne: "",
  pannes: [],
  dit: etat === "en-ligne" ? "online" : "offline for 3 h",
  version: "2.4.0",
  projets,
  max: null,
});
const BOX = station("gbox", "parade-box", ["parade"]);
const MAC = station("gmac", "macbook", [], "en-ligne", "macOS 25.0.0");
const ligne = (nom: string, etat: string, plus: Partial<LigneDeStation> = {}): LigneDeStation => ({ station: nom, distante: true, etat, dit: "", survol: "", cooks: [], agents: [], ...plus });
const cook = (ticket: number) => ({ ticket, titre: `ticket ${ticket}`, station: "parade-box/claude" });

describe("la ligne du haut : un seul de quatre états (#3195)", () => {
  test("une station en ligne le sert : « Cooked by <station> · online · N cooks at work », vert", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [ligne("parade-box/claude", "cooking", { presente: true, cooks: [cook(14), cook(15)] })], stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });
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
    assert.equal(phraseDuHaut(haut), HORS_LIGNE("parade-box", "offline for 3 h"));
    assert.match(phraseDuHaut(haut), /nothing cooks$/);
    assert.equal(haut.vert, false);
    assert.notEqual(tonDuHaut(haut), "vert");
  });

  test("tue sur GitHub, une station choisie pour le projet dit depuis quand elle s'est tue", () => {
    const servantes = servantesDe({ projet: "parade", lignes: [ligne("box/claude", "silent", { presente: false, vueLe: "2026-11-11T09:00:00.000Z" })], maintenant: MAINTENANT });
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), HORS_LIGNE("box/claude", "offline for 3 h"));
  });

  test("aucune station ne le sert : « Nobody cooks this project », sans vert", () => {
    const servantes = servantesDe({ projet: "parade", stations: [MAC, station("gpc", "pc", ["cantine"])], locale: "gmac", maintenant: MAINTENANT });
    assert.deepEqual(servantes, []);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), PERSONNE);
    assert.equal(haut.vert, false);
  });

  test("un déménagement en route l'emporte : « Moving from A to B: waiting for … », depuis quand, sans vert", () => {
    const publie: DemenagementEnCours = { de: "parade-box", vers: "macbook", demandeLe: "2026-11-11T11:59:30.000Z", etape: "demandee", dit: "" };
    const sans = servantesDe({ projet: "parade", stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });
    const deplacement = deplacementSuivi({ publie, servantes: sans, stations: [BOX, MAC] });
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
    const servantes = servantesDe({ projet: "parade", lignes: [ligne("atelier/claude", "refused", { dit: "This computer cannot run the project's cooks." })], maintenant: MAINTENANT });
    assert.deepEqual(servantes.map(({ nom, etat, dit, note }) => ({ nom, etat, dit, note })), [{ nom: "atelier/claude", etat: "refuse", dit: REFUSANT, note: "This computer cannot run the project's cooks." }]);
    const haut = hautDe({ servantes, deplacement: null, maintenant: MAINTENANT });
    assert.equal(phraseDuHaut(haut), "atelier/claude cooks this project, but it is refusing it: nothing cooks");
    assert.equal(haut.vert, false);
  });
});

describe("les cartes : les stations qui servent le projet, elles seules (#3195)", () => {
  test("cet ordinateur d'abord ; une box toujours allumée, un autre ordinateur ; ce que chacune tient", () => {
    const servantes = servantesDe({
      projet: "parade",
      lignes: [ligne("parade-box/claude", "cooking", { presente: true, cooks: [cook(14)] })],
      stations: [BOX, { ...MAC, projets: ["parade"] }, station("gpc", "pc-du-salon", ["parade"], "hors-ligne", "Windows 11")],
      locale: "gmac",
      maintenant: MAINTENANT,
    });
    assert.deepEqual(
      servantes.map(({ nom, ici, sorte, etat, cooks }) => ({ nom, ici, sorte, etat, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { nom: "macbook", ici: true, sorte: "ici", etat: "en-ligne", cooks: [] },
        { nom: "parade-box", ici: false, sorte: "box", etat: "en-ligne", cooks: [14] },
        { nom: "pc-du-salon", ici: false, sorte: "ordinateur", etat: "hors-ligne", cooks: [] },
      ],
    );
  });

  test("une station que le projet déclare, que rien d'autre ne nomme : sa carte dit qu'elle ne s'est pas annoncée, sans vert", () => {
    const servantes = servantesDe({ projet: "parade", declarees: [{ nom: "pc/claude", distante: true }], maintenant: MAINTENANT });
    assert.deepEqual(servantes.map(({ nom, etat, dit }) => ({ nom, etat, dit })), [{ nom: "pc/claude", etat: "illisible", dit: PAS_ANNONCEE }]);
    assert.equal(hautDe({ servantes, deplacement: null, maintenant: MAINTENANT }).vert, false);
  });

  test("chaque station une fois : la ligne de `facts`, rattachée à sa station appairée — celle de ce poste quand le projet y cuit —, et la déclaration par son nom", () => {
    const servantes = servantesDe({
      projet: "parade",
      lignes: [ligne("mac/claude", "cooking", { distante: false, presente: true }), ligne("parade-box/claude", "cooking", { presente: true })],
      stations: [{ ...MAC, projets: ["parade"] }, BOX],
      declarees: [{ nom: "parade-box/claude", distante: true }, { nom: "mac/claude", distante: false }, { nom: "pc/claude", distante: true }],
      locale: "gmac",
      ici: true,
      maintenant: MAINTENANT,
    });
    assert.deepEqual(servantes.map(({ id, nom, prise, ici }) => [id, nom, prise, ici]), [["gmac", "macbook", "mac/claude", true], ["gbox", "parade-box", "parade-box/claude", false], ["", "pc/claude", undefined, false]]);
  });

  test("le nom de prise d'une station est celui que le runtime lui donne", () => {
    for (const nom of ["parade-box", "MacBook Pro de Benoît", "--", "PC_du_salon"]) assert.equal(nomDePrise(nom), stationDe(nom));
  });
});

describe("le déménagement suivi, de son départ à son arrivée (#3195)", () => {
  // Le chef vient de choisir macbook : rien n'est encore publié, l'onglet suit sa demande.
  const demande = { de: "parade-box", vers: "macbook", depuis: MAINTENANT };
  const haut = (stations: StationVue[], maintenant: number, publie: DemenagementEnCours | null = null) => {
    const sans = servantesDe({ projet: "parade", stations, locale: "gmac", maintenant });
    const deplacement = deplacementSuivi({ publie, demande, servantes: sans, stations });
    const servantes = deplacement === null ? sans : servantesDe({ projet: "parade", stations, locale: "gmac", vers: deplacement.vers, maintenant });
    return { haut: hautDe({ servantes, deplacement, maintenant }), servantes };
  };

  test("choisie, la station visée : « Moving from A to B: waiting for … » depuis le clic, et sa carte dit qu'elle démarre", () => {
    const { haut: ligne1, servantes } = haut([BOX, MAC], MAINTENANT);
    assert.equal(phraseDuHaut(ligne1), EN_DEPLACEMENT("parade-box", "macbook", "macbook to take the kitchen over", MAINTENANT));
    assert.equal(ligne1.etat === "deplacement" && ligne1.bloque, null);
    assert.deepEqual(servantes.map(({ nom, etat }) => [nom, etat]), [["macbook", "demarre"], ["parade-box", "en-ligne"]]);
  });

  test("pas fini au bout d'une minute, il dit ce qui le bloque — la station visée hors ligne", () => {
    const avant = haut([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], MAINTENANT + UNE_MINUTE_MS - 1).haut;
    assert.equal(avant.etat === "deplacement" && avant.bloque, null);
    const apres = haut([BOX, { ...MAC, etat: "hors-ligne", dit: "offline for 5 min" }], MAINTENANT + UNE_MINUTE_MS).haut;
    assert.equal(apres.etat, "deplacement");
    assert.equal(apres.etat === "deplacement" && apres.bloque, "macbook is offline: it takes the kitchen over when it is back");
    assert.equal(BLOQUE("x"), "Not done after a minute: x");
  });

  test("pas fini au bout d'une minute, les deux en ligne : ce que la station en dit, sinon celle qui ne répond pas, et depuis quand", () => {
    const publie: DemenagementEnCours = { de: "parade-box", vers: "macbook", demandeLe: new Date(MAINTENANT).toISOString(), etape: "acceptee", dit: "" };
    const muette = haut([BOX, MAC], MAINTENANT + 3 * UNE_MINUTE_MS, publie).haut;
    assert.equal(muette.etat === "deplacement" && muette.attend, "parade-box to close its kitchen");
    assert.equal(muette.etat === "deplacement" && muette.bloque, "parade-box has not answered for 3 min");
    const dite = haut([BOX, MAC], MAINTENANT + 3 * UNE_MINUTE_MS, { ...publie, etape: "remise", dit: "its sandbox is not ready" }).haut;
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
    assert.equal(deplacementSuivi({ publie: refuse, demande, servantes: sans, stations: [BOX, MAC] }), null);
    assert.equal(hautDe({ servantes: sans, deplacement: null, maintenant: MAINTENANT }).etat, "cuit");
  });
});

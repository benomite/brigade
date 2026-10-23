// Sur l'onglet Cooks (#1509, épique #1506) : chaque station que la box du projet déclare, une ligne chacune — son nom,
// son plafond de cooks, ses capacités, et où elle tourne, la box ou ce poste, sous deux mots distincts. Un projet qui
// n'en déclare aucune le dit en une ligne, jamais par un blanc. La déclaration arrive avec l'installation du projet
// (`controle.stations`, service.ts) : à l'ouverture de l'espace, puis à chaque contrôle. La vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../src/service.ts";
import { AUCUNE, OU, ouTourne, PAS_LUE, plafondDit, poserLesDeclarees, TITRE } from "../../src/vue/stations-declarees.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const PARADE = "parade";

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-23T10:04:11.000Z",
  dernierTick: "2026-10-23T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

// Ce que `installation stations --json` rend (runtime/src/declarer-stations.ts, `faitsDesStations`), lu par l'app
// telle qu'elle est : une station de la box, une que ce poste joue, une qu'un autre poste joue.
const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: null }],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "mac/claude", moteur: "claude", fournit: ["navigateur-headless", "chrome-connecté"], cooks: 1, distante: true },
        { nom: "pc/claude", moteur: "claude", fournit: ["code"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsLues | undefined): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { commande: "ssh -t box sudo systemctl enable --now brigade@parade.service" },
  termine: true,
  ...(stations === undefined ? {} : { controle: { a: A, stations } }),
});

// Ce poste joue mac/claude pour parade.
const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade", box: { hote: "parade-box" }, stations: ["mac/claude"] };

const demarrage = (projet: Projet) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [projet], hotes: ["parade-box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(stations: StationsLues | undefined, projet: Projet = PROJET): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(projet), espace: () => [], service: () => guide(stations), lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue;
}

const bloc = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "stations-declarees");
// Une ligne telle qu'elle se lit : son nom, où elle tourne, son plafond, ses capacités.
const lu = (pose: Faux) =>
  pose.dessous("li").filter(({ className }) => className === "station-declaree").map((ligne) => {
    const [qui, plafond, capacites] = ligne.children;
    return {
      nom: qui?.children[0]?.textContent,
      ou: qui?.children[1]?.textContent,
      plafond: plafond?.textContent,
      capacites: capacites?.children.map(({ textContent }) => textContent),
    };
  });

describe("ce que chaque station déclarée fournit, sur l'onglet Cooks", () => {
  test("une station de la box et une que ce poste joue : leur plafond, leurs capacités, et deux mots distincts pour où elles tournent", async () => {
    const vue = await ouvrir(DECLAREES);
    const pose = bloc(vue) ?? assert.fail("pas de stations déclarées sur Cooks");
    assert.equal(pose.dessous("h4")[0]?.textContent?.startsWith(TITRE), true);
    assert.deepEqual(lu(pose), [
      { nom: "box/claude", ou: "box station", plafond: "3 cooks at once", capacites: ["code", "raisonnement"] },
      { nom: "mac/claude", ou: "this workstation", plafond: "1 cook at once", capacites: ["navigateur-headless", "chrome-connecté"] },
      { nom: "pc/claude", ou: "remote", plafond: "2 cooks at once", capacites: ["code"] },
    ]);
    // Les mots sont distincts, et la peau les distingue aussi.
    assert.equal(new Set(Object.values(OU)).size, 3);
    const lignes = pose.dessous("li").filter(({ className }) => className === "station-declaree");
    assert.deepEqual(lignes.map(({ dataset }) => dataset.ou), ["box", "poste", "ailleurs"]);
    // Le survol dit où : la box par le nom que le chef lui connaît, ce poste qui tire son travail de la box.
    const survols = lignes.map((ligne) => ligne.dessous("span").find(({ className }) => className === "ou")?.title ?? "");
    assert.match(survols[0] ?? "", /main station, parade-box/);
    assert.match(survols[1] ?? "", /this computer plays it/);
    assert.match(survols[2] ?? "", /another workstation/);
    // Sous les stations, au-dessus des tickets de l'heure.
    const ids = vue.element("rail").children.map(({ id }) => id);
    assert.ok(ids.indexOf("declarees-du-projet") > ids.indexOf("cuisson-du-projet"), ids.join(", "));
    assert.ok(ids.indexOf("declarees-du-projet") < ids.indexOf("activite-du-projet"), ids.join(", "));
  });

  test("un projet sans station déclarée le dit en une ligne, à la place d'un blanc", async () => {
    const vue = await ouvrir({ ...DECLAREES, declarees: [] });
    const pose = bloc(vue) ?? assert.fail("rien sur Cooks");
    assert.deepEqual(pose.dessous("p").map(({ textContent }) => textContent), [AUCUNE]);
    assert.equal(lu(pose).length, 0);
  });

  test("tant que l'installation n'a rien lu, une ligne le dit ; le contrôle suivant pose les stations, sans rouvrir l'espace", async () => {
    const vue = await ouvrir(undefined);
    assert.deepEqual(bloc(vue)?.dessous("p").map(({ textContent }) => textContent), [PAS_LUE]);
    vue.dire("surGuide", guide(DECLAREES));
    await repos();
    assert.deepEqual(lu(bloc(vue) ?? assert.fail("plus de bloc")).map(({ nom }) => nom), ["box/claude", "mac/claude", "pc/claude"]);
    // Une installation relue sans contrôle ne les efface pas.
    vue.dire("surGuide", guide(undefined));
    await repos();
    assert.equal(lu(bloc(vue) ?? assert.fail("plus de bloc")).length, 3);
  });

  test("un poste Windows : pc/claude joué ici est « this workstation », mac/claude devient « remote »", async () => {
    const vue = await ouvrir(DECLAREES, { ...PROJET, stations: ["pc/claude"] });
    assert.deepEqual(lu(bloc(vue) ?? assert.fail("rien sur Cooks")).map(({ nom, ou }) => [nom, ou]), [
      ["box/claude", "box station"],
      ["mac/claude", "remote"],
      ["pc/claude", "this workstation"],
    ]);
  });

  test("le module se lit seul, sur un faux document", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const pose = poserLesDeclarees(doc as never, { stations: DECLAREES, jouees: ["mac/claude"], hote: "parade-box" }) as unknown as Faux;
    assert.deepEqual(lu(pose).map(({ plafond }) => plafond), [plafondDit(3), plafondDit(1), plafondDit(2)]);
    // Une station sans capacité le dit.
    const sans = poserLesDeclarees(doc as never, { stations: { ...DECLAREES, declarees: [{ nom: "box/claude", moteur: "claude", fournit: [], cooks: 1, distante: false }] } }) as unknown as Faux;
    assert.deepEqual(lu(sans)[0]?.capacites, ["provides nothing"]);
    // La cuisine tourne sur ce poste : ses stations de la box tournent ici.
    const [box, mac] = DECLAREES.declarees;
    assert.equal(ouTourne(box ?? assert.fail(), { jouees: [], ici: true }), "poste");
    assert.equal(ouTourne(box ?? assert.fail(), { jouees: [], ici: false }), "box");
    assert.equal(ouTourne(mac ?? assert.fail(), { jouees: [], ici: false }), "ailleurs");
    assert.equal(ouTourne(mac ?? assert.fail(), { jouees: ["mac/claude"], ici: false }), "poste");
  });
});

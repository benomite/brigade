// La page d'un projet en deux onglets (#1184, #2921) : Rail — ce qui t'attend, le kanban entier, Taken et Pass compris,
// sous le bandeau de santé — et Stations. Un seul est montré au centre ; le second reste à droite,
// le même, quel que soit l'onglet. L'app rouvre un projet sur le dernier onglet que le chef y a ouvert.
// Le menu de la page (#2485) n'a que Rail · Stations · Agents · Know-how · Settings (#2921 : Kitchen et ses sous-onglets ont disparu ;
// #4224 : Agents ; #4505 : Know-how retiré, #4570 : revenu), et un bloc monté par onglet.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { FakeStorage, type Fake, type Played, playTheVue, openRead, openTab, repos } from "./helpers/false-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const FANFARE = "fanfare";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const SECOND_OF_FANFARE: Terminal = { id: 7, projet: FANFARE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const PROJECTS = [
  { nom: PARADE, dossier: "/tmp/parade" },
  { nom: FANFARE, dossier: "/tmp/fanfare" },
];
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

// Un rail où chaque colonne a sa carte : #14 pris, #30 à la pass, #12 qui t'attend, #31 servi, #21 et #22 en attente.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  
  
  attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }],
};
const STATUS = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée",
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass · 1 servi",
  "",
].join("\n");
function drawable(): Drawable {
  const heldOnes = holdFacts();
  heldOnes.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  return heldOnes.attendre(putAside({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}

async function play(storage?: FakeStorage): Promise<Played> {
  return playTheVue({ demarrage: startup, espace: (project) => (project === FANFARE ? [SECOND_OF_FANFARE] : [SECOND]), machines: () => [{ id: "poste", titre: "this computer" }] }, { stockage: storage });
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier.
async function enter(vue: Played, name: string): Promise<void> {
  (vue.element("projets").children.at(PROJECTS.findIndex((project) => project.nom === name) + 1) ?? assert.fail(`pas de case pour ${name}`)).click();
  await repos();
}
// L'espace de parade, ses faits lus.
async function open(storage?: FakeStorage): Promise<Played> {
  const vue = await play(storage);
  await enter(vue, PARADE);
  vue.dire("surFaits", { ...drawable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const tabs = (vue: Played) => vue.element("onglets-du-projet").children;
// L'onglet montré : l'entrée du menu marquée.
const shows = (vue: Played) => tabs(vue).filter((tab) => tab.ariaSelected === "true").map((tab) => tab.textContent);
const center = (vue: Played) => vue.element("rail");
const columns = (vue: Played) => center(vue).dessous("section").filter((pose) => pose.className === "colonne").map((column) => column.children[0]?.children[0]?.textContent);
// Les cartes des colonnes montrées, dans leur ordre.
const cards = (vue: Played) =>
  center(vue)
    .dessous("section")
    .filter((pose) => pose.className === "colonne")
    .flatMap((column) => column.dessous("li").filter((li) => li.className === "bon").map((slip) => slip.children[0]?.children[0]?.textContent));
const cardOf = (vue: Played, number: number): Fake => center(vue).dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de carte #${number} sur l'onglet montré`);
const pose = (vue: Played, id: string) => vue.poses().some((element) => element.id === id && !element.hidden && center(vue).contains(element));
// Les blocs du bandeau de santé, une section de Settings (#3014) : les plafonds, le closer, tous les projets.
const blocks = (vue: Played) => vue.element("rail").children.map((pose) => pose.dataset.bloc);

describe("deux onglets, Rail et Stations, à côté du nom du projet", () => {
  test("un projet s'ouvre sur Rail ; un clic montre Stations, un autre rend Rail — un seul est montré à la fois", async () => {
    const vue = await open();

    assert.equal(vue.element("onglets-du-projet").hidden, false);
    assert.deepEqual(tabs(vue).map((tab) => [tab.textContent, tab.role]), [["Rail", "tab"], ["Stations", "tab"], ["Agents", "tab"], ["Know-how", "tab"], ["Settings", "tab"]]);
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.equal(center(vue).dataset.onglet, "rail");

    await openTab(vue, "Stations");
    assert.deepEqual(shows(vue), ["Stations"]);
    assert.equal(center(vue).dataset.onglet, "stations");
    assert.equal(vue.element("contenu").hidden, true);

    await openTab(vue, "Rail");
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.equal(center(vue).dataset.onglet, "rail");
  });

  test("une page ouverte par-dessus — Settings — se referme quand le chef choisit un onglet", async () => {
    const vue = await open();
    await openRead(vue, "Settings");
    assert.equal(vue.element("contenu").hidden, false);
    // Couvert par la page, seul Settings est marqué montré.
    assert.deepEqual(shows(vue), ["Settings"]);

    await openTab(vue, "Stations");
    assert.equal(vue.element("contenu").hidden, true);
    assert.deepEqual(shows(vue), ["Stations"]);
  });

  test("hors d'un projet, sur « Tous les projets », il n'y a pas d'onglets", async () => {
    const vue = await play();
    assert.equal(vue.element("onglets-du-projet").hidden, true);
    assert.deepEqual(tabs(vue), []);
  });
});

describe("ce que chaque onglet montre", () => {
});

describe("le second reste à droite, le même, quel que soit l'onglet", () => {
  test("ce qui est tapé et la réponse en cours passent d'un onglet à l'autre sans rien perdre ni rouvrir", async () => {
    const vue = await open();
    const [terminal] = vue.xterms;
    const frame = vue.element("fil").children[0];
    const openings = vue.appels.filter(({ geste: action }) => action === "espace").length;
    assert.ok(terminal !== undefined && frame !== undefined);

    vue.dire("surSortie", SECOND.id, "> combien de cooks ?\r\n");
    terminal.taper("et la pass");
    vue.dire("surSortie", SECOND.id, "Deux cooks tournent, ");
    await openTab(vue, "Stations");
    // La réponse continue d'arriver pendant que Stations est montré ; le chef continue de taper.
    vue.dire("surSortie", SECOND.id, "et la pass a ses gates en cours.");
    terminal.taper(" ?");
    await openTab(vue, "Rail");
    await openTab(vue, "Stations");

    for (const state of ["Stations", "Rail"]) {
      if (state === "Rail") await openTab(vue, "Rail");
      assert.equal(vue.element("second").hidden, false, state);
      assert.deepEqual(vue.xterms, [terminal], state);
      assert.equal(vue.element("fil").children[0], frame, state);
      assert.equal(frame.hidden, false, state);
      assert.deepEqual(terminal.ecrits, ["> combien de cooks ?\r\n", "Deux cooks tournent, ", "et la pass a ses gates en cours."], state);
    }
    assert.deepEqual(
      vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args),
      [[SECOND.id, "et la pass"], [SECOND.id, " ?"]],
    );
    // Rien n'a été rouvert : l'espace du projet n'a pas été redemandé.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, openings);
  });
});

describe("l'app rouvre un projet sur le dernier onglet que le chef y a ouvert", () => {
  test("Stations choisi, quitter le projet et y revenir : il s'ouvre sur Stations ; de même pour Rail", async () => {
    const vue = await open();
    await openTab(vue, "Stations");
    await enter(vue, FANFARE);
    // Un projet jamais ouvert s'ouvre sur Rail.
    assert.deepEqual(shows(vue), ["Rail"]);
    await enter(vue, PARADE);
    assert.deepEqual(shows(vue), ["Stations"]);
    assert.equal(center(vue).dataset.onglet, "stations");

    await openTab(vue, "Rail");
    await enter(vue, FANFARE);
    await enter(vue, PARADE);
    assert.deepEqual(shows(vue), ["Rail"]);
  });

  test("l'app fermée puis rouverte, chaque projet reprend son onglet ; un projet jamais ouvert s'ouvre sur Rail", async () => {
    const storage = new FakeStorage();
    const before = await open(storage);
    await openTab(before, "Stations");

    const after = await play(storage);
    await enter(after, PARADE);
    assert.deepEqual(shows(after), ["Stations"]);
    assert.equal(center(after).dataset.onglet, "stations");
    await enter(after, FANFARE);
    assert.deepEqual(shows(after), ["Rail"]);

    // Rail rechoisi sur parade : c'est lui que la prochaine ouverture rend.
    await enter(after, PARADE);
    await openTab(after, "Rail");
    const still = await play(storage);
    await enter(still, PARADE);
    assert.deepEqual(shows(still), ["Rail"]);
  });

  test("un stockage illisible ou absent n'empêche rien : chaque projet s'ouvre sur Rail", async () => {
    const storage = new FakeStorage();
    storage.setItem("brigade.onglets-des-projets", "{pas du json");
    const vue = await play(storage);
    await enter(vue, PARADE);
    assert.deepEqual(shows(vue), ["Rail"]);
    await openTab(vue, "Stations");
    assert.deepEqual(shows(vue), ["Stations"]);

    const without = await play();
    await enter(without, PARADE);
    assert.deepEqual(shows(without), ["Rail"]);
  });
});

describe("le menu de la page d'un projet (#2485, #2921)", () => {
  test("exactement cinq entrées, Rail · Stations · Agents · Know-how · Settings (#4224, #4570) ; Rail est ouvert par défaut, sans Kitchen ni sous-onglets", async () => {
    const vue = await open();

    assert.deepEqual(tabs(vue).map((tab) => tab.textContent), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.equal(vue.element("rail").dataset.onglet, "rail");
    // Plus de Kitchen, donc plus de sous-onglets Health et Cooks.
    assert.equal(vue.poses().some((element) => element.id === "onglets-cuisine"), false);
  });

  test("chaque bloc est monté dans son onglet, chacun dans son seul onglet", async () => {
    const vue = await open();
    // Sur Rail, au-dessus des colonnes, la seule bande des chiffres (#3013) : plus de ligne repliée.

    await openTab(vue, "Stations");
    // L'onglet des stations, un seul composant (#3195) : toutes les stations et « + station » sont sur l'accueil.
    assert.deepEqual(blocks(vue), ["stations-tab"]);

    (tabs(vue).find((tab) => tab.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
    await repos();
    assert.equal(vue.element("etat").hidden, false);

    await openTab(vue, "Rail");
    assert.equal(vue.element("etat").hidden, true);
  });

  test("l'onglet retenu est celui du projet ; un ancien « cooks » ou « sante » stocké ouvre Rail", async () => {
    const vue = await open();
    await openTab(vue, "Stations");
    await enter(vue, FANFARE);
    assert.deepEqual(shows(vue), ["Rail"]);
    await enter(vue, PARADE);
    assert.deepEqual(shows(vue), ["Stations"]);

    for (const old of ["cooks", "sante"]) {
      const storage = new FakeStorage();
      storage.setItem("brigade.onglets-des-projets", JSON.stringify({ [PARADE]: old }));
      const reopened = await open(storage);
      assert.deepEqual(shows(reopened), ["Rail"], old);
      assert.equal(reopened.element("rail").dataset.onglet, "rail", old);
    }
  });

  test("Settings s'ouvre par-dessus, depuis le même menu, et garde son contenu", async () => {
    const vue = await open();
    (tabs(vue).find((tab) => tab.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
    await repos();
    assert.deepEqual(shows(vue), ["Settings"]);
    assert.equal(vue.element("etat").hidden, false);
  });
});

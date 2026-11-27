// Les projets que sert la station de cet ordinateur, dans Settings (#2359, épique #2356) : une ligne d'en-tête qui dit,
// à l'installation, que cet ordinateur ne sert aucun projet, puis une ligne par projet de l'app, `served` ou `not served`.
// La liste ne se change que sur l'onglet Stations d'un projet (#3402) : l'écran la lit, sans case ni bouton. Un projet
// ajouté à la liste s'y lit servi, et la ligne « aucun projet » s'en va ; rouvert, l'écran le montre encore servi ;
// retiré, la ligne revient. L'écran est joué devant un faux document ; derrière son pont, la station lit pour de bon, par
// `lireProjetsServis` du runtime, la liste qu'`ajouterProjetServi` et `retirerProjetServi` écrivent, dans un répertoire du
// test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, cheminDesProjetsServis, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import {
  HELP,
  NO,
  OUTSIDE_OF_THE_APP,
  UNREADABLE,
  NOT_SERVED,
  setTheProjectsServed,
  WITHOUT_REPOSITORY,
  SERVES,
  SERVED,
  holdTheProjectsServed,
  type ReadOfProjectsServed,
  type ProjectOfTheApp,
  type BridgeOfProjectsServed,
} from "../../src/vue/projects-served/projects-served.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const HERE = "this computer";
// Les projets de l'app, tels que son fichier des projets les tient : chacun avec son dépôt, sauf un ajouté à la main.
const PROJECTS: ProjectOfTheApp[] = [
  { nom: "parade", depot: "chef/parade" },
  { nom: "cantine", depot: "chef/cantine" },
  { nom: "brouillon" },
];

const stations: string[] = [];
after(() => {
  for (const station of stations) rmSync(station, { recursive: true, force: true });
});

// Ce que le process principal fait de la station (main.ts) : lire sa liste. Ses écritures, l'onglet Stations les fait.
const refusalOf = (error: unknown): ReadOfProjectsServed => {
  if (error instanceof ProjetsServisIllisibles) return { refus: error.message };
  throw error;
};
function bridgeInFront(station: string, calls: { depot: string; servi: boolean }[] = []): BridgeOfProjectsServed {
  return {
    projetsServis: () => {
      try {
        return Promise.resolve({ depots: lireProjetsServis(station) });
      } catch (error) {
        return Promise.resolve(refusalOf(error));
      }
    },
    servirUnProjet: (repository, served) => {
      calls.push({ depot: repository, servi: served });
      return Promise.resolve({ refus: "Settings does not write the list" });
    },
  };
}

// Une station dans un répertoire neuf — une installation neuve : pas de liste —, et l'app ouverte devant elle.
function station() {
  const root = mkdtempSync(join(tmpdir(), "projets-servis-"));
  stations.push(root);
  return root;
}
function opens(root: string, options: { pont?: BridgeOfProjectsServed; projets?: ProjectOfTheApp[] } = {}) {
  const calls: { depot: string; servi: boolean }[] = [];
  const bridge = options.pont ?? bridgeInFront(root, calls);
  const heldOne = holdTheProjectsServed({ pont: bridge, rendre: () => {} });
  const screen = (): Fake => setTheProjectsServed(doc, { etat: heldOne.etat ?? assert.fail("l'écran n'est pas posé"), projets: options.projets ?? PROJECTS, ici: HERE });
  return { appels: calls, tenue: heldOne, ecran: screen };
}

const head = (screen: Fake) => screen.children[0] ?? assert.fail("pas de ligne d'en-tête");
const lines = (screen: Fake) => screen.children.filter((child) => child.dataset.projet !== undefined);
const line = (screen: Fake, project: string) => lines(screen).find((child) => child.dataset.projet === project) ?? assert.fail(`pas de ligne pour ${project}`);
// La valeur d'une ligne : son premier mot, sans le survol qui le suit.
const valueOf = (root: Fake) => root.children[1]?.children[0]?.textContent;
const saysNo = (screen: Fake) => head(screen).textContent.includes(NO(HERE));
// Les survols de l'écran : leur texte n'est que dans le nom accessible de leur déclencheur.
const hovers = (root: Fake) => root.dessous("button").filter((element) => element.className === "aide").map((element) => element.ariaLabel);
// Ce qui se règle : une case, un champ, un bouton qui n'est pas un survol.
const checks = (root: Fake) => [...root.dessous("input"), ...root.dessous("button").filter((element) => element.className !== "aide")];

describe("à l'installation", () => {
  test("aucun projet n'est servi : chaque projet de l'app a sa ligne, not served, et l'écran dit que ce Mac n'en sert aucun", async () => {
    const root = station();
    const app = opens(root);
    await app.tenue.lire();
    const screen = app.ecran();
    assert.ok(saysNo(screen), "la ligne « aucun projet » se lit en tête");
    assert.equal(NO(HERE), "this computer serves no project");
    // Les projets offerts sont ceux de l'app, dans son ordre — et rien d'autre.
    assert.deepEqual(lines(screen).map((rank) => rank.dataset.projet), ["parade", "cantine", "brouillon"]);
    for (const project of ["parade", "cantine"]) assert.equal(valueOf(line(screen, project)), NOT_SERVED);
    // Lire n'écrit rien : la station n'a toujours pas de liste.
    assert.equal(existsSync(cheminDesProjetsServis(root)), false);
    assert.deepEqual(app.appels, []);
    // Chaque ligne est la rangée de réglage (#2920), sans « save » ni PR. Le dépôt se lit à côté du nom.
    for (const rank of lines(screen)) {
      assert.equal(rank.className, "reglage");
      assert.equal(rank.dessous("button").some((button) => /save|propose/i.test(button.textContent)), false);
      assert.equal(rank.dessous("p").some((p) => p.className === "par-pr"), false);
    }
    assert.equal(line(screen, "parade").children[0]?.textContent, "paradechef/parade");
  });

  test("un projet dont l'app ne connaît pas le dépôt le dit au survol", async () => {
    const app = opens(station());
    await app.tenue.lire();
    const draft = line(app.ecran(), "brouillon");
    assert.equal(valueOf(draft), "–");
    assert.deepEqual(hovers(draft), [WITHOUT_REPOSITORY]);
  });
});

describe("la liste se lit ici, elle se change sur l'onglet Stations (#3402)", () => {
  test("aucune ligne n'a de contrôle : l'aide dit où un projet s'ajoute ou se retire", async () => {
    const root = station();
    ajouterProjetServi(root, "chef/parade");
    const app = opens(root);
    await app.tenue.lire();
    const screen = app.ecran();
    assert.deepEqual(checks(screen), []);
    assert.deepEqual(hovers(head(screen)), [HELP(HERE)]);
    assert.match(HELP(HERE), /added or removed on its Stations tab/);
    assert.deepEqual(app.appels, []);
  });

  test("parade ajouté à la liste se lit servi : la ligne « aucun projet » s'en va, et l'app rouverte le montre servi", async () => {
    const root = station();
    const app = opens(root);
    await app.tenue.lire();
    assert.ok(saysNo(app.ecran()));
    // L'onglet Stations de parade l'ajoute ; l'écran relu le dit.
    ajouterProjetServi(root, "chef/parade");
    await app.tenue.lire();
    // La station l'a pour de bon, dans sa configuration.
    assert.equal(readFileSync(cheminDesProjetsServis(root), "utf8"), "parade chef/parade\n");
    let screen = app.ecran();
    assert.equal(saysNo(screen), false, "la ligne « aucun projet » est partie");
    assert.ok(head(screen).textContent.includes(SERVES(1)));
    assert.equal(valueOf(line(screen, "parade")), SERVED);
    assert.equal(valueOf(line(screen, "cantine")), NOT_SERVED);

    // L'app fermée puis rouverte : un écran neuf, qui relit la station.
    const reopened = opens(root);
    await reopened.tenue.lire();
    screen = reopened.ecran();
    assert.equal(valueOf(line(screen, "parade")), SERVED);
    assert.equal(saysNo(screen), false);
  });

  test("le dernier projet retiré de la liste, la ligne « aucun projet » revient", async () => {
    const root = station();
    ajouterProjetServi(root, "chef/parade");
    ajouterProjetServi(root, "chef/cantine");
    const app = opens(root);
    await app.tenue.lire();
    assert.ok(head(app.ecran()).textContent.includes(SERVES(2)));
    retirerProjetServi(root, "chef/cantine");
    await app.tenue.lire();
    assert.equal(saysNo(app.ecran()), false, "parade est encore servi");
    retirerProjetServi(root, "chef/parade");
    await app.tenue.lire();
    const screen = app.ecran();
    assert.ok(saysNo(screen), "la ligne « aucun projet » est revenue");
    assert.ok(lines(screen).every((rank) => valueOf(rank) !== SERVED));
  });

  test("un dépôt de la liste qu'aucun projet de l'app ne porte garde sa ligne, servi, et dit au survol comment le changer", async () => {
    const root = station();
    ajouterProjetServi(root, "chef/ailleurs");
    const app = opens(root);
    await app.tenue.lire();
    const elsewhere = line(app.ecran(), "chef/ailleurs");
    assert.equal(valueOf(elsewhere), SERVED);
    assert.deepEqual(hovers(elsewhere), [OUTSIDE_OF_THE_APP]);
    assert.equal(saysNo(app.ecran()), false, "ce Mac sert un projet, même hors de l'app");
  });

  test("un dépôt écrit autrement (casse) est reconnu comme celui du projet", async () => {
    const root = station();
    ajouterProjetServi(root, "Chef/Parade");
    const app = opens(root);
    await app.tenue.lire();
    assert.equal(valueOf(line(app.ecran(), "parade")), SERVED);
    assert.equal(lines(app.ecran()).length, PROJECTS.length);
  });
});

describe("ce qui ne se lit pas", () => {
  test("une liste illisible ne se lit pas comme vide : l'écran dit qu'elle est indisponible, sans ligne ni « aucun projet »", async () => {
    const root = station();
    // Un répertoire à la place de la configuration : elle ne se lit pas.
    mkdirSync(cheminDesProjetsServis(root));
    const app = opens(root);
    await app.tenue.lire();
    const screen = app.ecran();
    assert.ok(head(screen).textContent.includes(UNREADABLE));
    assert.equal(saysNo(screen), false);
    assert.deepEqual(lines(screen), []);
  });

  test("un appareil sans station (le téléphone) ne pose rien", async () => {
    const withoutBridge = holdTheProjectsServed({ pont: {}, rendre: () => {} });
    await withoutBridge.lire();
    assert.equal(withoutBridge.etat, undefined);
    const nothingOfRendered = holdTheProjectsServed({ pont: { projetsServis: () => Promise.resolve(undefined) }, rendre: () => {} });
    await nothingOfRendered.lire();
    assert.equal(nothingOfRendered.etat, undefined);
  });
});

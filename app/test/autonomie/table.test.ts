// La table d'autonomie d'un projet, avec ses réglages (#1563) : sept rangées à trois positions, celle en vigueur
// pressée ; trois rangées verrouillées ; trois profils ; et ce qui s'affiche après un clic est ce que le journal
// porte. La vue est jouée devant un faux document (aides/fausse-vue.ts), son API tenue par le vrai module du runtime
// (runtime/src/autonomie/table.ts) sur un journal à elle — ce que la cuisine lit est ce que le test relit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import * as runtime from "../../../runtime/src/autonomie/table.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import {
  type Api,
  AUJOURDHUI,
  ceQuePose,
  EN_COURS,
  FIXES,
  LIBELLES_DES_POSITIONS,
  LIBELLES_DES_RANGEES,
  NOMS_DES_PROFILS,
  PAR_LE_GRANT,
  POSITIONS,
  type Position,
  PROFILS,
  type Profil,
  RANGEES,
  type Rangee,
  type Rendu,
  type Table,
  tenirLaTableDAutonomie,
} from "../../src/vue/autonomie/table.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = new Date("2026-10-23T12:00:00.000Z");

// Un projet et son journal ; l'API que la vue reçoit le lit et l'écrit par le module du runtime, au nom du chef.
function projet(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-autonomie-"));
  const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const geste = { projet: "parade", auteur: "app:chef", maintenant: MAINTENANT };
  const lue = (): Table => runtime.lireAutonomie(journal.base, MAINTENANT);
  const appels: string[] = [];
  const rendre = (ecrire: () => unknown): Promise<Rendu> => {
    try {
      ecrire();
      return Promise.resolve({ table: lue() });
    } catch (erreur) {
      if (erreur instanceof runtime.AutonomieRefusee) return Promise.resolve({ refus: erreur.message });
      throw erreur;
    }
  };
  const api: Api = {
    lire: () => Promise.resolve({ table: lue() }),
    poserRangee: (row, position) => {
      appels.push(`${row} ${position}`);
      return rendre(() => runtime.poserRangee(journal, { ...geste, row, position }));
    },
    appliquerProfil: (profil) => {
      appels.push(`profile ${profil}`);
      return rendre(() => runtime.appliquerProfil(journal, { ...geste, profil }));
    },
  };
  const positions = () => Object.fromEntries(lue().rows.map(({ row, position }) => [row, position]));
  return { journal, api, appels, positions };
}

// La table posée dans sa racine, lue une première fois.
async function monter(api: Api) {
  const racine = new Faux("div");
  const tenue = tenirLaTableDAutonomie(doc, racine, api);
  await tenue.lire();
  return { racine, tenue };
}

const section = (racine: Faux) => racine.children[0] ?? assert.fail("rien n'est posé");
const rangeesDe = (racine: Faux) => section(racine).dessous("div").filter((div) => div.className === "rangee");
const verrouillees = (racine: Faux) => section(racine).dessous("div").filter((div) => div.className === "rangee verrouillee");
const rangee = (racine: Faux, row: string) => section(racine).dessous("div").find((div) => div.className.startsWith("rangee") && div.dataset.row === row) ?? assert.fail(`aucune rangée ${row}`);
const boutonsDe = (ligne: Faux) => ligne.dessous("button").filter((bouton) => bouton.dataset.position !== undefined);
const pressee = (ligne: Faux) => boutonsDe(ligne).filter((bouton) => bouton.ariaPressed === "true").map((bouton) => bouton.dataset.position);
const positionsVues = (racine: Faux) => Object.fromEntries(rangeesDe(racine).map((ligne) => [ligne.dataset.row, pressee(ligne)[0]]));
const cliquer = async (racine: Faux, row: string, position: Position) => {
  const bouton = boutonsDe(rangee(racine, row)).find((pose) => pose.dataset.position === position) ?? assert.fail(`aucun bouton ${position} sur ${row}`);
  bouton.click();
  await repos();
};
const profilBouton = (racine: Faux, nom: Profil) => section(racine).dessous("span").find((span) => span.dataset.profil === nom)?.children[0] ?? assert.fail(`aucun profil ${nom}`);
const appliquer = async (racine: Faux, nom: Profil) => {
  profilBouton(racine, nom).click();
  await repos();
};
const tout = (position: Position) => Object.fromEntries(RANGEES.map((row) => [row, position]));

describe("la table : sept rangées, trois positions, celle en vigueur pressée", () => {
  test("un projet sans table : les sept rangées dans l'ordre, chacune à trois positions, une seule pressée — le comportement d'aujourd'hui", async (t) => {
    const { api } = projet(t);
    const { racine } = await monter(api);

    assert.equal(racine.hidden, false);
    assert.equal(section(racine).dessous("h3")[0]?.textContent, "Autonomy?");
    const lignes = rangeesDe(racine);
    assert.deepEqual(
      lignes.map((ligne) => ligne.children[0]?.textContent),
      ["Screens", "Merge", "Specification", "Priorities", "Cost", "Dependencies", "Publishing"].map((titre) => `${titre}?`),
    );
    for (const ligne of lignes) {
      assert.deepEqual(
        boutonsDe(ligne).map((bouton) => [bouton.textContent, bouton.disabled]),
        [
          ["brigade decides", false],
          ["brigade decides and tells me", false],
          ["I decide", false],
        ],
      );
      assert.equal(pressee(ligne).length, 1, `${ligne.dataset.row} : une position pressée`);
    }
    // Ce que la cuisine fait aujourd'hui, et Merge à « I decide » : aucun grant.
    assert.deepEqual(positionsVues(racine), { ...runtime.AUJOURDHUI, merge: "i-decide" });
    assert.deepEqual(
      lignes.map((ligne) => ligne.dessous("small")[0]?.textContent),
      RANGEES.map((row) => (row === "merge" ? PAR_LE_GRANT : AUJOURDHUI)),
    );
  });

  test("un projet qui a le grant `merge` : la rangée Merge le dit, « brigade decides » — les autres gardent leur défaut", async (t) => {
    const { journal, api } = projet(t);
    journal.ajouter({ project: "parade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    const { racine } = await monter(api);

    assert.deepEqual(positionsVues(racine), { ...runtime.AUJOURDHUI, merge: "brigade-decides" });
  });

  test("les mots de la vue sont ceux du runtime : rangées, positions, profils", () => {
    assert.deepEqual([...RANGEES], [...runtime.RANGEES]);
    assert.deepEqual([...FIXES], [...runtime.FIXES]);
    assert.deepEqual([...POSITIONS], [...runtime.POSITIONS]);
    assert.deepEqual([...NOMS_DES_PROFILS], [...runtime.NOMS_DES_PROFILS]);
    assert.deepEqual(LIBELLES_DES_RANGEES, runtime.LIBELLES_DES_RANGEES);
    assert.deepEqual(LIBELLES_DES_POSITIONS, runtime.LIBELLES_DES_POSITIONS);
    assert.deepEqual(Object.fromEntries(NOMS_DES_PROFILS.map((nom) => [nom, PROFILS[nom].table])), runtime.PROFILS);
  });

  test("une table illisible tient en une ligne, son détail au survol", async () => {
    const { racine } = await monter({
      lire: () => Promise.reject(new Error("ssh: connect to host box port 22: Connection refused")),
      poserRangee: () => assert.fail("rien ne se pose"),
      appliquerProfil: () => assert.fail("rien ne s'applique"),
    });
    const indisponible = section(racine).dessous("p").find((p) => p.className === "indisponible") ?? assert.fail("aucune ligne");
    assert.equal(indisponible.children[0]?.textContent, "the autonomy table is unavailable");
    assert.equal(indisponible.dessous("button")[0]?.ariaLabel, "ssh: connect to host box port 22: Connection refused");
    assert.equal(rangeesDe(racine).length, 0);
  });
});

describe("changer une rangée", () => {
  test("un clic pose la position par l'API ; l'écran montre ensuite la table écrite, et seule cette rangée a bougé", async (t) => {
    const { api, appels, positions, journal } = projet(t);
    const { racine } = await monter(api);

    await cliquer(racine, "screens", "i-decide");

    assert.deepEqual(appels, ["screens i-decide"]);
    assert.equal(positions().screens, "i-decide");
    assert.deepEqual(positionsVues(racine), positions());
    assert.deepEqual(positionsVues(racine), { ...runtime.AUJOURDHUI, merge: "i-decide", screens: "i-decide" });
    assert.equal(rangee(racine, "screens").dessous("small")[0]?.textContent, "", "posée par le chef : plus « today's behavior »");
    const changement = journal.tout().find((evenement) => evenement.type === "autonomy.changed");
    assert.equal(changement?.author, "app:chef");
  });

  test("chacune des trois positions, posée sur Merge, est celle que l'écran montre ensuite — et le grant la suit", async (t) => {
    const { api, positions } = projet(t);
    const { racine } = await monter(api);
    for (const position of ["brigade-decides-and-tells-me", "brigade-decides", "i-decide", "brigade-decides-and-tells-me"] as const) {
      await cliquer(racine, "merge", position);
      assert.equal(positions().merge, position);
      assert.deepEqual(pressee(rangee(racine, "merge")), [position]);
    }
  });

  test("la position déjà posée ne repart pas ; celle d'aujourd'hui, si : le chef la choisit", async (t) => {
    const { api, appels } = projet(t);
    const { racine } = await monter(api);
    await cliquer(racine, "cost", "brigade-decides");
    assert.deepEqual(appels, ["cost brigade-decides"]);
    assert.equal(rangee(racine, "cost").dataset.source, "set");
    await cliquer(racine, "cost", "brigade-decides");
    assert.deepEqual(appels, ["cost brigade-decides"]);
  });

  test("pendant que le clic part, rien d'autre ne se clique ; ce qui est demandé se voit, puis la table rendue", async (t) => {
    const { api } = projet(t);
    let lacher: (rendu: Rendu) => void = () => assert.fail("rien n'est parti");
    const lente: Api = { ...api, poserRangee: () => new Promise((fini) => (lacher = fini)) };
    const { racine } = await monter(lente);

    await cliquer(racine, "priorities", "brigade-decides");
    const ligne = rangee(racine, "priorities");
    assert.equal(ligne.dessous("small")[0]?.textContent, EN_COURS);
    assert.deepEqual(pressee(ligne), ["i-decide"], "rien n'est montré posé avant que l'API le rende");
    assert.equal(boutonsDe(ligne).find((bouton) => bouton.dataset.position === "brigade-decides")?.className, "demandee");
    assert.ok(rangeesDe(racine).every((autre) => boutonsDe(autre).every((bouton) => bouton.disabled)));
    assert.ok(NOMS_DES_PROFILS.every((nom) => profilBouton(racine, nom).disabled));

    const table = await api.poserRangee("priorities", "brigade-decides");
    lacher(table);
    await repos();
    assert.deepEqual(pressee(rangee(racine, "priorities")), ["brigade-decides"]);
    assert.ok(rangeesDe(racine).every((autre) => boutonsDe(autre).every((bouton) => !bouton.disabled)));
  });

  test("un clic refusé se dit en une ligne sous la table, le détail au survol ; la table reste celle qui est écrite", async (t) => {
    const { api, positions } = projet(t);
    const { racine } = await monter({ ...api, poserRangee: () => Promise.reject(new Error("exit 255: ssh: Could not resolve hostname box")) });

    await cliquer(racine, "dependencies", "brigade-decides");
    const refus = section(racine).dessous("p").find((p) => p.className === "dit refus") ?? assert.fail("aucun refus");
    assert.equal(refus.children[0]?.textContent, "nothing was changed: the answer could not be read");
    assert.equal(refus.dessous("button")[0]?.ariaLabel, "exit 255: ssh: Could not resolve hostname box");
    assert.deepEqual(positionsVues(racine), positions());
  });
});

describe("appliquer un profil", () => {
  const ATTENDU: Record<Profil, Record<Rangee, Position>> = {
    prototype: tout("brigade-decides") as Record<Rangee, Position>,
    "client-product": { ...(tout("brigade-decides") as Record<Rangee, Position>), screens: "i-decide", specification: "i-decide" },
    "internal-tool": tout("brigade-decides-and-tells-me") as Record<Rangee, Position>,
  };

  for (const nom of NOMS_DES_PROFILS) {
    test(`« ${PROFILS[nom].libelle} » pose toute la table d'un clic ; une rangée se change ensuite seule`, async (t) => {
      const { api, appels, positions } = projet(t);
      const { racine } = await monter(api);

      await appliquer(racine, nom);
      assert.deepEqual(appels, [`profile ${nom}`]);
      assert.deepEqual(positions(), ATTENDU[nom]);
      assert.deepEqual(positionsVues(racine), ATTENDU[nom]);

      const autre = ATTENDU[nom].publishing === "i-decide" ? "brigade-decides" : "i-decide";
      await cliquer(racine, "publishing", autre);
      assert.deepEqual(positionsVues(racine), { ...ATTENDU[nom], publishing: autre });
      assert.deepEqual(positions(), { ...ATTENDU[nom], publishing: autre });
    });
  }

  test("chaque profil dit au survol ce qu'il pose, sans rien poser au survol", async (t) => {
    const { api, appels } = projet(t);
    const { racine } = await monter(api);
    assert.deepEqual(
      NOMS_DES_PROFILS.map((nom) => [profilBouton(racine, nom).textContent, profilBouton(racine, nom).title]),
      [
        ["prototype", "Every row: brigade decides."],
        ["client product", "Screens and Specification: I decide. Every other row: brigade decides."],
        ["internal tool", "Every row: brigade decides and tells me."],
      ],
    );
    assert.deepEqual(
      NOMS_DES_PROFILS.map((nom) => ceQuePose(nom)),
      NOMS_DES_PROFILS.map((nom) => profilBouton(racine, nom).title),
    );
    assert.deepEqual(appels, []);
  });
});

describe("les rangées verrouillées", () => {
  test("production, secrets et ce qui se publie hors du dépôt : sous la table, « I decide » pressé, aucun bouton ne se clique", async (t) => {
    const { api, appels, journal } = projet(t);
    const { racine } = await monter(api);
    const avant = journal.dernierSeq();

    const lignes = verrouillees(racine);
    assert.deepEqual(
      lignes.map((ligne) => ligne.children[0]?.textContent),
      ["Production?", "Secrets?", "Published outside the repository?"],
    );
    const tete = section(racine).dessous("p").find((p) => p.className === "tete-fixes");
    assert.equal(tete?.children[0]?.textContent, "Always I decide");
    assert.equal(tete?.children[1]?.textContent, "locked");
    for (const ligne of lignes) {
      assert.deepEqual(pressee(ligne), ["i-decide"]);
      assert.ok(boutonsDe(ligne).every((bouton) => bouton.disabled));
      for (const bouton of boutonsDe(ligne)) bouton.declencher("click");
    }
    await repos();
    assert.deepEqual(appels, []);
    assert.equal(journal.dernierSeq(), avant);
  });

  test("aucun profil ne les touche, et le runtime refuse de les changer : la vue dit son refus, elles restent « I decide »", async (t) => {
    const { api } = projet(t);
    const { racine } = await monter(api);
    await appliquer(racine, "prototype");
    assert.ok(verrouillees(racine).every((ligne) => pressee(ligne)[0] === "i-decide"));

    // Ce qu'une API qui passerait outre rendrait : le refus du runtime, posé tel qu'il l'écrit, en une ligne.
    const rendu = await api.poserRangee("secrets" as Rangee, "brigade-decides");
    assert.ok("refus" in rendu);
    assert.match(rendu.refus, /always “I decide”/);
    const { racine: autre } = await monter({ ...api, poserRangee: () => api.poserRangee("secrets" as Rangee, "brigade-decides") });
    await cliquer(autre, "screens", "i-decide");
    assert.equal(section(autre).dessous("p").find((p) => p.className === "dit refus")?.children[0]?.textContent, rendu.refus);
    assert.ok(verrouillees(autre).every((ligne) => pressee(ligne)[0] === "i-decide"));
  });
});

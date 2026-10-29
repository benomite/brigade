// Un seul interrupteur pour tout le projet, en tête de son espace (#906, #1406) : allumé ou éteint,
// lisible sans rien lire d'autre, et un clic le bascule — éteindre part dans le second, allumer ouvre
// sa confirmation, qui dit en une phrase ce que le manager va juger, avec le nombre réel d'issues
// ouvertes. Éteint, la tête du rail est marquée à l'arrêt, d'une ligne courte ; la bande d'alertes
// n'en fait plus de ligne, et la ligne brute de la box n'est plus qu'au survol de l'interrupteur.
// L'état vient de la bande (alertes.ts), lu dans ce que `manager` écrit — le manager suit
// l'interrupteur du projet, et sa ligne le dit : la commande du runtime, jouée ici sur un vrai
// journal (runtime/src/manager-cli.ts). La vue est jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { MANAGER_ETEINT, tenirBandes, type Bande } from "../src/alertes.ts";
import { ALLUMAGE, AVERTISSEMENT, dire } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const CUISINE = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const A = "2026-10-13T10:00:01.000Z";
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade" };
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande, texte }] });

// `manager`, jouée sur un journal où le chef a allumé, ou éteint, le projet à 9 h 25 : sa sortie, telle quelle.
function sortieDeManager(t: TestContext, allume: boolean): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-interrupteur-"));
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date("2026-10-13T09:25:00.000Z") });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const fait: Fait = { type: allume ? "project.switched-on" : "project.switched-off", payload: {} };
  journal.ajouter({ project: "parade", ticket: null, author: "chef", ...fait });
  const lignes: string[] = [];
  void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
  return `${lignes.join("\n")}\n`;
}

// La bande que le process principal dirait, `manager` lu — ou pas encore.
function bandeLue(sortie?: string): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  const [ouverte] = bandes.ouvrir(["parade"]);
  return sortie === undefined ? (ouverte ?? assert.fail("pas de bande")) : bandes.manager(lecture("manager", sortie));
}

// Un rail, pour voir sa tête : deux tickets en attente, un pris.
const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/chef/parade/issues/14", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [],
};

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    ...reponses,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  const recue = tenirFaits().recevoir(lecture("facts", JSON.stringify(FAITS)));
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const bascule = (vue: Jouee): Faux => vue.element("interrupteur-projet").dessous("button").find(({ className }) => className === "bascule") ?? assert.fail("pas d'interrupteur");
const teteDuRail = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("p").find(({ className }) => className === "arret-manager");
const confirmation = (vue: Jouee): Faux | undefined => vue.element("interrupteur-projet").dessous("div").find(({ className }) => className === "confirmation");
const gestesPartis = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args);

describe("la bande porte l'état de l'interrupteur du projet", () => {
  test("allumé, éteint, pas encore lu : l'état tel qu'il vient d'être lu, la ligne du runtime mot pour mot — jamais « éteint » faute de lecture", (t) => {
    assert.deepEqual(bandeLue(sortieDeManager(t, true)).manager, { allume: true, releve: "ON since 2026-10-13T09:25:00.000Z (by chef) — the project switch is on: it judges the open issues, sets `fire` and the calibration" });
    const eteinte = bandeLue(sortieDeManager(t, false));
    assert.deepEqual(eteinte.manager, { allume: false, dit: MANAGER_ETEINT, releve: "OFF since 2026-10-13T09:25:00.000Z (by chef) — the project switch is off: `brigade <projet> switch on` turns it on — no issue is judged, what it set stays set" });
    // La ligne de la bande dit la même phrase : c'est elle qui fait le signal de la case, dans la barre.
    assert.deepEqual(eteinte.alertes.map(({ sujet, dit }) => [sujet, dit]), [["manager", "project off — nothing new is taken, split or merged"]]);
    assert.equal(eteinte.signal?.dit, MANAGER_ETEINT);
    const pasLue = bandeLue().manager;
    assert.ok(pasLue !== undefined && "sans" in pasLue, JSON.stringify(pasLue));
  });
});

describe("l'interrupteur, en tête de l'espace", () => {
  test("éteint : « project off », la ligne de la box au survol, aucune ligne dans la bande, et la tête du rail à l'arrêt d'une ligne", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();

    assert.equal(vue.element("interrupteur-projet").hidden, false);
    const eteint = bascule(vue);
    assert.equal(eteint.role, "switch");
    assert.equal(eteint.ariaChecked, "false");
    assert.equal(eteint.dataset.etat, "eteint");
    assert.equal(eteint.textContent, "project off");
    assert.equal(eteint.ariaLabel, "the project: off");
    // La ligne brute de la box n'est plus à plat : elle est au survol de l'interrupteur.
    assert.match(eteint.title, /^OFF since 2026-10-13T09:25:00\.000Z \(by chef\) — the project switch is off/);
    assert.equal(vue.element("alertes").hidden, true);
    assert.doesNotMatch(vue.element("alertes").textContent, /OFF|manager|project/);
    // Le prix n'est pas posé à côté de l'interrupteur.
    assert.doesNotMatch(vue.element("interrupteur-projet").textContent, /judge|backlog|cost/);

    // Éteint, la page le dit en une ligne : la tête du rail.
    const tete = teteDuRail(vue) ?? assert.fail("la tête du rail n'est pas marquée à l'arrêt");
    assert.equal(tete.textContent, "project off — nothing new is taken, split or merged");
    // Elle est en tête du rail : avant ce qui arrive et les colonnes.
    const rail = vue.element("rail").children;
    assert.ok(rail.indexOf(tete) < rail.findIndex(({ className }) => className === "colonnes"));
  });

  test("allumé : « project on », et la tête du rail n'est plus marquée ; une bascule lue se voit aussitôt, sans attendre les faits", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();
    assert.notEqual(teteDuRail(vue), undefined);

    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();
    const allume = bascule(vue);
    assert.equal(allume.ariaChecked, "true");
    assert.equal(allume.dataset.etat, "allume");
    assert.equal(allume.textContent, "project on");
    assert.match(allume.title, /^ON since/);
    assert.equal(teteDuRail(vue), undefined);
    assert.equal(vue.element("alertes").hidden, true);
  });

  test("pas encore lu : ni « on » ni « off », et un clic ne bascule rien — ce n'est pas « éteint »", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue());
    await repos();

    const inconnu = bascule(vue);
    assert.equal(inconnu.ariaChecked, "mixed");
    assert.equal(inconnu.disabled, true);
    assert.equal(inconnu.textContent, "project …");
    assert.equal(teteDuRail(vue), undefined);
    inconnu.click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste" || geste === "confirmer"), []);
  });

  test("allumé, un clic l'éteint : le geste part dans le second, sans confirmation", async (t) => {
    const vue = await ouvrir({ geste: () => undefined });
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();

    bascule(vue).click();
    await repos();
    assert.deepEqual(gestesPartis(vue), [["parade", "projet-eteindre", undefined, undefined]]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "confirmer"), []);
  });

  test("un geste que le second refuse : le centre le dit en une phrase avec « try again », qui rejoue le même geste — jamais un clic sans message", async (t) => {
    let appels = 0;
    const vue = await ouvrir({ geste: () => (++appels === 1 ? { refus: "the second is busy — the command did not go, and nothing is written: `switch off`" } : undefined) });
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();

    bascule(vue).click();
    await repos();
    const note = vue.element("note");
    assert.equal(note.hidden, false);
    assert.match(note.textContent, /^nothing was sent to the second: the second is busy/);
    const encore = note.dessous("button").find(({ textContent }) => textContent === "try again") ?? assert.fail("pas de « try again »");
    encore.click();
    await repos();
    assert.equal(gestesPartis(vue).length, 2);
    assert.doesNotMatch(vue.element("note").textContent, /nothing was sent/);
  });

  test("le message d'un geste raté ne suit pas le chef dans un autre espace : ouvrir un projet l'efface", async (t) => {
    const vue = await ouvrir({ geste: () => ({ refus: "the second is busy — nothing is written" }) });
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();
    bascule(vue).click();
    await repos();
    assert.match(vue.element("note").textContent, /nothing was sent/);

    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.doesNotMatch(vue.element("note").textContent, /nothing was sent/);
  });

  test("éteint, un clic ouvre la confirmation : une phrase dit ce qu'il va juger, avec le nombre réel d'issues ouvertes — rien ne part avant le « oui »", async (t) => {
    const backlog = { ouvertes: 23, retenues: 0 };
    const vue = await ouvrir({
      confirmer: (_, id, grant) => confirmationDe(id, PARADE, { sans: "pas lus" }, grant, CUISINE),
      compter: () => ({ projet: "parade", a: A, ...backlog, dit: dire(backlog) }),
      geste: () => undefined,
    });
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();

    bascule(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "projet-allumer", undefined]);
    assert.deepEqual(vue.dernier("compter"), ["parade"]);
    assert.deepEqual(gestesPartis(vue), []);
    const ouverte = confirmation(vue) ?? assert.fail("pas de confirmation sous l'interrupteur");
    assert.equal(bascule(vue).ariaChecked, "false", "la confirmation ouverte ne bascule rien");

    // Le prix : une phrase, et une seule — ce qu'il va juger. Ce qu'allumer engage est au survol.
    const prix = ouverte.dessous("p").filter(({ className }) => className === "prix" || className === "nombres");
    assert.equal(prix.length, 1);
    // Sa phrase, puis le « ? » de son survol.
    assert.equal(prix[0]?.textContent, "it will judge the 23 open issues?");
    assert.doesNotMatch(ouverte.textContent, /whole open backlog/);
    assert.ok(ouverte.dessous("button").some(({ ariaLabel }) => ariaLabel.includes(AVERTISSEMENT)), "ce qu'allumer engage n'est pas au survol");
    // À côté des réponses, rien d'écrit : ce que chacune engage est au survol de son bouton.
    assert.doesNotMatch(ouverte.textContent, /taken up right away|nothing goes/);
    const reponses = ouverte.dessous("button").filter(({ className }) => className !== "aide");
    assert.deepEqual(reponses.map(({ textContent, title }) => [textContent, title]), [
      ["yes, switch the project on", "what the manager judges executable is taken up right away, and green deliveries are merged"],
      ["no, leave it off", "nothing goes"],
    ]);

    // « oui » le fait partir, dans le second, et referme la confirmation.
    (ouverte.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(gestesPartis(vue), [["parade", "projet-allumer", undefined, true]]);
    assert.equal(confirmation(vue), undefined);
  });

  test("la phrase compte ce qu'il va vraiment juger : `blocked-on-human` retient, et rien d'ouvert, c'est rien à juger", () => {
    assert.equal(dire({ ouvertes: 23, retenues: 0 }), "it will judge the 23 open issues");
    assert.equal(dire({ ouvertes: 23, retenues: 2 }), "it will judge 21 of the 23 open issues — 2 carry `blocked-on-human`");
    assert.equal(dire({ ouvertes: 1, retenues: 0 }), "it will judge the 1 open issue");
    assert.equal(dire({ ouvertes: 4, retenues: 4 }), "it will judge no issue: all 4 open issues carry `blocked-on-human`");
    assert.equal(dire({ ouvertes: 0, retenues: 0 }), "it will judge no issue: none is open");
  });
});

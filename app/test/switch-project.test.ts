// Un seul interrupteur pour tout le projet, en tête de son espace (#906, #1406) : allumé ou éteint,
// lisible sans rien lire d'autre, et un clic le bascule — éteindre part dans le second, allumer ouvre
// sa confirmation, qui dit en une phrase ce que le manager va juger, avec le nombre réel d'issues
// ouvertes. Éteint, la tête du rail est marquée à l'arrêt, d'une ligne courte, avec le bouton qui l'allume (#3454) ; la bande d'alertes
// n'en fait plus de ligne, et la ligne brute de la box n'est plus qu'au survol de l'interrupteur.
// L'état vient de la bande (alerts.ts), lu dans ce que `manager` écrit — le manager suit
// l'interrupteur du projet, et sa ligne le dit : la sortie de la commande de l'ancien runtime, jouée sur
// un vrai journal et recopiée telle quelle (runtime/src/manager-cli.ts, supprimé avec lui, #4499). La vue
// est jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MANAGER_OFF, holdBands, type Band } from "../src/alerts.ts";
import { POWER_UP, WARNING, tell } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { confirmationOf } from "../src/confirmation.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const A = "2026-10-13T10:00:01.000Z";
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande: command, texte: text }] });

// La sortie de `manager` sur un journal où le chef a allumé, ou éteint, le projet à 9 h 25 : telle que l'ancien runtime
// l'écrivait.
function outputOfManager(lit: boolean): string {
  const switchLine = lit
    ? "manager               ON since 2026-10-13T09:25:00.000Z (by chef) — the project switch is on: it judges the open issues, sets `fire` and the calibration"
    : "manager               OFF since 2026-10-13T09:25:00.000Z (by chef) — the project switch is off: `brigade <projet> switch on` turns it on — no issue is judged, what it set stays set";
  return [switchLine, "latest decisions      none", "set aside             none", "epics                 none", "reactions             none", "held gestures         none"].join("\n") + "\n";
}

// La bande que le process principal dirait, `manager` lu — ou pas encore.
function bandRead(output?: string): Band {
  const bands = holdBands({ etablir: 1, minimum: 0 });
  const [openOne] = bands.ouvrir(["parade"]);
  return output === undefined ? (openOne ?? assert.fail("pas de bande")) : bands.manager(reading("manager", output));
}

// Un rail, pour voir sa tête : deux tickets en attente, un pris.
const FACTS: Facts = {
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

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    ...answers,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  const receivedOne = holdFacts().recevoir(reading("facts", JSON.stringify(FACTS)));
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const toggle = (vue: Played): Fake => vue.element("interrupteur-projet").dessous("button").find(({ className }) => className === "bascule") ?? assert.fail("pas d'interrupteur");
const headOfRail = (vue: Played): Fake | undefined => vue.element("rail").dessous("p").find(({ className }) => className === "arret-manager");
const confirmation = (vue: Played): Fake | undefined => vue.element("interrupteur-projet").dessous("section").find(({ className }) => className === "confirmation");
const actionsGone = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "geste").map(({ args }) => args);

describe("la bande porte l'état de l'interrupteur du projet", () => {
  test("allumé, éteint, pas encore lu : l'état tel qu'il vient d'être lu, la ligne du runtime mot pour mot — jamais « éteint » faute de lecture", () => {
    assert.deepEqual(bandRead(outputOfManager(true)).manager, { allume: true, releve: "ON since 2026-10-13T09:25:00.000Z (by chef) — the project switch is on: it judges the open issues, sets `fire` and the calibration" });
    const off = bandRead(outputOfManager(false));
    assert.deepEqual(off.manager, { allume: false, dit: MANAGER_OFF, releve: "OFF since 2026-10-13T09:25:00.000Z (by chef) — the project switch is off: `brigade <projet> switch on` turns it on — no issue is judged, what it set stays set" });
    // La ligne de la bande dit la même phrase : c'est elle qui fait le signal de la case, dans la barre.
    assert.deepEqual(off.alertes.map(({ sujet: subject, dit: said }) => [subject, said]), [["manager", "project off — nothing new is taken, split or merged"]]);
    assert.equal(off.signal?.dit, MANAGER_OFF);
    const notRead = bandRead().manager;
    assert.ok(notRead !== undefined && "sans" in notRead, JSON.stringify(notRead));
  });
});

describe("l'interrupteur, en tête de l'espace", () => {
  test("éteint : « project off », la ligne de la box au survol, aucune ligne dans la bande, et la tête du rail à l'arrêt d'une ligne", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(outputOfManager(false)));
    await repos();

    assert.equal(vue.element("interrupteur-projet").hidden, false);
    const off = toggle(vue);
    assert.equal(off.role, "switch");
    assert.equal(off.ariaChecked, "false");
    assert.equal(off.dataset.etat, "eteint");
    assert.equal(off.textContent, "project off");
    assert.equal(off.ariaLabel, "the project: off");
    // La ligne brute de la box n'est plus à plat : elle est au survol de l'interrupteur.
    assert.match(off.title, /^OFF since 2026-10-13T09:25:00\.000Z \(by chef\) — the project switch is off/);
    assert.equal(vue.element("alertes").hidden, true);
    assert.doesNotMatch(vue.element("alertes").textContent, /OFF|manager|project/);
    // Le prix n'est pas posé à côté de l'interrupteur.
    assert.doesNotMatch(vue.element("interrupteur-projet").textContent, /judge|backlog|cost/);

    // Éteint, la page le dit en une ligne : la tête du rail.
    const head = headOfRail(vue) ?? assert.fail("la tête du rail n'est pas marquée à l'arrêt");
    // Sa phrase, puis le bouton qui l'allume (#3454).
    assert.equal(head.dessous("strong")[0]?.textContent, "project off — nothing new is taken, split or merged");
    assert.equal(head.textContent, "project off — nothing new is taken, split or mergedswitch the project on…");
    // Elle est en tête du rail : avant ce qui arrive et les colonnes.
    const rail = vue.element("rail").children;
    assert.ok(rail.indexOf(head) < rail.findIndex(({ className }) => className === "colonnes"));
  });

  test("allumé : « project on », et la tête du rail n'est plus marquée ; une bascule lue se voit aussitôt, sans attendre les faits", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(outputOfManager(false)));
    await repos();
    assert.notEqual(headOfRail(vue), undefined);

    vue.dire("surAlertes", bandRead(outputOfManager(true)));
    await repos();
    const lit = toggle(vue);
    assert.equal(lit.ariaChecked, "true");
    assert.equal(lit.dataset.etat, "allume");
    assert.equal(lit.textContent, "project on");
    assert.match(lit.title, /^ON since/);
    assert.equal(headOfRail(vue), undefined);
    assert.equal(vue.element("alertes").hidden, true);
  });

  test("pas encore lu : ni « on » ni « off », et un clic ne bascule rien — ce n'est pas « éteint »", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead());
    await repos();

    const unknown = toggle(vue);
    assert.equal(unknown.ariaChecked, "mixed");
    assert.equal(unknown.disabled, true);
    assert.equal(unknown.textContent, "project …");
    assert.equal(headOfRail(vue), undefined);
    unknown.click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "geste" || action === "confirmer"), []);
  });

  test("allumé, un clic l'éteint : le geste part dans le second, sans confirmation", async () => {
    const vue = await open({ geste: () => undefined });
    vue.dire("surAlertes", bandRead(outputOfManager(true)));
    await repos();

    toggle(vue).click();
    await repos();
    assert.deepEqual(actionsGone(vue), [["parade", "projet-eteindre", undefined]]);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "confirmer"), []);
  });

  test("un geste que le second refuse : le centre le dit en une phrase avec « try again », qui rejoue le même geste — jamais un clic sans message", async () => {
    let calls = 0;
    const vue = await open({ geste: () => (++calls === 1 ? { refus: "the second is busy — the command did not go, and nothing is written: `switch off`" } : undefined) });
    vue.dire("surAlertes", bandRead(outputOfManager(true)));
    await repos();

    toggle(vue).click();
    await repos();
    const note = vue.element("note");
    assert.equal(note.hidden, false);
    assert.match(note.textContent, /^nothing was sent to the second: the second is busy/);
    const still = note.dessous("button").find(({ textContent }) => textContent === "Try again") ?? assert.fail("pas de « Try again »");
    still.click();
    await repos();
    assert.equal(actionsGone(vue).length, 2);
    assert.doesNotMatch(vue.element("note").textContent, /nothing was sent/);
  });

  test("le message d'un geste raté ne suit pas le chef dans un autre espace : ouvrir un projet l'efface", async () => {
    const vue = await open({ geste: () => ({ refus: "the second is busy — nothing is written" }) });
    vue.dire("surAlertes", bandRead(outputOfManager(true)));
    await repos();
    toggle(vue).click();
    await repos();
    assert.match(vue.element("note").textContent, /nothing was sent/);

    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.doesNotMatch(vue.element("note").textContent, /nothing was sent/);
  });

  test("éteint, un clic ouvre la confirmation : une phrase dit ce qu'il va juger, avec le nombre réel d'issues ouvertes — rien ne part avant le « oui »", async () => {
    const backlog = { ouvertes: 23, retenues: 0 };
    const vue = await open({
      confirmer: (_, id) => confirmationOf(id, PARADE, { sans: "pas lus" }, KITCHEN),
      compter: () => ({ projet: "parade", a: A, ...backlog, dit: tell(backlog) }),
      geste: () => undefined,
    });
    vue.dire("surAlertes", bandRead(outputOfManager(false)));
    await repos();

    toggle(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "projet-allumer"]);
    assert.deepEqual(vue.dernier("compter"), ["parade"]);
    assert.deepEqual(actionsGone(vue), []);
    const openOne = confirmation(vue) ?? assert.fail("pas de confirmation sous l'interrupteur");
    assert.equal(toggle(vue).ariaChecked, "false", "la confirmation ouverte ne bascule rien");

    // Le prix : une phrase, et une seule — ce qu'il va juger. Ce qu'allumer engage est au survol.
    const price = openOne.dessous("p").filter(({ className }) => className === "prix" || className === "nombres");
    assert.equal(price.length, 1);
    // Sa phrase, puis le « ? » de son survol.
    assert.equal(price[0]?.textContent, "it will judge the 23 open issues?");
    assert.doesNotMatch(openOne.textContent, /whole open backlog/);
    assert.ok(openOne.dessous("button").some(({ ariaLabel }) => ariaLabel.includes(WARNING)), "ce qu'allumer engage n'est pas au survol");
    // À côté des réponses, rien d'écrit : ce que chacune engage est au survol de son bouton.
    assert.doesNotMatch(openOne.textContent, /taken up right away|nothing goes/);
    const answers = openOne.dessous("button").filter(({ className }) => className !== "aide");
    assert.deepEqual(answers.map(({ textContent, title }) => [textContent, title]), [
      ["yes, switch the project on", "what the manager judges executable is taken up right away, and green deliveries are merged"],
      ["no, leave it off", "nothing goes"],
    ]);

    // « oui » le fait partir, dans le second, et referme la confirmation.
    (openOne.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(actionsGone(vue), [["parade", "projet-allumer", true]]);
    assert.equal(confirmation(vue), undefined);
  });

  test("la phrase compte ce qu'il va vraiment juger : un ticket parqué retient, et rien d'ouvert, c'est rien à juger", () => {
    assert.equal(tell({ ouvertes: 23, retenues: 0 }), "it will judge the 23 open issues");
    assert.equal(tell({ ouvertes: 23, retenues: 2 }), "it will judge 21 of the 23 open issues — 2 are parked");
    assert.equal(tell({ ouvertes: 1, retenues: 0 }), "it will judge the 1 open issue");
    assert.equal(tell({ ouvertes: 4, retenues: 4 }), "it will judge no issue: all 4 open issues are parked");
    assert.equal(tell({ ouvertes: 0, retenues: 0 }), "it will judge no issue: none is open");
  });
});

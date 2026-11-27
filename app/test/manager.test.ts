// L'état du manager, lu dans la sortie de `manager` : allumé ou éteint, depuis
// quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi. Les
// sorties lues ici sont celles que la commande de l'ancien runtime écrivait
// (runtime/src/manager-cli.ts, supprimé avec lui, #4499), jouée sur un vrai journal,
// recopiées telles quelles : la forme que l'app lit est celle que le runtime écrivait. Manager n'est
// plus un onglet (#1700) : sa lecture sert l'amont et les alertes. À côté, les
// deux gestes, qui envoient leur commande dans le second, s'il est dit
// libre (terminals.test.ts) : éteindre, direct ; allumer, confirmé — rien ne part
// sans son « oui » (confirmation.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Reading } from "../src/box.ts";
import { COMMAND, managerOf, see, type Manager } from "../src/manager.ts";
import { commandOf, TABS } from "../src/tabs.ts";
import { SAYS } from "../src/input.ts";
import { openTerminals } from "../src/terminals.ts";

const ROOT = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };

// La sortie de `manager` sur un journal où chaque fait est écrit une minute après le précédent, à partir de 9 h 01 :
// telle que l'ancien runtime l'écrivait.
const OUTPUT = {
  // Allumé par le chef à 9 h 01.
  ON: [
    "manager               ON since 2026-10-13T09:01:00.000Z (by chef) — it judges the open issues, sets `fire` and the calibration",
    "latest decisions      none",
    "set aside             none",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // Allumé par le chef à 9 h 01, éteint par benoit à 9 h 02.
  OFF: [
    "manager               OFF since 2026-10-13T09:02:00.000Z (by benoit) — no issue is judged, what it set stays set",
    "latest decisions      none",
    "set aside             none",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // Un journal vide : jamais allumé.
  NEVER: [
    "manager               OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand",
    "latest decisions      none",
    "set aside             none",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // Allumé, puis #30 jugé et posé sur le rail (haiku / low), #31 refusé (une épique), #32 un jugement illisible.
  DECISIONS: [
    "manager               ON since 2026-10-13T09:01:00.000Z (by chef) — it judges the open issues, sets `fire` and the calibration",
    "latest decisions      ",
    "  2026-10-13T09:05:00.000Z  #32  unreadable judgment — aucun objet JSON dans la réponse",
    "  2026-10-13T09:04:00.000Z  #31  refused (an epic) — Trois livrables.",
    "  2026-10-13T09:02:00.000Z  #30  on the rail, haiku / low (set: fire, effort:low) — Un livrable, un test.",
    "set aside             none",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // Allumé, puis quatre écarts : #1 la roadmap, #31 parqué, #32 servi ailleurs (`fire` posé par le chef), #30 changé par le chef.
  SET_ASIDE: [
    "manager               ON since 2026-10-13T09:01:00.000Z (by chef) — it judges the open issues, sets `fire` and the calibration",
    "latest decisions      ",
    "  2026-10-13T09:05:00.000Z  #30  set aside (`chef-changed`)",
    "  2026-10-13T09:04:00.000Z  #32  set aside (`served-elsewhere`), `fire` set by the chef: left as it is, not calibrated",
    "  2026-10-13T09:03:00.000Z  #31  set aside (`parked`)",
    "  2026-10-13T09:02:00.000Z  #1  set aside (`roadmap`)",
    "set aside             ",
    "  2026-10-13T09:05:00.000Z  #30  you removed `fire` or a calibration the manager had set — to return it to the manager: `brigade <projet> manager return 30`: it rejudges it from scratch",
    "  2026-10-13T09:04:00.000Z  #32  `served-elsewhere` — this ticket is not served on this box; the why is on the issue",
    "  2026-10-13T09:03:00.000Z  #31  it is parked: it waits for someone — the chef when it carries `chef-todo`, else the one its parking comment names — to return it to the manager: answer its card, or remove `parked`: it is judged on the next wake-up",
    "  2026-10-13T09:02:00.000Z  #1  it is the project's roadmap — nothing returns it to the manager",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // #30 écarté (changé par le chef), puis rendu au manager par le chef.
  HANDED_BACK: [
    "manager               OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand",
    "latest decisions      none",
    "set aside             ",
    "  2026-10-13T09:02:00.000Z  #30  returned to the manager, not rejudged yet — it rejudges it on its next wake-up, if it is on",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
  // Allumé, puis #1 écarté : la roadmap.
  ROADMAP: [
    "manager               ON since 2026-10-13T09:01:00.000Z (by chef) — it judges the open issues, sets `fire` and the calibration",
    "latest decisions      ",
    "  2026-10-13T09:02:00.000Z  #1  set aside (`roadmap`)",
    "set aside             ",
    "  2026-10-13T09:02:00.000Z  #1  it is the project's roadmap — nothing returns it to the manager",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ].join("\n") + "\n",
};

// Ce que l'app a lu : le test échoue net si la sortie n'a pas été comprise.
function readOne(output: string): Manager {
  const manager = managerOf(output);
  assert.ok(!("informe" in manager), `la sortie n'a pas été lue : ${"informe" in manager ? manager.informe : ""}\n${output}`);
  return manager;
}

const NO = { dit: "none", lignes: [], illisibles: [] };

const reading = (text: string): Reading => ({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: COMMAND, texte: text }] });

describe("l'état du manager, lu dans la sortie de `manager`", () => {
  test("un manager allumé : il l'est, depuis quand, par qui — et ce que le runtime en dit, mot pour mot", () => {
    assert.deepEqual(readOne(OUTPUT.ON).interrupteur, { allume: true, mot: "ON", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "it judges the open issues, sets `fire` and the calibration" });
  });

  test("un manager éteint : il l'est, depuis quand, par qui — ce qu'il a posé reste posé, et c'est le runtime qui le dit", () => {
    assert.deepEqual(readOne(OUTPUT.OFF).interrupteur, { allume: false, mot: "OFF", depuis: "2026-10-13T09:02:00.000Z", par: "benoit", dit: "no issue is judged, what it set stays set" });
  });

  test("un manager jamais allumé est éteint, sans date ni auteur : l'app n'en invente pas", () => {
    assert.deepEqual(readOne(OUTPUT.NEVER).interrupteur, { allume: false, mot: "OFF", dit: "never turned on: no issue is judged, `fire` and the calibration are set by hand" });
  });

  test("une sortie sans décision : ni décision ni issue écartée, et c'est le mot du runtime qui le dit — « none »", () => {
    const manager = readOne(OUTPUT.ON);

    assert.equal(manager.interrupteur.allume, true);
    assert.deepEqual(manager.decisions, NO);
    assert.deepEqual(manager.ecartees, NO);
  });

  test("ses dernières décisions, la plus récente d'abord : l'instant, le ticket, et ce qu'il en a fait, mot pour mot", () => {
    assert.deepEqual(readOne(OUTPUT.DECISIONS).decisions, {
      dit: "",
      lignes: [
        { a: "2026-10-13T09:05:00.000Z", ticket: 32, dit: "unreadable judgment — aucun objet JSON dans la réponse" },
        { a: "2026-10-13T09:04:00.000Z", ticket: 31, dit: "refused (an epic) — Trois livrables." },
        { a: "2026-10-13T09:02:00.000Z", ticket: 30, dit: "on the rail, haiku / low (set: fire, effort:low) — Un livrable, un test." },
      ],
      illisibles: [],
    });
  });

  test("ce qu'il a écarté : chaque écart avec son motif, et ce qui rend l'issue au manager quand le runtime le dit", () => {
    const { decisions, ecartees } = readOne(OUTPUT.SET_ASIDE);

    assert.deepEqual(ecartees, {
      dit: "",
      lignes: [
        { a: "2026-10-13T09:05:00.000Z", ticket: 30, motif: "you removed `fire` or a calibration the manager had set", rend: "to return it to the manager: `brigade <projet> manager return 30`: it rejudges it from scratch" },
        // Servi ailleurs : le runtime n'en dit que le motif, il n'y a rien à rendre.
        { a: "2026-10-13T09:04:00.000Z", ticket: 32, motif: "`served-elsewhere` — this ticket is not served on this box; the why is on the issue" },
        { a: "2026-10-13T09:03:00.000Z", ticket: 31, motif: "it is parked: it waits for someone — the chef when it carries `chef-todo`, else the one its parking comment names", rend: "to return it to the manager: answer its card, or remove `parked`: it is judged on the next wake-up" },
        { a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "it is the project's roadmap", rend: "nothing returns it to the manager" },
      ],
      illisibles: [],
    });
    // Un écart est aussi une décision : il se lit dans les deux sections, comme le runtime l'écrit.
    assert.deepEqual(decisions?.lignes.map(({ ticket, dit: said }) => [ticket, said]), [
      [30, "set aside (`chef-changed`)"],
      [32, "set aside (`served-elsewhere`), `fire` set by the chef: left as it is, not calibrated"],
      [31, "set aside (`parked`)"],
      [1, "set aside (`roadmap`)"],
    ]);
  });

  test("une issue rendue au manager et pas encore rejugée se lit parmi les écartées, telle que le runtime la dit", () => {
    const ecartees = readOne(OUTPUT.HANDED_BACK).ecartees;

    assert.deepEqual(ecartees?.lignes[0], { a: "2026-10-13T09:02:00.000Z", ticket: 30, motif: "returned to the manager, not rejudged yet — it rejudges it on its next wake-up, if it is on" });
    assert.deepEqual(ecartees?.illisibles, []);
  });

  test("une sortie d'avant #951, en français, se lit encore : mêmes sections, même interrupteur — l'état écrit avant le ticket est appliqué sans édition", () => {
    const output = [
      "manager               ALLUMÉ depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage",
      "dernières décisions   ",
      "  2026-10-13T09:04:00.000Z  #31  écartée (roadmap)",
      "écartées              ",
      "  2026-10-13T09:04:00.000Z  #31  c'est la roadmap du projet — rien ne la rend au manager",
      "  2026-10-13T09:03:00.000Z  #30  tu y as retiré `fire` ou un calibrage que le manager avait posé — pour la lui rendre : `brigade <projet> manager return 30` : il la rejuge à neuf",
      "épiques               aucune",
      "réactions             aucune",
      "",
    ].join("\n");

    assert.deepEqual(readOne(output), {
      interrupteur: { allume: true, mot: "ALLUMÉ", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "il juge les issues ouvertes, pose `fire` et le calibrage" },
      decisions: { dit: "", lignes: [{ a: "2026-10-13T09:04:00.000Z", ticket: 31, dit: "écartée (roadmap)" }], illisibles: [] },
      ecartees: {
        dit: "",
        lignes: [
          { a: "2026-10-13T09:04:00.000Z", ticket: 31, motif: "c'est la roadmap du projet", rend: "rien ne la rend au manager" },
          { a: "2026-10-13T09:03:00.000Z", ticket: 30, motif: "tu y as retiré `fire` ou un calibrage que le manager avait posé", rend: "pour la lui rendre : `brigade <projet> manager return 30` : il la rejuge à neuf" },
        ],
        illisibles: [],
      },
    });
    // Éteint, de même : `ÉTEINT` est éteint.
    assert.equal(readOne("manager               ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main\n").interrupteur.allume, false);
    // Les deux formes ne se mêlent pas : une ligne qui en prend une moitié à chacune n'est lue d'aucune.
    assert.ok("informe" in managerOf("manager               ON depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge\n"));
  });

  test("une ligne qui n'a pas la forme reste telle quelle, à part — un motif sur deux lignes ne fait perdre aucune des décisions qui suivent", () => {
    const output = [
      "manager               ALLUMÉ depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage",
      "dernières décisions   ",
      "  2026-10-13T09:05:00.000Z  #32  refusée (un ticket incomplet) — Il manque un critère.",
      "Et le contexte ne dit pas quel écran.",
      "  2026-10-13T09:04:00.000Z  #31  écartée (roadmap)",
      "  hier  le ticket trente  rien",
      "écartées              ",
      "  2026-10-13T09:04:00.000Z  #31  c'est la roadmap du projet — rien ne la rend au manager",
      "épiques               ",
      "  2026-10-13T09:03:00.000Z  #30  QUESTION POSÉE, attend ta réponse sur l'épique — Quel écran ?",
      "réactions             aucune",
      "",
    ].join("\n");

    assert.deepEqual(readOne(output), {
      interrupteur: { allume: true, mot: "ALLUMÉ", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "il juge les issues ouvertes, pose `fire` et le calibrage" },
      decisions: {
        dit: "",
        lignes: [
          { a: "2026-10-13T09:05:00.000Z", ticket: 32, dit: "refusée (un ticket incomplet) — Il manque un critère." },
          { a: "2026-10-13T09:04:00.000Z", ticket: 31, dit: "écartée (roadmap)" },
        ],
        illisibles: ["Et le contexte ne dit pas quel écran.", "  hier  le ticket trente  rien"],
      },
      // Les épiques et les réactions ne sont pas lues : leurs lignes ne passent pas pour des écarts.
      ecartees: { dit: "", lignes: [{ a: "2026-10-13T09:04:00.000Z", ticket: 31, motif: "c'est la roadmap du projet", rend: "rien ne la rend au manager" }], illisibles: [] },
    });
  });

  test("une sortie qui n'a pas la ligne `manager` n'est pas lue du tout : ce n'est pas « éteint », et l'app dit en quoi", () => {
    assert.deepEqual(managerOf(""), { informe: "it has no `manager` line" });
    assert.deepEqual(managerOf("brigade : ce journal n'a pas encore l'état du manager : redémarrer le runtime, qui le recalcule\n"), { informe: "it has no `manager` line" });
    // Le mot `manager` ailleurs qu'en tête de ligne n'est pas sa ligne.
    assert.deepEqual(managerOf("cuisine    ouverte\n  manager  juge-30-a  depuis 12 s\n"), { informe: "it has no `manager` line" });
    assert.deepEqual(managerOf("manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z\ndernières décisions   aucune\n"), {
      informe: "its `manager` line says neither ON nor OFF (nor the older ALLUMÉ or ÉTEINT) in the expected form: “manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z”",
    });
  });

  test("une section absente n'est pas « aucune » : l'interrupteur se lit, et la section reste sans lecture", () => {
    const manager = readOne("manager               ÉTEINT depuis le 2026-10-13T09:02:00.000Z (par chef) — aucune issue n'est jugée, ce qu'il a posé reste posé\n");

    assert.equal(manager.interrupteur.allume, false);
    assert.equal(manager.decisions, undefined);
    assert.equal(manager.ecartees, undefined);
  });
});

describe("ce que l'app pose de la lecture du manager — l'amont la lit (upstream.ts)", () => {
  test("lu : l'interrupteur, les décisions et les écartées, avec l'heure de la lecture — la vue n'y calcule rien", () => {
    assert.deepEqual(see(reading(OUTPUT.ROADMAP)), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      interrupteur: { allume: true, mot: "ON", ton: "vert", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "it judges the open issues, sets `fire` and the calibration" },
      decisions: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, dit: "set aside (`roadmap`)" }], illisibles: [] },
      ecartees: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "it is the project's roadmap", rend: "nothing returns it to the manager" }], illisibles: [] },
    });
  });

  test("sans décision ni écart, chaque liste dit ce que le runtime en dit, à la place de ses lignes", () => {
    const seenOne = see(reading(OUTPUT.NEVER));

    assert.ok("interrupteur" in seenOne);
    // Éteint n'est pas une alerte : c'est l'état d'un manager que personne n'a allumé.
    assert.equal(seenOne.interrupteur.ton, "gris");
    assert.deepEqual(seenOne.decisions, { lignes: [], illisibles: [], vide: "none" });
    assert.deepEqual(seenOne.ecartees, { lignes: [], illisibles: [], vide: "none" });
  });

  test("une section que la sortie n'a pas se dit « pas lue », jamais « aucune »", () => {
    const seenOne = see(reading("manager               ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main\n"));

    assert.ok("interrupteur" in seenOne);
    assert.deepEqual(seenOne.decisions, { lignes: [], illisibles: [], vide: "not read: the output has no `latest decisions` line. This is not “none” — it is shown below, in full" });
    assert.deepEqual(seenOne.ecartees, { lignes: [], illisibles: [], vide: "not read: the output has no `set aside` line. This is not “none” — it is shown below, in full" });
  });

  test("une lecture ratée ne dit rien du manager : ni allumé, ni éteint — ce que l'app a obtenu se lit dessous", () => {
    const seenOne = see({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", erreur: "$ node geste.ts manager\n→ code de sortie 1", atteinte: false, cas: null });

    assert.deepEqual(seenOne, { projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sans: "the manager's state was not read: what the app got in its place is below. This is not “off”" });
  });

  test("une sortie qui n'a pas la forme ne dit rien du manager non plus, et l'app dit en quoi", () => {
    assert.deepEqual(see(reading("usage : brigade <projet> <commande> [arguments…]\n")), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      sans: "the manager's state was not read in this output: it has no `manager` line. This is not “off” — it is shown below, in full",
    });
    // La lecture d'un autre onglet n'est pas celle du manager.
    assert.ok("sans" in see({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: "rail", texte: "manager               ALLUMÉ depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge\n" }] }));
  });
});

describe("la lecture du manager et ses deux gestes", () => {
  test("la lecture lance `manager`, sans argument : rien n'y est allumé ni éteint — et Manager n'est plus un onglet (#1700)", () => {
    assert.equal(COMMAND, "manager");
    assert.equal(commandOf("manager"), undefined);
    assert.equal(TABS.some(({ id, titre: title }) => id === "manager" || title === "Manager"), false);
  });

  test("le module ne lance rien : il lit une sortie que la veille a déjà rendue", () => {
    const source = readFileSync(join(ROOT, "app/src/manager.ts"), "utf8");

    assert.doesNotMatch(source, /node:child_process|\bimport\(|require\(|execFile|spawn/);
  });
});

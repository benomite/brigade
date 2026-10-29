// L'état du manager, lu dans la sortie de `manager` : allumé ou éteint, depuis
// quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi. Les
// sorties lues ici sont écrites par la commande du runtime elle-même
// (runtime/src/manager-cli.ts), jouée dans ce process sur un vrai journal : la
// forme que l'app lit est tenue contre celle que le runtime écrit. Manager n'est
// plus un onglet (#1700) : sa lecture sert l'amont et les alertes. À côté, les
// deux gestes, qui envoient la commande de la doc dans le second, s'il est dit
// libre (terminaux.test.ts) : éteindre, direct ; allumer, confirmé — rien ne part
// sans son « oui » (confirmation.test.ts).
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import { GESTE, type Lecture } from "../src/box.ts";
import { CONFIRMES, DIRECTS, ecrireGeste, GESTES, SANS_OUI } from "../src/gestes.ts";
import { COMMANDE, managerDe, voir, type Manager } from "../src/manager.ts";
import { commandeDe, ONGLETS } from "../src/onglets.ts";
import { DIT } from "../src/saisie.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const CUISINE = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };

// Un journal, et `manager` jouée dessus comme le geste de la box la joue : sa sortie, telle quelle.
// Chaque fait y est écrit une minute après le précédent, à partir de 9 h 01.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-manager-"));
  let minute = 0;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.UTC(2026, 9, 13, 9, ++minute)) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null, author = "manager") => void journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const sortie = (): string => {
    const lignes: string[] = [];
    void principal({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    return `${lignes.join("\n")}\n`;
  };
  return { noter, sortie };
}

// Ce que l'app a lu : le test échoue net si la sortie n'a pas été comprise.
function lu(sortie: string): Manager {
  const manager = managerDe(sortie);
  assert.ok(!("informe" in manager), `la sortie n'a pas été lue : ${"informe" in manager ? manager.informe : ""}\n${sortie}`);
  return manager;
}

const allumer = { type: "manager.enabled", payload: {} } as const;
const eteindre = { type: "manager.disabled", payload: {} } as const;
const AUCUNE = { dit: "none", lignes: [], illisibles: [] };

const lecture = (texte: string): Lecture => ({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: COMMANDE, texte }] });

describe("l'état du manager, lu dans la sortie de `manager`", () => {
  test("un manager allumé : il l'est, depuis quand, par qui — et ce que le runtime en dit, mot pour mot", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");

    assert.deepEqual(lu(sortie()).interrupteur, { allume: true, mot: "ON", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "it judges the open issues, sets `fire` and the calibration" });
  });

  test("un manager éteint : il l'est, depuis quand, par qui — ce qu'il a posé reste posé, et c'est le runtime qui le dit", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter(eteindre, null, "benoit");

    assert.deepEqual(lu(sortie()).interrupteur, { allume: false, mot: "OFF", depuis: "2026-10-13T09:02:00.000Z", par: "benoit", dit: "no issue is judged, what it set stays set" });
  });

  test("un manager jamais allumé est éteint, sans date ni auteur : l'app n'en invente pas", (t) => {
    const { sortie } = cuisine(t);

    assert.deepEqual(lu(sortie()).interrupteur, { allume: false, mot: "OFF", dit: "never turned on: no issue is judged, `fire` and the calibration are set by hand" });
  });

  test("une sortie sans décision : ni décision ni issue écartée, et c'est le mot du runtime qui le dit — « none »", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");

    const manager = lu(sortie());

    assert.equal(manager.interrupteur.allume, true);
    assert.deepEqual(manager.decisions, AUCUNE);
    assert.deepEqual(manager.ecartees, AUCUNE);
  });

  test("ses dernières décisions, la plus récente d'abord : l'instant, le ticket, et ce qu'il en a fait, mot pour mot", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "Un livrable, un test.", missing: null, model: "haiku", effort: "low", calibration: "Mécanique." } }, 30);
    noter({ type: "manager.labeled", payload: { labels: ["fire", "effort:low"] } }, 30);
    noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: "La découper.", model: null, effort: null, calibration: null } }, 31);
    noter({ type: "manager.failed", payload: { run: "juge-32-a", fingerprint: "e3", reason: "aucun objet JSON dans la réponse" } }, 32);

    assert.deepEqual(lu(sortie()).decisions, {
      dit: "",
      lignes: [
        { a: "2026-10-13T09:05:00.000Z", ticket: 32, dit: "unreadable judgment — aucun objet JSON dans la réponse" },
        { a: "2026-10-13T09:04:00.000Z", ticket: 31, dit: "refused (an epic) — Trois livrables." },
        { a: "2026-10-13T09:02:00.000Z", ticket: 30, dit: "on the rail, haiku / low (set: fire, effort:low) — Un livrable, un test." },
      ],
      illisibles: [],
    });
  });

  test("ce qu'il a écarté : chaque écart avec son motif, et ce qui rend l'issue au manager quand le runtime le dit", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);
    noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 31);
    noter({ type: "manager.set-aside", payload: { reason: "hors-cuisine", fired: true } }, 32);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);

    const { decisions, ecartees } = lu(sortie());

    assert.deepEqual(ecartees, {
      dit: "",
      lignes: [
        { a: "2026-10-13T09:05:00.000Z", ticket: 30, motif: "you removed `fire` or a calibration the manager had set", rend: "to return it to the manager: `brigade <projet> manager return 30`: it rejudges it from scratch" },
        // Servi ailleurs : le runtime n'en dit que le motif, il n'y a rien à rendre.
        { a: "2026-10-13T09:04:00.000Z", ticket: 32, motif: "`hors-cuisine` — this ticket is not served on this box; the why is on the issue" },
        { a: "2026-10-13T09:03:00.000Z", ticket: 31, motif: "it carries `blocked-on-human`", rend: "to return it to the manager: remove `blocked-on-human`: it is judged on the next wake-up" },
        { a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "it is the project's roadmap", rend: "nothing returns it to the manager" },
      ],
      illisibles: [],
    });
    // Un écart est aussi une décision : il se lit dans les deux sections, comme le runtime l'écrit.
    assert.deepEqual(decisions?.lignes.map(({ ticket, dit }) => [ticket, dit]), [
      [30, "set aside (`chef-changed`)"],
      [32, "set aside (`hors-cuisine`), `fire` set by the chef: left as it is, not calibrated"],
      [31, "set aside (`blocked-on-human`)"],
      [1, "set aside (`roadmap`)"],
    ]);
  });

  test("une issue rendue au manager et pas encore rejugée se lit parmi les écartées, telle que le runtime la dit", (t) => {
    const { noter, sortie } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);
    noter({ type: "manager.handed-back", payload: {} }, 30, "chef");

    const ecartees = lu(sortie()).ecartees;

    assert.deepEqual(ecartees?.lignes[0], { a: "2026-10-13T09:02:00.000Z", ticket: 30, motif: "returned to the manager, not rejudged yet — it rejudges it on its next wake-up, if it is on" });
    assert.deepEqual(ecartees?.illisibles, []);
  });

  test("une sortie d'avant #951, en français, se lit encore : mêmes sections, même interrupteur — l'état écrit avant le ticket est appliqué sans édition", () => {
    const sortie = [
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

    assert.deepEqual(lu(sortie), {
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
    assert.equal(lu("manager               ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main\n").interrupteur.allume, false);
    // Les deux formes ne se mêlent pas : une ligne qui en prend une moitié à chacune n'est lue d'aucune.
    assert.ok("informe" in managerDe("manager               ON depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge\n"));
  });

  test("une ligne qui n'a pas la forme reste telle quelle, à part — un motif sur deux lignes ne fait perdre aucune des décisions qui suivent", () => {
    const sortie = [
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

    assert.deepEqual(lu(sortie), {
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
    assert.deepEqual(managerDe(""), { informe: "it has no `manager` line" });
    assert.deepEqual(managerDe("brigade : ce journal n'a pas encore l'état du manager : redémarrer le runtime, qui le recalcule\n"), { informe: "it has no `manager` line" });
    // Le mot `manager` ailleurs qu'en tête de ligne n'est pas sa ligne.
    assert.deepEqual(managerDe("cuisine    ouverte\n  manager  juge-30-a  depuis 12 s\n"), { informe: "it has no `manager` line" });
    assert.deepEqual(managerDe("manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z\ndernières décisions   aucune\n"), {
      informe: "its `manager` line says neither ON nor OFF (nor the older ALLUMÉ or ÉTEINT) in the expected form: “manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z”",
    });
  });

  test("une section absente n'est pas « aucune » : l'interrupteur se lit, et la section reste sans lecture", () => {
    const manager = lu("manager               ÉTEINT depuis le 2026-10-13T09:02:00.000Z (par chef) — aucune issue n'est jugée, ce qu'il a posé reste posé\n");

    assert.equal(manager.interrupteur.allume, false);
    assert.equal(manager.decisions, undefined);
    assert.equal(manager.ecartees, undefined);
  });
});

describe("ce que l'app pose de la lecture du manager — l'amont la lit (amont.ts)", () => {
  test("lu : l'interrupteur, les décisions et les écartées, avec l'heure de la lecture — la vue n'y calcule rien", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);

    assert.deepEqual(voir(lecture(sortie())), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      interrupteur: { allume: true, mot: "ON", ton: "vert", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "it judges the open issues, sets `fire` and the calibration" },
      decisions: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, dit: "set aside (`roadmap`)" }], illisibles: [] },
      ecartees: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "it is the project's roadmap", rend: "nothing returns it to the manager" }], illisibles: [] },
    });
  });

  test("sans décision ni écart, chaque liste dit ce que le runtime en dit, à la place de ses lignes", (t) => {
    const { sortie } = cuisine(t);

    const vu = voir(lecture(sortie()));

    assert.ok("interrupteur" in vu);
    // Éteint n'est pas une alerte : c'est l'état d'un manager que personne n'a allumé.
    assert.equal(vu.interrupteur.ton, "gris");
    assert.deepEqual(vu.decisions, { lignes: [], illisibles: [], vide: "none" });
    assert.deepEqual(vu.ecartees, { lignes: [], illisibles: [], vide: "none" });
  });

  test("une section que la sortie n'a pas se dit « pas lue », jamais « aucune »", () => {
    const vu = voir(lecture("manager               ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main\n"));

    assert.ok("interrupteur" in vu);
    assert.deepEqual(vu.decisions, { lignes: [], illisibles: [], vide: "not read: the output has no `latest decisions` line. This is not “none” — it is shown below, in full" });
    assert.deepEqual(vu.ecartees, { lignes: [], illisibles: [], vide: "not read: the output has no `set aside` line. This is not “none” — it is shown below, in full" });
  });

  test("une lecture ratée ne dit rien du manager : ni allumé, ni éteint — ce que l'app a obtenu se lit dessous", () => {
    const vu = voir({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", erreur: "$ node geste.ts manager\n→ code de sortie 1", atteinte: false, cas: null });

    assert.deepEqual(vu, { projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sans: "the manager's state was not read: what the app got in its place is below. This is not “off”" });
  });

  test("une sortie qui n'a pas la forme ne dit rien du manager non plus, et l'app dit en quoi", () => {
    assert.deepEqual(voir(lecture("usage : brigade <projet> <commande> [arguments…]\n")), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      sans: "the manager's state was not read in this output: it has no `manager` line. This is not “off” — it is shown below, in full",
    });
    // La lecture d'un autre onglet n'est pas celle du manager.
    assert.ok("sans" in voir({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: "rail", texte: "manager               ALLUMÉ depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge\n" }] }));
  });
});

describe("la lecture du manager et ses deux gestes", () => {
  test("la lecture lance `manager`, un script du runtime, sans argument : rien n'y est allumé ni éteint — et Manager n'est plus un onglet (#1700)", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMANDE, "manager");
    assert.ok(COMMANDE in scripts);
    assert.equal(commandeDe("manager"), undefined);
    assert.equal(ONGLETS.some(({ id, titre }) => id === "manager" || titre === "Manager"), false);
  });

  test("le manager n'a plus de geste à lui : l'interrupteur du projet l'allume et l'éteint avec le reste (#1406)", () => {
    assert.equal(GESTES.some(({ id, commande }) => id.startsWith("manager-") || /^manager (?:on|off)$/.test(commande)), false);
    assert.deepEqual(
      GESTES.filter(({ id }) => id.startsWith("projet-")).map(({ id, commande }) => [id, commande]),
      [
        ["projet-allumer", "switch on"],
        ["projet-eteindre", "switch off"],
      ],
    );
  });

  test("« éteindre » le projet, direct, et « allumer », confirmé, envoient la commande de docs/runtime/, « The project switch », dans le second — sans « oui », allumer ne part pas ; d'un second qui démarre, rien ne part, et aucun shell ne s'ouvre", async () => {
    const doc = docRuntime(RACINE);
    const ecrits: string[][] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty() {
        const recus: string[] = [];
        ecrits.push(recus);
        return { ecrire: (donnees) => void recus.push(donnees), redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace(PARADE);

    assert.deepEqual(["projet-allumer", "projet-eteindre"].map((id) => (CONFIRMES.includes(id) ? "confirmé" : DIRECTS.includes(id) ? "direct" : "?")), ["confirmé", "direct"]);
    assert.deepEqual(ecrireGeste(terminaux, "projet-allumer", PARADE, undefined, false, CUISINE), { refus: SANS_OUI });

    const [allumer, eteindre] = await Promise.all([ecrireGeste(terminaux, "projet-allumer", PARADE, undefined, true, CUISINE), ecrireGeste(terminaux, "projet-eteindre", PARADE, undefined, false, CUISINE)]);

    // Le second vient d'être lancé, il n'est pas dit libre : rien n'est écrit, et le refus le dit — avec la commande de la doc.
    assert.deepEqual(allumer, { refus: `${DIT.demarre} — the command did not go, and nothing is written: \`!(cd '/tmp/runtime' && BRIGADE_STATION_DIR='/tmp/station' node ${GESTE} parade switch on)\`` });
    assert.deepEqual(eteindre, { refus: `${DIT.demarre} — the command did not go, and nothing is written: \`!(cd '/tmp/runtime' && BRIGADE_STATION_DIR='/tmp/station' node ${GESTE} parade switch off)\`` });
    assert.deepEqual(ecrits, [[]]);
    // La doc cite la commande deux fois : sur la box (« Driving it »), dans sa forme de poste — ce qui part —, et dans le dépôt (« The project switch »).
    assert.ok(doc.includes("`brigade <projet> switch [on \\| off]`"), "docs/runtime/, « Driving it », ne cite plus la commande de l'interrupteur");
    for (const mot of ["on", "off"]) assert.ok(doc.includes(`npm --prefix runtime run switch -- ${mot}`), `docs/runtime/, « The project switch », ne cite plus \`switch -- ${mot}\``);
  });

  test("le module ne lance rien : il lit une sortie que la veille a déjà rendue", () => {
    const source = readFileSync(join(RACINE, "app/src/manager.ts"), "utf8");

    assert.doesNotMatch(source, /node:child_process|\bimport\(|require\(|execFile|spawn/);
  });
});

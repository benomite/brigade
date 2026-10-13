// L'état du manager, lu dans la sortie de `manager` : allumé ou éteint, depuis
// quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi. Les
// sorties lues ici sont écrites par la commande du runtime elle-même
// (runtime/src/manager-cli.ts), jouée dans ce process sur un vrai journal : la
// forme que l'app lit est tenue contre celle que le runtime écrit. À côté, les
// deux gestes : allumer écrit la commande de la doc dans un shell de l'espace,
// et rien ne l'envoie ; éteindre est direct — la sienne part dans le second,
// s'il est dit libre (terminaux.test.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal } from "../../runtime/src/manager-cli.ts";
import type { Lecture } from "../src/box.ts";
import { DIRECTS, ecrireGeste, GESTES } from "../src/gestes.ts";
import { COMMANDE, GESTES_DU_MANAGER, managerDe, voir, type Manager } from "../src/manager.ts";
import { commandeDe, ONGLETS } from "../src/onglets.ts";
import { DIT } from "../src/saisie.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };

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
const AUCUNE = { dit: "aucune", lignes: [], illisibles: [] };

const lecture = (texte: string): Lecture => ({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: COMMANDE, texte }] });

describe("l'état du manager, lu dans la sortie de `manager`", () => {
  test("un manager allumé : il l'est, depuis quand, par qui — et ce que le runtime en dit, mot pour mot", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");

    assert.deepEqual(lu(sortie()).interrupteur, { allume: true, mot: "ALLUMÉ", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "il juge les issues ouvertes, pose `fire` et le calibrage" });
  });

  test("un manager éteint : il l'est, depuis quand, par qui — ce qu'il a posé reste posé, et c'est le runtime qui le dit", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter(eteindre, null, "benoit");

    assert.deepEqual(lu(sortie()).interrupteur, { allume: false, mot: "ÉTEINT", depuis: "2026-10-13T09:02:00.000Z", par: "benoit", dit: "aucune issue n'est jugée, ce qu'il a posé reste posé" });
  });

  test("un manager jamais allumé est éteint, sans date ni auteur : l'app n'en invente pas", (t) => {
    const { sortie } = cuisine(t);

    assert.deepEqual(lu(sortie()).interrupteur, { allume: false, mot: "ÉTEINT", dit: "jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main" });
  });

  test("une sortie sans décision : ni décision ni issue écartée, et c'est le mot du runtime qui le dit — « aucune »", (t) => {
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
        { a: "2026-10-13T09:05:00.000Z", ticket: 32, dit: "jugement illisible — aucun objet JSON dans la réponse" },
        { a: "2026-10-13T09:04:00.000Z", ticket: 31, dit: "refusée (une épique) — Trois livrables." },
        { a: "2026-10-13T09:02:00.000Z", ticket: 30, dit: "sur le rail, haiku / low (posé : fire, effort:low) — Un livrable, un test." },
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
        { a: "2026-10-13T09:05:00.000Z", ticket: 30, motif: "tu y as retiré `fire` ou un calibrage que le manager avait posé", rend: "pour la lui rendre : `npm --prefix runtime run manager -- rendre 30` : il la rejuge à neuf" },
        // Servi ailleurs : le runtime n'en dit que le motif, il n'y a rien à rendre.
        { a: "2026-10-13T09:04:00.000Z", ticket: 32, motif: "hors-cuisine — ce ticket ne se sert pas sur cette box ; le pourquoi est sur l'issue" },
        { a: "2026-10-13T09:03:00.000Z", ticket: 31, motif: "elle porte `blocked-on-human`", rend: "pour la lui rendre : retire `blocked-on-human` : elle est jugée au réveil suivant" },
        { a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "c'est la roadmap du projet", rend: "rien ne la rend au manager" },
      ],
      illisibles: [],
    });
    // Un écart est aussi une décision : il se lit dans les deux sections, comme le runtime l'écrit.
    assert.deepEqual(decisions?.lignes.map(({ ticket, dit }) => [ticket, dit]), [
      [30, "écartée (chef-changed)"],
      [32, "écartée (hors-cuisine), `fire` posé par le chef : laissé, non calibrée"],
      [31, "écartée (blocked-on-human)"],
      [1, "écartée (roadmap)"],
    ]);
  });

  test("une issue rendue au manager et pas encore rejugée se lit parmi les écartées, telle que le runtime la dit", (t) => {
    const { noter, sortie } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);
    noter({ type: "manager.handed-back", payload: {} }, 30, "chef");

    const ecartees = lu(sortie()).ecartees;

    assert.deepEqual(ecartees?.lignes[0], { a: "2026-10-13T09:02:00.000Z", ticket: 30, motif: "rendue au manager, pas encore rejugée — il la rejuge à son prochain réveil, s'il est allumé" });
    assert.deepEqual(ecartees?.illisibles, []);
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
    assert.deepEqual(managerDe(""), { informe: "elle n'a pas de ligne `manager`" });
    assert.deepEqual(managerDe("brigade : ce journal n'a pas encore l'état du manager : redémarrer le runtime, qui le recalcule\n"), { informe: "elle n'a pas de ligne `manager`" });
    // Le mot `manager` ailleurs qu'en tête de ligne n'est pas sa ligne.
    assert.deepEqual(managerDe("cuisine    ouverte\n  manager  juge-30-a  depuis 12 s\n"), { informe: "elle n'a pas de ligne `manager`" });
    assert.deepEqual(managerDe("manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z\ndernières décisions   aucune\n"), {
      informe: "sa ligne `manager` ne dit ni ALLUMÉ ni ÉTEINT dans la forme attendue : « manager               EN PANNE depuis le 2026-10-13T09:01:00.000Z »",
    });
  });

  test("une section absente n'est pas « aucune » : l'interrupteur se lit, et la section reste sans lecture", () => {
    const manager = lu("manager               ÉTEINT depuis le 2026-10-13T09:02:00.000Z (par chef) — aucune issue n'est jugée, ce qu'il a posé reste posé\n");

    assert.equal(manager.interrupteur.allume, false);
    assert.equal(manager.decisions, undefined);
    assert.equal(manager.ecartees, undefined);
  });
});

describe("ce que l'onglet Manager pose au-dessus du texte", () => {
  test("lu : l'interrupteur, les décisions et les écartées, avec l'heure de la lecture — la vue n'y calcule rien", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(allumer, null, "chef");
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);

    assert.deepEqual(voir(lecture(sortie())), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      interrupteur: { allume: true, mot: "ALLUMÉ", ton: "vert", depuis: "2026-10-13T09:01:00.000Z", par: "chef", dit: "il juge les issues ouvertes, pose `fire` et le calibrage" },
      decisions: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, dit: "écartée (roadmap)" }], illisibles: [] },
      ecartees: { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 1, motif: "c'est la roadmap du projet", rend: "rien ne la rend au manager" }], illisibles: [] },
    });
  });

  test("sans décision ni écart, chaque liste dit ce que le runtime en dit, à la place de ses lignes", (t) => {
    const { sortie } = cuisine(t);

    const vu = voir(lecture(sortie()));

    assert.ok("interrupteur" in vu);
    // Éteint n'est pas une alerte : c'est l'état d'un manager que personne n'a allumé.
    assert.equal(vu.interrupteur.ton, "gris");
    assert.deepEqual(vu.decisions, { lignes: [], illisibles: [], vide: "aucune" });
    assert.deepEqual(vu.ecartees, { lignes: [], illisibles: [], vide: "aucune" });
  });

  test("une section que la sortie n'a pas se dit « pas lue », jamais « aucune »", () => {
    const vu = voir(lecture("manager               ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main\n"));

    assert.ok("interrupteur" in vu);
    assert.deepEqual(vu.decisions, { lignes: [], illisibles: [], vide: "pas lues : la sortie n'a pas de ligne `dernières décisions`. Ce n'est pas « aucune » — elle se lit dessous, entière" });
    assert.deepEqual(vu.ecartees, { lignes: [], illisibles: [], vide: "pas lues : la sortie n'a pas de ligne `écartées`. Ce n'est pas « aucune » — elle se lit dessous, entière" });
  });

  test("une lecture ratée ne dit rien du manager : ni allumé, ni éteint — ce que l'app a obtenu se lit dessous", () => {
    const vu = voir({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", erreur: "$ ssh -- box brigade parade manager\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" });

    assert.deepEqual(vu, { projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sans: "l'état du manager n'a pas été lu : ce que l'app a obtenu à sa place est dessous. Ce n'est pas « éteint »" });
  });

  test("une sortie qui n'a pas la forme ne dit rien du manager non plus, et l'app dit en quoi", () => {
    assert.deepEqual(voir(lecture("usage : brigade <projet> <commande> [arguments…]\n")), {
      projet: "parade",
      demande: 4,
      a: "2026-10-13T10:00:00.000Z",
      sans: "l'état du manager n'a pas été lu dans cette sortie : elle n'a pas de ligne `manager`. Ce n'est pas « éteint » — elle se lit dessous, entière",
    });
    // La lecture d'un autre onglet n'est pas celle du manager.
    assert.ok("sans" in voir({ projet: "parade", demande: 4, a: "2026-10-13T10:00:00.000Z", sorties: [{ commande: "rail", texte: "manager               ALLUMÉ depuis le 2026-10-13T09:01:00.000Z (par chef) — il juge\n" }] }));
  });
});

describe("l'onglet Manager et ses deux gestes", () => {
  test("l'onglet relaie `manager`, un script du runtime, sans argument : rien n'y est allumé ni éteint par la lecture", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMANDE, "manager");
    assert.ok(COMMANDE in scripts);
    assert.equal(commandeDe("manager"), COMMANDE);
    assert.equal(ONGLETS.find(({ id }) => id === "manager")?.titre, "Manager");
  });

  test("« allumer » et « éteindre » sont deux gestes du socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(GESTES_DU_MANAGER, [
      { id: "manager-allumer", libelle: "allumer" },
      { id: "manager-eteindre", libelle: "éteindre" },
    ]);
    for (const { id } of GESTES_DU_MANAGER) assert.ok(GESTES.some((geste) => geste.id === id), `« ${id} » n'est pas un geste du socle`);
  });

  test("« allumer » écrit la commande de docs/runtime.md, « Le manager », dans un shell de l'espace — sans Entrée : rien ne l'envoie ; « éteindre », direct, n'ouvre aucun shell — et d'un second qui démarre, rien ne part", async () => {
    const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");
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

    const [allumer, eteindre] = await Promise.all(GESTES_DU_MANAGER.map(({ id }) => ecrireGeste(terminaux, id, PARADE)));

    // Le second n'a rien reçu ; « allumer » a son shell, et dedans sa commande seule.
    assert.deepEqual(ecrits, [[], ["ssh box brigade parade manager allumer"]]);
    // « éteindre » seul est direct : le second vient d'être lancé, il n'est pas dit libre — rien n'est écrit, et le refus le dit.
    assert.deepEqual(GESTES_DU_MANAGER.map(({ id }) => DIRECTS.includes(id)), [false, true]);
    assert.deepEqual(eteindre, { refus: `${DIT.demarre} — la commande n'est pas partie, et rien n'est écrit : \`!ssh box brigade parade manager eteindre\`` });
    // La doc cite la commande deux fois : dans le dépôt (« Le manager »), et sur la box (« Piloter ») — celle-ci, dans sa forme de poste, est ce qui s'écrit.
    assert.ok(doc.includes("`brigade <projet> manager [allumer \\| eteindre \\| rendre <n°> \\| backlog]`"), "docs/runtime.md, « Piloter », ne cite plus la commande du manager");
    for (const mot of ["allumer", "eteindre"]) assert.ok(doc.includes(`npm --prefix runtime run manager -- ${mot}`), `docs/runtime.md, « Le manager », ne cite plus \`manager -- ${mot}\``);
    assert.ok(allumer !== undefined && "note" in allumer);
    assert.equal(allumer.genre, "shell");
    assert.ok(allumer.note.startsWith("écrit dans ce shell, sans Entrée : `ssh box brigade parade manager allumer` — c'est la tienne qui l'envoie."));
    for (const recus of ecrits) for (const ecrit of recus) assert.doesNotMatch(ecrit, /[\x00-\x1f\x7f]/);
  });

  test("le module ne lance rien : il lit une sortie que la veille a déjà rendue", () => {
    const source = readFileSync(join(RACINE, "app/src/manager.ts"), "utf8");

    assert.doesNotMatch(source, /node:child_process|\bimport\(|require\(|execFile|spawn/);
  });
});

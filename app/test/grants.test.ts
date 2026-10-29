// L'état des grants, lu dans la sortie de `grant` : lequel est actif, son
// échéance — la durée restante d'abord, l'heure ensuite —, ses derniers usages,
// et ce qu'aucun grant n'autorise. Les sorties lues ici sont écrites par la
// commande du runtime elle-même (runtime/src/grant-cli.ts), jouée dans ce
// process sur un vrai journal, à une heure que le test fixe : la forme que l'app
// lit est tenue contre celle que le runtime écrit. À côté, les deux gestes de
// chaque grant — accorder, révoquer — sont confirmés : la commande de la doc
// part dans le second, seulement avec le « oui » du chef.
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { principal } from "../../runtime/src/grant-cli.ts";
import { JAMAIS_ACCORDEES } from "../../runtime/src/grant.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { GESTE, type Cuisine, type Lecture } from "../src/box.ts";
import { CONFIRMES, ecrireGeste, GESTES, GRANTS, SANS_OUI } from "../src/gestes.ts";
import { DIT } from "../src/saisie.ts";
import { COMMANDE, GESTES_DES_GRANTS, grantsDe, voir, type Grants } from "../src/grants.ts";
import { commandeDe, ONGLETS } from "../src/onglets.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const CUISINE: Cuisine = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
// L'heure à laquelle `grant` est jouée, sauf mention : celle de la box, en UTC.
const A_16H30 = "2026-10-13T16:30:00.000Z";

// Un journal, et `grant` jouée dessus comme le geste de la box la joue : sa sortie, telle quelle.
// Chaque fait y est écrit une minute après le précédent, à partir de 9 h 01 ; la commande,
// elle, lit l'horloge — fixée pour elle, le temps de son appel, à l'heure que le test donne.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-grants-"));
  let minute = 0;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.UTC(2026, 9, 13, 9, ++minute)) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null = null, author = "chef") => void journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const sortie = (a = A_16H30): string => {
    const lignes: string[] = [];
    t.mock.timers.enable({ apis: ["Date"], now: new Date(a) });
    try {
      void principal({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    } finally {
      t.mock.timers.reset();
    }
    return `${lignes.join("\n")}\n`;
  };
  return { noter, sortie };
}

// Ce que l'app a lu : le test échoue net si la sortie n'a pas été comprise.
function lu(sortie: string): Grants {
  const grants = grantsDe(sortie);
  assert.ok(!("informe" in grants), `la sortie n'a pas été lue : ${"informe" in grants ? grants.informe : ""}\n${sortie}`);
  return grants;
}

const accorder = (payload: { until?: string; uses?: number } = {}) => ({ type: "grant.activated", payload: { action: "merge", ...payload } }) as const;
const revoquer = { type: "grant.revoked", payload: { action: "merge" } } as const;
const user = (numero: number, sha: string, verdict: number) => ({ type: "grant.used", payload: { action: "merge", pr: `https://github.com/benomite/brigade/pull/${numero}`, number: numero, sha, base: "v2", verdict } }) as const;
const AUCUN = { dit: "none", lignes: [], illisibles: [] };
const INTERDITS = [
  { action: "identifiants-max", dit: "read the Max account credentials" },
  { action: "acces-prod", dit: "any action on a project's production" },
];

// Ce qu'écrivait une box d'avant #950 : les mêmes lignes, en français.
const INTERDITS_FR = [
  { action: "identifiants-max", dit: "lire les identifiants du compte Max" },
  { action: "acces-prod", dit: "toute action sur la production d'un projet" },
];

const lecture = (texte: string): Lecture => ({ projet: "parade", demande: 4, a: "2026-10-13T16:30:02.000Z", sorties: [{ commande: COMMANDE, texte }] });

// Une box peut ne pas être à jour : `grant` y écrit encore le français. L'app lit les deux,
// et le même état donne la même structure — les mots du runtime restent ceux qu'il a écrits.
describe("la double lecture : la sortie de `grant` en anglais, et l'ancienne en français", () => {
  const anglais = [
    "grant merge           ACTIVE since 2026-10-13T09:01:00.000Z (by chef) — EXPIRING SOON — 30 min left (until 13 Oct 17:00 UTC) · 2 uses left, of which 1 held by a merge under way: a green pass is merged without you",
    "never granted         identifiants-max — read the Max account credentials",
    "                      acces-prod — any action on a project's production",
    "latest actions        ",
    "  2026-10-13T09:01:00.000Z  merge  enabled until 13 Oct 17:00 UTC · for 2 uses  (chef)",
    "latest uses           ",
    "  2026-10-13T09:04:00.000Z  #19  merge on v2  https://github.com/benomite/brigade/pull/54  9c2d4e1  verdict no. 14  merge under way",
    "without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open",
    "",
  ].join("\n");
  const francais = [
    "grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — BIENTÔT ÉTEINT — encore 30 min (jusqu'au 13 oct. 17:00 UTC) · encore 2 usages, dont 1 retenu par un merge en cours : une pass verte est mergée sans toi",
    "jamais accordé        identifiants-max — lire les identifiants du compte Max",
    "                      acces-prod — toute action sur la production d'un projet",
    "derniers gestes       ",
    "  2026-10-13T09:01:00.000Z  merge  accordé jusqu'au 13 oct. 17:00 UTC · pour 2 usages  (chef)",
    "derniers usages       ",
    "  2026-10-13T09:04:00.000Z  #19  merge sur v2  https://github.com/benomite/brigade/pull/54  9c2d4e1  verdict n° 14  merge en cours",
    "sans grant, 1 livraison verte arrêtée : 0 mergée à la main, 0 fermée sans merge — aucun désaccord —, 1 encore ouverte",
    "",
  ].join("\n");

  test("un grant actif qui va s'éteindre se lit de même dans les deux langues : état, auteur, échéance, usages, interdits, bilan", () => {
    for (const [sortie, mots] of [
      [anglais, { mot: "ACTIVE", bientot: "EXPIRING SOON", reste: "30 min left", jusqua: "until 13 Oct 17:00 UTC", limite: "2 uses left, of which 1 held by a merge under way", dit: "a green pass is merged without you", verdict: "verdict no. 14", suite: "merge under way" }],
      [francais, { mot: "ACTIF", bientot: "BIENTÔT ÉTEINT", reste: "encore 30 min", jusqua: "jusqu'au 13 oct. 17:00 UTC", limite: "encore 2 usages, dont 1 retenu par un merge en cours", dit: "une pass verte est mergée sans toi", verdict: "verdict n° 14", suite: "merge en cours" }],
    ] as const) {
      const lus = lu(sortie);
      assert.deepEqual(lus.grants, [
        { action: "merge", actif: true, mot: mots.mot, depuis: "2026-10-13T09:01:00.000Z", par: "chef", bientot: mots.bientot, echeance: { reste: mots.reste, jusqua: mots.jusqua }, limites: [mots.limite], dit: mots.dit },
      ]);
      assert.deepEqual(lus.usages?.lignes, [{ a: "2026-10-13T09:04:00.000Z", ticket: 19, action: "merge", base: "v2", pr: "https://github.com/benomite/brigade/pull/54", commit: "9c2d4e1", verdict: mots.verdict, suite: mots.suite }]);
      assert.equal(lus.interdits?.lignes.length, 2);
      assert.equal(lus.bilan?.slice(0, 12), sortie === anglais ? "without a gr" : "sans grant, ");
    }
  });

  test("les états éteint seul et révoqué, et le titre d'une section, se lisent dans les deux langues", () => {
    const etats = (...lignes: string[]) => lu(`${lignes.join("\n")}\n`).grants.map((grant) => ("mot" in grant ? [grant.mot, grant.actif, grant.depuis, grant.par] : grant.informe));
    assert.deepEqual(etats("grant merge           LAPSED since 2026-10-13T12:00:00.000Z — its deadline has passed (enabled by chef): the pass stops at the open PR"), [["LAPSED", false, "2026-10-13T12:00:00.000Z", undefined]]);
    assert.deepEqual(etats("grant merge           ÉTEINT SEUL depuis le 2026-10-13T12:00:00.000Z — son échéance est passée (accordé par chef) : la pass s'arrête à la PR ouverte"), [["ÉTEINT SEUL", false, "2026-10-13T12:00:00.000Z", undefined]]);
    assert.deepEqual(etats("grant merge           REVOKED since 2026-10-13T09:02:00.000Z (by benoit) — the pass stops at the open PR"), [["REVOKED", false, "2026-10-13T09:02:00.000Z", "benoit"]]);
    assert.deepEqual(etats("grant merge           RÉVOQUÉ depuis le 2026-10-13T09:02:00.000Z (par benoit) — la pass s'arrête à la PR ouverte"), [["RÉVOQUÉ", false, "2026-10-13T09:02:00.000Z", "benoit"]]);
    // Une section « aucun » : le mot est celui de la box.
    assert.equal(lu("grant merge           ABSENT — never given: x\nlatest uses           none\n").usages?.dit, "none");
    assert.equal(lu("grant merge           ABSENT — jamais donné : x\nderniers usages       aucun\n").usages?.dit, "aucun");
  });

  test("l'onglet colore de même un grant vu en français ou en anglais", () => {
    const ton = (sortie: string) => {
      const vu = voir(lecture(sortie));
      assert.ok("grants" in vu);
      const [grant] = vu.grants;
      assert.ok(grant !== undefined && "ton" in grant);
      return grant.ton;
    };
    assert.deepEqual([ton(anglais), ton(francais)], ["jaune", "jaune"]);
    assert.equal(ton(anglais.replace("EXPIRING SOON — ", "")), "vert");
    assert.equal(ton(francais.replace("BIENTÔT ÉTEINT — ", "")), "vert");
    assert.equal(ton("grant merge           LAPSED since 2026-10-13T12:00:00.000Z — x: y\n"), "jaune");
    assert.equal(ton("grant merge           REVOKED since 2026-10-13T12:00:00.000Z (by chef) — x\n"), "gris");
  });
});

describe("l'état des grants, lu dans la sortie de `grant`", () => {
  test("un grant actif avec une échéance : il l'est, depuis quand, par qui — et de son échéance, la durée restante d'abord, l'heure ensuite", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-13T18:40:00.000Z" }));

    assert.deepEqual(lu(sortie()).grants, [
      {
        action: "merge",
        actif: true,
        mot: "ACTIVE",
        depuis: "2026-10-13T09:01:00.000Z",
        par: "chef",
        echeance: { reste: "2 h 10 left", jusqua: "until 13 Oct 18:40 UTC" },
        limites: [],
        dit: "a green pass is merged without you",
      },
    ]);
  });

  test("la durée restante est celle que la box a comptée à l'heure de la lecture : l'app n'en recalcule aucune", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-20T12:00:00.000Z" }));

    const dans = (a: string) => {
      const [grant] = lu(sortie(a)).grants;
      assert.ok(grant !== undefined && "echeance" in grant);
      return grant.echeance;
    };

    assert.deepEqual(dans(A_16H30), { reste: "6 d left", jusqua: "until 20 Oct 12:00 UTC" });
    assert.deepEqual(dans("2026-10-19T09:15:00.000Z"), { reste: "26 h 45 left", jusqua: "until 20 Oct 12:00 UTC" });
  });

  test("un grant actif sans échéance : c'est le runtime qui le dit, et l'app ne lui en prête aucune", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());

    assert.deepEqual(lu(sortie()).grants, [{ action: "merge", actif: true, mot: "ACTIVE", depuis: "2026-10-13T09:01:00.000Z", par: "chef", limites: ["no deadline"], dit: "a green pass is merged without you" }]);
  });

  test("un grant compté en usages : ce qu'il en reste se lit mot pour mot, à côté de l'échéance", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-13T18:40:00.000Z", uses: 10 }));
    noter(user(53, "4be1f07aaaaaaaaaa", 12), 18, "pass");

    const [grant] = lu(sortie()).grants;

    assert.ok(grant !== undefined && "mot" in grant);
    assert.deepEqual(grant.echeance, { reste: "2 h 10 left", jusqua: "until 13 Oct 18:40 UTC" });
    assert.deepEqual(grant.limites, ["10 uses left, of which 1 held by a merge under way"]);
  });

  test("un grant qui va s'éteindre : le runtime le dit `EXPIRING SOON`, et l'app le pose avec son mot", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-13T17:00:00.000Z" }));

    const [grant] = lu(sortie()).grants;

    assert.ok(grant !== undefined && "mot" in grant);
    assert.equal(grant.actif, true);
    assert.equal(grant.bientot, "EXPIRING SOON");
    assert.deepEqual(grant.echeance, { reste: "30 min left", jusqua: "until 13 Oct 17:00 UTC" });
  });

  test("sans grant actif — jamais donné : il est absent, sans date ni auteur, et rien ne lui reste", (t) => {
    const { noter, sortie } = cuisine(t);
    // Un journal qui n'a jamais vu de grant : il a d'autres faits, pas celui-là.
    noter({ type: "manager.enabled", payload: {} });

    assert.deepEqual(lu(sortie()).grants, [{ action: "merge", actif: false, mot: "ABSENT", limites: [], dit: "never given: the pass stops at the open PR, nothing is merged" }]);
  });

  test("sans grant actif — révoqué : il ne l'est plus, depuis quand et par qui", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());
    noter(revoquer, null, "benoit");

    assert.deepEqual(lu(sortie()).grants, [{ action: "merge", actif: false, mot: "REVOKED", depuis: "2026-10-13T09:02:00.000Z", par: "benoit", limites: [], dit: "the pass stops at the open PR" }]);
  });

  test("une échéance dépassée : le grant n'est plus actif, il s'est éteint seul à son échéance — et aucune durée ne lui reste", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-13T12:00:00.000Z" }));

    // À 11 h 30, il vaut encore ; à 16 h 30, son heure est passée — que le journal le dise ou non.
    const [avant] = lu(sortie("2026-10-13T11:30:00.000Z")).grants;
    const [apres] = lu(sortie()).grants;

    assert.ok(avant !== undefined && "mot" in avant);
    assert.equal(avant.actif, true);
    assert.deepEqual(avant.echeance, { reste: "30 min left", jusqua: "until 13 Oct 12:00 UTC" });
    assert.deepEqual(apres, {
      action: "merge",
      actif: false,
      mot: "LAPSED",
      depuis: "2026-10-13T12:00:00.000Z",
      limites: [],
      dit: "its deadline has passed (enabled by chef): the pass stops at the open PR (the runtime will write it to the log on its next pass)",
    });

    // Constatée et écrite au journal, l'extinction se lit de même.
    noter({ type: "grant.expired", payload: { action: "merge", cause: "until", since: "2026-10-13T12:00:00.000Z" } }, null, "runtime");
    const [ecrite] = lu(sortie()).grants;
    assert.deepEqual(ecrite, { action: "merge", actif: false, mot: "LAPSED", depuis: "2026-10-13T12:00:00.000Z", limites: [], dit: "its deadline has passed (enabled by chef): the pass stops at the open PR" });
  });

  test("ses derniers usages, le plus récent d'abord : l'issue, la PR, le commit, le verdict, et ce que le merge est devenu", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());
    noter(user(53, "4be1f07aaaaaaaaaa", 12), 18, "pass");
    noter({ type: "merge.done", payload: { pr: "https://github.com/benomite/brigade/pull/53", sha: "4be1f07aaaaaaaaaa", by: "pass", reconciled: false } }, 18, "pass");
    noter(user(54, "9c2d4e1bbbbbbbbbb", 14), 19, "pass");

    assert.deepEqual(lu(sortie()).usages, {
      dit: "",
      lignes: [
        { a: "2026-10-13T09:04:00.000Z", ticket: 19, action: "merge", base: "v2", pr: "https://github.com/benomite/brigade/pull/54", commit: "9c2d4e1", verdict: "verdict no. 14", suite: "merge under way" },
        { a: "2026-10-13T09:02:00.000Z", ticket: 18, action: "merge", base: "v2", pr: "https://github.com/benomite/brigade/pull/53", commit: "4be1f07", verdict: "verdict no. 12", suite: "merged" },
      ],
      illisibles: [],
    });
  });

  test("un grant qui n'a jamais servi : aucun usage, et c'est le mot du runtime qui le dit — « aucun »", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());

    assert.deepEqual(lu(sortie()).usages, AUCUN);
  });

  test("ce qu'aucun grant n'autorise : la liste du runtime, action par action, mot pour mot", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());
    // Une demande refusée s'écrit dans les derniers gestes : elle n'ajoute rien à la liste, et n'en retire rien.
    noter({ type: "grant.refused", payload: { action: "acces-prod", line: "any action on a project's production" } });

    const { interdits } = lu(sortie());

    assert.deepEqual(interdits, { dit: "", lignes: INTERDITS, illisibles: [] });
    assert.deepEqual(interdits?.lignes, JAMAIS_ACCORDEES.map(({ action, ligne }) => ({ action, dit: ligne })));
  });

  test("le bilan des arrêts faute de grant, quand la sortie le porte, se lit tel quel — il n'est pris pour aucun usage", (t) => {
    const { noter, sortie } = cuisine(t);
    noter({ type: "pass.started", payload: { run: "cook-18-a", pr: null, number: null, sha: "4be1f07aaaaaaaaaa" } }, 18, "pass");
    noter({ type: "pass.pr-opened", payload: { pr: "https://github.com/benomite/brigade/pull/53", number: 53, reconciled: false } }, 18, "pass");
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 18, "pass");

    const grants = lu(sortie());

    assert.equal(grants.bilan, "without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open");
    assert.deepEqual(grants.usages, AUCUN);
  });

  test("une ligne qui n'a pas la forme reste telle quelle, à part — elle ne fait perdre aucun des usages qui suivent", () => {
    const sortie = [
      "grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — sans échéance : une pass verte est mergée sans toi",
      "jamais accordé        identifiants-max — lire les identifiants du compte Max",
      "                      acces-prod — toute action sur la production d'un projet",
      "                      une ligne sans son tiret",
      "derniers gestes       ",
      "  2026-10-13T09:01:00.000Z  merge  accordé sans échéance  (chef)",
      "derniers usages       ",
      "  2026-10-13T09:04:00.000Z  #19  merge sur v2  https://github.com/benomite/brigade/pull/54  9c2d4e1  verdict n° 14  mergée",
      "  un usage dans une forme d'après",
      // Un usage d'un grant dont la sortie n'a pas la ligne ne se rattache à rien.
      "  2026-10-13T09:03:00.000Z  #20  deploy sur v2  https://github.com/benomite/brigade/pull/55  1111111  verdict n° 13  mergée",
      "  2026-10-13T09:02:00.000Z  #18  merge sur v2  https://github.com/benomite/brigade/pull/53  4be1f07  verdict n° 12  non mergée",
      "",
    ].join("\n");

    const { interdits, usages } = lu(sortie);

    assert.deepEqual(interdits, { dit: "", lignes: INTERDITS_FR, illisibles: ["                      une ligne sans son tiret"] });
    assert.deepEqual(usages?.lignes.map(({ ticket, suite }) => [ticket, suite]), [
      [19, "mergée"],
      [18, "non mergée"],
    ]);
    assert.deepEqual(usages?.illisibles, ["  un usage dans une forme d'après", "  2026-10-13T09:03:00.000Z  #20  deploy sur v2  https://github.com/benomite/brigade/pull/55  1111111  verdict n° 13  mergée"]);
  });

  test("un état que l'app ne connaît pas n'est pas « absent » : le grant est nommé, et sa ligne reste telle quelle", () => {
    const ligne = "grant merge           SUSPENDU depuis le 2026-10-13T09:01:00.000Z (par chef) — la pass attend";

    assert.deepEqual(lu(`${ligne}\nderniers usages       aucun\n`).grants, [{ action: "merge", informe: ligne }]);
  });

  test("un grant actif dont le reste n'a pas la forme : il est actif, et ce que la ligne en dit se lit entier — aucune échéance n'en est tirée", () => {
    const [grant] = lu("grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — jusqu'à nouvel ordre\n").grants;

    assert.deepEqual(grant, { action: "merge", actif: true, mot: "ACTIF", depuis: "2026-10-13T09:01:00.000Z", par: "chef", limites: ["jusqu'à nouvel ordre"], dit: "" });
  });

  test("une sortie qui n'a aucune ligne `grant <nom>` n'est pas lue du tout : ce n'est pas « absent », et l'app dit en quoi", () => {
    for (const sortie of ["", "brigade : ce journal n'a pas encore l'état des grants : redémarrer le runtime, qui le recalcule\n", "manager               ÉTEINT — jamais allumé\n", "derniers usages       aucun\n"]) {
      assert.deepEqual(grantsDe(sortie), { informe: "it has no `grant <name>` line" });
    }
  });

  test("une section absente n'est pas « aucun » : l'état du grant se lit, et la section reste sans lecture", () => {
    const grants = lu("grant merge           RÉVOQUÉ depuis le 2026-10-13T09:02:00.000Z (par benoit) — la pass s'arrête à la PR ouverte\n");

    assert.equal(grants.grants.length, 1);
    assert.equal(grants.usages, undefined);
    assert.equal(grants.interdits, undefined);
    assert.equal(grants.bilan, undefined);
  });
});

describe("ce que l'onglet Grants pose au-dessus du texte", () => {
  test("lu, un grant actif : sa pastille, son échéance — la durée restante en tête —, ses usages à lui, ce qu'aucun grant n'autorise, et l'heure de la lecture", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder({ until: "2026-10-13T18:40:00.000Z" }));
    noter(user(53, "4be1f07aaaaaaaaaa", 12), 18, "pass");

    const vu = voir(lecture(sortie()));

    assert.ok("grants" in vu);
    assert.deepEqual([vu.projet, vu.demande, vu.a], ["parade", 4, "2026-10-13T16:30:02.000Z"]);
    const [grant] = vu.grants;
    assert.ok(grant !== undefined && "mot" in grant);
    assert.deepEqual([grant.action, grant.mot, grant.ton, grant.commandable], ["merge", "ACTIVE", "vert", true]);
    // L'échéance, dans l'ordre où elle se pose : ce qu'il reste, puis jusqu'à quand.
    assert.deepEqual(Object.entries(grant.echeance ?? {}), [
      ["reste", "2 h 10 left"],
      ["jusqua", "until 13 Oct 18:40 UTC"],
    ]);
    assert.deepEqual(grant.usages, { lignes: [{ a: "2026-10-13T09:02:00.000Z", ticket: 18, action: "merge", base: "v2", pr: "https://github.com/benomite/brigade/pull/53", commit: "4be1f07", verdict: "verdict no. 12", suite: "merge under way" }], illisibles: [] });
    assert.deepEqual(vu.interdits, { lignes: INTERDITS, illisibles: [] });
    assert.equal(vu.bilan, undefined);
  });

  test("la couleur suit ce que le runtime dit : vert actif, jaune bientôt éteint ou éteint seul, gris absent ou révoqué", (t) => {
    const ton = (noter: (journal: ReturnType<typeof cuisine>["noter"]) => void) => {
      const { noter: ecrire, sortie } = cuisine(t);
      noter(ecrire);
      const vu = voir(lecture(sortie()));
      assert.ok("grants" in vu);
      const [grant] = vu.grants;
      assert.ok(grant !== undefined && "mot" in grant);
      return [grant.mot, grant.ton];
    };

    assert.deepEqual(ton((noter) => noter(accorder())), ["ACTIVE", "vert"]);
    assert.deepEqual(ton((noter) => noter(accorder({ until: "2026-10-13T17:00:00.000Z" }))), ["ACTIVE", "jaune"]);
    assert.deepEqual(ton((noter) => noter(accorder({ until: "2026-10-13T12:00:00.000Z" }))), ["LAPSED", "jaune"]);
    assert.deepEqual(ton((noter) => noter({ type: "manager.enabled", payload: {} })), ["ABSENT", "gris"]);
    assert.deepEqual(
      ton((noter) => {
        noter(accorder());
        noter(revoquer);
      }),
      ["REVOKED", "gris"],
    );
  });

  test("sans usage, la liste du grant dit ce que le runtime en dit, à la place de ses lignes", (t) => {
    const { noter, sortie } = cuisine(t);
    noter(accorder());

    const vu = voir(lecture(sortie()));

    assert.ok("grants" in vu);
    assert.deepEqual(vu.grants.map((grant) => grant.usages), [{ lignes: [], illisibles: [], vide: "none" }]);
  });

  test("une section que la sortie n'a pas se dit « pas lue », jamais « aucun »", () => {
    const vu = voir(lecture("grant merge           RÉVOQUÉ depuis le 2026-10-13T09:02:00.000Z (par benoit) — la pass s'arrête à la PR ouverte\n"));

    assert.ok("grants" in vu);
    assert.match(vu.grants[0]?.usages.vide ?? "", /^not read: the output has no `latest uses` line\. This is not “none”/);
    assert.match(vu.interdits.vide ?? "", /^not read: the output has no `never granted` line\. This is not “nothing”/);
  });

  test("des usages que l'app n'a pas su lire ne font pas dire « aucun » au grant : ils restent à part, tels quels", () => {
    const tete = "grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — sans échéance : une pass verte est mergée sans toi";
    const forme = "  2026-10-13T09:04:00.000Z  #19  merge → v2  mergée";

    const vu = voir(lecture(`${tete}\nderniers usages       \n${forme}\n`));

    assert.ok("grants" in vu);
    assert.deepEqual(vu.grants[0]?.usages, { lignes: [], illisibles: [], vide: "not read: none of the lines under `latest uses` has the expected form. This is not “none” — they are shown further down, as they are" });
    assert.deepEqual(vu.illisibles, [forme]);
  });

  test("un grant sans usage parmi ceux d'un autre le dit, sans prendre les siens", () => {
    const vu = voir(
      lecture(
        [
          "grant deploy          ABSENT — jamais donné : rien n'est déployé",
          "grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — sans échéance : une pass verte est mergée sans toi",
          "derniers usages       ",
          "  2026-10-13T09:04:00.000Z  #19  merge sur v2  https://github.com/benomite/brigade/pull/54  9c2d4e1  verdict n° 14  mergée",
          "",
        ].join("\n"),
      ),
    );

    assert.ok("grants" in vu);
    assert.deepEqual(vu.grants.map(({ action, usages }) => [action, usages.lignes.map(({ ticket }) => ticket), usages.vide]), [
      ["deploy", [], "none among the 1 latest uses the output lists"],
      ["merge", [19], undefined],
    ]);
  });

  test("un état que l'app ne connaît pas se dit tel, avec sa ligne : ni actif, ni absent — et ses gestes restent", () => {
    const ligne = "grant merge           SUSPENDU depuis le 2026-10-13T09:01:00.000Z (par chef) — la pass attend";

    const vu = voir(lecture(`${ligne}\nderniers usages       aucun\n`));

    assert.ok("grants" in vu);
    const [grant] = vu.grants;
    assert.ok(grant !== undefined && "sans" in grant);
    assert.equal(grant.sans, `this grant's state was not read: its line does not have the expected form. This is neither “active” nor “absent” — “${ligne}”`);
    assert.equal(grant.commandable, true);
  });

  test("un grant que la doc ne nomme pas se lit, mais n'a pas de geste : le socle n'écrirait rien pour lui", () => {
    const vu = voir(lecture("grant deploy          ABSENT — jamais donné : rien n'est déployé\ngrant merge           ABSENT — jamais donné : la pass s'arrête à la PR ouverte, rien n'est mergé\n"));

    assert.ok("grants" in vu);
    assert.deepEqual(vu.grants.map(({ action, commandable }) => [action, commandable]), [
      ["deploy", false],
      ["merge", true],
    ]);
  });

  test("une lecture ratée ne dit rien des grants : ni actif, ni absent — ce que l'app a obtenu se lit dessous", () => {
    const vu = voir({ projet: "parade", demande: 4, a: "2026-10-13T16:30:02.000Z", erreur: "$ brigade parade grant\n→ code de sortie 1", atteinte: false, cas: null });

    assert.deepEqual(vu, { projet: "parade", demande: 4, a: "2026-10-13T16:30:02.000Z", sans: "the grants' state was not read: what the app got in its place is below. This is not “no active grant”" });
  });

  test("une sortie qui n'a pas la forme ne dit rien des grants non plus, et l'app dit en quoi", () => {
    const vu = voir(lecture("brigade : ce journal n'a pas encore l'état des grants : redémarrer le runtime, qui le recalcule\n"));

    assert.ok("sans" in vu);
    assert.equal(vu.sans, "the grants' state was not read in this output: it has no `grant <name>` line. This is not “no active grant” — it is shown below, in full");
    // La sortie d'une autre commande n'est pas celle de `grant`, quoi qu'elle dise.
    assert.ok("sans" in voir({ projet: "parade", demande: 4, a: "2026-10-13T16:30:02.000Z", sorties: [{ commande: "status", texte: "grant merge           ACTIF depuis le 2026-10-13T09:01:00.000Z (par chef) — sans échéance : une pass verte est mergée sans toi\n" }] }));
  });
});

describe("l'onglet Grants et les deux gestes de chaque grant", () => {
  test("l'onglet relaie `grant`, un script du runtime, sans argument : rien n'y est accordé ni révoqué par la lecture", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMANDE, "grant");
    assert.ok(COMMANDE in scripts);
    assert.equal(commandeDe("grants"), COMMANDE);
    assert.equal(ONGLETS.find(({ id }) => id === "grants")?.titre, "Grants");
  });

  test("« accorder » et « révoquer » sont deux gestes du socle, qui portent sur un grant : la vue les nomme, elle ne sait pas ce qu'ils écrivent", () => {
    assert.deepEqual(GESTES_DES_GRANTS, [
      { id: "grant-activer", libelle: "enable" },
      { id: "grant-revoquer", libelle: "revoke" },
    ]);
    for (const { id } of GESTES_DES_GRANTS) assert.equal(GESTES.find((geste) => geste.id === id)?.parGrant, true, `« ${id} » n'est pas un geste du socle qui porte sur un grant`);
  });

  test("tous deux sont confirmés : sans « oui », rien ne part ; avec, la commande de docs/runtime/, « Le grant `merge` », `merge` compris, part dans le second — aucun shell ne s'ouvre", async () => {
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
    assert.deepEqual(GRANTS, ["merge"]);

    for (const { id } of GESTES_DES_GRANTS) {
      assert.ok(CONFIRMES.includes(id), id);
      assert.deepEqual(ecrireGeste(terminaux, id, PARADE, "merge", undefined, CUISINE), { refus: SANS_OUI });
    }
    const rendus = await Promise.all(GESTES_DES_GRANTS.map(({ id }) => ecrireGeste(terminaux, id, PARADE, "merge", true, CUISINE)));

    // Le second vient d'être lancé, il n'est pas dit libre : rien n'est écrit, et le refus dit ce qui serait parti.
    assert.deepEqual(ecrits, [[]]);
    // La doc cite la commande deux fois : dans le dépôt (« Le grant `merge` »), et sur la box (« Piloter ») — celle-ci, dans sa forme de poste, est ce qui part.
    assert.ok(doc.includes("`brigade <projet> grant [enable merge ["), "docs/runtime/, « Piloter », ne cite plus la commande du grant");
    for (const [rang, mot] of ["enable", "revoke"].entries()) {
      assert.ok(doc.includes(`npm --prefix runtime run grant -- ${mot} merge`), `docs/runtime/, « Le grant \`merge\` », ne cite plus \`grant -- ${mot} merge\``);
      assert.deepEqual(rendus[rang], { refus: `${DIT.demarre} — the command did not go, and nothing is written: \`!(cd '/runtime' && BRIGADE_STATION_DIR='/station' node ${GESTE} parade grant ${mot} merge)\`` });
    }
  });

  test("la confirmation est celle de l'app, pas une boîte du système : ni `confirm`, ni `dialog` — et le process principal ne passe que le « oui » de la vue", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const principalDeLApp = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const geste = principalDeLApp.slice(principalDeLApp.indexOf('ipcMain.handle("geste"'), principalDeLApp.indexOf('ipcMain.on("regarder"'));

    assert.doesNotMatch(vue, /\b(confirm|alert|prompt)\s*\(/);
    assert.match(geste, /ecrireGeste\(terminaux, id, vise, grant, oui, cuisines\.cuisineDe\(vise\)\)/);
    assert.doesNotMatch(geste, /dialog\.|showMessageBox/);
    for (const source of ["app/src/grants.ts", "app/src/gestes.ts", "app/src/confirmation.ts"]) assert.doesNotMatch(readFileSync(join(RACINE, source), "utf8"), /dialog|showMessageBox|\bconfirm\(/);
  });

  test("le module ne lance rien : il lit une sortie que la veille a déjà rendue", () => {
    const source = readFileSync(join(RACINE, "app/src/grants.ts"), "utf8");

    assert.doesNotMatch(source, /node:child_process|\bimport\(|require\(|execFile|spawn/);
  });
});

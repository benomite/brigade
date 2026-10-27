// Un rouge de CI que la livraison ne touche pas se relance, une fois (#1496) :
// la lecture du journal d'un job, l'attribution de ses tests en échec, et la
// pass qui relance les jobs au lieu de renvoyer un cook ou d'écrire au chef.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Check } from "../src/events/pass.ts";
import { attribuer, testsEnEchec, type Lecture } from "../src/relance-de-ci.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { appeler, DEPOT, jusqua } from "./outils.ts";

// Le résumé de `node --test` tel que le journal brut d'un job de GitHub Actions le rend.
const JOURNAL_LINUX = [
  "2026-10-23T01:26:52.9070000Z ℹ tests 1204",
  "2026-10-23T01:26:52.9078144Z ✖ failing tests:",
  "2026-10-23T01:26:52.9080000Z ",
  "2026-10-23T01:26:52.9082318Z test at test/cuisson-de-bout-en-bout.test.ts:68:3",
  "2026-10-23T01:26:52.9083798Z ✖ la station prépare le worktree (598.5125ms)",
  "2026-10-23T01:26:52.9096672Z FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test",
].join("\n");
const JOURNAL_WINDOWS = [
  "2026-10-23T03:46:54.2137179Z \x1b[31m✖ failing tests:\x1b[39m",
  "2026-10-23T03:46:54.2137421Z \x1b[31mtest at test\\lectures-sous-condition.test.ts:132:1\x1b[39m",
  "2026-10-23T03:46:54.2138369Z ✖ une heure de ticks (120953.7389ms)",
  "2026-10-23T03:46:54.2138999Z   'test timed out after 120000ms'",
  "2026-10-23T03:46:54.2139000Z test at test\\lectures-sous-condition.test.ts:160:1",
].join("\r\n");

describe("le journal d'un job dit ses tests en échec", () => {
  test("le résumé de node --test nomme chaque fichier une fois, chemins Windows et couleurs compris", () => {
    assert.deepEqual(testsEnEchec(JOURNAL_LINUX), ["test/cuisson-de-bout-en-bout.test.ts"]);
    assert.deepEqual(testsEnEchec(JOURNAL_WINDOWS), ["test/lectures-sous-condition.test.ts"]);
    assert.deepEqual(testsEnEchec("2026-10-23T00:00:00Z test at file:///D:/a/brigade/brigade/runtime/test/rail.test.ts:3:1"), ["D:/a/brigade/brigade/runtime/test/rail.test.ts"]);
  });

  test("un journal qui ne nomme aucun test n'en dit rien : un contrôle de types, un lint, un job coupé", () => {
    assert.equal(testsEnEchec("2026-10-23T00:00:00Z src/pass.ts(12,3): error TS2322\n##[error]Process completed with exit code 2."), null);
    assert.equal(testsEnEchec(""), null);
  });
});

// Un petit dépôt : deux zones, des tests, leurs helpers.
const DEPOT_DE_TEST: Record<string, string> = {
  "runtime/src/rail.ts": "export const rail = 1;\n",
  "runtime/src/pass.ts": 'import { rail } from "./rail.ts";\nexport const pass = rail;\n',
  "runtime/src/station.ts": "export const station = 1;\n",
  "runtime/src/types.ts": "export type T = number;\n",
  "runtime/test/aides/cuisine.ts": 'import { pass } from "../../src/pass.ts";\nimport { outil } from "../outils.ts";\nexport const cuisine = pass + outil;\n',
  "runtime/test/outils.ts": 'export const outil = 1;\nexport const MAIN = "src/main.ts";\n',
  "runtime/test/pass.test.ts": 'import { cuisine } from "./aides/cuisine.ts";\nimport type { T } from "../src/types.ts";\n',
  "runtime/test/rail.test.ts": 'import { rail } from "../src/rail.ts";\n',
  "runtime/test/main.test.ts": 'import { outil } from "./outils.ts";\n',
  "runtime/test/montrer-rail.test.ts": "// montrer-rail.ts\n",
  "runtime/src/main.ts": "",
  "app/src/vue.ts": "",
  "app/test/vue.test.ts": 'import "../src/vue.ts";\n',
  "docs/runtime.md": "",
};
const lecture = (changes: string[], fichiers = DEPOT_DE_TEST): Lecture => ({ changes, fichiers: Object.keys(fichiers), lire: (chemin) => fichiers[chemin] ?? null });

describe("un rouge n'est pas celui de la livraison quand aucun de ses tests n'est touché", () => {
  test("des tests que la livraison ne touche pas : étrangers, nommés en chemins du dépôt", () => {
    assert.deepEqual(attribuer(["test/rail.test.ts", "test/vue.test.ts"], lecture(["runtime/src/station.ts", "docs/runtime.md"])), {
      etranger: true,
      tests: ["runtime/test/rail.test.ts", "app/test/vue.test.ts"],
    });
  });

  test("ce que le helper d'un test importe du produit n'est pas suivi au-delà : le produit est une feuille", () => {
    // pass.test.ts → cuisine.ts → src/pass.ts → src/rail.ts : rail.ts n'est pas touché.
    assert.equal(attribuer(["test/pass.test.ts"], lecture(["runtime/src/rail.ts"])).etranger, true);
    // Un import de type ne fait rien tourner.
    assert.equal(attribuer(["test/pass.test.ts"], lecture(["runtime/src/types.ts"])).etranger, true);
    // `rail.ts` n'est pas cité par `montrer-rail.ts`.
    assert.equal(attribuer(["test/montrer-rail.test.ts"], lecture(["runtime/src/rail.ts"])).etranger, true);
  });

  const touches: Array<[string, string, string[], RegExp]> = [
    ["le test modifié", "test/rail.test.ts", ["runtime/test/rail.test.ts"], /la livraison change le test en échec `runtime\/test\/rail\.test\.ts`/],
    ["ce qu'il importe", "test/rail.test.ts", ["runtime/src/rail.ts"], /`runtime\/test\/rail\.test\.ts` importe `runtime\/src\/rail\.ts`/],
    ["ce qu'importe un de ses helpers", "test/pass.test.ts", ["runtime/src/pass.ts"], /passe par `runtime\/test\/aides\/cuisine\.ts`, qui importe `runtime\/src\/pass\.ts`/],
    ["un helper de ses helpers", "test/pass.test.ts", ["runtime/test/outils.ts"], /qui importe `runtime\/test\/outils\.ts`/],
    ["ce qu'un helper nomme", "test/main.test.ts", ["runtime/src/main.ts"], /passe par `runtime\/test\/outils\.ts`, qui nomme `runtime\/src\/main\.ts`/],
    ["ce qui règle des suites entières", "test/rail.test.ts", ["runtime/package.json"], /`runtime\/package\.json`, qui règle des suites entières/],
    ["la CI elle-même", "test/rail.test.ts", [".github/workflows/tests.yml"], /`\.github\/workflows\/tests\.yml`/],
    ["les gates", "test/rail.test.ts", [".claude/brigade/gates.sh"], /`\.claude\/brigade\/gates\.sh`/],
  ];
  for (const [quoi, nomme, changes, raison] of touches) {
    test(`un test touché par ${quoi} : le rouge reste celui de la livraison, et la raison le dit`, () => {
      const attribution = attribuer([nomme], lecture(changes));
      assert.equal(attribution.etranger, false);
      assert.match(attribution.etranger ? "" : attribution.raison, raison);
    });
  }

  test("un test qui ne se retrouve pas dans le dépôt, ou pas d'une seule façon, ne s'attribue pas", () => {
    const sansLui = attribuer(["test/disparu.test.ts"], lecture(["docs/runtime.md"]));
    assert.match(sansLui.etranger ? "" : sansLui.raison, /`test\/disparu\.test\.ts` ne se retrouve pas/);
    const deux = { ...DEPOT_DE_TEST, "app/test/rail.test.ts": "" };
    assert.equal(attribuer(["test/rail.test.ts"], lecture(["docs/runtime.md"], deux)).etranger, false);
    // Le chemin absolu du runner se retrouve.
    assert.equal(attribuer(["D:/a/brigade/brigade/runtime/test/rail.test.ts"], lecture(["docs/runtime.md"])).etranger, true);
    // Illisible, il ne s'attribue pas.
    assert.equal(attribuer(["test/rail.test.ts"], { ...lecture(["docs/runtime.md"]), lire: () => null }).etranger, false);
  });
});

// Le job rouge d'un run de GitHub Actions, et le même relancé.
const RUN = 39896462364;
const job = (n: number, outcome: Check["outcome"] = "red", nom = "tests"): Check => ({
  name: nom,
  outcome,
  conclusion: outcome === "red" ? "failure" : outcome === "green" ? "success" : "in_progress",
  url: `https://github.com/${DEPOT}/actions/runs/${RUN}/job/${n}`,
});

// Une cuisine sous grant, un ticket livré dont la branche a la tête de la
// base, et le dépôt de test : la livraison change `runtime/src/station.ts`.
function servir(t: TestContext, options: Partial<Options> & { changes?: string[] } = {}) {
  const changes = options.changes ?? ["runtime/src/station.ts"];
  const lieu = cuisine(t, {
    pass: true,
    issues: [issue(17)],
    ...options,
    depot: (depot) => ({ ...depot, avance: () => 0, changes: () => changes, fichiers: () => Object.keys(DEPOT_DE_TEST), lire: (_branche, chemin) => DEPOT_DE_TEST[chemin] ?? null }),
  });
  chef(lieu.repertoire, "grant.activated");
  const compter = (type: string) => lieu.journal.duTicket(17).filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const attendreTicks = (n: number) => {
    const depart = lieu.types().filter((type) => type === "runtime.ticked").length;
    return jusqua(() => lieu.types().filter((type) => type === "runtime.ticked").length >= depart + n);
  };
  // Ce qui irait au chef : une remontée, une carte, un commentaire de pass rouge.
  const auChef = () => [...lieu.types(17).filter((type) => type === "pass.escalated" || type.startsWith("todo.")), ...lieu.gh.commentaires.filter(([, corps]) => corps.includes("Pass — rouge")).map(() => "commentaire")];
  return { ...lieu, compter, jusquAu, attendreTicks, auChef, pass: () => passDuTicket(lieu.journal.base, 17) };
}

describe("la pass relance une CI rouge sur des tests que la livraison ne touche pas", { concurrency: 4 }, () => {
  test("rouge seulement sur un test qu'elle ne touche pas : les jobs en échec sont relancés, sans renvoi ni carte, puis la relance verte est mergée", async (t) => {
    const lieu = servir(t);
    const { gh, compter, jusquAu, attendreTicks, auChef, pass, cooks, dernier } = lieu;
    gh.ci.checks = [job(1, "green", "lint"), job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_WINDOWS.replaceAll("lectures-sous-condition", "rail"));
    await jusquAu("pass.ci-rerun");

    assert.deepEqual(gh.relances, [RUN]);
    assert.deepEqual(dernier("pass.ci-rerun", 17), { run: pass()?.run, sha: pass()?.sha, runs: [RUN], checks: [job(2)], tests: ["runtime/test/rail.test.ts"] });
    // GitHub rend encore le rouge d'avant la relance : il est en cours, pas un verdict.
    await attendreTicks(3);
    assert.deepEqual([compter("pass.judged"), compter("pass.returned"), pass()?.phase, pass()?.returns, auChef()], [0, 0, "judging", 0, []]);

    gh.ci.checks = [job(1, "green", "lint"), job(3, "pending")];
    await attendreTicks(2);
    assert.equal(compter("pass.judged"), 0);
    gh.ci.checks = [job(1, "green", "lint"), job(3, "green")];
    await jusquAu("merge.done");

    // Servi, le ticket n'est plus en pass : ses renvois se comptent au journal.
    assert.deepEqual([dernier("pass.judged", 17)?.verdict, compter("pass.ci-rerun"), gh.relances.length, gh.merges.length, cooks().length, compter("pass.returned"), auChef()], ["green", 1, 1, 1, 1, 0, []]);
    // L'historique du ticket la raconte.
    const historique = appeler(montrerPass, ["17"], { BRIGADE_STATE_DIR: lieu.repertoire });
    assert.equal(await historique.fin, 0);
    assert.match(
      historique.sortie(),
      new RegExp(`CI red on \\S{7} only on tests the delivery does not touch: failed jobs rerun once \\(run ${RUN}\\) — no return, no card\n\\s+CI “tests”: failure — ${job(2).url}\n\\s+failing test: runtime/test/rail\\.test\\.ts\n`),
    );
  });

  test("rouge de nouveau après la relance sur le même test : pas de seconde relance, ni renvoi, ni carte — le test part à la cuisine en ticket `fix`, et la livraison est jugée sans lui", async (t) => {
    const { gh, compter, jusquAu, dernier, auChef, pass } = servir(t, { scenario: "bavard", suite: ["livre"] });
    gh.ci.checks = [job(1, "green", "lint"), job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    await jusquAu("pass.ci-rerun");
    gh.ci.checks = [job(1, "green", "lint"), job(3)];
    await jusquAu("merge.done");

    assert.deepEqual([compter("pass.ci-rerun"), compter("pass.returned"), compter("pass.escalated"), pass()?.returns], [1, 0, 0, 0]);
    // Le ticket `fix` du test, ouvert sans geste du chef : il porte `fire` et son calibrage.
    const [fix] = gh.creations;
    assert.equal(gh.creations.length, 1);
    assert.deepEqual(gh.lire(fix!)?.labels, ["fire", "fix", "prio:1", "model:sonnet", "effort:medium"]);
    assert.equal(gh.lire(fix!)?.title, "Fix the unstable test `runtime/test/rail.test.ts`");
    assert.match(gh.corpsDe(fix!), /^<!-- brigade:test-instable runtime\/test\/rail\.test\.ts -->/);
    assert.match(gh.corpsDe(fix!), /delivery of #17 .* is red on `runtime\/test\/rail\.test\.ts`, a test that delivery does not touch/);
    assert.ok(gh.corpsDe(fix!).includes(job(2).url!) && gh.corpsDe(fix!).includes(job(3).url!));
    // La livraison est jugée sans ce job : verte, mergée.
    assert.deepEqual(dernier("pass.ci-set-aside", 17), { sha: pass()?.sha, checks: [job(3)], fixes: [{ test: "runtime/test/rail.test.ts", issue: fix, reused: false }] });
    const verdict = dernier("pass.judged", 17) as { verdict: string; ci: { outcome: string }; findings: string[] } | undefined;
    assert.deepEqual([verdict?.verdict, verdict?.ci.outcome, verdict?.findings], ["green", "green", []]);
    assert.deepEqual(auChef(), []);
    const commentaire = gh.commentaires.map(([, corps]) => corps).find((corps) => corps.includes("CI mise de côté"));
    assert.match(commentaire ?? "", new RegExp(`\`runtime/test/rail\\.test\\.ts\` part à la cuisine en ticket \`fix\` #${fix}`));
  });

  test("la réponse de GitHub perdue après la création du ticket `fix` : il se retrouve par sa marque, pas ouvert deux fois", async (t) => {
    const { gh, jusquAu, dernier, compter } = servir(t, { scenario: "bavard", suite: ["livre"] });
    gh.ci.checks = [job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    await jusquAu("pass.ci-rerun");
    gh.pannes.apresCreation = true;
    gh.ci.checks = [job(3)];
    await jusquAu("pass.ci-set-aside");

    assert.equal(gh.creations.length, 1);
    assert.equal(compter("pass.test-fix-opening"), 1);
    assert.deepEqual(dernier("pass.ci-set-aside", 17)?.fixes, [{ test: "runtime/test/rail.test.ts", issue: gh.creations[0], reused: false }]);
  });

  test("le ticket `fix` du test déjà ouvert : une autre livraison rouge sur le même test le reprend, sans en ouvrir un second", async (t) => {
    const { gh, journal } = servir(t, { scenario: "bavard", suite: ["livre", "livre"], issues: [issue(17), issue(18)], cooks: 2 });
    const fait = (ticket: number, type: string) => journal.duTicket(ticket).findLast((e) => e.type === type)?.payload as { fixes: Array<{ issue: number; reused: boolean }> } | undefined;
    gh.ci.checks = [job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    await jusqua(() => fait(17, "pass.ci-rerun") !== undefined);
    gh.ci.checks = [job(3)];
    await jusqua(() => fait(17, "pass.ci-set-aside") !== undefined);
    const [fix] = gh.creations;
    // Le ticket 18, jugé à son tour, rouge sur le même test, deux fois.
    await jusqua(() => fait(18, "pass.ci-rerun") !== undefined);
    gh.ci.checks = [job(4)];
    await jusqua(() => fait(18, "pass.ci-set-aside") !== undefined);

    assert.deepEqual(fait(17, "pass.ci-set-aside")?.fixes.map(({ issue, reused }) => [issue, reused]), [[fix, false]]);
    assert.deepEqual(fait(18, "pass.ci-set-aside")?.fixes.map(({ issue, reused }) => [issue, reused]), [[fix, true]]);
    assert.deepEqual(gh.creations, [fix]);
  });

  test("un run qu'un verdict rouge a déjà jugé est relancé avant d'être rejugé : un renvoi ne juge jamais deux fois le même run de CI", async (t) => {
    const { gh, compter, jusquAu, dernier } = servir(t, { scenario: "bavard", suite: ["livre", "livre"] });
    // Un journal illisible : rien n'établit que le rouge n'est pas celui de la livraison.
    gh.ci.checks = [job(2)];
    await jusquAu("pass.returned");
    assert.deepEqual([compter("pass.ci-rerun"), gh.relances.length], [0, 0]);
    // Le cook renvoyé n'a rien changé qui relance la CI : le même job rouge, déjà jugé.
    await jusquAu("pass.ci-rerun");

    assert.deepEqual(gh.relances, [RUN]);
    assert.deepEqual(dernier("pass.ci-rerun", 17)?.checks, [job(2)]);
    assert.equal(dernier("pass.ci-rerun", 17)?.alreadyJudged, true);
    assert.equal(compter("pass.returned"), 1);
    // Sa relance verte, la livraison est mergée.
    gh.ci.checks = [job(3, "green")];
    await jusquAu("merge.done");
    assert.deepEqual([compter("pass.returned"), compter("pass.escalated"), gh.relances.length], [1, 0, 1]);
  });

  test("rouge après la relance sur un autre test, qui n'est pas touché non plus : la carte ne dit pas « deux fois », le rouge est un verdict comme avant", async (t) => {
    const { gh, compter, jusquAu, dernier } = servir(t, { scenario: "bavard", suite: ["livre"] });
    gh.ci.checks = [job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    await jusquAu("pass.ci-rerun");
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "vue"));
    gh.ci.checks = [job(3)];
    await jusquAu("pass.returned");

    assert.deepEqual([compter("pass.ci-rerun"), gh.relances.length, compter("pass.escalated")], [1, 1, 0]);
    assert.deepEqual(dernier("pass.returned", 17)?.findings, [`CI rouge — job « tests » : failure (${job(3).url}).`]);
  });

  const commeAvant: Array<[string, Partial<Options> & { changes?: string[] }, (gh: ReturnType<typeof servir>["gh"]) => void]> = [
    ["un test que la livraison touche", { changes: ["runtime/src/rail.ts"] }, (gh) => gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"))],
    ["un journal qui ne se lit pas", {}, () => {}],
    ["un journal qui ne nomme aucun test", {}, (gh) => gh.journauxDeCI.set("tests", "2026-10-23T00:00:00Z src/pass.ts(12,3): error TS2322")],
    ["un test qui n'est pas dans le dépôt", {}, (gh) => gh.journauxDeCI.set("tests", JOURNAL_LINUX)],
    ["un check qui n'est pas un job de GitHub Actions", {}, (gh) => {
      gh.ci.checks = [{ ...job(2), url: "https://ci.exemple/2" }];
      gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    }],
    ["une relance que GitHub refuse", {}, (gh) => {
      gh.pannes.relance = true;
      gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    }],
  ];
  for (const [quoi, options, regler] of commeAvant) {
    test(`rouge sur ${quoi} : aucune relance, la livraison est renvoyée comme avant`, async (t) => {
      const { gh, compter, jusquAu, dernier } = servir(t, { scenario: "bavard", suite: ["livre"], ...options });
      gh.ci.checks = [job(2)];
      regler(gh);
      await jusquAu("pass.returned");

      assert.deepEqual([compter("pass.ci-rerun"), gh.relances.length, dernier("pass.judged", 17)?.verdict], [0, 0, "red"]);
      assert.deepEqual(dernier("pass.returned", 17)?.findings, [`CI rouge — job « tests » : failure (${gh.ci.checks[0]?.url}).`]);
    });
  }

  test("un constat bloquant du reviewer fait déjà le verdict rouge : rien n'est relancé", async (t) => {
    const { gh, compter, jusquAu } = servir(t, { scenario: "bavard", suite: ["livre"], reviewer: { relecture: "relit-rouge" } });
    gh.ci.checks = [job(2)];
    gh.journauxDeCI.set("tests", JOURNAL_LINUX.replace("cuisson-de-bout-en-bout", "rail"));
    await jusquAu("pass.returned");

    assert.deepEqual([compter("pass.ci-rerun"), gh.relances.length], [0, 0]);
  });
});

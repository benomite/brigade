// Les commandes par lesquelles le chef voit la pass, tient son grant et fait
// rejouer la base : `npm run grant -- [activer merge | revoquer merge]`,
// `npm run pass -- [<ticket>]` et `npm run base -- [replay]`. Elles se jouent
// dans le process du test ; chacune depuis le sien, là où c'est lui qu'on
// regarde — un grant ou un rejeu posés pendant que le runtime tourne, une
// lecture de la pass, un refus rendu par son code.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Commande } from "../src/appel.ts";
import { principal as base } from "../src/base-cli.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as grant } from "../src/grant-cli.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { sessions } from "../src/projections/sessions.ts";
import { demarrer } from "../src/runtime.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, horloge, lancer, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

// Chaque commande, et le fichier par lequel `npm run` la lance.
type Cli = { commande: Commande; fichier: string };
const GRANT: Cli = { commande: grant, fichier: join(import.meta.dirname, "../src/grant-cli.ts") };
const BASE: Cli = { commande: base, fichier: join(import.meta.dirname, "../src/base-cli.ts") };
const PR = "https://github.com/o/r/pull/40";
const ROUGES = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime"], tail: "" };
const VERTES = { outcome: "green" as const, code: 0, failures: [], tail: "" };
const NON_JOUEES = { outcome: "skipped" as const, code: null, failures: [], tail: "" };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const { journal } = runtime;
  const noter = (fait: Fait, ticket: number | null = 17, author = "pass") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const rendre = async (cli: { fin: Promise<number | null>; sortie: () => string }) => ({ code: await cli.fin, sortie: cli.sortie() });
  const commande = (cli: Cli, ...args: string[]) => rendre(appeler(cli.commande, args, { BRIGADE_STATE_DIR: repertoire }));
  // Par son fichier, dans son propre process : comme `npm run` la lance.
  const lancee = (cli: Cli, ...args: string[]) => rendre(lancer(t, cli.fichier, args, { BRIGADE_STATE_DIR: repertoire }));
  const livrer = (run: string) => {
    noter({ type: "cook.launched", payload: { run, limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, branch: "cook/a", worktree: "worktrees/a" } }, 17, "runtime");
    noter({ type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: "cook/a", pr: PR } }, 17, "station:box/claude");
  };
  const juger = (run: string, verdict: "green" | "red") => {
    noter({ type: "pass.started", payload: { run, pr: PR, number: 40, sha: `abcdef0${run}` } });
    const rouge = verdict === "red";
    return noter({
      type: "pass.judged",
      payload: {
        run,
        pr: PR,
        number: 40,
        sha: `abcdef0${run}`,
        // Un verdict rouge d'avant, rendu sur la branche seule : il ne dit pas sur quoi il porte.
        ...(rouge ? {} : { base: "ba5e0001ffff", merged: "a4b4e0001fff" }),
        verdict,
        gates: { outcome: "green", code: 0, failures: [], tail: "" },
        ci: { outcome: rouge ? "red" : "none", checks: rouge ? [{ name: "lint", outcome: "red", conclusion: "failure", url: "https://ci/2" }] : [] },
        findings: rouge ? ["CI rouge — job « lint » : failure (https://ci/2)."] : [],
        judgeModified: false,
        review: { outcome: "green", run: `review-17-${run}`, summary: "Le diff fait ce que le ticket demande.", findings: [{ severity: "remark", file: "a.ts", text: "Un nom plus clair aiderait." }] },
        noDiff: false,
      },
    });
  };
  const grants = () => journal.tout().filter((e) => e.type.startsWith("grant."));
  return { runtime, journal, repertoire, noter, commande, lancee, livrer, juger, grants };
}

// Chaque test a son répertoire d'état : ils se jouent de front.
describe("les commandes du grant et de la pass", { concurrency: 8 }, () => {
  test("sans grant jamais donné, le chef le lit absent, et sans usage", async (t) => {
    const { commande } = cuisine(t);

    const { code, sortie } = await commande(GRANT);

    assert.equal(code, 0);
    assert.match(sortie, /grant merge\s+ABSENT — never given/);
    assert.match(sortie, /latest uses\s+none/);
  });

  test("le chef active le grant sans redémarrer le runtime, en son nom, et voit son état", async (t) => {
    const { lancee, grants } = cuisine(t);

    const activation = await lancee(GRANT, "enable", "merge");

    assert.equal(activation.code, 0);
    assert.match(activation.sortie, /grant merge active, no deadline: every green pass from now on is merged/);
    assert.doesNotMatch(activation.sortie, /no runtime is running/);
    assert.deepEqual(grants().map((e) => [e.type, e.author, e.project, e.ticket, e.payload]), [["grant.activated", "chef", "brigade", null, { action: "merge" }]]);
    assert.match((await lancee(GRANT)).sortie, /grant merge\s+ACTIVE since \d{4}-\d{2}-\d{2}T\S+ \(by chef\)/);
  });

  test("`--until` rend ce qu'il a compris, en UTC et avec la durée, avant toute autre ligne", async (t) => {
    const { commande, grants } = cuisine(t);

    const { code, sortie } = await commande(GRANT, "enable", "merge", "--until", "2999-01-01T18:00");

    // L'instant tapé se lit à l'heure de la machine : ce qu'il vaut en UTC dépend du fuseau du poste.
    const tape = new Date(2999, 0, 1, 18, 0);
    const enUtc = `${tape.getUTCDate()} Jan ${tape.toISOString().slice(11, 16)} UTC`;
    assert.equal(code, 0);
    assert.match(sortie.split("\n")[0] ?? "", new RegExp(`^brigade : understood: until ${enUtc} — in \\d+ d$`));
    assert.equal(grants().length, 1);
  });

  test("activer deux fois ne s'écrit qu'une fois ; révoquer se lit, et ne s'écrit pas sans grant actif", async (t) => {
    const { commande, grants } = cuisine(t);
    assert.match((await commande(GRANT, "revoke", "merge")).sortie, /nothing to revoke/);

    await commande(GRANT, "enable", "merge");
    assert.match((await commande(GRANT, "enable", "merge")).sortie, /already active since/);
    assert.match((await commande(GRANT, "revoke", "merge")).sortie, /grant merge revoked: the pass now stops at the open PR/);

    assert.deepEqual(grants().map((e) => e.type), ["grant.activated", "grant.revoked"]);
    assert.match((await commande(GRANT)).sortie, /grant merge\s+REVOKED since/);
  });

  test("chaque usage du grant se relit : quel ticket, quelle PR, quel verdict, quand", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    livrer("a");
    const verdict = juger("a", "green");
    const usage = noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "abcdef0a", base: "v2", verdict: verdict?.seq ?? 0 } });
    assert.match((await commande(GRANT)).sortie, /merge under way/);
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "pass", reconciled: false } });

    // Une livraison arrêtée faute de grant, avant qu'il soit accordé : `grant` dit ce qu'elle est devenue.
    noter({ type: "pass.started", payload: { run: "b", pr: `${PR}2`, number: 402, sha: "abcdef0b" } }, 12);
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 12);
    const { sortie } = await commande(GRANT);

    assert.match(sortie, new RegExp(`${usage?.at}  #17  merge on v2  ${PR}  abcdef0  verdict no. ${verdict?.seq}  merged`));
    assert.match(sortie, /^without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open$/m);
  });

  test("avant d'accorder, le chef lit ce qu'il a fait de ce que la pass a arrêté faute de grant, là où il regarde déjà — sans rien écrire", async (t) => {
    const { journal, commande, noter, livrer, juger } = cuisine(t);
    livrer("a");
    juger("a", "green");
    // Trois livraisons arrêtées : une qu'il merge, une qu'il ferme, une qu'il laisse.
    noter({ type: "pass.held", payload: { reason: "no-grant" } });
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "outside", actor: "acme", reconciled: false } });
    noter({ type: "pass.started", payload: { run: "b", pr: `${PR}8`, number: 408, sha: "abcdef0b" } }, 18);
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 18);
    noter({ type: "pass.pr-closed", payload: { pr: `${PR}8` } }, 18);
    noter({ type: "pass.started", payload: { run: "c", pr: `${PR}9`, number: 409, sha: "abcdef0c" } }, 19);
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 19);
    // Redite au réveil suivant, une livraison arrêtée ne compte qu'une fois ; et un arrêt qu'aucun grant ne lève n'en est pas.
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 19);
    noter({ type: "pass.started", payload: { run: "d", pr: `${PR}0`, number: 400, sha: "abcdef0d" } }, 20);
    noter({ type: "pass.held", payload: { reason: "review-required", cause: "judge-modified" } }, 20);
    const avant = journal.tout();

    assert.match((await commande(GRANT)).sortie, /^without a grant, 3 green deliveries stopped: 1 merged by hand, 1 closed without merge — 1 disagreement —, 1 still open$/m);
    // La commande `essai` n'existe plus : le chiffre se lit sans elle.
    assert.equal((await commande(GRANT, "essai")).code, 2);
    assert.deepEqual(journal.tout(), avant);
  });

  test("le grant donné sans runtime qui tourne tient quand même, et le dit", async (t) => {
    const { runtime, repertoire, commande } = cuisine(t);
    runtime.arreter("test");

    const { sortie } = await commande(GRANT, "enable", "merge");

    assert.match(sortie, /no runtime is running: the command will take effect on its next start/);
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => journal.fermer());
    assert.equal(journal.tout().at(-1)?.type, "grant.activated");
  });

  test("le chef accorde avec une échéance, lit ce qu'il reste, prolonge sans révoquer — et l'histoire de ses gestes se relit", async (t) => {
    const { commande, grants } = cuisine(t);

    const accorde = await commande(GRANT, "enable", "merge", "--for", "4h", "--uses", "3");
    assert.equal(accorde.code, 0);
    assert.match(accorde.sortie, /grant merge active, 4 h 00 left \(until \d+ \S+ \d\d:\d\d UTC\) · for 3 uses: [\s\S]*It will lapse on its own/);

    // Raccourcir n'est pas prolonger : refusé, rien n'est écrit.
    const refuse = await commande(GRANT, "extend", "merge", "--for", "1h");
    assert.equal(refuse.code, 1);
    assert.match(refuse.sortie, /does not extend it — to shorten it, revoke it then enable it again/);
    assert.equal((await commande(GRANT, "extend", "merge", "--uses", "2")).code, 0);

    const [activation, prolongation] = grants().map((e) => e.payload as Record<string, unknown>);
    assert.deepEqual(grants().map((e) => [e.type, e.author]), [["grant.activated", "chef"], ["grant.extended", "chef"]]);
    assert.deepEqual([typeof activation?.until, activation?.uses, prolongation], ["string", 3, { action: "merge", uses: 2 }]);
    const { sortie } = await commande(GRANT);
    assert.match(sortie, /grant merge\s+ACTIVE since \S+ \(by chef\) — \d h \d\d left \(until \d+ \S+ \d\d:\d\d UTC\) · 5 uses left: a green pass is merged without you/);
    assert.match(sortie, /latest actions\s*\n  \S+  merge  extended: 2 uses more  \(chef\)\n  \S+  merge  enabled until \d+ \S+ \d\d:\d\d UTC · for 3 uses  \(chef\)\n/);
  });

  test("`grant` lit éteint un grant échu que le runtime n'a pas encore constaté, et n'écrit rien : il ne prend pas le journal", async (t) => {
    const { commande, noter, grants } = cuisine(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: "2026-01-01T00:00:00.000Z" } }, null, "chef");

    const { code, sortie } = await commande(GRANT);

    assert.equal(code, 0);
    assert.match(sortie, /grant merge\s+LAPSED since 2026-01-01T00:00:00.000Z — its deadline has passed \(enabled by chef\): the pass stops at the open PR \(the runtime will write it to the log on its next pass\)/);
    assert.deepEqual(grants().map((e) => e.type), ["grant.activated"]);
  });

  test("une commande inconnue, ou un grant autre que merge, est refusé avec l'usage, sans rien écrire", async (t) => {
    const { commande, grants } = cuisine(t);

    for (const args of [["enable"], ["enable", "push-tag"], ["donner", "merge"], ["enable", "merge", "vite"], ["enable", "merge", "--until", "vendredi"]]) {
      const { code, sortie } = await commande(GRANT, ...args);
      assert.equal(code, 2);
      assert.match(sortie, /usage: /);
    }
    assert.deepEqual(grants(), []);
  });

  test("le chef lit ce qu'aucun grant n'autorise là où il lit ses grants", async (t) => {
    const { commande } = cuisine(t);

    const { code, sortie } = await commande(GRANT);

    assert.equal(code, 0);
    assert.match(sortie, /never granted\s+identifiants-max — read the Max account credentials\n\s+acces-prod — any action on a project's production\n/);
  });

  test("ce qu'aucun grant n'autorise est refusé au chef lui-même : la ligne est nommée, la demande journalisée, rien n'est accordé", async (t) => {
    const { commande, lancee, grants } = cuisine(t);

    const prod = await lancee(GRANT, "enable", "accès-prod");
    const max = await commande(GRANT, "enable", "identifiants-max", "--for", "4h");
    const prolonge = await commande(GRANT, "extend", "acces-prod", "--no-expiry");

    for (const { code, sortie } of [prod, max, prolonge]) {
      assert.equal(code, 1);
      assert.doesNotMatch(sortie, /usage: /);
      assert.match(sortie, /no grant allows it, not even asked by you/);
      assert.match(sortie, /changed by no command: only by a delivery, which reads as a diff \(runtime\/src\/grant\.ts\)/);
    }
    assert.match(prod.sortie, /grant acces-prod refused: “any action on a project's production”/);
    assert.match(max.sortie, /grant identifiants-max refused: “read the Max account credentials”/);
    assert.deepEqual(grants().map((e) => [e.type, e.author, e.project, e.ticket, e.payload]), [
      ["grant.refused", "chef", "brigade", null, { action: "acces-prod", line: "any action on a project's production" }],
      ["grant.refused", "chef", "brigade", null, { action: "identifiants-max", line: "read the Max account credentials" }],
      ["grant.refused", "chef", "brigade", null, { action: "acces-prod", line: "any action on a project's production" }],
    ]);
    const vu = (await commande(GRANT)).sortie;
    assert.match(vu, /grant merge\s+ABSENT/);
    assert.match(vu, /\d{4}-\d{2}-\d{2}T\S+  identifiants-max  refused: no grant allows it  \(chef\)/);
  });

  test("`enable`, `extend`, `revoke`, l'état et chacun de leurs refus s'écrivent sans mot français du glossaire", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    const lignes: string[] = [];
    const dire = async (...args: string[]) => {
      const { sortie } = await commande(GRANT, ...args);
      lignes.push(...sortie.split("\n").filter((ligne) => ligne !== ""));
      return sortie;
    };
    // Un état d'exemple qui montre tout : un usage, un arrêt faute de grant, ce qu'aucun grant n'autorise.
    livrer("a");
    const verdict = juger("a", "green");
    noter({ type: "pass.held", payload: { reason: "no-grant" } });

    // Les refus d'abord : grant absent, durée invalide, option inconnue, action interdite, rien à prolonger.
    await dire("revoke", "merge");
    await dire("extend", "merge", "--for", "2h");
    await dire("extend", "merge", "--no-expiry");
    await dire("enable", "merge", "--for", "longtemps");
    await dire("enable", "merge", "--until", "vendredi");
    await dire("enable", "merge", "--uses", "0");
    await dire("enable", "merge", "--toujours");
    await dire("enable", "merge", "--for", "2h", "--until", "18h");
    await dire("enable", "merge", "--no-expiry");
    await dire("enable", "acces-prod");
    await dire("enable");

    // Puis les gestes, et l'état après chacun.
    await dire();
    await dire("enable", "merge", "--for", "2d", "--uses", "3");
    await dire("enable", "merge");
    await dire("extend", "merge", "--for", "3d");
    await dire("extend", "merge", "--for", "1h");
    await dire("extend", "merge", "--uses", "2");
    await dire();
    noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "abcdef0a", base: "v2", verdict: verdict?.seq ?? 0 } });
    await dire();
    await dire("extend", "merge", "--no-expiry");
    await dire("revoke", "merge");
    await dire();

    assert.ok(lignes.length > 40);
    sansMotFrancais(lignes);
  });

  test("`--for 2d` est accepté, et `--for 2j` l'est toujours", async (t) => {
    const { commande, grants } = cuisine(t);

    const deux = await commande(GRANT, "enable", "merge", "--for", "2d");
    assert.equal(deux.code, 0);
    assert.match(deux.sortie, /2 d left/);
    await commande(GRANT, "revoke", "merge");
    const ancien = await commande(GRANT, "enable", "merge", "--for", "2j");
    assert.equal(ancien.code, 0);
    assert.match(ancien.sortie, /2 d left/);

    const [d, , j] = grants().map((e) => e.payload as { until?: string });
    const ecart = (until?: string) => Math.round((Date.parse(until ?? "") - Date.now()) / 3_600_000);
    assert.deepEqual([ecart(d?.until), ecart(j?.until)], [48, 48]);
  });

  test("un grant posé avant ce ticket — ancien mot de commande, ancienne durée, refus au libellé français — est montré et appliqué sans édition", async (t) => {
    const { commande, noter, grants } = cuisine(t);
    // Ce que le journal d'une box d'avant garde : un refus au libellé français, un grant à durée.
    noter({ type: "grant.refused", payload: { action: "acces-prod", line: "toute action sur la production d'un projet" } }, null, "chef");
    noter({ type: "grant.activated", payload: { action: "merge", until: new Date(Date.now() + 3_600_000).toISOString(), uses: 3 } }, null, "chef");

    const vu = (await commande(GRANT)).sortie;
    assert.match(vu, /grant merge\s+ACTIVE since \S+ \(by chef\) — .* left \(until \d+ \S+ \d\d:\d\d UTC\) · 3 uses left: a green pass is merged without you/);
    assert.match(vu, /acces-prod {2}refused: no grant allows it {2}\(chef\)/);
    sansMotFrancais(vu.split("\n"));

    // Les anciens mots du chef et sa durée en `j` s'appliquent encore, sans rien éditer.
    const prolonge = await commande(GRANT, "prolonger", "merge", "--pour", "3j");
    assert.equal(prolonge.code, 0);
    assert.match(prolonge.sortie, /grant merge extended: 3 d left/);
    assert.deepEqual(grants().map((e) => e.type), ["grant.refused", "grant.activated", "grant.extended"]);
    assert.equal((await commande(GRANT, "revoquer", "merge")).code, 0);
    assert.equal(grants().at(-1)?.type, "grant.revoked");
  });

  test("sans journal où l'écrire, ce qu'aucun grant n'autorise est refusé quand même, et rien n'est créé", async (t) => {
    const vide = repertoireTemporaire(t);

    const enfant = appeler(grant, ["enable", "acces-prod"], { BRIGADE_STATE_DIR: vide });

    assert.equal(await enfant.fin, 1);
    assert.match(enfant.sortie(), /grant acces-prod refused/);
    assert.equal(existsSync(join(vide, "log.db")), false);
  });

  test("sans journal, ou devant un journal d'avant la pass, les commandes le disent et ne créent rien", async (t) => {
    const vide = repertoireTemporaire(t);
    for (const cli of [GRANT, BASE]) {
      const enfant = lancer(t, cli.fichier, [], { BRIGADE_STATE_DIR: vide });
      assert.equal(await enfant.fin, 1);
      assert.match(enfant.sortie(), /aucun journal dans|no log in/);
    }
    assert.equal(existsSync(join(vide, "log.db")), false);

    const ancien = repertoireTemporaire(t);
    ouvrirJournal(ancien, { projections: [sessions] }).fermer();
    for (const cli of [GRANT, BASE]) {
      const enfant = appeler(cli.commande, [], { BRIGADE_STATE_DIR: ancien });
      assert.equal(await enfant.fin, 1);
      assert.match(enfant.sortie(), /redémarrer le runtime, qui le recalcule|restart the runtime, which recomputes it/);
    }
  });

  test("le chef fait rejouer les gates d'une base rouge, en son nom, sans redémarrer le runtime ; demandé deux fois, le rejeu ne s'écrit qu'une fois", async (t) => {
    const { lancee, noter, journal } = cuisine(t);
    const demandes = () => journal.tout().filter((e) => e.type === "base.recheck-requested");
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);

    const vue = await lancee(BASE);
    assert.equal(vue.code, 0);
    assert.match(vue.sortie, new RegExp(`^BASE RED since ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\) — after the merge of #17: nothing is judged or merged, deliveries wait$`, "m"));
    assert.match(vue.sortie, /^ {2}the station takes no more tickets while it is red$/m);
    assert.match(vue.sortie, /^ {2}replay its gates without waiting for a commit: brigade <projet> base replay$/m);
    assert.deepEqual(demandes(), []);

    const { code, sortie } = await lancee(BASE, "replay");
    assert.equal(code, 0);
    assert.match(sortie, /replay asked: the pass replays the base's gates on its current head, without waiting for a commit — green, the hold lifts; red, it stays/);
    assert.doesNotMatch(sortie, /no runtime is running/);
    assert.deepEqual(demandes().map((e) => [e.author, e.ticket, e.payload]), [["chef", null, {}]]);

    assert.match((await lancee(BASE, "replay")).sortie, /replay already asked on \S+: the pass plays it on its next round/);
    assert.equal(demandes().length, 1);
    assert.match((await lancee(BASE)).sortie, /^ {2}replay asked by the chef since \S+: the pass plays it on its next round$/m);

    // La machine le retient : c'est dit, à qui regarde comme à qui redemande.
    noter({ type: "base.recheck-held", payload: { resource: "cpu", observed: 64, limit: 12 } }, null);
    const retenu = new RegExp(`the saturated machine has held it since ${JOUR_HORLOGE}T\\S+, the pass comes back to it on its own`);
    assert.match((await lancee(BASE)).sortie, retenu);
    assert.match((await lancee(BASE, "replay")).sortie, retenu);
    assert.equal(demandes().length, 1);
  });

  test("un contrôle que le rapatriement retient se lit dans `run base` et `run pass` : retenu, pourquoi, depuis quand — sur des merges à vérifier comme sur un rejeu demandé", async (t) => {
    const { commande, noter } = cuisine(t);
    const retenir = () => noter({ type: "base.check-held", payload: { reason: "git fetch : fatal: origine injoignable" } }, null);
    const RETENU = `check held since ${JOUR_HORLOGE}T\\S+: the base cannot be fetched \\(git fetch : fatal: origine injoignable\\) — the pass comes back to it on its own, at every tick`;
    const RETENU_EN = `check held since ${JOUR_HORLOGE}T\\S+: the base cannot be fetched \\(git fetch : fatal: origine injoignable\\) — the pass comes back to it on its own, at every tick`;

    // Jamais contrôlée, un merge à vérifier, et l'origine qui ne répond pas.
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0c", by: "outside", reconciled: false, unverified: true } }, 19);
    retenir();
    assert.match((await commande(BASE)).sortie, new RegExp(`^base never checked\\n {2}${RETENU}$`, "m"));

    // Rouge : la retenue se lit sous le rouge, avec le geste.
    noter({ type: "base.check-resumed", payload: {} }, null);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [19] } }, null);
    retenir();
    assert.match((await commande(BASE)).sortie, new RegExp(`^ {2}${RETENU}\\n {2}replay its gates without waiting for a commit: `, "m"));

    // Le rejeu demandé bute à son tour : il n'est pas annoncé comme imminent, ni à qui regarde ni à qui redemande.
    assert.match((await commande(BASE, "replay")).sortie, /replay asked: .*If the machine saturates or the base cannot be fetched, it waits/);
    retenir();
    const attend = new RegExp(`the base cannot be fetched since ${JOUR_HORLOGE}T\\S+ \\(git fetch : fatal: origine injoignable\\), the pass comes back to it on its own`);
    for (const sortie of [(await commande(BASE)).sortie, (await commande(BASE, "replay")).sortie]) {
      assert.match(sortie, attend);
      assert.doesNotMatch(sortie, /next round/);
    }
  });

  test("sur une base qui n'est pas rouge, il n'y a rien à rejouer : la commande le dit et n'écrit rien", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    const ecrits = () => journal.tout().filter((e) => e.type === "base.recheck-requested").length;

    assert.match((await commande(BASE)).sortie, /^base never checked: no merge has had to be verified on it yet$/m);
    assert.match((await commande(BASE, "replay")).sortie, /nothing to replay: the base is not red/);

    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "green", gates: VERTES, tickets: [] } }, null);
    assert.match((await commande(BASE)).sortie, new RegExp(`^base green at the last check, on ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\)$`, "m"));
    assert.match((await commande(BASE, "replay")).sortie, /nothing to replay: the base is not red/);

    noter({ type: "base.checked", payload: { sha: "ba5e0005ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [] } }, null);
    assert.match((await commande(BASE)).sortie, new RegExp(`^base not checked: its gates could not be played on ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\) — nothing is held$`, "m"));
    noter({ type: "base.checked", payload: { sha: "ba5e0006ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [], reason: "git worktree : fatal: disque plein" } }, null);
    assert.match((await commande(BASE)).sortie, /^base not checked: its gates could not be played on \S+ \(ba5e000\), the attempt did not run \(git worktree : fatal: disque plein\) — nothing is held$/m);
    assert.equal(ecrits(), 0);

    for (const args of [["replay", "fast"], ["rerun"]]) {
      const { code, sortie } = await commande(BASE, ...args);
      assert.equal(code, 2);
      assert.match(sortie, /usage: /);
    }
    assert.equal(ecrits(), 0);
  });

  test("le rejeu demandé sans runtime qui tourne tient quand même, et le dit", async (t) => {
    const { runtime, commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [] } }, null);
    runtime.arreter("test");

    assert.match((await commande(BASE, "replay")).sortie, /replay asked[\s\S]*no runtime is running: the command will apply at its next start/);
  });

  test("un contrôle non joué sur une base rouge se lit : la base reste rouge, et le chef voit sur quel commit rien n'a pu être vérifié", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
    noter({ type: "base.checked", payload: { sha: "c0ffee05ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [17], red: "ba5e0004ffff" } }, null);

    assert.match((await commande(BASE)).sortie, /gates not played on c0ffee0/);
  });

  test("un rejeu demandé dont l'essai ne se fait pas n'est pas annoncé comme imminent : le chef lit pourquoi, depuis quand, et le geste lui est rendu", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
    noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [17], red: "ba5e0004ffff", reason: "git worktree : fatal: disque plein" } }, null);

    const base = (await commande(BASE)).sortie;
    assert.match(base, new RegExp(`^ {2}gates not played on ba5e000 since ${JOUR_HORLOGE}T\\S+, the attempt did not run \\(git worktree : fatal: disque plein\\): a check that was not played does not lift a red that was found$`, "m"));
    assert.match(base, /^ {2}replay its gates without waiting for a commit: brigade <projet> base replay$/m);
    assert.doesNotMatch(base, /next round/);
  });
});

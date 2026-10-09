// Les commandes par lesquelles le chef voit la pass, tient son grant et fait
// rejouer la base : `npm run grant -- [activer merge | revoquer merge]`,
// `npm run pass -- [<ticket>]` et `npm run base -- [rejouer]`, chacune depuis
// son propre process.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { sessions } from "../src/projections/sessions.ts";
import { demarrer } from "../src/runtime.ts";
import { horloge, lancer, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

const GRANT = join(import.meta.dirname, "../src/grant-cli.ts");
const PASS = join(import.meta.dirname, "../src/montrer-pass.ts");
const BASE = join(import.meta.dirname, "../src/base-cli.ts");
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
  const commande = async (cli: string, ...args: string[]) => {
    const enfant = lancer(t, cli, args, { BRIGADE_STATE_DIR: repertoire });
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };
  const livrer = (run: string) => {
    noter({ type: "cook.launched", payload: { run, limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, branch: "cook/a", worktree: "worktrees/a" } }, 17, "runtime");
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
  return { runtime, journal, repertoire, noter, commande, livrer, juger, grants };
}

// Chaque test a son répertoire d'état : ils se jouent de front.
describe("les commandes du grant et de la pass", { concurrency: 8 }, () => {
  test("sans grant jamais donné, le chef le lit absent, et sans usage", async (t) => {
    const { commande } = cuisine(t);

    const { code, sortie } = await commande(GRANT);

    assert.equal(code, 0);
    assert.match(sortie, /grant merge\s+ABSENT — jamais donné/);
    assert.match(sortie, /derniers usages\s+aucun/);
  });

  test("le chef active le grant sans redémarrer le runtime, en son nom, et voit son état", async (t) => {
    const { commande, grants } = cuisine(t);

    const activation = await commande(GRANT, "activer", "merge");

    assert.equal(activation.code, 0);
    assert.match(activation.sortie, /grant merge actif : toute pass verte à partir de maintenant est mergée/);
    assert.doesNotMatch(activation.sortie, /aucun runtime ne tourne/);
    assert.deepEqual(grants().map((e) => [e.type, e.author, e.project, e.ticket, e.payload]), [["grant.activated", "chef", "brigade", null, { action: "merge" }]]);
    assert.match((await commande(GRANT)).sortie, /grant merge\s+ACTIF depuis le \d{4}-\d{2}-\d{2}T\S+ \(par chef\)/);
  });

  test("activer deux fois ne s'écrit qu'une fois ; révoquer se lit, et ne s'écrit pas sans grant actif", async (t) => {
    const { commande, grants } = cuisine(t);
    assert.match((await commande(GRANT, "revoquer", "merge")).sortie, /rien à révoquer/);

    await commande(GRANT, "activer", "merge");
    assert.match((await commande(GRANT, "activer", "merge")).sortie, /déjà actif depuis le/);
    assert.match((await commande(GRANT, "revoquer", "merge")).sortie, /grant merge révoqué : la pass s'arrête désormais à la PR ouverte/);

    assert.deepEqual(grants().map((e) => e.type), ["grant.activated", "grant.revoked"]);
    assert.match((await commande(GRANT)).sortie, /grant merge\s+RÉVOQUÉ depuis le/);
  });

  test("chaque usage du grant se relit : quel ticket, quelle PR, quel verdict, quand", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    livrer("a");
    const verdict = juger("a", "green");
    const usage = noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "abcdef0a", base: "v2", verdict: verdict?.seq ?? 0 } });
    assert.match((await commande(GRANT)).sortie, /merge en cours/);
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "pass", reconciled: false } });

    const { sortie } = await commande(GRANT);

    assert.match(sortie, new RegExp(`${usage?.at}  #17  merge sur v2  ${PR}  abcdef0  verdict n° ${verdict?.seq}  mergée`));
  });

  test("le grant donné sans runtime qui tourne tient quand même, et le dit", async (t) => {
    const { runtime, repertoire, commande } = cuisine(t);
    runtime.arreter("test");

    const { sortie } = await commande(GRANT, "activer", "merge");

    assert.match(sortie, /aucun runtime ne tourne : la commande vaudra à son prochain démarrage/);
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => journal.fermer());
    assert.equal(journal.tout().at(-1)?.type, "grant.activated");
  });

  test("une commande inconnue, ou un grant autre que merge, est refusé avec l'usage, sans rien écrire", async (t) => {
    const { commande, grants } = cuisine(t);

    for (const args of [["activer"], ["activer", "push-tag"], ["donner", "merge"], ["activer", "merge", "vite"]]) {
      const { code, sortie } = await commande(GRANT, ...args);
      assert.equal(code, 2);
      assert.match(sortie, /usage : /);
    }
    assert.deepEqual(grants(), []);
  });

  test("sans journal, ou devant un journal d'avant la pass, les commandes le disent et ne créent rien", async (t) => {
    const vide = repertoireTemporaire(t);
    for (const cli of [GRANT, PASS, BASE]) {
      const enfant = lancer(t, cli, [], { BRIGADE_STATE_DIR: vide });
      assert.equal(await enfant.fin, 1);
      assert.match(enfant.sortie(), /aucun journal dans/);
    }
    assert.equal(existsSync(join(vide, "log.db")), false);

    const ancien = repertoireTemporaire(t);
    ouvrirJournal(ancien, { projections: [sessions] }).fermer();
    for (const cli of [GRANT, PASS, BASE]) {
      const enfant = lancer(t, cli, [], { BRIGADE_STATE_DIR: ancien });
      assert.equal(await enfant.fin, 1);
      assert.match(enfant.sortie(), /redémarrer le runtime, qui le recalcule/);
    }
  });

  test("une livraison entre les mains du manager se lit comme telle, et ses relances ne passent pas pour des renvois de la pass", async (t) => {
    const { noter, commande, livrer } = cuisine(t);
    livrer("a");
    noter({ type: "pass.returned", payload: { n: 3, findings: ["Gates rouges."] } }, 17, "manager");
    noter({ type: "pass.deferred", payload: {} });

    assert.match((await commande(PASS)).sortie, /^#17  rouge, au manager  renvois 2\/2, 1 relance du manager  depuis/m);
    // L'histoire du ticket dit qui a décidé quoi, et pourquoi.
    noter(
      { type: "manager.reacted", payload: { verdict: 9, returns: 3, choice: "escalate", reason: "Le critère 2 se contredit.", proposal: "Le trancher.", run: "reagit-17-a", from: { model: "haiku", effort: "low" }, to: null } },
      17,
      "manager",
    );
    const { sortie } = await commande(PASS, "17");
    assert.match(sortie, /relance 1 décidée par le manager : les findings repartent à un cook/);
    assert.match(sortie, /rouge : la pass passe la main au manager/);
    assert.match(sortie, /le manager remonte au chef — Le critère 2 se contredit\./);
  });

  test("le chef voit les livraisons en pass : leur phase, leurs renvois consommés, leur PR", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    assert.match((await commande(PASS)).sortie, /aucune livraison en pass/);

    livrer("a");
    juger("a", "red");
    noter({ type: "pass.returned", payload: { n: 1, findings: ["CI rouge."] } });

    const { code, sortie } = await commande(PASS);

    assert.equal(code, 0);
    assert.match(sortie, new RegExp(`#17  rouge, renvoyée au cook  renvois 1/2  depuis ${JOUR_HORLOGE}T\\S+  ${PR}`));
  });

  test("pour un ticket, le chef relit chaque verdict et ce qui l'a produit, jusqu'au merge", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    livrer("a");
    const rouge = juger("a", "red");
    noter({ type: "pass.returned", payload: { n: 1, findings: ["CI rouge."] } });
    livrer("b");
    const vert = juger("b", "green");
    noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "abcdef0b", base: "v2", verdict: vert?.seq ?? 0 } });
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0b", by: "pass", reconciled: false } });

    const { sortie } = await commande(PASS, "17");

    assert.match(sortie, /^#17  mergée  renvois 1\/2/m);
    assert.match(sortie, new RegExp(`verdict n° ${rouge?.seq} : ROUGE — gates vertes \\(code 0\\) · CI rouge · reviewer rien de bloquant \\(run review-17-a\\)\\n\\s+CI « lint » : failure — https://ci/2\\n\\s+CI rouge — job « lint »`));
    assert.match(sortie, /renvoi 1\/2 : les findings repartent à un cook/);
    assert.match(sortie, new RegExp(`verdict n° ${vert?.seq} : VERT — gates vertes \\(code 0\\) · CI aucun check · reviewer rien de bloquant \\(run review-17-b\\)\\n\\s+reviewer — remarque \\(a\\.ts\\) : Un nom plus clair aiderait\\.`));
    assert.match(sortie, new RegExp(`grant merge utilisé : merge de ${PR} sur v2, autorisé par le verdict n° ${vert?.seq}`));
    assert.match(sortie, /mergée par la pass$/m);
  });

  test("le relevé dit sous quelle identité un merge a été fait, quand le journal la porte", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    livrer("a");
    juger("a", "green");
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "pass", actor: "brigade-pass[bot]", reconciled: true } });
    assert.match((await commande(PASS, "17")).sortie, /mergée par la pass, sous l'identité brigade-pass\[bot\] — constaté après coup, au redémarrage$/m);

    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "outside", actor: "benomite", reconciled: false } });
    assert.match((await commande(PASS, "17")).sortie, /mergée hors du runtime \(à la main\), sous l'identité benomite$/m);
  });

  test("le chef lit ce que le reviewer a dit — son résumé, chaque constat — et un ticket sans diff servi sans merge", async (t) => {
    const { commande, noter, livrer } = cuisine(t);
    livrer("a");
    noter({ type: "pass.started", payload: { run: "a", pr: null, number: null, sha: "abcdef0a" } });
    const findings = [
      { severity: "blocking" as const, file: null, text: "La conclusion ne découle pas des mesures." },
      { severity: "remark" as const, file: "ci.yml", text: "Le cache est déjà en place." },
    ];
    noter({ type: "pass.reviewed", payload: { run: "a", sha: "abcdef0a", review: "review-17-x", outcome: "red", summary: "L'audit ne répond pas à la question.", findings, reason: null, truncated: false } });
    noter({ type: "pass.reviewed", payload: { run: "a", sha: "abcdef0a", review: "review-17-y", outcome: "unreadable", summary: null, findings: [], reason: "aucun objet JSON dans la réponse", truncated: true } });
    const skipped = { outcome: "skipped" as const, code: null, failures: [], tail: "" };
    const vert = noter({
      type: "pass.judged",
      payload: { run: "a", pr: null, number: null, sha: "abcdef0a", verdict: "green", gates: skipped, ci: { outcome: "skipped", checks: [] }, review: { outcome: "green", run: "review-17-z", summary: "Rien à redire.", findings: [] }, findings: [], judgeModified: false, noDiff: true },
    });
    noter({ type: "pass.served", payload: { verdict: vert?.seq ?? 0 } });

    const { sortie } = await commande(PASS, "17");
    const liste = await commande(PASS);

    assert.match(sortie, /^#17  servie sans merge — ticket sans diff  renvois 0\/2/m);
    assert.match(sortie, /jugement de la livraison sans diff sur abcdef0 \(run a\)/);
    assert.match(sortie, /relecture du reviewer \(run review-17-x\) : BLOQUANT\n\s+L'audit ne répond pas à la question\.\n\s+reviewer — BLOQUANT : La conclusion ne découle pas des mesures\.\n\s+reviewer — remarque \(ci\.yml\) : Le cache est déjà en place\./);
    assert.match(sortie, /relecture du reviewer \(run review-17-y\) : ILLISIBLE \(aucun objet JSON dans la réponse\) — diff coupé dans sa consigne/);
    assert.match(sortie, new RegExp(`verdict n° ${vert?.seq} : VERT — ticket sans diff, ni gates ni CI · reviewer rien de bloquant \\(run review-17-z\\)`));
    assert.match(sortie, new RegExp(`servie sans merge : rien à merger, autorisé par le verdict n° ${vert?.seq}`));
    assert.match(liste.sortie, /^#17  servie sans merge — ticket sans diff  renvois 0\/2  depuis \S+  sans diff$/m);
  });

  test("un ticket jamais passé par la pass le dit ; un argument qui n'est pas un ticket est refusé", async (t) => {
    const { commande } = cuisine(t);

    assert.match((await commande(PASS, "99")).sortie, /le ticket #99 n'est jamais passé par la pass/);
    const refus = await commande(PASS, "tous");
    assert.equal(refus.code, 2);
    assert.match(refus.sortie, /usage : /);
  });

  test("voir ne modifie pas le journal", async (t) => {
    const { journal, commande } = cuisine(t);
    const avant = journal.tout();

    await commande(GRANT);
    await commande(PASS);

    assert.deepEqual(journal.tout(), avant);
  });

  test("le chef lit ce que la base est devenue sous une livraison : le rejeu, le merge sans rejeu, la base rouge après merge et ce qui l'attend", async (t) => {
    const { commande, noter, livrer, juger } = cuisine(t);
    const gates = (outcome: "green" | "red") => ({ outcome, code: outcome === "green" ? 0 : 1, failures: outcome === "green" ? [] : ["FAIL  tests du runtime"], tail: "" });
    livrer("a");
    juger("a", "green");
    noter({ type: "pass.base-moved", payload: { sha: "abcdef0a", base: "ba5e0002ffff", from: "ba5e0001ffff", behind: 2, overlap: ["runtime/src/rail.ts"], replay: true } });
    noter({ type: "pass.replayed", payload: { sha: "abcdef0a", base: "ba5e0002ffff", gates: gates("green"), findings: [] } });
    noter({ type: "pass.base-moved", payload: { sha: "abcdef0a", base: "ba5e0003ffff", from: "ba5e0002ffff", behind: 3, overlap: [], replay: false } });
    noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "abcdef0a", base: "v2", verdict: 1 } });
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0a", by: "pass", reconciled: false } });
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: gates("red"), tickets: [17] } }, null);
    noter({ type: "cook.launched", payload: { run: "b", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/b.jsonl", branch: "cook/b", worktree: "worktrees/b" } }, 18, "runtime");
    noter({ type: "pass.waiting", payload: { reason: "base-red" } }, 18);
    noter({ type: "merge.done", payload: { pr: PR, sha: "abcdef0c", by: "outside", reconciled: false, unverified: true } }, 19);

    const liste = (await commande(PASS)).sortie;
    assert.match(liste, new RegExp(`^BASE ROUGE depuis ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\) — après le merge de #17 : les merges sous grant sont suspendus, les livraisons vertes attendent$`, "m"));
    assert.match(liste, /^base à vérifier — après le merge de #19 : ses gates sont à jouer sur elle-même$/m);
    assert.match(liste, /^#18  EN ATTENTE — verte, non mergée \(base-red\)  renvois 0\/2/m);

    const { sortie } = await commande(PASS, "17");
    assert.match(sortie, /la base a avancé de 2 commits sous cette livraison \(ba5e000\), sur des fichiers qu'elle touche aussi : gates rejouées sur le résultat du merge\n\s+runtime\/src\/rail\.ts/);
    assert.match(sortie, /gates rejouées sur le résultat du merge dans ba5e000 : vertes \(code 0\)$/m);
    assert.match(sortie, /la base a avancé de 3 commits sous cette livraison \(ba5e000\), sans toucher à ses fichiers : mergée sans rejeu/);
    assert.match(sortie, /gates jouées sur la base après merge \(ba5e000\) : ROUGES \(code 1\) — merges sous grant suspendus\n\s+FAIL {2}tests du runtime/);
  });

  test("le chef fait rejouer les gates d'une base rouge, en son nom, sans redémarrer le runtime ; demandé deux fois, le rejeu ne s'écrit qu'une fois", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    const demandes = () => journal.tout().filter((e) => e.type === "base.recheck-requested");
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);

    const vue = await commande(BASE);
    assert.equal(vue.code, 0);
    assert.match(vue.sortie, new RegExp(`^BASE ROUGE depuis ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\) — après le merge de #17 : les merges sous grant sont suspendus, les livraisons vertes attendent$`, "m"));
    assert.match(vue.sortie, /^ {2}la station ne prend plus de ticket tant qu'elle l'est$/m);
    assert.match(vue.sortie, /^ {2}rejouer ses gates sans attendre un commit : npm --prefix runtime run base -- rejouer$/m);
    assert.deepEqual(demandes(), []);

    const { code, sortie } = await commande(BASE, "rejouer");
    assert.equal(code, 0);
    assert.match(sortie, /rejeu demandé : la pass rejoue les gates de la base sur sa tête actuelle, sans attendre un commit — vertes, la retenue tombe ; rouges, elle reste/);
    assert.doesNotMatch(sortie, /aucun runtime ne tourne/);
    assert.deepEqual(demandes().map((e) => [e.author, e.ticket, e.payload]), [["chef", null, {}]]);

    assert.match((await commande(BASE, "rejouer")).sortie, /rejeu déjà demandé le \S+ : la pass le joue à son prochain passage/);
    assert.equal(demandes().length, 1);
    assert.match((await commande(BASE)).sortie, /^ {2}rejeu demandé par le chef depuis \S+ : la pass le joue à son prochain passage$/m);

    // La machine le retient : c'est dit, à qui regarde comme à qui redemande.
    noter({ type: "base.recheck-held", payload: { resource: "cpu", observed: 64, limit: 12 } }, null);
    const retenu = new RegExp(`la machine saturée le retient depuis ${JOUR_HORLOGE}T\\S+, la pass y revient seule`);
    assert.match((await commande(BASE)).sortie, retenu);
    assert.match((await commande(BASE, "rejouer")).sortie, retenu);
    assert.match((await commande(PASS)).sortie, retenu);
    assert.equal(demandes().length, 1);
  });

  test("sur une base qui n'est pas rouge, il n'y a rien à rejouer : la commande le dit et n'écrit rien", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    const ecrits = () => journal.tout().filter((e) => e.type === "base.recheck-requested").length;

    assert.match((await commande(BASE)).sortie, /^base jamais contrôlée : aucun merge n'a encore eu à être vérifié sur elle$/m);
    assert.match((await commande(BASE, "rejouer")).sortie, /rien à rejouer : la base n'est pas rouge/);

    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "green", gates: VERTES, tickets: [] } }, null);
    assert.match((await commande(BASE)).sortie, new RegExp(`^base verte au dernier contrôle, le ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\)$`, "m"));
    assert.match((await commande(BASE, "rejouer")).sortie, /rien à rejouer : la base n'est pas rouge/);

    noter({ type: "base.checked", payload: { sha: "ba5e0005ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [] } }, null);
    assert.match((await commande(BASE)).sortie, new RegExp(`^base non contrôlée : ses gates n'ont pas pu être jouées le ${JOUR_HORLOGE}T\\S+ \\(ba5e000\\) — rien n'est retenu$`, "m"));
    noter({ type: "base.checked", payload: { sha: "ba5e0006ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [], reason: "git worktree : fatal: disque plein" } }, null);
    assert.match((await commande(BASE)).sortie, /^base non contrôlée : ses gates n'ont pas pu être jouées le \S+ \(ba5e000\), l'essai ne s'est pas fait \(git worktree : fatal: disque plein\) — rien n'est retenu$/m);
    assert.equal(ecrits(), 0);

    for (const args of [["rejouer", "vite"], ["relancer"]]) {
      const { code, sortie } = await commande(BASE, ...args);
      assert.equal(code, 2);
      assert.match(sortie, /usage : /);
    }
    assert.equal(ecrits(), 0);
  });

  test("le rejeu demandé sans runtime qui tourne tient quand même, et le dit", async (t) => {
    const { runtime, commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [] } }, null);
    runtime.arreter("test");

    assert.match((await commande(BASE, "rejouer")).sortie, /rejeu demandé[\s\S]*aucun runtime ne tourne : la commande vaudra à son prochain démarrage/);
  });

  test("un contrôle non joué sur une base rouge se lit : la base reste rouge, et le chef voit sur quel commit rien n'a pu être vérifié", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
    noter({ type: "base.checked", payload: { sha: "c0ffee05ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [17], red: "ba5e0004ffff" } }, null);

    const liste = (await commande(PASS)).sortie;
    assert.match(liste, /^BASE ROUGE depuis \S+ \(ba5e000\) — après le merge de #17 : /m);
    assert.match(liste, new RegExp(`^ {2}gates non jouées sur c0ffee0 depuis ${JOUR_HORLOGE}T\\S+ : un contrôle non joué ne lève pas un rouge constaté$`, "m"));
    assert.match(liste, /^ {2}rejouer ses gates sans attendre un commit : npm --prefix runtime run base -- rejouer$/m);
    assert.match((await commande(BASE)).sortie, /gates non jouées sur c0ffee0/);

    const { sortie } = await commande(PASS, "17");
    assert.match(sortie, /gates jouées sur la base après merge \(c0ffee0\) : non jouées — la base reste ROUGE, un contrôle non joué ne lève pas le rouge constaté sur ba5e000$/m);
  });

  test("un rejeu demandé dont l'essai ne se fait pas n'est pas annoncé comme imminent : le chef lit pourquoi, depuis quand, et le geste lui est rendu", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
    noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
    noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [17], red: "ba5e0004ffff", reason: "git worktree : fatal: disque plein" } }, null);

    for (const sortie of [(await commande(BASE)).sortie, (await commande(PASS)).sortie]) {
      assert.match(sortie, new RegExp(`^ {2}gates non jouées sur ba5e000 depuis ${JOUR_HORLOGE}T\\S+, l'essai ne s'est pas fait \\(git worktree : fatal: disque plein\\) : un contrôle non joué ne lève pas un rouge constaté$`, "m"));
      assert.match(sortie, /^ {2}rejouer ses gates sans attendre un commit : npm --prefix runtime run base -- rejouer$/m);
      assert.doesNotMatch(sortie, /prochain passage/);
    }
    const { sortie } = await commande(PASS, "17");
    assert.match(sortie, /gates jouées sur la base après merge \(ba5e000\) : non jouées, l'essai ne s'est pas fait \(git worktree : fatal: disque plein\) — la base reste ROUGE/m);
  });
});

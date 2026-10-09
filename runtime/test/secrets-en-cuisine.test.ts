// Les secrets d'un projet, de bout en bout dans une cuisine : qui les reçoit,
// ce qui se passe quand il en manque un, et ce qui ne s'en lit nulle part.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { chef, controlerBase, cuisine, fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { BASE, depotGit, git, jusqua, repertoireTemporaire } from "./outils.ts";

const CLE = "sk_test_4eC39HqLyjWDarjtT1";
const BASE_DE_DEV = "postgres://dev:mot-de-passe@localhost:5432";
const DECLARES = "# ce dont les tests ont besoin\nCLE_API\nDATABASE_URL\n";
const VALEURS = `CLE_API=${CLE}\nDATABASE_URL=${BASE_DE_DEV}\nAUTRE_PROJET=une-valeur-non-declaree\n`;
const SECRETS = { declares: DECLARES, valeurs: VALEURS };

// Tout ce que le runtime garde ou publie : son journal, ce qu'il écrit sous
// son répertoire d'état (flux bruts compris), ce qu'il dit à journald, et ce
// qu'il pose sur GitHub.
function traces(lieu: ReturnType<typeof cuisine>): string {
  const fichiers = (repertoire: string): string[] =>
    readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(repertoire, entree.name);
      // Ce que les doublures notent de l'environnement qu'elles ont reçu n'est pas une trace du runtime.
      if (["temoin", "worktrees", "gates.txt.secrets"].includes(entree.name) || entree.name.endsWith(".db") || entree.name.includes(".db-")) return [];
      return entree.isDirectory() ? fichiers(chemin) : [readFileSync(chemin, "utf8")];
    });
  return [
    JSON.stringify(lieu.journal.tout()),
    ...fichiers(lieu.repertoire),
    ...lieu.avertissements,
    ...lieu.gh.commentaires.map(([, corps]) => corps),
    ...lieu.gh.prs.map((pr) => `${pr.titre}\n${pr.corps}`),
  ].join("\n");
}

// Chaque test a ses lieux : ils se jouent de front.
describe("les secrets du projet", { concurrency: 8 }, () => {
  test("le setup puis le cook reçoivent les secrets que le dépôt déclare, et rien d'autre de ce que la machine détient", async (t) => {
    const { lancements, avertissements } = cuisine(t, { scenario: "bavard", setup: "derive", secrets: SECRETS, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const env = lancements()[0]?.env ?? {};
    assert.equal(env.CLE_API, CLE);
    assert.equal(env.DATABASE_URL, BASE_DE_DEV);
    // Le setup a reçu le secret : il en a tiré la base du ticket.
    assert.equal(env.BASE_DE_TEST, `${BASE_DE_DEV}/ticket_15`);
    assert.equal(env.AUTRE_PROJET, undefined);
    assert.equal(avertissements.join("\n").includes("mot-de-passe"), false);
  });

  test("un projet sans déclaration ne reçoit rien du fichier de la machine", async (t) => {
    const { lancements, secrets } = cuisine(t, { scenario: "bavard", secrets: { declares: "", valeurs: VALEURS }, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const env = lancements()[0]?.env ?? {};
    assert.deepEqual([env.CLE_API, env.DATABASE_URL, env.AUTRE_PROJET], [undefined, undefined, undefined]);
    assert.equal(Object.values(env).includes(secrets.fichier), false);
  });

  test("un secret qui manque : aucun setup, aucun cook, le ticket est 86 dix minutes et l'issue dit lequel — une fois", async (t) => {
    const lieu = cuisine(t, { scenario: "bavard", setup: "derive", secrets: { declares: DECLARES, valeurs: `CLE_API=${CLE}\n` }, issues: [issue(15)] });
    const { repertoire, journal, heure, secrets, setup, etat, dernier, types, lancements, gh } = lieu;
    await jusqua(() => etat(15) === "86");

    assert.deepEqual(dernier("ticket.86", 15), { reason: "secrets-unavailable", until: "2026-10-08T10:10:00.000Z" });
    assert.deepEqual(dernier("secrets.unavailable", 15), { station: "box/claude", problems: [`\`DATABASE_URL\` : aucune valeur dans ${secrets.fichier}`] });
    assert.deepEqual([setup.appels(), lancements(), types().includes("cook.launched")], [[], [], false]);
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
    assert.deepEqual(readdirSync(join(repertoire, "worktrees")), []);
    await jusqua(() => gh.commentaires.length === 1);
    assert.match(gh.commentaires[0]?.[1] ?? "", /secrets du projet indisponibles[\s\S]*`DATABASE_URL` : aucune valeur[\s\S]*BRIGADE_SECRETS_FILE/);
    assert.equal(traces(lieu).includes(CLE), false);

    // Toujours absent dix minutes plus tard : le ticket est repris, refusé de
    // nouveau, et l'issue n'est pas recommentée.
    heure.avancer(600_000);
    await jusqua(() => journal.duTicket(15).filter((e) => e.type === "ticket.86").length === 2);
    assert.equal(journal.duTicket(15).filter((e) => e.type === "secrets.unavailable").length, 1);

    // Le chef pose la valeur, sans rien redémarrer : le cook part à l'essai suivant.
    secrets.poser(VALEURS);
    heure.avancer(600_000);
    await jusqua(() => lancements().length === 1);
    assert.equal(lancements()[0]?.env.DATABASE_URL, BASE_DE_DEV);
    assert.equal(gh.commentaires.filter(([, corps]) => corps.includes("secrets du projet indisponibles")).length, 1);
  });

  test("un dépôt qui déclare sur une machine sans fichier de secrets : aucun cook, et l'issue nomme la variable à poser", async (t) => {
    const { etat, gh, lancements } = cuisine(t, { secrets: { declares: DECLARES, valeurs: null }, issues: [issue(15)] });
    await jusqua(() => etat(15) === "86" && gh.commentaires.length === 1);

    assert.match(gh.commentaires[0]?.[1] ?? "", /BRIGADE_SECRETS_FILE n'est pas défini.*`CLE_API`, `DATABASE_URL`/);
    assert.deepEqual(lancements(), []);
  });

  test("un cook qui dit ses secrets tout haut ne les révèle nulle part : flux brut, sortie d'erreur, journal, issue et PR sont masqués", async (t) => {
    const lieu = cuisine(t, { scenario: "livre-et-revele", secrets: SECRETS, issues: [issue(15)] });
    const { repertoire, dernier, gh, etat } = lieu;
    await jusqua(() => etat(15) === "pass" && gh.commentaires.length === 1);

    const run = String(dernier("cook.launched", 15)?.run);
    const flux = readFileSync(join(repertoire, "runs", `${run}.jsonl`), "utf8");
    assert.match(flux, /CLE_API=\[secret:CLE_API\]/);
    assert.equal(readFileSync(join(repertoire, "runs", `${run}.jsonl.stderr`), "utf8"), "avertissement : DATABASE_URL=[secret:DATABASE_URL]\n");
    const dit = "Pour mémoire, la clé est [secret:CLE_API] et la base [secret:DATABASE_URL].";
    assert.ok(String(dernier("cook.reported", 15)?.summary).includes(dit));
    assert.ok(gh.commentaires[0]?.[1].includes(dit));
    assert.ok(gh.prs[0]?.corps.includes(dit));
    const tout = traces(lieu);
    assert.equal(tout.includes(CLE), false);
    assert.equal(tout.includes("mot-de-passe"), false);
  });

  test("une livraison qui porte la valeur d'un secret n'est pas poussée : le cook est en échec, et l'issue nomme la variable", async (t) => {
    // Un vrai dépôt, dont la base déclare un secret.
    const depot = depotGit(t);
    const semis = join(repertoireTemporaire(t), "semis");
    git(join(semis, ".."), "clone", "-q", depot.origine, semis);
    mkdirSync(join(semis, ".claude/brigade"), { recursive: true });
    writeFileSync(join(semis, ".claude/brigade/secrets"), "CLE_API\n");
    git(semis, "add", ".");
    git(semis, "commit", "-q", "-m", "déclare un secret");
    git(semis, "push", "-q", "origin", BASE);
    const lieux = { repertoire: repertoireTemporaire(t), ...depot, gh: fauxGitHub(issue(15)), heure: montre() };

    const lieu = cuisine(t, { lieux, git: true, scenario: "livre-et-laisse-un-secret", seuilDisjoncteur: 1, secrets: { declares: "", valeurs: VALEURS } });
    const { origine, gh, etat, dernier } = lieu;
    await jusqua(() => dernier("cook.reported", 15) !== undefined && gh.commentaires.length === 1);

    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "secret-committed: `CLE_API`"]);
    assert.equal(etat(15), "waiting");
    assert.deepEqual(gh.prs, []);
    assert.equal(git(origine, "for-each-ref", "refs/heads/cook"), "");
    assert.match(gh.commentaires[0]?.[1] ?? "", /échoué \(secret-committed: `CLE_API`\)[\s\S]*porte la valeur d'un secret du projet \(`CLE_API`\)[\s\S]*Rien n'est poussé/);
    assert.equal(traces(lieu).includes(CLE), false);
  });

  test("les gates de la pass reçoivent les secrets du projet, le reviewer aucun, et ce qu'elles en disent est masqué", async (t) => {
    const lieu = cuisine(t, { pass: true, secrets: SECRETS, issues: [issue(17)] });
    const { journal, gates, relectures, dernier, gh } = lieu;
    gates.regler("bavard");
    await jusqua(() => journal.tout().some((e) => e.type === "pass.judged"));

    assert.deepEqual(gates.secrets(), [CLE]);
    assert.deepEqual((dernier("pass.judged", 17)?.gates as { failures: string[] }).failures, ["FAIL  connexion refusée avec la clé [secret:CLE_API]"]);
    await jusqua(() => gh.commentaires.some(([, corps]) => corps.includes("[secret:CLE_API]")));
    assert.equal(traces(lieu).includes(CLE), false);

    // Les gates passent : la livraison est relue, par un reviewer sans secret.
    gates.regler("vert");
    await jusqua(() => relectures().length === 1);
    const env = relectures()[0]?.env ?? {};
    assert.deepEqual([env.CLE_API, env.DATABASE_URL], [undefined, undefined]);
  });

  test("un reviewer qui cite ce que les gates ont laissé sur le disque ne publie pas le secret", async (t) => {
    const lieu = cuisine(t, { pass: true, reviewer: { relecture: "relit-en-citant" }, secrets: SECRETS, issues: [issue(17)] });
    const { journal, dernier, gh } = lieu;
    await jusqua(() => journal.tout().some((e) => e.type === "pass.judged") && gh.commentaires.some(([, corps]) => corps.includes("Les gates ont tourné")));

    assert.equal((dernier("pass.reviewed", 17) as { summary: string }).summary, "Les gates ont tourné avec la clé [secret:CLE_API].");
    assert.equal(traces(lieu).includes(CLE), false);
  });

  test("un secret retiré avant les gates : elles ne sont pas jouées, rien n'est renvoyé au cook, et la pass remonte au chef", async (t) => {
    const lieu = cuisine(t, { pass: true, scenario: "commite-puis-attend", secrets: SECRETS, issues: [issue(17)] });
    const { journal, gates, secrets, lancements, conclure, etat, dernier, gh } = lieu;
    await jusqua(() => lancements().length === 1);

    secrets.poser(`CLE_API=${CLE}\n`);
    conclure();
    await jusqua(() => journal.tout().some((e) => e.type === "pass.escalated"));

    assert.deepEqual(dernier("pass.escalated", 17), { reason: "secrets-unavailable" });
    assert.deepEqual(gates.appels(), []);
    assert.equal(journal.tout().some((e) => e.type === "pass.judged"), false);
    assert.equal(etat(17), "86");
    await jusqua(() => gh.commentaires.some(([, corps]) => corps.includes("remontée au chef (`secrets-unavailable`)")));
    assert.match(gh.commentaires.at(-1)?.[1] ?? "", /n'ont pas été jouées[\s\S]*`DATABASE_URL` : aucune valeur/);
  });

  test("le contrôle de la base, sans ses secrets, n'est pas joué — et dit pourquoi", async (t) => {
    const lieu = cuisine(t, { pass: true, secrets: { declares: DECLARES, valeurs: `CLE_API=${CLE}\n` } });
    const { repertoire, journal, gates, dernier } = lieu;
    // Une base rouge, que le chef fait rejouer.
    controlerBase(repertoire, "red");
    chef(repertoire, "base.recheck-requested");
    await jusqua(() => journal.tout().filter((e) => e.type === "base.checked").length === 2);

    assert.equal(dernier("base.checked")?.outcome, "skipped");
    assert.match(String(dernier("base.checked")?.reason), /secrets du projet indisponibles — `DATABASE_URL` : aucune valeur/);
    assert.deepEqual(gates.appels(), []);
  });
});

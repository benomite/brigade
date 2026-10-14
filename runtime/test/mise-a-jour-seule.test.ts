// La box se met à jour seule : quand la branche que le clone de brigade suit
// avance sur son origine, le runtime essaie la nouvelle version — le geste de
// box, une doublure de `sudo` ici —, sans commande ni demande du chef. Gardée
// si elle démarre, la précédente revenue sinon ; une version ratée n'est pas
// réessayée, la suivante l'est ; et la cuisine ne s'arrête pas pendant l'essai.
//
// Une box sans root ni systemd : une origine nue, le clone qui la suit, les
// versions posées à côté de lui comme la bascule les pose, et de vrais `git`
// pour la comparaison. La bascule, c'est le test qui la joue : il arrête le
// runtime et le relance sur la version qu'elle mettrait en service, sur le
// même répertoire d'état, et note son compte rendu à côté des versions.
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import type { Journal } from "../src/journal.ts";
import { brancherMiseEnService, JOURNAL_DU_GESTE } from "../src/mettre-en-service.ts";
import { versionComparee } from "../src/projections/version.ts";
import { demarrer, type Runtime } from "../src/runtime.ts";
import { brancherVersion } from "../src/version.ts";
import { cuisine, issue, montre } from "./aides/cuisine.ts";
import { fauxSudo } from "./aides/faux-sudo.ts";
import { aArreter, BASE, ENV_GIT, git, jusqua, repertoireTemporaire, vivant } from "./outils.ts";

const PROJET = "brigade";
// Ce que le runtime lance, argument par argument — et rien d'autre.
const ARGUMENTS = ["-n", "--", "/usr/local/bin/brigade-mise-en-service", PROJET];
const SUIVIE = `origin/${BASE}`;
// Ce que la bascule note quand la version ne démarre pas.
const MOTIF = "le runtime est sorti en code 1, et systemd ne le relance pas (`failed`)";

// Un commit tel que la file le cite, et l'heure d'un instant à la minute, à
// l'heure de la machine.
const sha = (commit: string) => `\`${commit.slice(0, 7)}\``;
const hhmm = (instant: string) => new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Ce que le journal garde de la mise en service, dans l'ordre.
const gestes = (journal: Journal) => journal.tout().flatMap((evenement) => (evenement.type.startsWith("deploy.") ? [evenement] : []));
const typesDeGestes = (journal: Journal) => gestes(journal).map(({ type }) => type);

// Laisse passer des ticks du runtime : à chacun, il regarde s'il a une version
// à essayer. Un fait — des battements écrits —, pas une durée.
const battements = (journal: Journal) => journal.base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'runtime.ticked'")[0]?.n ?? 0;
async function ticks(journal: Journal, combien = 3): Promise<void> {
  const avant = battements(journal);
  await jusqua(() => battements(journal) >= avant + combien);
}

// Laisse passer des comparaisons du runtime à l'origine — des cycles : chacune
// relit la version qui attend, et le réveil qui la suit pourrait l'essayer.
async function comparaisons(journal: Journal, rapatriee: () => number, combien = 2): Promise<void> {
  for (let fois = 0; fois < combien; fois++) {
    const avant = rapatriee();
    await jusqua(() => rapatriee() > avant);
  }
  await ticks(journal);
}

// Le bloc `attend` de `status`, de sa ligne de tête à sa ligne de fin. Ce
// qu'il dit de l'âge d'une attente se compte depuis les livraisons, datées
// par `git` à l'heure de la machine et non à celle du test : il est tu (`…`).
function blocAttend(journal: Journal, maintenant: Date): string[] {
  const lignes = decrireEtat(lireEtat(journal, maintenant), maintenant);
  return lignes
    .slice(lignes.findIndex((ligne) => ligne.startsWith("attend")), lignes.indexOf("fin attend") + 1)
    .map((ligne) => ligne.replace(/^(attend .* depuis ).+$/, "$1…").replace(/^( {2}version {2}depuis ).+?( {2})/, "$1…$2"));
}

// La box : l'origine de brigade et sa branche d'intégration, le clone qui la
// suit, les versions posées à côté de lui, et le runtime du projet sur l'une
// d'elles — qui compare, à chaque tick ou presque, ce qu'il sert à l'origine.
function box(t: TestContext) {
  const racine = realpathSync(repertoireTemporaire(t));
  const sous = (nom: string) => join(racine, nom);
  const [origine, travail, clone, etat] = [sous("origine.git"), sous("travail"), sous("brigade"), sous("etat")];
  const versions = join(`${clone}-versions`, PROJET);
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  let rang = 0;
  // Une livraison sur la branche de l'origine, qui change le runtime. Rend son commit.
  const livrer = (): string => {
    mkdirSync(join(travail, "runtime/src"), { recursive: true });
    writeFileSync(join(travail, "runtime/src/main.ts"), `// livraison ${++rang}\n`);
    git(travail, "add", ".");
    git(travail, "commit", "-q", "-m", `livraison ${rang}`);
    git(travail, "push", "-q", origine, BASE);
    return git(travail, "rev-parse", "HEAD");
  };
  const premiere = livrer();
  git(racine, "clone", "-q", "--branch", BASE, origine, clone);

  const sudo = fauxSudo(t, "attend");
  const heure = montre();
  let runtime: Runtime | null = null;
  const arreter = () => {
    runtime?.arreter("SIGTERM");
    runtime = null;
  };
  aArreter(t, () => {
    arreter();
    sudo.finir();
  });
  const enMarche = (): Runtime => {
    if (runtime === null) throw new Error("aucun runtime en marche");
    return runtime;
  };
  const journal = () => enMarche().journal;
  // Le runtime démarre sur la version posée de ce commit, comme l'unité du
  // projet le lance une fois la bascule passée : il compare ce qu'il sert à
  // l'origine, et tient sa mise en service.
  const demarrerSur = (commit: string) => {
    const sources = join(versions, commit, "runtime/src");
    mkdirSync(sources, { recursive: true });
    const socle = demarrer({ repertoireEtat: etat, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
    const compare = brancherVersion(socle, { repertoireEtat: etat, env: ENV_GIT, sources, cadenceMs: 100 });
    runtime = brancherMiseEnService(compare, { repertoireEtat: etat, env: sudo.env, sources, attenteAuDemarrageMs: 0 });
  };
  // Ce que la dernière comparaison du runtime en marche a dit.
  const comparee = () => versionComparee(journal().base)?.comparaison ?? null;
  // Le dernier rapatriement de l'origine qu'une comparaison a fait — `git
  // fetch` le note à chaque fois, même quand la réponse ne change pas.
  const rapatriee = () => {
    try {
      return statSync(join(etat, "version.git/FETCH_HEAD")).mtimeMs;
    } catch {
      return 0;
    }
  };
  return {
    clone,
    premiere,
    livrer,
    sudo,
    heure,
    journal,
    arreter,
    demarrerSur,
    comparee,
    rapatriee,
    // Les gestes de box que le runtime a lancés, dans l'ordre.
    lances: () => gestes(journal()).flatMap(({ type, author, payload }) => (type === "deploy.launched" ? [{ author, payload }] : [])),
    conclusions: () => gestes(journal()).flatMap(({ type, payload }) => (type === "deploy.concluded" ? [payload] : [])),
    // Ce que la bascule note à côté des versions, à l'heure du test.
    compteRendu(enService: string, refus?: { refusee: string; motif: string }) {
      const lignes = [`clone=${clone}`, `en-service=${enService}`, ...(refus ? [`refusee=${refus.refusee}`, `motif=${refus.motif}`] : [])];
      writeFileSync(join(versions, "bascule"), `${lignes.join("\n")}\n`);
      utimesSync(join(versions, "bascule"), heure.maintenant(), heure.maintenant());
    },
    // Le geste a mis le clone à jour depuis son origine, comme il le fait avant de basculer.
    mettreLeCloneAJour: () => git(clone, "pull", "-q", "--ff-only"),
    bloc: () => blocAttend(journal(), heure.maintenant()),
  };
}

test("quand la branche avance, la box passe seule à la nouvelle version : aucune commande, aucune demande du chef — le geste part, la version démarre, et la file dit « passé en <sha> à <hh:mm> »", async (t) => {
  const { premiere, livrer, sudo, heure, journal, arreter, demarrerSur, comparee, lances, conclusions, compteRendu, mettreLeCloneAJour, bloc } = box(t);
  demarrerSur(premiere);
  // À jour : rien ne part.
  await jusqua(() => comparee()?.outcome === "current");
  await ticks(journal());
  assert.deepEqual(sudo.lancements(), []);
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);

  // La branche avance : le runtime le voit à sa comparaison, et lance le geste
  // de box de lui-même.
  const nouvelle = livrer();
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  // Personne ne l'a demandé : le journal n'a que le lancement, écrit par le runtime.
  assert.deepEqual(typesDeGestes(journal()), ["deploy.launched"]);
  assert.deepEqual(lances(), [{ author: "runtime", payload: { command: ["sudo", ...ARGUMENTS], flying: [], log: JOURNAL_DU_GESTE, served: premiere, target: nouvelle, auto: true } }]);
  // L'essai ne retient pas la cuisine, et la file n'en dit rien tant qu'il tourne : seul un essai raté s'y lit.
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);
  // Une fois : les ticks et les comparaisons suivantes ne le relancent pas.
  await ticks(journal(), 10);
  assert.equal(sudo.lancements().length, 1);

  // La box : le clone mis à jour, le runtime arrêté et relancé sur la version
  // posée, qui démarre.
  mettreLeCloneAJour();
  heure.avancer(30_000);
  arreter();
  demarrerSur(nouvelle);
  compteRendu(nouvelle);
  sudo.liberer();

  assert.deepEqual(conclusions(), [{ outcome: "served", served: nouvelle }]);
  await jusqua(() => comparee()?.outcome === "current");
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", `  passé en ${sha(nouvelle)} à ${hhmm("2026-10-08T10:00:30.000Z")}`, "fin attend"]);
  // Rien d'autre ne part : la version en service est celle de la branche.
  await ticks(journal(), 10);
  assert.equal(sudo.lancements().length, 1);
  // Le lendemain, la ligne ne se lit plus : l'heure seule tromperait.
  heure.avancer(24 * 3_600_000);
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);
});

test("une version qui ne démarre pas : la bascule remet l'ancienne, qui reprend la main — la file dit « essai de <sha> raté à <hh:mm> : <raison> — <sha> reste en service », et la même version n'est pas réessayée, même au démarrage suivant", async (t) => {
  const { premiere, livrer, sudo, heure, journal, arreter, demarrerSur, comparee, rapatriee, lances, conclusions, compteRendu, bloc } = box(t);
  demarrerSur(premiere);
  await jusqua(() => comparee()?.outcome === "current");
  const lignes = [`brigade-bascule : la nouvelle version n'a pas démarré pour brigade@${PROJET}.service — ${MOTIF}`];
  sudo.dire("attend", lignes);
  const ratee = livrer();
  await jusqua(() => sudo.lancements().length === 1);

  // La bascule arrête le runtime, essaie la version, la refuse, et relance l'ancienne.
  heure.avancer(40_000);
  arreter();
  compteRendu(premiere, { refusee: ratee, motif: MOTIF });
  heure.avancer(20_000);
  demarrerSur(premiere);
  sudo.liberer();

  assert.deepEqual(conclusions(), [{ outcome: "returned", served: premiere, refused: ratee, reason: MOTIF, tail: lignes.join("\n") }]);
  // L'ancienne reprend la main : c'est elle qui tourne, qui bat, et qui compare.
  await jusqua(() => comparee()?.outcome === "waiting");
  const relue = comparee();
  assert.ok(relue?.outcome === "waiting");
  assert.deepEqual([relue.served, relue.head], [premiere, ratee]);
  await ticks(journal(), 10);
  assert.deepEqual(bloc().slice(1), [
    `  version  depuis …  essai de ${sha(ratee)} raté à ${hhmm("2026-10-08T10:01:00.000Z")} : ${MOTIF} — ${sha(premiere)} reste en service`,
    "fin attend",
  ]);
  assert.equal(bloc()[0], "attend     1 décision attend le chef depuis …");

  // Au cycle suivant, et aux suivants : la version ratée n'est pas réessayée.
  await comparaisons(journal(), rapatriee);
  assert.equal(sudo.lancements().length, 1);
  assert.equal(lances().length, 1);

  // Ni après un redémarrage qui n'est pas le sien : ce qui dit qu'elle a raté
  // survit aux démarrages, et la file le dit encore.
  arreter();
  demarrerSur(premiere);
  await jusqua(() => comparee()?.outcome === "waiting");
  await ticks(journal(), 10);
  assert.equal(sudo.lancements().length, 1);
  assert.equal(conclusions().length, 1);
  assert.match(bloc()[1] ?? "", new RegExp(`essai de ${sha(ratee)} raté à `));
});

test("une version ratée sans redémarrage — la bascule refuse une unité changée — n'est pas réessayée ; la suivante que la branche porte l'est, une fois", async (t) => {
  const { premiere, livrer, sudo, heure, journal, demarrerSur, comparee, rapatriee, lances, bloc } = box(t);
  demarrerSur(premiere);
  await jusqua(() => comparee()?.outcome === "current");
  const refus = [
    "brigade-mise-en-service : le clone a reçu 1 commit(s) de son origine",
    "brigade-bascule : la version change des unités posées sous /etc/systemd/system : brigade@.service — rien n'a été arrêté",
  ];
  sudo.dire(72, refus);
  const ratee = livrer();
  await jusqua(() => typesDeGestes(journal()).includes("deploy.exited"));
  assert.deepEqual(gestes(journal()).at(-1)?.payload, { code: 72, signal: null, tail: refus.join("\n") });

  // Le runtime n'a pas été arrêté : c'est lui qui dit l'échec, et la file le lit.
  assert.deepEqual(bloc().slice(1), [
    `  version  depuis …  essai de ${sha(ratee)} raté à ${hhmm(heure.maintenant().toISOString())} : le geste de box a rendu 72 (la version change une unité posée) — « ${refus[1]} » — ${sha(premiere)} reste en service`,
    "      les dernières lignes du geste de box :",
    ...refus.map((ligne) => `      │ ${ligne}`),
    "fin attend",
  ]);
  // Les comparaisons suivantes redisent la même version : elle n'est pas réessayée.
  await comparaisons(journal(), rapatriee);
  assert.equal(sudo.lancements().length, 1);

  // Une version plus récente arrive : elle est essayée, une fois.
  sudo.regler("attend");
  const suivante = livrer();
  await jusqua(() => sudo.lancements().length === 2);
  assert.deepEqual(
    lances().map(({ payload }) => payload.target),
    [ratee, suivante],
  );
  assert.equal(lances()[1]?.payload.auto, true);
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);
  await ticks(journal(), 10);
  assert.equal(sudo.lancements().length, 2);
});

test("une version plus récente que la version ratée est essayée, après le retour de l'ancienne : celle qui a raté ne l'est plus jamais", async (t) => {
  const { premiere, livrer, sudo, heure, journal, arreter, demarrerSur, comparee, lances, conclusions, compteRendu, bloc } = box(t);
  demarrerSur(premiere);
  await jusqua(() => comparee()?.outcome === "current");
  const ratee = livrer();
  await jusqua(() => sudo.lancements().length === 1);
  heure.avancer(40_000);
  arreter();
  compteRendu(premiere, { refusee: ratee, motif: MOTIF });
  demarrerSur(premiere);
  sudo.liberer();
  await jusqua(() => comparee()?.outcome === "waiting");
  await ticks(journal(), 10);
  assert.equal(sudo.lancements().length, 1);

  // Une livraison corrige la version ratée : la branche porte une tête plus
  // récente, que le runtime essaie de lui-même.
  sudo.retenir();
  const corrigee = livrer();
  await jusqua(() => sudo.lancements().length === 2);
  assert.deepEqual(
    lances().map(({ payload }) => [payload.target, payload.served, payload.auto]),
    [
      [ratee, premiere, true],
      [corrigee, premiere, true],
    ],
  );
  // Elle démarre : la file dit le passage, plus l'échec d'avant.
  heure.avancer(60_000);
  arreter();
  demarrerSur(corrigee);
  compteRendu(corrigee);
  sudo.liberer();
  assert.deepEqual(conclusions().at(-1), { outcome: "served", served: corrigee });
  await jusqua(() => comparee()?.outcome === "current");
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", `  passé en ${sha(corrigee)} à ${hhmm(heure.maintenant().toISOString())}`, "fin attend"]);
});

test("hors d'une version posée par la bascule, rien n'est essayé seul : rien ne dit ce qui est en service, et il n'y a pas de box à mettre à jour", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sudo = fauxSudo(t);
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20 });
  const runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env, attenteAuDemarrageMs: 0 });
  aArreter(t, () => {
    runtime.arreter("test");
    sudo.finir();
  });
  runtime.journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "version.compared", payload: { outcome: "waiting", served: "a".repeat(40), branch: SUIVIE, head: "b".repeat(40), since: "2026-10-08T08:21:07.000Z", deliveries: 2 } });
  await ticks(runtime.journal, 10);
  assert.deepEqual(sudo.lancements(), []);
  assert.deepEqual(typesDeGestes(runtime.journal), []);
});

test("un runtime qui vient de démarrer n'essaie rien tout de suite : la bascule qui l'a lancé est peut-être encore à le confirmer", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sources = join(realpathSync(repertoireTemporaire(t)), "brigade-versions", PROJET, "a".repeat(40), "runtime/src");
  mkdirSync(sources, { recursive: true });
  const sudo = fauxSudo(t);
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20 });
  const runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env, sources, attenteAuDemarrageMs: 3_600_000 });
  aArreter(t, () => {
    runtime.arreter("test");
    sudo.finir();
  });
  runtime.journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "version.compared", payload: { outcome: "waiting", served: "a".repeat(40), branch: SUIVIE, head: "b".repeat(40), since: "2026-10-08T08:21:07.000Z", deliveries: 2 } });
  await ticks(runtime.journal, 10);
  assert.deepEqual(sudo.lancements(), []);
});

test("en cuisine : pendant l'essai, la cuisine continue — un ticket prêt est pris par un cook, et rien n'est retenu", async (t) => {
  const lieu = cuisine(t, { scenario: "bavard" });
  const { journal, gh, etat, cooks, types } = lieu;
  const [servie, tete] = ["a".repeat(40), "b".repeat(40)];
  const sources = join(realpathSync(repertoireTemporaire(t)), "brigade-versions", PROJET, servie, "runtime/src");
  mkdirSync(sources, { recursive: true });
  const sudo = fauxSudo(t, "attend");
  const tenu = brancherMiseEnService(lieu.runtime, { repertoireEtat: lieu.repertoire, env: sudo.env, sources, attenteAuDemarrageMs: 0 });
  aArreter(t, () => {
    tenu.arreter("test");
    sudo.finir();
  });
  const enAttente: Fait = { type: "version.compared", payload: { outcome: "waiting", served: servie, branch: SUIVIE, head: tete, since: "2026-10-08T08:21:07.000Z", deliveries: 3 } };
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...enAttente });

  // L'essai part : le geste de box tourne, et ne rend pas la main.
  await jusqua(() => sudo.lancements().length === 1);
  const [geste] = sudo.lancements();

  // Un ticket devient prêt pendant l'essai : un cook le prend.
  gh.poser(issue(16));
  await jusqua(() => cooks().length === 1 && etat(16) === "taken");
  assert.ok(types(16).includes("cook.launched"));
  // L'essai tourne toujours, et rien n'a retenu la station.
  assert.equal(vivant(geste?.pid), true);
  assert.deepEqual(typesDeGestes(journal), ["deploy.launched"]);
  assert.equal(journal.tout().some(({ type, payload }) => type === "station.held" && (payload as { reason?: string }).reason === "deploy"), false);
});

test("une demande du chef qui attendait le rail calme n'a plus d'objet quand le runtime essaie la version seul : elle s'éteint, et ne retient plus aucun cook", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sources = join(realpathSync(repertoireTemporaire(t)), "brigade-versions", PROJET, "a".repeat(40), "runtime/src");
  mkdirSync(sources, { recursive: true });
  const sudo = fauxSudo(t, "attend");
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20 });
  const runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env, sources, attenteAuDemarrageMs: 0 });
  aArreter(t, () => {
    runtime.arreter("test");
    sudo.finir();
  });
  const noter = (fait: Fait, author = "runtime") => runtime.journal.ajouter({ project: PROJET, ticket: null, author, ...fait });
  noter({ type: "version.compared", payload: { outcome: "waiting", served: "a".repeat(40), branch: SUIVIE, head: "b".repeat(40), since: "2026-10-08T08:21:07.000Z", deliveries: 2 } });
  // Un cook en vol, et la demande du chef qui l'attend — écrits d'un trait :
  // le runtime ne se réveille qu'après.
  noter({ type: "cook.launched", payload: { run: "12-aaaa", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/12-aaaa.jsonl", station: "box/claude" } });
  noter({ type: "deploy.requested", payload: { cut: false } }, "chef");

  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(typesDeGestes(runtime.journal), ["deploy.requested", "deploy.launched"]);
  assert.equal((gestes(runtime.journal).at(-1)?.payload as { auto?: boolean } | undefined)?.auto, true);
});

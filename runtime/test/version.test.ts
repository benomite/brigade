// La version en attente : le runtime compare la version qu'il sert à la branche
// que le clone de brigade suit, lue sur son origine — jamais dans le clone —,
// et la file du projet le dit : le bloc `attend` de `status`, et `faits`. Ni
// réseau ni box ici : une origine nue, un clone que personne ne met à jour, une
// version posée comme la bascule la pose, et de vrais `git`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { SOURCES } from "../src/code.ts";
import { decrireEtat, ETATS_DE_VERSION, faits, lireEtat } from "../src/etat.ts";
import type { Comparaison } from "../src/evenements/version.ts";
import { principal as commandeFaits } from "../src/faits.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demarrer, type CauseReveil } from "../src/runtime.ts";
import { principal as status } from "../src/status.ts";
import { brancherVersion, comparerVersion, suivreVersion, versionPosee } from "../src/version.ts";
import { aArreter, appeler, BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, JOUR_HORLOGE, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const PROJET = "calculus";
const SUIVIE = `origin/${BASE}`;
const RIEN = ["attend     rien n'attend le chef"];
const court = (commit: string) => commit.slice(0, 12);
const a = (heure: string) => `${JOUR_HORLOGE}T${heure}.000Z`;

// Une box : l'origine de brigade, le clone (`brigade`) qui suit sa branche, et
// à côté de lui la version que la bascule a posée de son commit — celle que le
// runtime du projet sert. Le clone n'est plus touché ensuite : ce que
// l'origine reçoit, personne ne le lui rapatrie.
function box(t: TestContext) {
  const racine = realpathSync(repertoireTemporaire(t));
  const sous = (nom: string) => join(racine, nom);
  const [origine, travail, clone, etat] = [sous("origine.git"), sous("travail"), sous("brigade"), sous("etat")];
  const ecrire = (fichier: string, contenu: string) => {
    mkdirSync(dirname(join(travail, fichier)), { recursive: true });
    writeFileSync(join(travail, fichier), contenu);
  };
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  ecrire("runtime/src/main.ts", "amorce\n");
  ecrire("docs/runtime.md", "amorce\n");
  git(travail, "add", ".");
  git(travail, "commit", "-q", "-m", "amorce");
  git(travail, "push", "-q", origine, BASE);
  git(racine, "clone", "-q", "--branch", BASE, origine, clone);
  const servie = git(clone, "rev-parse", "HEAD");
  const poser = (commit: string) => {
    const sources = join(`${clone}-versions`, PROJET, commit, "runtime/src");
    mkdirSync(sources, { recursive: true });
    return sources;
  };
  const sources = poser(servie);

  let rang = 0;
  // Une livraison mergée sur l'origine à cet instant : une branche, un commit,
  // son merge sur la ligne principale. Rend le commit du merge.
  const livrer = (fichier: string, quand: string): string => {
    const branche = `cook/${++rang}`;
    git(travail, "checkout", "-q", "-b", branche);
    ecrire(fichier, `${branche}\n`);
    git(travail, "add", ".");
    git(travail, "commit", "-q", "-m", `livre ${fichier}`);
    git(travail, "checkout", "-q", BASE);
    execFileSync("git", ["merge", "-q", "--no-ff", "-m", `Merge ${branche}`, branche], { cwd: travail, env: { ...ENV_GIT, GIT_AUTHOR_DATE: quand, GIT_COMMITTER_DATE: quand }, stdio: "ignore" });
    git(travail, "push", "-q", origine, BASE);
    return git(travail, "rev-parse", "HEAD");
  };

  // Le runtime du projet, dont le test tient l'horloge et les réveils.
  let instant = a("12:00:00");
  const ouvrir = () => {
    const runtime = demarrer({ repertoireEtat: etat, projet: PROJET, maintenant: () => new Date(instant), intervalleVeilleMs: 3_600_000, intervalleTickMs: 3_600_000 });
    aArreter(t, () => runtime.arreter("test"));
    return runtime;
  };
  let runtime = ouvrir();
  const lire = (maintenant: string) => {
    const lu = lireEtat(runtime.journal, new Date(maintenant));
    const lignes = decrireEtat(lu, new Date(maintenant));
    // Le bloc `attend`, pris par son bord, sans sa ligne de fin.
    return { bloc: lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("attend")), lignes.indexOf("fin attend")), forme: faits(lu, new Date(maintenant)) };
  };
  return {
    origine,
    clone,
    etat,
    servie,
    sources,
    poser,
    livrer,
    lire,
    journal: () => runtime.journal,
    runtime: () => runtime,
    // Les comparaisons que le journal porte, dans l'ordre.
    comparees: () => runtime.journal.tout().flatMap((evenement) => (evenement.type === "version.compared" ? [evenement.payload] : [])),
    comparer: (commit = servie) => comparerVersion({ clone, commit }, etat, { env: ENV_GIT }),
    suivre: () => suivreVersion(runtime, { clone, commit: servie }, { repertoireEtat: etat, env: ENV_GIT }),
    // Le runtime redémarre : la même version, le même répertoire d'état.
    redemarrer: () => {
      runtime.arreter("test");
      runtime = ouvrir();
    },
    a: (heure: string) => void (instant = heure),
  };
}

test("une version posée par la bascule se reconnaît à son chemin — son commit, le clone d'où elle vient, et là où sont rangées les versions de son projet ; ailleurs, aucune version n'est en service à part du clone", (t) => {
  const { clone, servie, sources } = box(t);
  assert.deepEqual(versionPosee(sources), { clone, commit: servie, versions: join(`${clone}-versions`, PROJET) });
  // L'unité lance le runtime sous le lien `en-service` : c'est la version qu'il désigne.
  symlinkSync(servie, join(`${clone}-versions`, PROJET, "en-service"));
  assert.deepEqual(versionPosee(join(`${clone}-versions`, PROJET, "en-service/runtime/src")), { clone, commit: servie, versions: join(`${clone}-versions`, PROJET) });

  // Le poste de dev, une box pas encore basculée : le runtime tourne sur un clone.
  assert.equal(versionPosee(SOURCES), null);
  assert.equal(versionPosee(join(clone, "runtime/src")), null);
  assert.equal(versionPosee(join(clone, "absent/runtime/src")), null);
});

test("version à jour : la branche de l'origine porte le `runtime/src` qui est servi — le bloc dit toujours « rien n'attend le chef », et `faits` dit `à jour` ; une livraison qui ne touche pas au runtime n'en fait attendre aucune", async (t) => {
  const { servie, livrer, comparer, suivre, lire, comparees } = box(t);
  assert.deepEqual(await comparer(), { outcome: "current", served: servie, branch: SUIVIE });

  // La branche avance, pas le code que `node` exécute.
  livrer("docs/runtime.md", a("11:00:00"));
  await suivre().comparer();
  assert.deepEqual(comparees(), [{ outcome: "current", served: servie, branch: SUIVIE }]);
  const { bloc, forme } = lire(a("12:30:00"));
  assert.deepEqual(bloc, RIEN);
  assert.equal(forme.compteurs.attend, 0);
  assert.deepEqual(forme.version, { etat: "à jour", depuis: a("12:00:00"), branche: SUIVIE, enService: servie, enAttente: null, livraisons: null, raison: null });
});

test("version en attente : la branche a reçu des livraisons sur l'origine, le clone n'a pas été mis à jour — le bloc `attend` nomme la version, depuis quand elle est en retard, et combien de livraisons ne sont pas en service", async (t) => {
  const { clone, etat, servie, livrer, suivre, lire, comparees } = box(t);
  livrer("runtime/src/a.ts", a("08:21:07"));
  livrer("docs/runtime.md", a("09:00:00"));
  const tete = livrer("runtime/src/b.ts", a("09:46:00"));
  await suivre().comparer();

  // Deux livraisons changent le runtime ; celle de la doc n'est pas à mettre en service.
  assert.deepEqual(comparees(), [{ outcome: "waiting", served: servie, branch: SUIVIE, head: tete, since: a("08:21:07"), deliveries: 2 }]);
  const { bloc, forme } = lire(a("13:21:07"));
  assert.deepEqual(bloc, [
    "attend     1 décision attend le chef depuis 5 h 00",
    `  version  depuis 5 h 00  une version attend : ${SUIVIE} (${court(tete)}) porte un runtime qui n'est pas en service — en service : ${court(servie)}, en retard depuis le ${a("08:21:07")} ; 2 livraisons non en service — à mettre en service : \`run mise-en-service\`, qui dit d'abord ce qui est en vol et ce que ça a coûté, puis attend le rail calme sans interrompre aucun cook — ou \`run mise-en-service -- --couper\`, sans attendre : les cooks en vol sont interrompus, et leurs tickets repris par des cooks neufs`,
  ]);
  assert.equal(forme.compteurs.attend, 1);
  assert.deepEqual(forme.attend, []);
  assert.deepEqual(forme.version, { etat: "en attente", depuis: a("08:21:07"), branche: SUIVIE, enService: servie, enAttente: tete, livraisons: 2, raison: null });

  // Le clone est resté où il était, et rien n'y a été écrit : c'est l'origine qui a été lue, dans un dépôt du runtime.
  assert.equal(git(clone, "rev-parse", "HEAD"), servie);
  assert.equal(git(clone, "rev-parse", `refs/remotes/${SUIVIE}`), servie);
  assert.equal(existsSync(join(clone, ".git/FETCH_HEAD")), false);
  assert.equal(existsSync(join(etat, "version.git/HEAD")), true);
});

test("version non comparée : l'origine ne répond pas — le bloc le dit, avec le motif et depuis quand, et jamais « à jour » ; quand elle répond de nouveau, l'entrée sort seule", async (t) => {
  const { origine, servie, livrer, suivre, lire, comparees, a: regler } = box(t);
  livrer("runtime/src/a.ts", a("08:21:07"));
  renameSync(origine, `${origine}.partie`);
  const suivi = suivre();
  await suivi.comparer();

  const [comparee] = comparees();
  assert.ok(comparee?.outcome === "unreadable");
  assert.deepEqual({ ...comparee, reason: "" }, { outcome: "unreadable", served: servie, branch: SUIVIE, reason: "" });
  assert.match(comparee.reason, /^l'origine n'a pas rendu origin\/v2 — .*does not appear to be a git repository/);
  const { bloc, forme } = lire(a("12:12:00"));
  assert.deepEqual(bloc, [
    "attend     1 décision attend le chef depuis 12 min",
    `  version  depuis 12 min  version non comparée à ${SUIVIE} : ${comparee.reason} — rien ne dit que la version en service (${court(servie)}) est à jour ; la comparaison est reprise seule, toutes les 10 min`,
  ]);
  assert.deepEqual(forme.version, { etat: "non comparée", depuis: a("12:00:00"), branche: SUIVIE, enService: servie, enAttente: null, livraisons: null, raison: comparee.reason });

  // L'origine revient : la version qui attendait pendant ce temps se lit.
  renameSync(`${origine}.partie`, origine);
  regler(a("12:20:00"));
  await suivi.comparer();
  assert.deepEqual(comparees().map(({ outcome }) => outcome), ["unreadable", "waiting"]);
  assert.match(lire(a("12:21:00")).bloc[1] ?? "", /^ {2}version {2}depuis 3 h 59 {2}une version attend : .* 1 livraison non en service — /);
});

test("ce qui empêche de comparer est une réponse, pas un silence : un clone qui ne se lit pas ou ne suit aucune branche, une version hors de l'histoire de la branche", async (t) => {
  const { clone, servie, poser, comparer, suivre, lire, a: regler } = box(t);
  const illisible = async (commit = servie) => {
    const comparee = await comparer(commit);
    assert.equal(comparee.outcome, "unreadable");
    return comparee as Extract<Comparaison, { outcome: "unreadable" }>;
  };

  // Une version posée d'un commit que l'origine n'a jamais reçu.
  writeFileSync(join(clone, "runtime/src/main.ts"), "ici seulement\n");
  git(clone, "commit", "-q", "-a", "-m", "ici seulement");
  const locale = git(clone, "rev-parse", "HEAD");
  poser(locale);
  assert.deepEqual(await illisible(locale), { outcome: "unreadable", served: locale, branch: SUIVIE, reason: `la version en service (${court(locale)}) n'est pas dans l'histoire de ${SUIVIE} (${court(servie)}) : ce qui les sépare ne se compte pas` });

  // Un clone en tête détachée : `git pull` n'y rapatrierait rien.
  git(clone, "checkout", "-q", "--detach");
  assert.match((await illisible()).reason, /^le clone de brigade \(.*\) ne dit pas sur quelle branche il est — /);
  assert.equal((await illisible()).branch, null);

  // Deux motifs de suite : la version n'est pas comparée depuis le premier.
  const suivi = suivre();
  await suivi.comparer();
  rmSync(clone, { recursive: true });
  regler(a("12:10:00"));
  await suivi.comparer();
  const { bloc, forme } = lire(a("12:30:00"));
  assert.match(bloc[1] ?? "", /^ {2}version {2}depuis 30 min {2}version non comparée à son origine : le clone de brigade \(.*\) ne dit pas sur quelle branche il est — .*cannot change to/);
  assert.equal(forme.version?.depuis, a("12:00:00"));
  assert.equal(forme.version?.branche, null);
});

test("une comparaison ne s'écrit que lorsque sa réponse change, et ne vaut que pour le runtime qui l'a faite : au redémarrage rien n'est dit — ni en attente, ni à jour — avant la comparaison suivante", async (t) => {
  const { servie, livrer, suivre, lire, comparees, redemarrer } = box(t);
  let suivi = suivre();
  await suivi.comparer();
  await suivi.comparer();
  assert.deepEqual(comparees().map(({ outcome }) => outcome), ["current"]);
  livrer("runtime/src/a.ts", a("11:00:00"));
  await suivi.comparer();
  await suivi.comparer();
  assert.deepEqual(comparees().map(({ outcome }) => outcome), ["current", "waiting"]);

  // Un suivi lâché n'écrit plus : son runtime s'arrête.
  suivi.lacher();
  const derniere = livrer("runtime/src/b.ts", a("11:30:00"));
  await suivi.comparer();
  assert.equal(comparees().length, 2);

  redemarrer();
  const { bloc, forme } = lire(a("12:30:00"));
  assert.deepEqual(bloc, RIEN);
  assert.equal(forme.version, null);
  suivi = suivre();
  await suivi.comparer();
  assert.deepEqual(comparees().at(-1), { outcome: "waiting", served: servie, branch: SUIVIE, head: derniere, since: a("11:00:00"), deliveries: 2 });
  assert.equal(lire(a("12:30:00")).forme.version?.livraisons, 2);
});

test("branché sur le runtime : il compare d'emblée, puis au tick une fois la cadence passée ; sans version posée, il ne fait rien — aucun `git`, aucun fait", async (t) => {
  const { etat, sources, livrer, runtime, comparees } = box(t);
  const socle = runtime();

  // Sur un clone, rien n'est branché : le runtime rendu est celui qui a été donné.
  assert.equal(brancherVersion(socle, { repertoireEtat: etat, env: ENV_GIT, sources: SOURCES }), socle);
  assert.equal(existsSync(join(etat, "version.git")), false);

  const reveils: Array<(cause: CauseReveil) => void> = [];
  const branche = brancherVersion({ ...socle, surReveil: (ecouter) => (reveils.push(ecouter), () => {}) }, { repertoireEtat: etat, env: ENV_GIT, sources, cadenceMs: 0 });
  await jusqua(() => comparees().length === 1);
  livrer("runtime/src/a.ts", a("11:00:00"));
  // Un autre process a écrit : ce n'est pas le moment de comparer.
  for (const reveiller of reveils) reveiller("log");
  await jusqua(() => {
    for (const reveiller of reveils) reveiller("tick");
    return comparees().length === 2;
  });
  assert.deepEqual(comparees().map(({ outcome }) => outcome), ["current", "waiting"]);
  // Son arrêt est celui du runtime, et lâche d'abord la comparaison en cours.
  branche.arreter("test");
  assert.throws(() => socle.journal.dernierSeq());
});

test("sur le vrai process, lancé de la version posée comme l'unité le lance : il dit ce qu'il compare, l'écrit, et `status` comme `faits` — d'autres process — le relaient ; arrêté pendant qu'il tourne, il rend la main", async (t) => {
  const { clone, servie, sources, livrer } = box(t);
  // La version que la bascule pose : le `runtime/` du commit, et le lien que l'unité suit.
  cpSync(SOURCES, sources, { recursive: true });
  cpSync(join(SOURCES, "../package.json"), join(sources, "../package.json"));
  symlinkSync(servie, join(`${clone}-versions`, PROJET, "en-service"));
  const main = join(`${clone}-versions`, PROJET, "en-service/runtime/src/main.ts");
  const repertoire = repertoireTemporaire(t);
  const depot = repertoireTemporaire(t);
  git(depot, "init", "-q");
  const gh = fauxGh(t);
  gh.issues([]);
  const env = {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: PROJET,
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: depot,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_STATIONS: "box/claude:30:code",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  const comparees = () => {
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return journal.tout().flatMap((evenement) => (evenement.type === "version.compared" ? [evenement.payload] : []));
    } finally {
      journal.fermer();
    }
  };
  const dire = async (commande: typeof status) => {
    const appel = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await appel.fin, 0, appel.sortie());
    return appel.sortie();
  };

  let runtime = lancer(t, main, [], env);
  await runtime.attendre("démarré");
  assert.match(runtime.sortie(), new RegExp(`brigade : version — ${court(servie)} en service, comparée à la branche que le clone \\(${clone}\\) suit sur son origine, d'emblée puis toutes les 10 min`));
  await jusqua(() => comparees().length === 1);
  assert.deepEqual(comparees(), [{ outcome: "current", served: servie, branch: SUIVIE }]);
  assert.match(await dire(status), /^attend {5}rien n'attend le chef\nfin attend$/m);
  assert.equal(JSON.parse(await dire(commandeFaits)).version.etat, "à jour");
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);

  // Une livraison arrive sur l'origine, runtime arrêté : celui qui repart la voit d'emblée.
  const tete = livrer("runtime/src/a.ts", a("08:21:07"));
  runtime = lancer(t, main, [], env);
  await runtime.attendre("démarré");
  await jusqua(() => comparees().length === 2);
  const bloc = await dire(status);
  assert.match(bloc, /^attend {5}1 décision attend le chef depuis /m);
  assert.match(bloc, new RegExp(`^  version  depuis .*  une version attend : ${SUIVIE} \\(${court(tete)}\\) porte un runtime qui n'est pas en service — en service : ${court(servie)}, en retard depuis le ${a("08:21:07")} ; 1 livraison non en service — à mettre en service : \`run mise-en-service\`, qui dit d'abord ce qui est en vol`, "m"));
  const forme = JSON.parse(await dire(commandeFaits));
  assert.deepEqual(forme.version, { etat: "en attente", depuis: a("08:21:07"), branche: SUIVIE, enService: servie, enAttente: tete, livraisons: 1, raison: null });
  assert.equal(forme.compteurs.attend, 1);
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

test("la liste des états d'une version est fermée : `faits` n'en écrit aucun autre", () => {
  assert.deepEqual(ETATS_DE_VERSION, ["à jour", "en attente", "non comparée"]);
});

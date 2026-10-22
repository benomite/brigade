// L'étape « decisions » de l'installation : le chef — ou l'app, pour lui — lit
// chaque décision que l'installation pose, avec sa question, ses options et
// leur effet, la valeur recommandée et ce qui se passe s'il la saute ; il
// répond, et ses réponses sont posées au journal du projet, sans `sudo` ni
// drop-in. Répondue pendant l'installation, aucune n'attend plus le chef au
// démarrage.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { attentesDuChef } from "../src/attend.ts";
import { DECISIONS, decisionsPosees, OBLIGATOIRES, verifierDecision } from "../src/decisions.ts";
import { principal as declarerStations } from "../src/declarer-stations.ts";
import { installationDe, noterEtape } from "../src/etapes.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { POSABLES, principal } from "../src/poser-decisions.ts";
import { lireRail } from "../src/projections/rail.ts";
import { appeler, BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, lancer, repertoireTemporaire } from "./outils.ts";

const INSTALLATION = join(import.meta.dirname, "../src/installation-cli.ts");
const MAIN = join(import.meta.dirname, "../src/main.ts");
const PROJET = "espace";

// Une réponse que le runtime lit, pour chaque décision de l'étape.
const REPONSES = [
  ["manager-modele", "sonnet"],
  ["manager-effort", "medium"],
  ["reviewer-modele", "sonnet"],
  ["reviewer-effort", "medium"],
  ["seuil-ticket", "800000"],
  ["seuil-perdus", "300000"],
  ["seuil-renvois", "40"],
  ["fenetre-renvois", "12"],
  ["budget-gates", "120"],
  ["budget-gates-cpu", "500"],
  ["closer-modele", "sonnet"],
  ["closer-effort", "medium"],
  ["closer-cooks", "1"],
  ["closer-tokens", "500000"],
  ["closer-retraits", "500"],
  ["ceiling-modele", "opus"],
  ["ceiling-effort", "high"],
] as const;
const RECLAMEES = REPONSES.slice(0, 4);

type Lue = {
  etape: { id: string; etat: string };
  decisions: Array<{
    nom: string;
    decision: string;
    question: string;
    options: Array<{ valeur: string; effet: string }>;
    recommandee: { valeur: string; pourquoi: string } | null;
    sauter: string;
    reclamee: boolean;
    posee: string | null;
  }>;
  manquantes: string[];
};

const env = (etat: string) => ({ BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: PROJET });

async function lire(etat: string): Promise<Lue> {
  const appel = appeler(principal, ["--json"], env(etat));
  assert.equal(await appel.fin, 0, appel.sortie());
  return JSON.parse(appel.sortie()) as Lue;
}

async function repondre(etat: string, args: readonly string[]) {
  const appel = appeler(principal, [...args], env(etat));
  return { code: await appel.fin, sortie: appel.sortie() };
}

function evenements(etat: string) {
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return journal.tout();
  } finally {
    journal.fermer();
  }
}

test("l'étape pose toutes les décisions du chef, sauf les stations qui ont la leur ; celles que le démarrage réclame sont dites telles", () => {
  assert.deepEqual(POSABLES.map((posable) => posable.decision).sort(), DECISIONS.filter((decision) => decision !== "BRIGADE_STATIONS").sort());
  assert.deepEqual(REPONSES.map(([nom]) => nom), POSABLES.map((posable) => posable.nom));
  for (const posable of POSABLES) assert.equal(posable.reclamee, OBLIGATOIRES.includes(posable.decision), posable.nom);
  // Celles que le démarrage réclame d'abord.
  assert.deepEqual(POSABLES.filter((posable) => posable.reclamee).map((posable) => posable.nom), RECLAMEES.map(([nom]) => nom));
});

test("chaque décision a sa question, ses options et l'effet de chacune, sa phrase « si je la saute » ; une option ou une recommandation est une valeur que le runtime lit", () => {
  for (const posable of POSABLES) {
    assert.match(posable.question, /\?$/, posable.nom);
    assert.ok(posable.options.length > 0, posable.nom);
    for (const option of posable.options) {
      assert.ok(option.effet.length > 10, `${posable.nom} ${option.valeur}`);
      if (!option.valeur.startsWith("<")) assert.doesNotThrow(() => verifierDecision(posable.decision, option.valeur), `${posable.nom} ${option.valeur}`);
    }
    assert.ok(posable.sauter.length > 10, posable.nom);
    if (posable.recommandee !== null) {
      assert.doesNotThrow(() => verifierDecision(posable.decision, posable.recommandee?.valeur ?? ""), posable.nom);
      assert.ok(posable.recommandee.pourquoi.length > 10, posable.nom);
      // Une recommandation parmi des valeurs nommées en est une.
      if (!posable.options.some((option) => option.valeur.startsWith("<"))) assert.ok(posable.options.some((option) => option.valeur === posable.recommandee?.valeur), posable.nom);
    }
  }
  // Celles que le démarrage réclame : le sauter, c'est un runtime qui refuse de démarrer.
  for (const posable of POSABLES.filter((posable) => posable.reclamee)) assert.match(posable.sauter, /refuse de démarrer/, posable.nom);
});

test("la lecture dit chaque décision, ce qui est posé et ce que le démarrage réclame encore, et ne crée aucun journal", async (t) => {
  const etat = repertoireTemporaire(t);

  const lue = await lire(etat);

  assert.deepEqual(Object.keys(lue), ["etape", "decisions", "manquantes"]);
  assert.deepEqual(lue.etape, { id: "decisions", etat: "à faire" });
  assert.deepEqual(Object.keys(lue.decisions[0] ?? {}), ["nom", "decision", "question", "options", "recommandee", "sauter", "reclamee", "posee"]);
  assert.deepEqual(lue.decisions.map((decision) => decision.nom), REPONSES.map(([nom]) => nom));
  assert.ok(lue.decisions.every((decision) => decision.posee === null));
  assert.deepEqual(lue.decisions[0]?.options.map((option) => option.valeur), ["opus", "sonnet", "haiku"]);
  assert.deepEqual(lue.decisions[0]?.recommandee?.valeur, "sonnet");
  assert.deepEqual(lue.manquantes, ["manager-modele", "manager-effort", "reviewer-modele", "reviewer-effort"]);
  assert.equal(existsSync(join(etat, "log.db")), false);
});

test("les réponses sont posées au journal comme décisions du chef, et l'étape notée faite dès que le démarrage ne réclame plus rien", async (t) => {
  const etat = repertoireTemporaire(t);

  const { code, sortie } = await repondre(etat, RECLAMEES.flat());

  assert.equal(code, 0, sortie);
  assert.match(sortie, /^brigade : manager-modele : sonnet \(c'était : non posée\)$/m);
  assert.match(sortie, /lues par le runtime à sa lecture suivante, sans redémarrage/);
  assert.match(sortie, /« Poser les décisions que le démarrage réclame » notée faite/);
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), {
      BRIGADE_MANAGER_MODEL: "sonnet",
      BRIGADE_MANAGER_EFFORT: "medium",
      BRIGADE_REVIEWER_MODEL: "sonnet",
      BRIGADE_REVIEWER_EFFORT: "medium",
    });
  } finally {
    journal.fermer();
  }
  assert.deepEqual(evenements(etat).map((e) => [e.type, e.author, e.project]), [
    ...RECLAMEES.map(() => ["decision.set", "chef", PROJET]),
    ["installation.step", "chef", PROJET],
  ]);
  const lue = await lire(etat);
  assert.deepEqual(lue.etape, { id: "decisions", etat: "faite" });
  assert.deepEqual(lue.manquantes, []);
  assert.equal(lue.decisions.find((decision) => decision.nom === "reviewer-effort")?.posee, "medium");
});

test("une réponse partielle est posée, l'étape reste à faire et la sortie dit ce que le démarrage réclame encore", async (t) => {
  const etat = repertoireTemporaire(t);

  const premiere = await repondre(etat, ["manager-modele", "opus", "seuil-ticket", "800000"]);

  assert.equal(premiere.code, 0, premiere.sortie);
  assert.match(premiere.sortie, /le démarrage réclame encore manager-effort, reviewer-modele, reviewer-effort — « Poser les décisions que le démarrage réclame » reste à faire/);
  assert.equal(installationDe(etat).etapes.find((etape) => etape.id === "decisions")?.etat, "todo");

  const seconde = await repondre(etat, ["manager-effort", "low", "reviewer-modele", "haiku", "reviewer-effort", "high"]);

  assert.equal(seconde.code, 0, seconde.sortie);
  assert.match(seconde.sortie, /notée faite/);
  assert.equal(installationDe(etat).etapes.find((etape) => etape.id === "decisions")?.etat, "done");
});

test("les étapes qui précèdent faites, l'étape courante passe des décisions au démarrage", async (t) => {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  for (const etape of ["ajout", "init", "verification", "stations", "protection"]) noterEtape(journal, { projet: PROJET, etape, etat: "done", auteur: "chef" });
  journal.fermer();
  assert.equal(installationDe(etat).courante, "decisions");

  assert.equal((await repondre(etat, RECLAMEES.flat())).code, 0);

  assert.equal(installationDe(etat).courante, "demarrage");
});

test("répondre à nouveau la même chose ne réécrit rien", async (t) => {
  const etat = repertoireTemporaire(t);
  await repondre(etat, RECLAMEES.flat());

  const { code, sortie } = await repondre(etat, ["manager-modele", "sonnet"]);

  assert.equal(code, 0, sortie);
  assert.match(sortie, /manager-modele : déjà posée — sonnet ; rien n'est réécrit/);
  assert.equal(evenements(etat).length, RECLAMEES.length + 1);
});

test("une réponse que le runtime ne lirait pas est refusée avant d'écrire : ni décision, ni étape, ni journal", async (t) => {
  const etat = repertoireTemporaire(t);

  for (const [args, motif] of [
    [["manager-modele", "gpt"], /BRIGADE_MANAGER_MODEL invalid: “gpt” — expected opus, sonnet or haiku — rien n'est écrit/],
    // Une bonne réponse avec une mauvaise : rien de l'une ni de l'autre.
    [["manager-effort", "medium", "seuil-ticket", "beaucoup"], /BRIGADE_DRIFT_TICKET_TOKENS invalid.* rien n'est écrit/],
    [["manager-modele"], /une réponse est une décision suivie de sa valeur/],
    [["manager-modele", "sonnet", "manager-modele", "opus"], /manager-modele est donnée deux fois/],
    [["plat-du-jour", "oui"], /« plat-du-jour » n'est pas une décision que l'installation pose — attendu manager-modele, /],
    [["stations", "box/claude:2:code"], /les stations ont leur étape : `installation stations`/],
    [["manager-modele", "  "], /an empty value is not a decision/],
    // Le closer se règle par les deux, ou par aucun : le runtime refuserait l'un sans l'autre.
    [["closer-modele", "sonnet"], /BRIGADE_CLOSING_EFFORT is not set — the closer is set by both, or by neither.* — donner closer-modele et closer-effort dans la même réponse — rien n'est écrit/],
  ] as const) {
    const { code, sortie } = await repondre(etat, args);
    assert.equal(code, 2, `${args.join(" ")} : ${sortie}`);
    assert.match(sortie, motif);
  }
  assert.equal(existsSync(join(etat, "log.db")), false);

  // Le modèle et l'effort du closer dans la même réponse : posés ensemble.
  const closer = await repondre(etat, ["closer-modele", "sonnet", "closer-effort", "medium"]);
  assert.equal(closer.code, 0, closer.sortie);
});

test("sans journal ni projet nommé, rien n'est écrit : rien ne dit à quel projet poser les décisions", async (t) => {
  const etat = repertoireTemporaire(t);

  const appel = appeler(principal, ["manager-modele", "sonnet"], { BRIGADE_STATE_DIR: etat });

  assert.equal(await appel.fin, 1);
  assert.match(appel.sortie(), /BRIGADE_PROJECT n'est pas défini/);
  assert.equal(existsSync(join(etat, "log.db")), false);
});

test("l'action ne lance aucun geste de box : ni `sudo`, ni `systemctl`, ni drop-in — rien ne peut y manquer", async (t) => {
  const etat = repertoireTemporaire(t);
  const outils = repertoireTemporaire(t);
  const temoin = join(outils, "temoin");
  for (const nom of ["sudo", "systemctl", "tee"]) {
    writeFileSync(join(outils, nom), `#!/bin/sh\necho "${nom} $*" >> "${temoin}"\nexit 1\n`, { mode: 0o755 });
  }

  const commande = lancer(t, INSTALLATION, ["decisions", ...RECLAMEES.flat()], {
    ...env(etat),
    PATH: `${outils}:${process.env.PATH ?? ""}`,
    BRIGADE_SUDO_BIN: join(outils, "sudo"),
    BRIGADE_SYSTEMCTL_BIN: join(outils, "systemctl"),
    BRIGADE_MISE_EN_SERVICE_LIEN: join(outils, "absent"),
  });

  assert.equal(await commande.fin, 0, commande.sortie());
  assert.equal(existsSync(temoin), false, "un geste de box a été lancé");
  assert.equal(installationDe(etat).etapes.find((etape) => etape.id === "decisions")?.etat, "done");
});

test("la commande du chef, en texte : l'étape, puis chaque décision avec sa question, ses options, la recommandée et ce qui arrive si on la saute", async (t) => {
  const etat = repertoireTemporaire(t);

  const commande = lancer(t, INSTALLATION, ["decisions"], env(etat));

  assert.equal(await commande.fin, 0, commande.sortie());
  const sortie = commande.sortie();
  assert.match(sortie, /^brigade : « Poser les décisions que le démarrage réclame » — à faire$/m);
  assert.match(sortie, /^manager-modele — à poser — le démarrage la réclame$/m);
  assert.match(sortie, /^ {2}Quel modèle juge les issues du dépôt/m);
  assert.match(sortie, /^ {4}sonnet {4}fiable pour un coût modéré/m);
  assert.match(sortie, /^ {2}recommandée {6}: sonnet — /m);
  assert.match(sortie, /^ {2}si tu la sautes {2}: Le runtime refuse de démarrer/m);
  assert.match(sortie, /^seuil-ticket — non posée$/m);
  assert.match(sortie, /Pour répondre : `brigade espace installation decisions manager-modele <opus\|sonnet\|haiku> manager-effort <low\|medium\|high\|xhigh\|max> reviewer-modele/);
});

// Le critère de bout en bout : un projet dont l'installation a posé toutes
// ses décisions démarre sans aucune variable de décision dans son
// environnement, et sa file n'en porte aucune.
test("de bout en bout : toutes les décisions posées pendant l'installation, le runtime démarre et rien n'attend le chef", async (t) => {
  const { clone } = depotGit(t);
  const gh = fauxGh(t);
  gh.issues([]);
  const service = (etat: string) => ({
    ...ENV_GIT,
    BRIGADE_STATE_DIR: etat,
    BRIGADE_PROJECT: PROJET,
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
  });

  // Sans l'étape, le démarrage la réclame : le runtime refuse, en nommant ce qui manque.
  const sansEtape = repertoireTemporaire(t);
  const refuse = lancer(t, MAIN, [], service(sansEtape));
  assert.notEqual(await refuse.fin, 0);
  assert.match(refuse.sortie(), /BRIGADE_(MANAGER|REVIEWER)_(MODEL|EFFORT) n'est pas défini/);

  const etat = repertoireTemporaire(t);
  const stations = appeler(declarerStations, ["box/claude:1:code+raisonnement"], { ...env(etat), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE });
  assert.equal(await stations.fin, 0, stations.sortie());
  const { code, sortie } = await repondre(etat, REPONSES.flat());
  assert.equal(code, 0, sortie);

  const runtime = lancer(t, MAIN, [], service(etat));
  await runtime.attendre("démarré");
  // Aucune décision n'est dite manquante, ni ignorée dans l'environnement.
  for (const decision of DECISIONS) assert.equal(runtime.sortie().includes(decision), false, `${decision} : ${runtime.sortie()}`);
  assert.doesNotMatch(runtime.sortie(), /non relu/);
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base)), []);
  } finally {
    journal.fermer();
  }
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

type Courante = {
  enAttente: number;
  courante: { nom: string; question: string; options: unknown[]; sauter: string; avec: { nom: string } | null } | null;
  suivantes: string[];
};

async function courante(etat: string): Promise<Courante> {
  const appel = appeler(principal, ["courante", "--json"], env(etat));
  assert.equal(await appel.fin, 0, appel.sortie());
  return JSON.parse(appel.sortie()) as Courante;
}

test("une lecture renvoie une seule décision courante, avec sa question, ses options, l'effet et combien restent ; répondre passe à la suivante, dans le même ordre à chaque appel", async (t) => {
  const etat = repertoireTemporaire(t);
  const premiere = await courante(etat);
  assert.deepEqual(await courante(etat), premiere);
  assert.equal(premiere.enAttente, REPONSES.length);
  assert.equal(premiere.courante?.nom, "manager-modele");
  assert.ok((premiere.courante?.options.length ?? 0) > 0);
  assert.ok((premiere.courante?.sauter.length ?? 0) > 10);
  assert.deepEqual(premiere.suivantes, REPONSES.slice(1).map(([nom]) => nom));

  const vues: string[] = [];
  for (const [nom, valeur] of REPONSES) {
    const lue = await courante(etat);
    assert.equal(lue.courante?.nom, nom);
    vues.push(nom);
    const reponse = await repondre(etat, nom === "closer-modele" ? ["courante", valeur, "medium"] : nom === "closer-effort" ? ["courante", valeur] : ["courante", valeur]);
    if (nom === "closer-modele") {
      assert.equal(lue.courante?.avec?.nom, "closer-effort");
      assert.equal(reponse.code, 0, reponse.sortie);
    } else if (nom === "closer-effort") {
      // Déjà posé avec son modèle : ce n'est plus la courante.
      assert.fail("closer-effort ne doit plus rester");
    } else assert.equal(reponse.code, 0, reponse.sortie);
    if (nom === "closer-modele") break;
  }
  assert.deepEqual(vues.slice(0, 3), ["manager-modele", "manager-effort", "reviewer-modele"]);
});

test("quand plus aucune décision ne reste, la lecture dit « aucune décision en attente »", async (t) => {
  const etat = repertoireTemporaire(t);
  const tout = REPONSES.flatMap(([nom, valeur]) => [nom, valeur]);
  const { code, sortie } = await repondre(etat, tout);
  assert.equal(code, 0, sortie);
  assert.match(sortie, /aucune décision en attente/);
  const lue = await courante(etat);
  assert.deepEqual(lue, { enAttente: 0, courante: null, suivantes: [] });
  const texte = await repondre(etat, ["courante"]);
  assert.equal(texte.code, 0);
  assert.match(texte.sortie, /aucune décision en attente/);
  const refus = await repondre(etat, ["courante", "opus"]);
  assert.equal(refus.code, 1);
});

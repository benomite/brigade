// L'atelier de la station sur le Mac du chef : la station vit sous
// `~/.config/brigade`, qu'aucun cook du bac à sable ne lit, et le clone et les
// worktrees de ses projets vivent hors de là. Un projet servi avant y
// déménage, son travail non commité compris, et sa cuisine s'ouvre sans geste
// du chef. Le compte du chef est un répertoire temporaire ; la machine, un Mac
// simulé ; `git` est le vrai.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { test, type TestContext } from "node:test";
import { posixOnly } from "../support/plateforme.ts";
import { LECTURES_INTERDITES, type Reglages } from "../../src/bac-a-sable/configuration.ts";
import { SEATBELT, type Sondes } from "../../src/bac-a-sable/detection.ts";
import { configBacASableLocal, dansLeBacASableLocal } from "../../src/bac-a-sable/local.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirNettoyage } from "../../src/nettoyage.ts";
import { REGLES_DE_BASE } from "../../src/reseau.ts";
import { prendreVerrou } from "../../src/verrou.ts";
import { demenagerVersLAtelier } from "../../src/station/atelier.ts";
import { lieuxDuProjet } from "../../src/station/configuration.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { aArreter, BASE, commiter, depotGit, ENV_GIT, FAUX_CLAUDE, git, horloge, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n" };
const PROJET = "mirrorlab";
const RUN = "12-abc";
const DECIDE = {
  BRIGADE_STATIONS: "mac/claude:2:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

// Le Mac du chef avant la mise à jour : sa station sous `~/.config/brigade`,
// le clone du projet sous la station, et le worktree d'un cook sous l'état du
// projet — une branche qui porte un commit, et un fichier jamais commité. Un
// worktree jetable de la pass, à côté.
function avantLaMiseAJour(t: TestContext) {
  const compte = repertoireTemporaire(t);
  const home = join(compte, "chef");
  const racine = join(home, ".config/brigade/station");
  const etat = join(racine, "etat", PROJET);
  const ancienClone = join(racine, "clones", PROJET);
  const ancienWorktree = join(etat, "worktrees", RUN);
  mkdirSync(join(racine, "clones"), { recursive: true });
  renameSync(depotGit(t).clone, ancienClone);
  git(ancienClone, "worktree", "add", "-q", "-b", `cook/${RUN}`, ancienWorktree, `origin/${BASE}`);
  commiter(ancienWorktree, "commite.txt");
  writeFileSync(join(ancienWorktree, "en-cours.txt"), "le travail que le cook n'a pas commité\n");
  git(ancienClone, "worktree", "add", "-q", "--detach", join(etat, "worktrees/.essais/pass-1"), `origin/${BASE}`);
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  return { compte, home, racine, etat, ancienClone, ancienWorktree, lieux: lieuxDuProjet(racine, PROJET, home) };
}

test("un projet servi avant l'atelier y déménage : son clone et ses worktrees, tels quels — branche, commits et fichiers non commités compris —, et `git` y retrouve ses liens", (t) => {
  const { home, racine, etat, ancienClone, ancienWorktree, lieux } = avantLaMiseAJour(t);
  assert.deepEqual(lieux, { clone: join(home, ".local/share/brigade/station/clones", PROJET), worktrees: join(home, ".local/share/brigade/station/worktrees", PROJET) });

  const bilan = demenagerVersLAtelier(racine, PROJET, lieux, { cloneDeLaStation: true, env: ENV_GIT });
  const worktree = join(lieux.worktrees, RUN);
  assert.deepEqual(bilan, {
    deplaces: [`clone : ${ancienClone} → ${lieux.clone}`, `worktree : ${join(etat, "worktrees/.essais/pass-1")} → ${join(lieux.worktrees, ".essais/pass-1")}`, `worktree : ${ancienWorktree} → ${worktree}`],
    restes: [],
  });
  // Rien ne reste à l'ancienne place ; l'état du projet, lui, n'a pas bougé.
  assert.equal(existsSync(ancienClone), false);
  assert.equal(existsSync(join(etat, "worktrees")), false);
  assert.equal(existsSync(join(etat, "log.db")), true);
  // Le travail du cook est là, et `git` le voit : sa branche, son commit, son
  // fichier non commité.
  assert.equal(readFileSync(join(worktree, "en-cours.txt"), "utf8"), "le travail que le cook n'a pas commité\n");
  assert.equal(git(worktree, "rev-parse", "--abbrev-ref", "HEAD"), `cook/${RUN}`);
  assert.equal(git(worktree, "status", "--porcelain"), "?? en-cours.txt");
  assert.equal(git(lieux.clone, "log", "-1", "--format=%s", `cook/${RUN}`), "ajoute commite.txt");
  const listes = git(lieux.clone, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((ligne) => ligne.startsWith("worktree "))
    .sort();
  assert.deepEqual(listes, [`worktree ${lieux.clone}`, `worktree ${join(lieux.worktrees, ".essais/pass-1")}`, `worktree ${worktree}`].sort());

  // Rejoué, il n'y a plus rien à déménager.
  assert.deepEqual(demenagerVersLAtelier(racine, PROJET, lieux, { cloneDeLaStation: true, env: ENV_GIT }), { deplaces: [], restes: [] });
});

test("déménagé, le worktree d'un cook d'une vie précédente se range sans geste du chef : ce qui y traînait est commité sur sa branche, puis il est retiré", async (t) => {
  const { racine, etat, lieux } = avantLaMiseAJour(t);
  demenagerVersLAtelier(racine, PROJET, lieux, { cloneDeLaStation: true, env: ENV_GIT });
  // Le journal le nomme comme avant la mise à jour : `worktrees/<run>`, relatif à l'état.
  const journal = ouvrirJournal(etat, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait) => journal.ajouter({ project: PROJET, ticket: 12, author: "runtime", ...fait });
  noter({ type: "ticket.arrived", payload: { title: "Ticket 12", priority: 1, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/12" } });
  noter({
    type: "cook.launched",
    payload: {
      run: RUN,
      limits: { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 },
      stream: `runs/${RUN}.jsonl`,
      station: "mac/claude",
      model: "sonnet",
      effort: "low",
      branch: `cook/${RUN}`,
      worktree: `worktrees/${RUN}`,
    },
  });
  noter({ type: "cook.exited", payload: { run: RUN, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "mac", node: "26" } });

  const avertissements: string[] = [];
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: lieux.worktrees, env: ENV_GIT });
  const nettoyage = ouvrirNettoyage({ journal, projet: PROJET, repertoireEtat: etat, worktrees: lieux.worktrees, depot, avertir: (ligne) => void avertissements.push(ligne) });
  await nettoyage.rattraper();

  assert.deepEqual(avertissements, []);
  const range = journal.duTicket(12).find((evenement) => evenement.type === "worktree.removed");
  assert.ok(range, "le worktree n'est pas rangé");
  const { harvest } = range.payload as { harvest: string | null };
  assert.ok(harvest, "ce qui traînait n'a pas été commité");
  assert.equal(existsSync(join(lieux.worktrees, RUN)), false);
  // Rien n'est perdu : le fichier jamais commité est sur la branche du cook.
  assert.equal(git(lieux.clone, "show", `cook/${RUN}:en-cours.txt`), "le travail que le cook n'a pas commité");
});

test("ce qui ne se déménage pas reste où il est, et se dit : un clone déjà dans l'atelier, un projet qu'un runtime tient encore", (t) => {
  const { racine, etat, ancienClone, ancienWorktree, lieux } = avantLaMiseAJour(t);
  // Un runtime tient le projet : rien ne bouge sous lui.
  const verrou = prendreVerrou(etat);
  assert.deepEqual(demenagerVersLAtelier(racine, PROJET, lieux, { cloneDeLaStation: true, env: ENV_GIT }), { deplaces: [], restes: [] });
  verrou.relacher();
  assert.equal(existsSync(ancienClone), true);

  // Un autre clone occupe déjà l'atelier : l'ancien reste, et ses worktrees
  // avec lui — leurs liens ne mènent qu'à lui.
  mkdirSync(lieux.clone, { recursive: true });
  const bilan = demenagerVersLAtelier(racine, PROJET, lieux, { cloneDeLaStation: true, env: ENV_GIT });
  assert.deepEqual(bilan.deplaces, []);
  assert.equal(bilan.restes.length, 2);
  assert.match(bilan.restes[0] ?? "", /^le clone reste à .*clones\/mirrorlab — .*existe déjà$/);
  assert.match(bilan.restes[1] ?? "", /^ses worktrees restent à .*etat\/mirrorlab\/worktrees, accrochés à ce clone$/);
  assert.equal(readFileSync(join(ancienWorktree, "en-cours.txt"), "utf8"), "le travail que le cook n'a pas commité\n");
});

// Les réglages qu'un `claude` lancé dans ce répertoire reçoit de la cuisine.
function reglagesDansLeBacASable(home: string, worktrees: string, ou: string): Reglages {
  const bac = configBacASableLocal(MAC, { home, worktrees, caches: [] }, () => REGLES_DE_BASE);
  const args = dansLeBacASableLocal(bac, argumentsClaude("consigne", { model: "sonnet", effort: "low" }), ou);
  return JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as Reglages;
}

test("sur un Mac, la station sous `~/.config/brigade` sert le projet, ses cooks dans le bac à sable : sans réglage, et sans nettoyage à la main de ce qu'elle avait laissé", { skip: posixOnly("runs the fake claude and the fake gh (POSIX shell scripts)") }, (t) => {
  const { compte, home, racine, etat, lieux } = avantLaMiseAJour(t);
  writeFileSync(join(racine, "projets"), `${PROJET} benomite/${PROJET} ${BASE}\n`);
  // Le répertoire temporaire d'un Mac n'est pas au-dessus du compte : c'est là
  // que partent les jugements du manager.
  const temporaire = join(compte, "tmp");
  mkdirSync(temporaire);
  const avant = process.env.TMPDIR;
  process.env.TMPDIR = temporaire;
  t.after(() => void (process.env.TMPDIR = avant));
  const session = join(compte, "session");
  mkdirSync(session);

  const lignes: string[] = [];
  const station = ouvrirStation({
    racine,
    env: { ...ENV_GIT, HOME: home, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_DIR: session },
    dire: (ligne) => void lignes.push(ligne),
    ouvrir: (env, options) => ouvrirCuisine(env, { ...options, sondes: MAC }),
    relectureMs: 3_600_000,
  });
  aArreter(t, () => station.arreter("fin du test"));

  // Aucun refus : le projet est servi, et sa cuisine dit que chaque `claude` y
  // part dans le bac à sable.
  assert.deepEqual(station.refuses(), {});
  assert.deepEqual(station.projets(), [PROJET]);
  assert.ok(lignes.some((ligne) => ligne.startsWith(`brigade [${PROJET}] : bac à sable — chaque \`claude\` de la cuisine`)), lignes.join("\n"));
  assert.ok(lignes.includes(`brigade [${PROJET}] : déménagé dans l'atelier de la station — clone : ${join(racine, "clones", PROJET)} → ${lieux.clone}`), lignes.join("\n"));
  assert.equal(lignes.filter((ligne) => ligne.includes("pas déménagé")).length, 0, lignes.join("\n"));

  // Le cook de ce worktree n'écrit que là ; il ne lit ni n'écrit `~/.ssh`,
  // `~/.config/brigade` — l'état du projet compris —, ni les identifiants.
  const worktree = join(lieux.worktrees, RUN);
  assert.equal(existsSync(join(worktree, "en-cours.txt")), true);
  const { sandbox, permissions } = reglagesDansLeBacASable(home, lieux.worktrees, worktree);
  assert.deepEqual(sandbox.filesystem.allowWrite, [worktree]);
  assert.ok(permissions.allow.includes(`Edit(/${worktree}/**)`));
  const interdits = [".ssh", ".config/brigade", ".claude/.credentials.json", ".git-credentials", ".netrc", ".config/gh"].map((relatif) => join(home, relatif));
  for (const interdit of interdits) {
    assert.ok(sandbox.filesystem.denyRead.includes(interdit), `${interdit} se lit`);
    assert.ok(sandbox.filesystem.denyWrite.includes(interdit), `${interdit} s'écrit`);
    for (const outil of ["Read", "Edit"]) assert.ok(permissions.deny.includes(`${outil}(/${interdit}/**)`), `${outil} ouvert sur ${interdit}`);
  }
  // Ce qu'il écrit n'est sous rien de ce qui lui est interdit ; l'état du
  // projet, lui, l'est.
  const sous = (parent: string, enfant: string) => enfant === parent || enfant.startsWith(`${parent}/`);
  for (const relatif of LECTURES_INTERDITES) assert.equal(sous(posix.join(home, relatif), worktree), false, `${worktree} est sous ~/${relatif}`);
  assert.ok(sous(join(home, ".config/brigade"), etat));
});

test("atelier.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

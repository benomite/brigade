// La mise à jour de la station sur une installation de test, à part de toute
// vraie machine (`helpers/machine.ts`) : de vrais paquets construits depuis ce
// dépôt, installés comme le guide les installe, puis des versions publiées
// l'une après l'autre. Le minuteur de la mise à jour se déclenche ; personne
// ne tape de commande. C'est le code installé qui tourne — la station et sa
// mise à jour —, ses unités et son postinst.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireEnService } from "../../src/update/in-service.ts";
import { lireEtatMiseAJour } from "../../src/update/state.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, git, issueGitHub, jusqua, mort, repertoireTemporaire, tuerLesRelais, vivant } from "../outils.ts";
import { construirePaquet, deriverPaquet, sansDpkgDeb, uneMachine, type Machine } from "./helpers/machine.ts";

const UNITE = "usr/lib/systemd/system/brigade-station.service";
const MAIN = "usr/lib/brigade-station/runtime/src/station/main.ts";

// L'heure d'un instant, à la minute, à l'heure de la machine : « 14:02 ».
const heure = (instant: string) => {
  const lu = new Date(instant);
  return `${String(lu.getHours()).padStart(2, "0")}:${String(lu.getMinutes()).padStart(2, "0")}`;
};

// Les décisions sans lesquelles un projet ne sert pas.
const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

// Une installation de test qui sert un projet, `brigade` : son journal, ses
// décisions, son clone et son `gh`, tels qu'ils seraient avant la première
// version.
function machineAvecUnProjet(t: TestContext): Machine & { etatDuProjet: string } {
  const compte = repertoireTemporaire(t);
  const machine = uneMachine(t, {
    ...ENV_GIT,
    HOME: compte,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  });
  const etatDuProjet = join(machine.station, "etat/brigade");
  mkdirSync(etatDuProjet, { recursive: true });
  const journal = ouvrirJournal(etatDuProjet);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const clone = join(machine.station, "clones/brigade");
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q");
  const gh = fauxGh(t);
  gh.issues([]);
  writeFileSync(join(machine.station, "projets"), `brigade benomite/brigade ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_SANDBOX_BIN=${FAUX_BWRAP}\n`);
  return { ...machine, etatDuProjet };
}

// Le bloc `awaiting` de l'état du projet : la file.
function file(etatDuProjet: string): string[] {
  const journal = ouvrirJournal(etatDuProjet, { lectureSeule: true });
  try {
    const lignes = decrireEtat(lireEtat(journal), new Date());
    const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
    return lignes.slice(debut, lignes.indexOf("end awaiting", debut) + 1);
  } finally {
    journal.fermer();
  }
}

const faits = (etatDuProjet: string, type: string) => {
  const journal = ouvrirJournal(etatDuProjet, { lectureSeule: true });
  try {
    return journal.tout().flatMap((e) => (e.type === type ? [e.payload as Record<string, unknown>] : []));
  } finally {
    journal.fermer();
  }
};

// La station tourne, en `version`, sous le pid que systemd lui donne.
async function enService(machine: Machine, version: string): Promise<number> {
  await jusqua(() => {
    const dite = lireEnService(machine.station);
    return dite?.version === version && dite.pid === machine.service().pid;
  });
  return machine.service().pid;
}

describe("la mise à jour de la station, sur une installation de test", { skip: sansDpkgDeb }, () => {
  let dossier = "";
  // Le paquet construit depuis ce dépôt, et ce qu'on en tire pour chaque version.
  let premier = "";
  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "brigade-mise-a-jour-test-"));
    premier = construirePaquet(dossier, "1.0.0");
  });
  after(() => rmSync(dossier, { recursive: true, force: true }));

  test("trois versions publiées l'une après l'autre passent seules — dont une qui change l'unité de la station —, et la file dit chaque passage", async (t) => {
    const machine = machineAvecUnProjet(t);
    machine.installer(premier);
    assert.equal(machine.installee(), "1.0.0");
    const pid1 = await enService(machine, "1.0.0");
    await jusqua(() => lireEnService(machine.station)?.servis.includes("brigade") === true);

    // Rien de publié de plus récent : rien ne bouge.
    machine.publier("1.0.0", premier);
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.service().pid, pid1);
    assert.deepEqual(machine.appels().filter((a) => a.startsWith("apt-get")), ["apt-get install brigade-station 1.0.0"]);

    // 1.1.0 : la même station, une autre version.
    machine.publier("1.1.0", deriverPaquet(dossier, premier, "1.1.0"));
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.1.0");
    const pid2 = await enService(machine, "1.1.0");
    assert.notEqual(pid2, pid1);
    await jusqua(() => faits(machine.etatDuProjet, "update.installed").length === 1);
    const [passage] = faits(machine.etatDuProjet, "update.installed");
    assert.deepEqual([passage?.version, passage?.previous], ["1.1.0", "1.0.0"]);
    assert.deepEqual(file(machine.etatDuProjet), ["awaiting   nothing awaits the chef", `  switched to version 1.1.0 at ${heure(String(passage?.at))}`, "end awaiting"]);

    // 1.2.0 change l'unité de la station : elle tourne sous la nouvelle.
    assert.equal(machine.envDeLaStation().BRIGADE_ESSAI_UNITE, undefined);
    machine.publier(
      "1.2.0",
      deriverPaquet(dossier, premier, "1.2.0", (arbre) => {
        const unite = join(arbre, UNITE);
        writeFileSync(unite, readFileSync(unite, "utf8").replace("[Service]\n", "[Service]\nEnvironment=BRIGADE_ESSAI_UNITE=1.2.0\n"));
      }),
    );
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.2.0");
    await enService(machine, "1.2.0");
    assert.equal(machine.envDeLaStation().BRIGADE_ESSAI_UNITE, "1.2.0");
    // L'unité changée a été relue avant que la station reparte.
    const appels = machine.appels();
    const installation = appels.lastIndexOf("apt-get install brigade-station 1.2.0");
    assert.deepEqual(
      appels.slice(installation).filter((a) => /daemon-reload|restart brigade-station\.service/.test(a)),
      ["systemctl daemon-reload", "systemctl restart brigade-station.service"],
    );

    // 1.3.0 : la troisième.
    machine.publier("1.3.0", deriverPaquet(dossier, premier, "1.3.0"));
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.3.0");
    await enService(machine, "1.3.0");
    await jusqua(() => faits(machine.etatDuProjet, "update.installed").length === 3);
    assert.deepEqual(
      faits(machine.etatDuProjet, "update.installed").map((p) => p.version),
      ["1.1.0", "1.2.0", "1.3.0"],
    );
    const dernier = faits(machine.etatDuProjet, "update.installed").at(-1);
    assert.deepEqual(file(machine.etatDuProjet).slice(1, 2), [`  switched to version 1.3.0 at ${heure(String(dernier?.at))}`]);
    // Le projet n'a jamais cessé d'être servi, et seule la station a été relancée.
    assert.deepEqual(lireEnService(machine.station)?.servis, ["brigade"]);
    assert.deepEqual(
      machine.appels().filter((a) => /^systemctl (stop|restart|start) brigade-station\.service/.test(a)),
      ["systemctl restart brigade-station.service", "systemctl restart brigade-station.service", "systemctl restart brigade-station.service"],
    );
    assert.equal(lireEtatMiseAJour(machine.miseAJour)?.installee, "1.3.0");
  });

  test("une version dont le démarrage échoue : la station revient seule à la précédente, la file le dit — version visée, version restaurée —, et elle n'est pas réessayée", async (t) => {
    const machine = machineAvecUnProjet(t);
    machine.installer(premier);
    machine.publier("1.0.0", premier);
    await enService(machine, "1.0.0");
    await jusqua(() => lireEnService(machine.station)?.servis.includes("brigade") === true);

    machine.publier(
      "1.1.0",
      deriverPaquet(dossier, premier, "1.1.0", (arbre) => {
        writeFileSync(join(arbre, MAIN), 'console.error("brigade : refus de démarrer la station — essai");\nprocess.exit(1);\n');
      }),
    );
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.0.0");
    const pid = await enService(machine, "1.0.0");
    assert.equal(vivant(pid), true);
    const etat = lireEtatMiseAJour(machine.miseAJour);
    assert.equal(etat?.derniere?.quoi, "revenue");
    assert.deepEqual(etat?.ratees, ["1.1.0"]);

    await jusqua(() => faits(machine.etatDuProjet, "update.reverted").length === 1);
    const [retour] = faits(machine.etatDuProjet, "update.reverted");
    assert.deepEqual([retour?.target, retour?.restored, retour?.restoreFailed], ["1.1.0", "1.0.0", null]);
    const [, ligne] = file(machine.etatDuProjet);
    assert.equal(
      ligne,
      `  update to version 1.1.0 failed at ${heure(String(retour?.at))}: la station s'est arrêtée en échec en 1.1.0 (systemd : failed) — back on version 1.0.0; 1.1.0 is not retried, the next one will be`,
    );

    // Elle n'est pas réessayée : rien n'est réinstallé.
    const installations = machine.appels().filter((a) => a.startsWith("apt-get")).length;
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.appels().filter((a) => a.startsWith("apt-get")).length, installations);
    assert.equal(machine.service().pid, pid);
    // Que la suivante le soit : mettre-a-jour.test.ts.
  });

  test("un cook en vol pendant la mise à jour n'est pas interrompu : la station de la nouvelle version le reprend sans le relancer, et sa livraison est servie", async (t) => {
    const compte = repertoireTemporaire(t);
    const essais = repertoireTemporaire(t);
    const suite = join(essais, "suite.txt");
    const feu = join(essais, "feu");
    ecrireSuite(suite, ["commite-puis-attend"]);
    const machine = uneMachine(t, {
      ...ENV_GIT,
      HOME: compte,
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_MAX_LOAD_PER_CORE: "1000000",
      BRIGADE_MIN_FREE_MEMORY_MB: "0",
      BRIGADE_MIN_FREE_DISK_MB: "0",
      // Le cook commite, puis attend qu'on le laisse conclure ; le reviewer relit vert.
      FAUX_CLAUDE: "relit-vert",
      FAUX_CLAUDE_SUITE: suite,
      FAUX_CLAUDE_FEU: feu,
    });
    const etatDuProjet = join(machine.station, "etat/brigade");
    aArreter(t, () => tuerLesRelais(etatDuProjet));
    const { origine, clone } = depotGit(t);
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\ntest -f "$1/travail.txt" && echo "gates : VERT"\n');
    chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
    git(clone, "push", "-q", "origin", BASE);
    const depot = "benomite/brigade";
    const pr = { number: 40, html_url: `https://github.com/${depot}/pull/40`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
    const gh = fauxGh(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${depot}/pulls`, { statut: 201, corps: pr });
    gh.repondre(`repos/${depot}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    gh.repondre(`repos/${depot}/pulls?head=benomite:cook/*`, { corps: [pr] });
    gh.repondre(`repos/${depot}/pulls/40`, { corps: pr });
    gh.repondre(`repos/${depot}/commits/*/check-runs?per_page=100`, { corps: { check_runs: [] } });
    gh.repondre(`repos/${depot}/commits/*/status?per_page=100`, { corps: { statuses: [] } });
    gh.repondre(`repos/${depot}/pulls/40/merge`, { corps: { merged: true } });
    mkdirSync(etatDuProjet, { recursive: true });
    const journal = ouvrirJournal(etatDuProjet);
    for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    journal.fermer();
    // Le clone du projet, là où la station le range : sous son répertoire, que la cloison masque.
    mkdirSync(join(machine.station, "clones"), { recursive: true });
    git(machine.station, "clone", "-q", origine, join(machine.station, "clones/brigade"));
    writeFileSync(join(machine.station, "projets"), `brigade ${depot} ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_SANDBOX_BIN=${FAUX_BWRAP}\n`);

    machine.installer(premier);
    machine.publier("1.0.0", premier);
    await enService(machine, "1.0.0");
    await jusqua(() => faits(etatDuProjet, "cook.launched").length === 1);
    const run = String(faits(etatDuProjet, "cook.launched")[0]?.run);
    const fichierDuPid = join(etatDuProjet, "runs", `${run}.cook.pid`);
    await jusqua(() => existsSync(fichierDuPid));
    const pid = Number(readFileSync(fichierDuPid, "utf8"));
    await jusqua(() => existsSync(join(etatDuProjet, "worktrees", run, "travail.txt")));

    // La mise à jour passe pendant que le cook travaille.
    machine.publier("1.1.0", deriverPaquet(dossier, premier, "1.1.0"));
    assert.equal(machine.declencher(), 0);
    await enService(machine, "1.1.0");
    assert.equal(vivant(pid), true);
    await jusqua(() => faits(etatDuProjet, "cook.resumed").length === 1);
    assert.equal(vivant(pid), true);
    assert.deepEqual(faits(etatDuProjet, "cook.interrupted"), []);

    // Il finit son travail : sa livraison est jugée, mergée sous grant, servie.
    writeFileSync(feu, "");
    await jusqua(() => faits(etatDuProjet, "ticket.served").length === 1);
    await mort(pid);
    // Lancé une fois, jamais relancé ; seul le reviewer est parti après lui.
    assert.deepEqual(faits(etatDuProjet, "cook.launched").map((p) => p.run).filter((r) => !String(r).startsWith("review-")), [run]);
    assert.equal(faits(etatDuProjet, "pass.judged")[0]?.sha, git(origine, "rev-parse", `cook/${run}`));
  });

  test("la version gelée, une version publiée n'est pas installée ; le gel levé, elle l'est", async (t) => {
    const machine = uneMachine(t, { ...ENV_GIT, HOME: repertoireTemporaire(t) });
    machine.installer(premier);
    machine.publier("1.0.0", premier);
    const pid = await enService(machine, "1.0.0");
    writeFileSync(join(machine.station, "reglages"), "# la box ne bouge pas pendant la refonte\ngel=oui\n");

    machine.publier("1.1.0", deriverPaquet(dossier, premier, "1.1.0"));
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.0.0");
    assert.equal(machine.service().pid, pid);
    const etat = lireEtatMiseAJour(machine.miseAJour);
    assert.deepEqual([etat?.gelee, etat?.installee, etat?.disponible, etat?.retenue], [true, "1.0.0", "1.1.0", "version gelée en 1.0.0 : 1.1.0 attend que le gel soit levé"]);
    // L'état exposé, en clair, par la commande du paquet.
    const lu = spawnSync(process.execPath, [join(machine.racine, "usr/lib/brigade-station/runtime/src/update/main.ts"), "etat"], {
      env: { ...machine.env, BRIGADE_STATION_DIR: machine.station, BRIGADE_MISE_A_JOUR_DIR: machine.miseAJour },
      encoding: "utf8",
    });
    assert.equal(lu.status, 0, lu.stderr);
    assert.match(lu.stdout, /^installée   1\.0\.0\npubliée     1\.1\.0\ngel         oui — aucune nouvelle version n'est installée\n/);
    assert.match(lu.stdout, /^retenue     version gelée en 1\.0\.0 : 1\.1\.0 attend que le gel soit levé$/m);

    writeFileSync(join(machine.station, "reglages"), "gel=non\n");
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.1.0");
    await enService(machine, "1.1.0");
    assert.deepEqual([lireEtatMiseAJour(machine.miseAJour)?.gelee, lireEtatMiseAJour(machine.miseAJour)?.derniere?.quoi], [false, "passee"]);
  });
});

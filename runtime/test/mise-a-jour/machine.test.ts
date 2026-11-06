// La mise à jour de la station sur une installation de test, à part de toute
// vraie machine (`aides/machine.ts`) : de vrais paquets construits depuis ce
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
import { lireEnService } from "../../src/mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, git, issueGitHub, jusqua, mort, repertoireTemporaire, tuerLesRelais, vivant } from "../outils.ts";
import { construirePaquet, deriverPaquet, sansDpkgDeb, uneMachine, type Machine } from "./aides/machine.ts";

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
  writeFileSync(join(machine.station, "projets"), `brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_SANDBOX_BIN=${FAUX_BWRAP}\n`);
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
// Le pid rendu est celui que systemd vient de donner : chaque question à
// systemd est un process de la doublure, il n'est pas reposé.
async function enService(machine: Machine, version: string): Promise<number> {
  let pid = 0;
  await jusqua(() => {
    const dite = lireEnService(machine.station);
    if (dite?.version !== version) return false;
    pid = machine.service().pid;
    return dite.pid === pid;
  });
  return pid;
}

describe("la mise à jour de la station, sur une installation de test", { skip: sansDpkgDeb }, () => {
  let dossier = "";
  // Le paquet construit depuis ce dépôt, et ce qu'on en tire, faits une fois
  // pour le fichier : chaque test en publie une copie. 1.1.0 est le premier
  // porté à sa version, sans autre changement ; 1.2.0 change l'unité de la
  // station ; la 1.1.0 cassée refuse de démarrer.
  let premier = "";
  let suivante = "";
  let uniteChangee = "";
  let cassee = "";
  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "brigade-mise-a-jour-test-"));
    premier = construirePaquet(dossier, "1.0.0");
    suivante = deriverPaquet(dossier, premier, "1.1.0");
    uniteChangee = deriverPaquet(dossier, premier, "1.2.0", (arbre) => {
      const unite = join(arbre, UNITE);
      writeFileSync(unite, readFileSync(unite, "utf8").replace("[Service]\n", "[Service]\nEnvironment=BRIGADE_ESSAI_UNITE=1.2.0\n"));
    });
    cassee = deriverPaquet(dossier, premier, "1.1.0", (arbre) => {
      writeFileSync(join(arbre, MAIN), 'console.error("brigade : refus de démarrer la station — essai");\nprocess.exit(1);\n');
    });
  });
  after(() => rmSync(dossier, { recursive: true, force: true }));

  test("deux versions publiées l'une après l'autre passent seules — dont une qui change l'unité de la station —, et la file dit chaque passage", async (t) => {
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
    machine.publier("1.1.0", suivante);
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
    machine.publier("1.2.0", uniteChangee);
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
    // Une troisième version simple ne disait rien de plus que 1.1.0 (#2464) : la file dit la dernière des deux.
    await jusqua(() => faits(machine.etatDuProjet, "update.installed").length === 2);
    assert.deepEqual(
      faits(machine.etatDuProjet, "update.installed").map((p) => p.version),
      ["1.1.0", "1.2.0"],
    );
    const dernier = faits(machine.etatDuProjet, "update.installed").at(-1);
    assert.deepEqual(file(machine.etatDuProjet).slice(1, 2), [`  switched to version 1.2.0 at ${heure(String(dernier?.at))}`]);
    // Le projet n'a jamais cessé d'être servi, et seule la station a été relancée.
    assert.deepEqual(lireEnService(machine.station)?.servis, ["brigade"]);
    assert.deepEqual(
      machine.appels().filter((a) => /^systemctl (stop|restart|start) brigade-station\.service/.test(a)),
      ["systemctl restart brigade-station.service", "systemctl restart brigade-station.service"],
    );
    assert.equal(lireEtatMiseAJour(machine.miseAJour)?.installee, "1.2.0");
  });

  test("une version dont le démarrage échoue : la station revient seule à la précédente, la file le dit — version visée, version restaurée —, et elle n'est pas réessayée", async (t) => {
    const machine = machineAvecUnProjet(t);
    machine.installer(premier);
    machine.publier("1.0.0", premier);
    await enService(machine, "1.0.0");
    await jusqua(() => lireEnService(machine.station)?.servis.includes("brigade") === true);

    machine.publier("1.1.0", cassee);
    // Rouge, ce que la mise à jour et la station ont dit nomme la cause.
    const dit = () => `la mise à jour :\n${machine.sortie("brigade-station-mise-a-jour.service")}\nla station :\n${machine.sortie("brigade-station.service").slice(-4000)}`;
    assert.equal(machine.declencher(), 0, dit());
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
    assert.equal(machine.declencher(), 0, dit());
    assert.equal(machine.appels().filter((a) => a.startsWith("apt-get")).length, installations);
    assert.equal(machine.service().pid, pid);
    // Que la suivante le soit : mettre-a-jour.test.ts.
  });

  test("la version gelée, une version publiée n'est pas installée ; le gel levé, elle l'est", async (t) => {
    const machine = uneMachine(t, { ...ENV_GIT, HOME: repertoireTemporaire(t) });
    machine.installer(premier);
    machine.publier("1.0.0", premier);
    const pid = await enService(machine, "1.0.0");
    writeFileSync(join(machine.station, "reglages"), "# la box ne bouge pas pendant la refonte\ngel=oui\n");

    machine.publier("1.1.0", suivante);
    assert.equal(machine.declencher(), 0);
    assert.equal(machine.installee(), "1.0.0");
    assert.equal(machine.service().pid, pid);
    const etat = lireEtatMiseAJour(machine.miseAJour);
    assert.deepEqual([etat?.gelee, etat?.installee, etat?.disponible, etat?.retenue], [true, "1.0.0", "1.1.0", "version gelée en 1.0.0 : 1.1.0 attend que le gel soit levé"]);
    // L'état exposé, en clair, par la commande du paquet.
    const lu = spawnSync(process.execPath, [join(machine.racine, "usr/lib/brigade-station/runtime/src/mise-a-jour/main.ts"), "etat"], {
      env: { ...machine.env, BRIGADE_STATION_DIR: machine.station, BRIGADE_MISE_A_JOUR_DIR: machine.miseAJour },
      encoding: "utf8",
    });
    assert.equal(lu.status, 0, lu.stderr);
    assert.match(lu.stdout, /^installée   1\.0\.0\npubliée     1\.1\.0\ngel         oui — aucune nouvelle version n'est installée\n/);
    assert.match(lu.stdout, /^retenue     version gelée en 1\.0\.0 : 1\.1\.0 attend que le gel soit levé$/m);

    writeFileSync(join(machine.station, "reglages"), "gel=non\n");
    // Rouge, ce que la mise à jour et la station ont dit nomme la cause.
    const dit = () => `la mise à jour :\n${machine.sortie("brigade-station-mise-a-jour.service")}\nla station :\n${machine.sortie("brigade-station.service").slice(-4000)}`;
    assert.equal(machine.declencher(), 0, dit());
    assert.equal(machine.installee(), "1.1.0", dit());
    await enService(machine, "1.1.0");
    assert.deepEqual([lireEtatMiseAJour(machine.miseAJour)?.gelee, lireEtatMiseAJour(machine.miseAJour)?.derniere?.quoi], [false, "passee"]);
  });
});

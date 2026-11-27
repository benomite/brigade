// La mise à jour de la station sur une installation de test, à part de toute
// vraie machine (`aides/machine.ts`) : de vrais paquets construits depuis ce
// dépôt, installés comme le guide les installe, puis des versions publiées
// l'une après l'autre. Le minuteur de la mise à jour se déclenche ; personne
// ne tape de commande. C'est le code installé qui tourne — la station, qui est
// la cuisine (`src/kitchen/main.ts`), et sa mise à jour —, ses unités et son
// postinst.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test, type TestContext } from "node:test";
import { lireEnService } from "../../src/mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { BASE, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, git, jusqua, repertoireTemporaire, vivant } from "../outils.ts";
import { construirePaquet, deriverPaquet, sansDpkgDeb, uneMachine, type Machine } from "./aides/machine.ts";

const UNITE = "usr/lib/systemd/system/brigade-station.service";
const MAIN = "usr/lib/brigade-station/runtime/src/kitchen/main.ts";

// Une installation de test dont la cuisine sert un projet, `brigade` : sa
// ligne dans `kitchen/projects`, son clone et son `gh`, tels qu'ils seraient
// avant la première version.
function machineAvecUnProjet(t: TestContext): Machine {
  const compte = repertoireTemporaire(t);
  const gh = fauxGh(t);
  gh.issues([]);
  const machine = uneMachine(t, {
    ...ENV_GIT,
    HOME: compte,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    FAUX_SYSTEMD_ENV: JSON.stringify({ BRIGADE_GH_BIN: gh.bin, BRIGADE_SANDBOX_BIN: FAUX_BWRAP }),
  });
  // Son clone là où la station le pose, sous le répertoire que la cloison masque.
  const clone = join(machine.station, "brigade/depot");
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q");
  mkdirSync(join(machine.station, "kitchen"), { recursive: true });
  writeFileSync(join(machine.station, "kitchen/projects"), `brigade acme/brigade ${BASE}\n`);
  return machine;
}

// La station tourne, en `version`, sous le pid que systemd lui donne.
// Le pid rendu est celui que systemd vient de donner : chaque question à
// systemd est un process de la doublure, il n'est pas reposé.
// Une station morte ne sera jamais en service : l'attendre userait le délai du
// test sans rien dire (#4552). Rouge tout de suite, sa sortie nomme la cause.
async function enService(machine: Machine, version: string): Promise<number> {
  let pid = 0;
  await jusqua(() => {
    const service = machine.service();
    if (service.actif === "failed") throw new Error(`la station s'est arrêtée en échec au lieu de tourner en ${version} :\n${machine.sortie("brigade-station.service").slice(-4000)}`);
    const dite = lireEnService(machine.station);
    if (dite?.version !== version) return false;
    pid = service.pid;
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

  test("deux versions publiées l'une après l'autre passent seules — dont une qui change l'unité de la station —, et l'état de la mise à jour dit chaque passage", async (t) => {
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

    // 1.1.0 : la même station, une autre version. Rouge, ce que la mise à
    // jour et la station ont dit nomme la cause : un passage sorti en 0 sans
    // rien installer ne dit rien d'autre que « 1.0.0 ».
    const dit = () => `l'issue du passage : ${JSON.stringify(lireEtatMiseAJour(machine.miseAJour)?.derniere ?? null)}\nla mise à jour :\n${machine.sortie("brigade-station-mise-a-jour.service")}\nla station :\n${machine.sortie("brigade-station.service").slice(-4000)}`;
    machine.publier("1.1.0", suivante);
    assert.equal(machine.declencher(), 0, dit());
    assert.equal(machine.installee(), "1.1.0", dit());
    const pid2 = await enService(machine, "1.1.0");
    assert.notEqual(pid2, pid1);
    // La cuisine est repartie sur les fichiers que 1.1.0 a posés : son départ
    // suit leur installation, sans quoi elle garderait le code d'avant (#4604).
    const pose = statSync(join(machine.racine, MAIN));
    const depuis = Date.parse(lireEnService(machine.station)?.depuis ?? "");
    assert.ok(depuis >= Math.floor(Math.max(pose.mtimeMs, pose.ctimeMs)), `la cuisine est partie à ${new Date(depuis).toISOString()}, avant ses fichiers (${new Date(pose.ctimeMs).toISOString()})`);
    const passage = lireEtatMiseAJour(machine.miseAJour)?.derniere;
    assert.deepEqual(passage?.quoi === "passee" && [passage.version, passage.depuis], ["1.1.0", "1.0.0"], dit());

    // 1.2.0 change l'unité de la station : elle tourne sous la nouvelle.
    assert.equal(machine.envDeLaStation().BRIGADE_ESSAI_UNITE, undefined);
    machine.publier("1.2.0", uniteChangee);
    assert.equal(machine.declencher(), 0, dit());
    assert.equal(machine.installee(), "1.2.0", dit());
    await enService(machine, "1.2.0");
    assert.equal(machine.envDeLaStation().BRIGADE_ESSAI_UNITE, "1.2.0");
    // L'unité changée a été relue avant que la station reparte.
    const appels = machine.appels();
    const installation = appels.lastIndexOf("apt-get install brigade-station 1.2.0");
    assert.deepEqual(
      appels.slice(installation).filter((a) => /daemon-reload|restart brigade-station\.service/.test(a)),
      ["systemctl daemon-reload", "systemctl restart brigade-station.service"],
    );
    const dernier = lireEtatMiseAJour(machine.miseAJour)?.derniere;
    assert.deepEqual(dernier?.quoi === "passee" && [dernier.version, dernier.depuis], ["1.2.0", "1.1.0"], dit());
    // Le projet n'a jamais cessé d'être servi, et seule la station a été relancée.
    await jusqua(() => lireEnService(machine.station)?.servis.includes("brigade") === true);
    assert.deepEqual(lireEnService(machine.station)?.servis, ["brigade"]);
    assert.deepEqual(
      machine.appels().filter((a) => /^systemctl (stop|restart|start) brigade-station\.service/.test(a)),
      ["systemctl restart brigade-station.service", "systemctl restart brigade-station.service"],
    );
    assert.equal(lireEtatMiseAJour(machine.miseAJour)?.installee, "1.2.0");
  });

  test("une version dont le démarrage échoue : la station revient seule à la précédente, l'état de la mise à jour le dit — version visée, version restaurée —, et elle n'est pas réessayée", async (t) => {
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

    const retour = etat?.derniere;
    assert.deepEqual(
      retour?.quoi === "revenue" && [retour.visee, retour.restauree, retour.retour, retour.motif],
      ["1.1.0", "1.0.0", null, "la station s'est arrêtée en échec en 1.1.0 (systemd : failed)"],
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

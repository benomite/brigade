// La mise à jour de la station, passage après passage, jusqu'à ce que le chef
// en lit : des versions publiées dans un répertoire comme une installation de
// test les publie, des passages sur une machine tenue en mémoire
// (`aides/en-memoire.ts`), ce que la station relaie au journal du projet et ce
// que la file en dit. Puis la machine telle que la mise à jour la lit et la
// touche : dpkg, apt et systemd, par des doublures qui notent leurs appels.
//
// Ce que le paquet joue à chaque version installée — l'unité changée relue
// avant de relancer la station, seule la station relancée — est dans
// paquet/paquet.test.ts ; un cook en vol que la vie suivante reprend sans le
// relancer, dans reprise.test.ts, sur le runtime du test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { lireEnService } from "../../src/mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { publications } from "../../src/mise-a-jour/publications.ts";
import { relayer } from "../../src/mise-a-jour/relais.ts";
import { systemeDeLaMachine } from "../../src/mise-a-jour/systeme.ts";
import { repertoireTemporaire } from "../outils.ts";
import { machineEnMemoire, passage, type Demarrage } from "./aides/en-memoire.ts";

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

// Une machine qui sert un projet, `brigade`, en 1.0.0 : son journal et ses
// décisions, et le répertoire où ses versions se publient. `passer` joue le
// minuteur de la mise à jour, puis ce que la station relaie au journal du
// projet.
function machineAvecUnProjet(t: TestContext, demarrage: (version: string) => Demarrage = () => ({ servis: ["brigade"] })) {
  const m = machineEnMemoire(t, "1.0.0", demarrage);
  m.configurer("brigade acme/brigade v2\n");
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  const publiees = repertoireTemporaire(t);
  return {
    ...m,
    journal,
    // Publier une version : poser son paquet là où la station les cherche.
    publier(version: string) {
      mkdirSync(join(publiees, version));
      writeFileSync(join(publiees, version, "brigade-station_amd64.deb"), `brigade-station ${version}`);
    },
    async passer() {
      const rendu = await passage(m, publications(publiees, "amd64"));
      relayer({ projet: "brigade", journal }, m.dossier);
      return rendu;
    },
  };
}

// Le bloc `awaiting` de l'état du projet : la file.
function file(journal: Journal): string[] {
  const lignes = decrireEtat(lireEtat(journal), new Date());
  const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
  return lignes.slice(debut, lignes.indexOf("end awaiting", debut) + 1);
}

const faits = (journal: Journal, type: string) => journal.tout().flatMap((e) => (e.type === type ? [e.payload as Record<string, unknown>] : []));

test("trois versions publiées l'une après l'autre passent seules, et la file dit chaque passage", async (t) => {
  const machine = machineAvecUnProjet(t);
  const pid1 = machine.systeme.service().pid;
  assert.deepEqual(lireEnService(machine.racine)?.servis, ["brigade"]);

  // Rien de publié de plus récent : rien ne bouge.
  machine.publier("1.0.0");
  assert.equal((await machine.passer()).issue, null);
  assert.deepEqual([machine.installations, machine.systeme.service().pid], [[], pid1]);

  // 1.1.0 : la même station, une autre version.
  machine.publier("1.1.0");
  assert.equal((await machine.passer()).issue?.quoi, "passee");
  assert.equal(machine.systeme.installee(), "1.1.0");
  const enService = lireEnService(machine.racine);
  assert.deepEqual([enService?.version, enService?.pid], ["1.1.0", machine.systeme.service().pid]);
  assert.notEqual(machine.systeme.service().pid, pid1);
  const [passage] = faits(machine.journal, "update.installed");
  assert.deepEqual([passage?.version, passage?.previous], ["1.1.0", "1.0.0"]);
  assert.deepEqual(file(machine.journal), ["awaiting   nothing awaits the chef", `  switched to version 1.1.0 at ${heure(String(passage?.at))}`, "end awaiting"]);

  // 1.2.0, puis 1.3.0.
  for (const version of ["1.2.0", "1.3.0"]) {
    machine.publier(version);
    assert.equal((await machine.passer()).issue?.quoi, "passee", version);
    assert.equal(lireEnService(machine.racine)?.version, version);
  }
  assert.deepEqual(
    faits(machine.journal, "update.installed").map((p) => [p.version, p.previous]),
    [["1.1.0", "1.0.0"], ["1.2.0", "1.1.0"], ["1.3.0", "1.2.0"]],
  );
  const dernier = faits(machine.journal, "update.installed").at(-1);
  assert.deepEqual(file(machine.journal).slice(1, 2), [`  switched to version 1.3.0 at ${heure(String(dernier?.at))}`]);
  // Le projet n'a jamais cessé d'être servi, et chaque version n'a été installée qu'une fois.
  assert.deepEqual(lireEnService(machine.racine)?.servis, ["brigade"]);
  assert.deepEqual(machine.installations, ["1.1.0", "1.2.0", "1.3.0"]);
  assert.equal(lireEtatMiseAJour(machine.dossier)?.installee, "1.3.0");
});

test("une version dont le démarrage échoue : la station revient seule à la précédente, la file le dit — version visée, version restaurée —, et elle n'est pas réessayée", async (t) => {
  const machine = machineAvecUnProjet(t, (version) => (version === "1.1.0" ? "tombe" : { servis: ["brigade"] }));
  machine.publier("1.0.0");
  machine.publier("1.1.0");
  assert.equal((await machine.passer()).issue?.quoi, "revenue");
  assert.equal(machine.systeme.installee(), "1.0.0");
  const pid = machine.systeme.service().pid;
  assert.deepEqual([lireEnService(machine.racine)?.version, lireEnService(machine.racine)?.pid], ["1.0.0", pid]);
  const etat = lireEtatMiseAJour(machine.dossier);
  assert.equal(etat?.derniere?.quoi, "revenue");
  assert.deepEqual(etat?.ratees, ["1.1.0"]);

  const [retour] = faits(machine.journal, "update.reverted");
  assert.deepEqual([retour?.target, retour?.restored, retour?.restoreFailed], ["1.1.0", "1.0.0", null]);
  const [, ligne] = file(machine.journal);
  assert.equal(
    ligne,
    `  update to version 1.1.0 failed at ${heure(String(retour?.at))}: la station s'est arrêtée en échec en 1.1.0 (systemd : failed) — back on version 1.0.0; 1.1.0 is not retried, the next one will be`,
  );

  // Elle n'est pas réessayée : rien n'est réinstallé.
  assert.deepEqual(machine.installations, ["1.1.0", "1.0.0"]);
  assert.equal((await machine.passer()).issue, null);
  assert.deepEqual(machine.installations, ["1.1.0", "1.0.0"]);
  assert.equal(machine.systeme.service().pid, pid);
  // Que la suivante le soit : mettre-a-jour.test.ts.
});

// Des commandes du système qui notent chacun de leurs appels, une ligne
// chacun, dans `appels`, devant le PATH du test le temps du test.
function doublures(t: TestContext, corps: Record<string, string>) {
  const bin = repertoireTemporaire(t);
  const appels = join(bin, "appels");
  writeFileSync(appels, "");
  for (const [nom, script] of Object.entries(corps)) {
    writeFileSync(join(bin, nom), `#!/bin/sh\necho "${nom} $* \${DEBIAN_FRONTEND:-}" >>"${appels}"\n${script}\n`);
    chmodSync(join(bin, nom), 0o755);
  }
  const avant = process.env.PATH;
  process.env.PATH = `${bin}:${avant ?? ""}`;
  t.after(() => void (process.env.PATH = avant));
  return { appels: () => readFileSync(appels, "utf8").trim().split("\n").filter(Boolean).map((ligne) => ligne.trim()) };
}

test("la machine telle que la mise à jour la lit et la touche : la version que dpkg dit installée, le contenu d'un paquet, apt pour l'installer, systemd pour la station", (t) => {
  const systeme = systemeDeLaMachine();
  const lu = doublures(t, {
    // Installé tout à fait en 1.2.0 ; à moitié posé si FAUX_DPKG le dit.
    "dpkg-query": '[ -n "$FAUX_DPKG" ] && { printf "iU 1.3.0"; exit 0; }; printf "ii 1.2.0"',
    "dpkg-deb": 'case "$2" in *.deb) printf "Package: brigade-station\\nVersion: 1.3.0\\n" ;; *) echo "dpkg-deb: error: not a debian format archive" >&2; exit 2 ;; esac',
    "apt-get": 'case "$*" in *refuse*) echo "Reading package lists..."; echo "E: Sub-process /usr/bin/dpkg returned an error code (1)" >&2; exit 100 ;; esac',
    systemctl: 'printf "ActiveState=active\\nMainPID=4242\\nNRestarts=1\\n"',
  });

  assert.equal(systeme.installee(), "1.2.0");
  process.env.FAUX_DPKG = "oui";
  t.after(() => void delete process.env.FAUX_DPKG);
  assert.equal(systeme.installee(), null);
  assert.deepEqual(systeme.lirePaquet("/essai/brigade-station_1.3.0.deb"), { paquet: "brigade-station", version: "1.3.0" });
  assert.equal(systeme.lirePaquet("/essai/pas-un-paquet"), null);
  assert.deepEqual(systeme.installer("/essai/brigade-station_1.3.0.deb"), { ok: true });
  assert.deepEqual(systeme.installer("/essai/refuse.deb"), { ok: false, motif: "apt-get a rendu 100 — « E: Sub-process /usr/bin/dpkg returned an error code (1) »" });
  assert.deepEqual(systeme.service(), { actif: "active", pid: 4242, redemarrages: 1 });

  // apt installe le fichier, même plus ancien, sans rien demander.
  assert.deepEqual(
    lu.appels().filter((appel) => appel.startsWith("apt-get") || appel.startsWith("systemctl")),
    [
      "apt-get install -y -q --allow-downgrades /essai/brigade-station_1.3.0.deb noninteractive",
      "apt-get install -y -q --allow-downgrades /essai/refuse.deb noninteractive",
      "systemctl show brigade-station.service --property=ActiveState,MainPID,NRestarts",
    ],
  );
});

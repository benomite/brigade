// La commande d'enrôlement, lancée telle que la home la donne sur une machine
// de test : elle y installe brigade s'il n'y est pas, présente la machine au
// chef par `ssh` — un faux, qui la joue ici —, et la machine apparaît « en
// attente » au registre, avec ses capacités. Un code faux, expiré ou déjà servi
// la laisse hors du registre ; acceptée seulement, elle devient sélectionnable.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { posixOnly } from "../support/plateforme.ts";
import { DUREE_MS, ouvrirEnrolements, RECEPTEUR } from "../../src/enrolement/enrolement.ts";
import { machineCourante, presenterLaMachine } from "../../src/enrolement/presentation.ts";
import { ouvrirRegistre } from "../../src/stations-globales/registre.ts";
import { BASE, ENV_ENFANT, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const RACINE_DU_DEPOT = join(import.meta.dirname, "../../..");
const FAUX_SSH = join(import.meta.dirname, "faux-ssh.sh");

type Lancee = { statut: number; sortie: string; erreurs: string };

// La machine de test : un compte neuf. `installee` : brigade y est déjà — ce
// dépôt-ci, là où la commande l'installerait.
function serveur(t: TestContext, { installee = true } = {}) {
  const home = repertoireTemporaire(t);
  if (installee) {
    mkdirSync(join(home, ".local/share"), { recursive: true });
    symlinkSync(RACINE_DU_DEPOT, join(home, ".local/share/brigade"));
  }
  const temoin = join(home, "ssh");
  const env = { ...ENV_GIT, ...ENV_ENFANT, HOME: home, BRIGADE_SSH_BIN: FAUX_SSH, FAUX_SSH_TEMOIN: temoin };
  return {
    home,
    joints: () => readFileSync(temoin, "utf8").split("\n").filter(Boolean),
    lancer: (commande: string) =>
      new Promise<Lancee>((resolve) => {
        execFile("sh", ["-c", commande], { env, encoding: "utf8" }, (erreur, sortie, erreurs) => {
          resolve({ statut: erreur ? (typeof erreur.code === "number" ? erreur.code : -1) : 0, sortie, erreurs });
        });
      }),
  };
}

// La machine du chef : son registre, et l'enrôlement qu'il prépare.
function chef(t: TestContext, maintenant?: () => Date) {
  const repertoire = repertoireTemporaire(t);
  const enrolements = ouvrirEnrolements(repertoire, maintenant ? { maintenant } : {});
  const registre = ouvrirRegistre(repertoire);
  t.after(() => {
    enrolements.fermer();
    registre.fermer();
  });
  return { enrolements, registre, repertoire };
}

test("la commande lancée sur une machine de test la présente au registre du chef « en attente », avec ses capacités — et rien ne la sélectionne avant l'acceptation", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  const { enrolements, registre } = chef(t);
  const machine = serveur(t);
  const { code, commande } = enrolements.preparer({ vers: "chef@box" });

  const lancee = await machine.lancer(commande);

  assert.equal(lancee.statut, 0, lancee.erreurs);
  const attendue = presenterLaMachine(machineCourante());
  const presentee = registre.lire(attendue.nom);
  assert.ok(presentee, `${attendue.nom} n'est pas au registre`);
  assert.equal(presentee.statut, "en-attente");
  assert.equal(presentee.machine, attendue.machine);
  assert.deepEqual(presentee.declarees, attendue.capacites);
  assert.equal(presentee.cloisonnee, attendue.cloisonnee);
  assert.deepEqual(JSON.parse(lancee.sortie), { ok: true, station: presentee });
  // Le serveur a joint le chef, par la destination de la commande ; il affiche
  // son code, que le chef retrouve dans sa home.
  assert.deepEqual(machine.joints(), ["chef@box"]);
  assert.match(lancee.erreurs, new RegExp(`s'est présentée sous le code ${code}`));
  assert.match(lancee.erreurs, /attend dans ta home que tu l'acceptes/);

  // Pas sélectionnable avant l'acceptation, ni sur ce qu'elle déclare.
  assert.deepEqual(registre.utilisables(), []);
  assert.deepEqual(registre.utilisables(attendue.capacites), []);
  const acceptee = registre.accepter(attendue.nom);
  assert.deepEqual(registre.utilisables(attendue.capacites), [acceptee]);
});

test("la commande porte le nom choisi dans la home : la machine se présente sous lui", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  const { enrolements, registre } = chef(t);
  const { commande } = enrolements.preparer({ vers: "chef@box", nom: "serveur-de-test" });

  assert.equal((await serveur(t).lancer(commande)).statut, 0);

  assert.deepEqual(
    registre.liste().map((s) => `${s.nom} ${s.statut}`),
    ["serveur-de-test en-attente"],
  );
});

test("un code faux dans la commande est refusé : la machine n'apparaît pas au registre", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  const { enrolements, registre } = chef(t);
  const { code, commande } = enrolements.preparer({ vers: "chef@box", nom: "serveur-de-test" });
  const faux = code.startsWith("0") ? `1${code.slice(1)}` : `0${code.slice(1)}`;

  const lancee = await serveur(t).lancer(commande.replace(code, faux));

  assert.equal(lancee.statut, 1);
  assert.deepEqual(JSON.parse(lancee.sortie).reason, "inconnu");
  assert.match(lancee.erreurs, /code refusé : aucun enrôlement/);
  assert.deepEqual(registre.liste(), []);
});

test("une commande expirée est refusée : la machine n'apparaît pas au registre", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  // Préparée il y a plus longtemps que son délai.
  const { enrolements, registre } = chef(t, () => new Date(Date.now() - DUREE_MS - 60_000));
  const { commande } = enrolements.preparer({ vers: "chef@box", nom: "serveur-de-test" });

  const lancee = await serveur(t).lancer(commande);

  assert.equal(lancee.statut, 1);
  assert.match(lancee.erreurs, /code refusé : il a expiré/);
  assert.deepEqual(registre.liste(), []);
});

test("une commande ne sert qu'une fois : relancée, ici ou sur une autre machine, elle est refusée et rien n'entre de plus au registre", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  const { enrolements, registre } = chef(t);
  const { commande } = enrolements.preparer({ vers: "chef@box", nom: "serveur-de-test" });
  assert.equal((await serveur(t).lancer(commande)).statut, 0);
  const avant = registre.liste();

  const autre = await serveur(t).lancer(commande.replace("--name 'serveur-de-test'", "--name 'intrus'"));
  const relancee = await serveur(t).lancer(commande);

  for (const lancee of [autre, relancee]) {
    assert.equal(lancee.statut, 1);
    assert.match(lancee.erreurs, /code refusé : il a déjà servi/);
  }
  assert.deepEqual(registre.liste(), avant);
});

test("sans brigade sur la machine, la commande le clone d'abord, puis lance le geste du clone", { skip: posixOnly("runs a fake claude, gh or gates written as a POSIX shell script") }, async (t) => {
  // Un dépôt de brigade dont le geste ne fait que noter ce qu'il reçoit.
  const depot = repertoireTemporaire(t);
  git(depot, "init", "-q", `--initial-branch=${BASE}`);
  mkdirSync(join(depot, "runtime/deploy"), { recursive: true });
  const geste = join(depot, "runtime/deploy/brigade-enrolement");
  writeFileSync(geste, '#!/bin/sh\nprintf \'%s\\n\' "$@" >"$HOME/geste"\n');
  chmodSync(geste, 0o755);
  git(depot, "add", ".");
  git(depot, "commit", "-q", "-m", "le geste");
  const { enrolements, repertoire } = chef(t);
  const { code, commande } = enrolements.preparer({ vers: "chef@box", depot: `file://${depot}`, branche: BASE });
  const machine = serveur(t, { installee: false });

  const lancee = await machine.lancer(commande);

  assert.equal(lancee.statut, 0, lancee.erreurs);
  assert.equal(git(join(machine.home, ".local/share/brigade"), "rev-parse", "--abbrev-ref", "HEAD"), BASE);
  assert.deepEqual(readFileSync(join(machine.home, "geste"), "utf8").split("\n").filter(Boolean), [
    "present",
    code,
    "--to",
    "chef@box",
    "--receiver",
    RECEPTEUR,
    "--registry",
    repertoire,
  ]);
});

// La commande `brigade` d'une station macOS (#3940) : installer-station.sh la pose dans
// ~/.local/bin, sous le compte, sans droit d'administrateur, et met ~/.local/bin sur le PATH des
// terminaux du compte quand il n'y est pas. Rejouée — c'est aussi la mise à jour d'une station
// macOS —, elle la réécrit sans rien doubler.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { posixOnly } from "../support/plateforme.ts";
import { LIGNE_DU_PROFIL, auTerminalNeuf, installerMac, serveurMac, unMac, type Mac } from "./aides.ts";

const occurrences = (fichier: string) => readFileSync(fichier, "utf8").split("\n").filter((ligne) => ligne === LIGNE_DU_PROFIL).length;

function statusDuTerminal(mac: Mac, profil: string) {
  const r = auTerminalNeuf(mac, profil, ["calculus", "status", "--", "--suivre"]);
  assert.equal(r.code, 0, r.erreur);
  return JSON.parse(r.sortie);
}

describe("sous macOS", { skip: posixOnly("plays deploy/installer-station.sh through `sh` on a fake macOS whose doubles are #!/bin/sh scripts first in a PATH joined with “:”") }, () => {
  test("après l'installation, ~/.local/bin/brigade est exécutable, et un terminal neuf lance `brigade calculus status` sans rien d'autre", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"));

    const r = installerMac(mac);

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.equal(statSync(mac.commande).mode & 0o111, 0o111);
    const profil = join(mac.home, ".zprofile");
    assert.equal(occurrences(profil), 1);
    assert.match(r.sortie, /la commande brigade est sur le PATH des terminaux que tu ouvriras/);
    assert.deepEqual(statusDuTerminal(mac, profil), { args: ["--suivre"], cwd: join(mac.base, "runtime"), station: mac.racine, version: "1.2.3" });
  });

  test("rejouée, puis mise à jour : un seul fichier de commande, une seule ligne au profil, et la commande lance le runtime neuf", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"));
    assert.equal(installerMac(mac).code, 0);
    assert.equal(installerMac(mac).code, 0);

    const r = installerMac(mac, [join(serveurMac(t, "1.2.4"), "brigade-station-mac.tar.gz")]);

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.deepEqual(readdirSync(join(mac.home, ".local/bin")), ["brigade"]);
    const profil = join(mac.home, ".zprofile");
    assert.equal(occurrences(profil), 1);
    assert.equal(statusDuTerminal(mac, profil).version, "1.2.4");
  });

  test("une commande d'avant, différente, est remplacée par celle de cette installation", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"));
    mkdirSync(join(mac.home, ".local/bin"), { recursive: true });
    writeFileSync(mac.commande, "#!/bin/sh\necho ancienne\n");

    assert.equal(installerMac(mac).code, 0);

    assert.match(readFileSync(mac.commande, "utf8"), /src\/station\/geste\.ts/);
    assert.equal(statSync(mac.commande).mode & 0o111, 0o111);
  });

  test("~/.local/bin déjà sur le PATH des terminaux : la commande y est posée, et aucun profil n'est écrit", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"));

    const r = installerMac(mac, [], { PATH: `${mac.env.PATH}:${join(mac.home, ".local/bin")}` });

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.equal(statSync(mac.commande).mode & 0o111, 0o111);
    assert.deepEqual(readdirSync(mac.home).filter((nom) => nom.startsWith(".") && !statSync(join(mac.home, nom)).isDirectory()), []);
    assert.doesNotMatch(r.sortie, /PATH/);
  });

  test("sous bash, la ligne va dans le profil qu'il lit déjà : ~/.profile s'il est seul, ~/.bash_profile s'il n'y a rien", (t) => {
    const avecProfile = unMac(t, serveurMac(t, "1.2.3"), { shell: "/bin/bash" });
    writeFileSync(join(avecProfile.home, ".profile"), "# le mien\n");
    assert.equal(installerMac(avecProfile).code, 0);
    assert.equal(occurrences(join(avecProfile.home, ".profile")), 1);
    assert.deepEqual(readdirSync(avecProfile.home).filter((nom) => nom.startsWith(".bash")), []);
    assert.equal(statusDuTerminal(avecProfile, join(avecProfile.home, ".profile")).version, "1.2.3");

    const sansRien = unMac(t, serveurMac(t, "1.2.3"), { shell: "/bin/bash" });
    assert.equal(installerMac(sansRien).code, 0);
    assert.equal(occurrences(join(sansRien.home, ".bash_profile")), 1);
    assert.deepEqual(readdirSync(sansRien.home).filter((nom) => [".profile", ".bash_login", ".zprofile"].includes(nom)), []);
  });

  test("un profil qui ne s'écrit pas : l'installation le dit et échoue, plutôt que de laisser une commande introuvable", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"));
    mkdirSync(join(mac.home, ".zprofile"));

    const r = installerMac(mac);

    assert.equal(r.code, 1);
    assert.match(r.erreur, /installation refusée — \S+\/\.zprofile ne s'écrit pas : la commande brigade n'est pas sur le PATH de tes terminaux/);
  });

  test("un shell dont le profil n'est pas connu : rien n'est écrit, et la commande dit où elle est", (t) => {
    const mac = unMac(t, serveurMac(t, "1.2.3"), { shell: "/opt/homebrew/bin/fish" });

    const r = installerMac(mac);

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.ok(r.sortie.includes(`la commande brigade est dans ${join(mac.home, ".local/bin")}, que le PATH de ton shell (/opt/homebrew/bin/fish) ne porte pas`), r.sortie);
    assert.deepEqual(readdirSync(mac.home).filter((nom) => nom.startsWith(".") && !statSync(join(mac.home, nom)).isDirectory()), []);
  });
});

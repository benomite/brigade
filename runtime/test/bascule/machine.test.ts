// La bascule telle que l'installation du paquet la joue : le vrai postinst du
// paquet, les chemins de la machine ramenés sous une racine d'essai, et les
// commandes qu'il appelle — le node du paquet, systemctl, getent — en
// doublures qui notent leurs appels. Personne ne tape d'autre commande que
// l'installation.
//
// Ce que la bascule fait de la machine est dans bascule.test.ts : les trois
// projets remis à la station — journal, décisions et clone intacts —, les
// anciennes unités arrêtées avant, l'ancien chemin retiré, et l'arrêt de la
// cuisine mesuré jusqu'à ce que la station serve. Un cook en vol que la vie
// suivante reprend sans le relancer : main.test.ts et station/main.test.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";

const POSTINST = join(import.meta.dirname, "../../paquet/debian/postinst");

// Une installation sous une racine d'essai où systemd tourne. `node` est la
// doublure du node du paquet : elle note ses arguments et rend `bascule` (la
// bascule) ou `attendre` (l'attente de la reprise). Rend ce que le postinst a
// rendu et la suite des appels.
function installer(t: TestContext, rendus: { bascule?: number; attendre?: number } = {}, versionDAvant = "") {
  const essai = repertoireTemporaire(t);
  const racine = join(essai, "machine");
  const bin = join(essai, "bin");
  mkdirSync(join(racine, "run/systemd/system"), { recursive: true });
  mkdirSync(bin);
  const appels = join(essai, "appels");
  writeFileSync(appels, "");
  const doublure = (nom: string, script: string) => {
    writeFileSync(join(bin, nom), `#!/bin/sh\necho "${nom} $*" >>"${appels}"\n${script}\n`);
    chmodSync(join(bin, nom), 0o755);
  };
  doublure("node", `[ "$2" = attendre ] && exit ${rendus.attendre ?? 0}; exit ${rendus.bascule ?? 0}`);
  // Le compte brigade existe déjà ; la station est activée, ses portes ne tournent pas.
  doublure("getent", "exit 0");
  doublure("systemctl", '[ "$2" = is-enabled ] && { [ "$3" = brigade-station.service ] && exit 0; exit 1; }; [ "$2" = is-active ] && exit 3; exit 0');
  // Les chemins de la machine sous la racine d'essai, et le node du paquet remplacé par sa doublure.
  const ramene = join(essai, "postinst");
  writeFileSync(
    ramene,
    readFileSync(POSTINST, "utf8")
      .replaceAll("/run/systemd/system", join(racine, "run/systemd/system"))
      .replace(/^RACINE=\/$/m, `RACINE=${racine}`)
      .replace(/^NODE=\/usr\/lib\/brigade-station\/node\/bin\/node$/m, `NODE=${join(bin, "node")}`)
      .replace(/^BASCULE=\/usr\/lib\//m, `BASCULE=${racine}/usr/lib/`),
  );
  const rendu = spawnSync("sh", [ramene, "configure", versionDAvant], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } });
  const bascule = join(racine, "usr/lib/brigade-station/runtime/src/bascule/main.ts");
  return {
    code: rendu.status,
    sortie: rendu.stdout + rendu.stderr,
    // Les appels, la racine et la bascule nommées : `<racine>` et `<bascule>`.
    appels: readFileSync(appels, "utf8")
      .trim()
      .split("\n")
      .filter((appel) => appel !== "" && !appel.startsWith("getent") && !/is-(enabled|active)/.test(appel))
      .map((appel) => appel.replaceAll(bascule, "<bascule>").replaceAll(racine, "<racine>")),
  };
}

test("installer le paquet joue la bascule avant de recharger systemd et de démarrer la station, puis attend que la station reprenne la cuisine", (t) => {
  const premiere = installer(t);
  assert.equal(premiere.code, 0, premiere.sortie);
  assert.deepEqual(premiere.appels, [
    "node <bascule> --racine <racine>",
    "systemctl daemon-reload",
    "systemctl enable --now brigade-station.service brigade-station-renouvellement.timer",
    "node <bascule> attendre --racine <racine>",
  ]);
  // Une mise à jour aussi : la station relancée, la reprise attendue après.
  const miseAJour = installer(t, {}, "1.0.0");
  assert.equal(miseAJour.code, 0, miseAJour.sortie);
  assert.deepEqual(miseAJour.appels, ["node <bascule> --racine <racine>", "systemctl daemon-reload", "systemctl restart brigade-station.service", "node <bascule> attendre --racine <racine>"]);
});

test("une bascule refusée arrête l'installation : systemd n'est pas rechargé, la station ne démarre pas", (t) => {
  const refusee = installer(t, { bascule: 1 });
  assert.notEqual(refusee.code, 0);
  assert.deepEqual(refusee.appels, ["node <bascule> --racine <racine>"]);
});

test("une reprise que la station n'a pas encore constatée n'arrête pas l'installation : la station est démarrée quand même", (t) => {
  const nonConstatee = installer(t, { attendre: 1 });
  assert.equal(nonConstatee.code, 0, nonConstatee.sortie);
  assert.equal(nonConstatee.appels.at(-1), "node <bascule> attendre --racine <racine>");
  assert.ok(nonConstatee.appels.includes("systemctl enable --now brigade-station.service brigade-station-renouvellement.timer"), nonConstatee.appels.join("\n"));
});

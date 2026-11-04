// La bascule telle que le paquet de la station la joue : son vrai postinst
// (`paquet/debian/postinst`), joué comme `apt-get` le joue à la première
// installation, ses chemins de machine ramenés sous une racine d'essai comme le
// fait la doublure d'apt (`../mise-a-jour/aides/faux-apt-get.ts`). systemd et
// le `node` du paquet sont des doublures en shell qui notent leurs appels, dans
// un seul fichier, dans l'ordre : ce qui est éprouvé ici, c'est le moment où
// le postinst joue la bascule, et ce qu'il fait quand elle refuse.
//
// Le reste est éprouvé ailleurs, sans paquet ni vrais runtimes :
// - ce que la bascule lit, écrit, retire et laisse, et sa commande en process
//   (`--racine`, `attendre`) : bascule.test.ts ;
// - l'arrêt de la cuisine mesuré jusqu'à ce que la station serve les projets :
//   bascule.test.ts « la reprise constatée : la station sert les projets remis,
//   et l'arrêt de leur cuisine est mesuré, de la bascule à la station » ;
// - un cook en vol que le runtime suivant, sur le même état, reprend sans le
//   relancer ni l'interrompre, puis mène jusqu'au merge : reprise.test.ts
//   « aucun cook en vol n'est interrompu pendant le remplacement… » et « le
//   cook repris finit son travail : sa branche est poussée, sa PR ouverte, il
//   passe la pass et se merge — sans qu'aucun cook neuf ne parte » ;
// - les fichiers que le paquet pose, la bascule comprise : paquet/paquet.test.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const RUNTIME = join(import.meta.dirname, "../..");
const POSTINST = join(RUNTIME, "paquet/debian/postinst");
const RUNTIME_DU_PAQUET = "/usr/lib/brigade-station/runtime/";
const SANS_SH = posixOnly("plays the package's sh postinst against sh fakes of systemctl and node; the scripts' paths are the Linux machine's");

function executable(fichier: string, texte: string): void {
  writeFileSync(fichier, texte);
  chmodSync(fichier, 0o755);
}

// Le postinst joué à la première installation, sur une machine où systemd
// tourne et où le compte brigade existe. `rend` : ce que le `node` du paquet
// rend quand on lui fait jouer la bascule, puis l'attente de la reprise.
function installer(t: TestContext, rend: { bascule: number; attendre: number; dit: string }) {
  const essai = repertoireTemporaire(t);
  const racine = join(essai, "machine");
  mkdirSync(join(racine, "run/systemd/system"), { recursive: true });
  const bin = join(essai, "bin");
  mkdirSync(bin);
  const appels = join(essai, "appels");
  writeFileSync(appels, "");
  executable(join(bin, "systemctl"), `#!/bin/sh\necho "systemctl $*" >>"${appels}"\nexit 0\n`);
  executable(join(bin, "getent"), "#!/bin/sh\nexit 0\n");
  const node = join(bin, "node-du-paquet");
  executable(node, `#!/bin/sh\necho "node $*" >>"${appels}"\necho "${rend.dit}" >&2\n[ "$2" = attendre ] && exit ${rend.attendre}\nexit ${rend.bascule}\n`);
  const ramene = join(essai, "postinst");
  writeFileSync(
    ramene,
    readFileSync(POSTINST, "utf8")
      .replaceAll("/run/systemd/system", join(racine, "run/systemd/system"))
      .replace(/^RACINE=\/$/m, `RACINE=${racine}`)
      .replace(/^NODE=\/usr\/lib\/brigade-station\/node\/bin\/node$/m, `NODE=${node}`),
  );
  const rendu = spawnSync("sh", [ramene, "configure", ""], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } });
  return { racine, code: rendu.status, sortie: rendu.stdout + rendu.stderr, appels: readFileSync(appels, "utf8").trim().split("\n").filter(Boolean) };
}

test("le postinst du paquet joue la bascule sous la racine de la machine avant de recharger systemd et de démarrer la station, puis attend qu'elle serve ce qu'elle a repris", { skip: SANS_SH }, (t) => {
  const installation = installer(t, { bascule: 0, attendre: 0, dit: "bascule : faite" });
  assert.equal(installation.code, 0, installation.sortie);
  const bascule = `${RUNTIME_DU_PAQUET}src/bascule/main.ts`;
  assert.deepEqual(installation.appels, [
    `node ${bascule} --racine ${installation.racine}`,
    "systemctl daemon-reload",
    "systemctl enable --now brigade-station.service brigade-station-renouvellement.timer",
    `node ${bascule} attendre --racine ${installation.racine}`,
  ]);
  // Ce que le postinst lance est la commande de la bascule de ce dépôt, là où le paquet pose le runtime.
  assert.equal(existsSync(join(RUNTIME, bascule.slice(RUNTIME_DU_PAQUET.length))), true, bascule);
});

test("une bascule refusée arrête l'installation en le disant : la station ne démarre pas, les anciennes unités servent toujours", { skip: SANS_SH }, (t) => {
  const installation = installer(t, { bascule: 1, attendre: 0, dit: "bascule refusée — rien n'a changé" });
  assert.notEqual(installation.code, 0);
  assert.match(installation.sortie, /bascule refusée — rien n'a changé/);
  assert.deepEqual(installation.appels, [`node ${RUNTIME_DU_PAQUET}src/bascule/main.ts --racine ${installation.racine}`]);
});

test("une reprise que la station n'a pas encore constatée ne fait pas échouer l'installation : la station est démarrée, l'attente l'a dit", { skip: SANS_SH }, (t) => {
  const installation = installer(t, { bascule: 0, attendre: 1, dit: "bascule : la station ne sert pas encore espace" });
  assert.equal(installation.code, 0, installation.sortie);
  assert.match(installation.sortie, /la station ne sert pas encore espace/);
  assert.equal(installation.appels.at(-2), "systemctl enable --now brigade-station.service brigade-station-renouvellement.timer");
  assert.match(installation.appels.at(-1) ?? "", / attendre --racine /);
});

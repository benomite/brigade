// Les téléphones de la station par sa commande de box : `brigade <projet>
// phones …`, ce que l'app de l'ordinateur lance par `ssh` pour appairer un
// téléphone sans terminal. Le geste est posé comme le paquet le pose, à côté
// du runtime de ce dépôt et de son `node` ; ni systemd ni `sudo` ici : des
// doublures dans le `PATH`. Ce que la règle sudoers donne au chef, il le lance ;
// qui n'en a pas le droit est refusé, et rien n'est tiré, lu ni révoqué.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { cheminTelephones, lireContenuDuQr, ouvrirTelephones } from "../src/telephone/appairage.ts";
import { repertoireDuFichier, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const RUNTIME = join(import.meta.dirname, "..");
const SANS_DROIT = 68;
const CACHE_DE_COMPILATION = process.env.NODE_COMPILE_CACHE || repertoireDuFichier("brigade-test-telephones-cache-");

type Fin = { code: number | null; sortie: string; erreur: string };

// Une machine où la station est installée sous le compte `brigade`, avec le
// projet `calculus`, et le registre des stations que son unité nomme. `droit` :
// le chef a la règle sudoers du geste, sans mot de passe — sinon aucune.
function machine(t: TestContext, { droit }: { droit: boolean }) {
  const racine = repertoireTemporaire(t);
  const [bin, paquet, station] = [join(racine, "bin"), join(racine, "usr/lib/brigade-station"), join(racine, "var/lib/brigade")];
  const registre = join(station, "registre");
  for (const repertoire of [bin, join(paquet, "node/bin"), station]) mkdirSync(repertoire, { recursive: true });
  const executable = (fichier: string, lignes: string[]) => {
    writeFileSync(fichier, ["#!/bin/sh", ...lignes, ""].join("\n"));
    chmodSync(fichier, 0o755);
  };
  const geste = join(paquet, "brigade");
  copyFileSync(join(RUNTIME, "deploy/brigade"), geste);
  chmodSync(geste, 0o755);
  symlinkSync(process.execPath, join(paquet, "node/bin/node"));
  symlinkSync(RUNTIME, join(paquet, "runtime"));
  writeFileSync(join(station, "projets"), "calculus benomite/calculus main\n");

  const unite: Record<string, string> = { User: "brigade", Environment: [`NODE_COMPILE_CACHE=${CACHE_DE_COMPILATION}`, `BRIGADE_STATION_DIR=${station}`, `BRIGADE_REGISTRE_DIR=${registre}`, "PATH=/usr/bin:/bin"].join(" ") };
  executable(join(bin, "systemctl"), [`case "$3" in`, ...Object.entries(unite).map(([cle, valeur]) => `  ${cle}) echo '${valeur}' ;;`), "esac"]);
  executable(join(bin, "id"), [`echo "\${FAUX_QUI:-chef}"`]);
  // `sudo [-n] [-H] -u <compte> -- <commande…>`. Sans le droit, `-n` est refusé
  // — sans terminal, rien ne se demande.
  executable(join(bin, "sudo"), [
    `if [ "$1" = "-n" ]; then ${droit ? "shift" : `echo "sudo: a password is required" >&2; exit 1`}; fi`,
    `[ "$1" = "-H" ] && { HOME="/home/$3"; export HOME; shift; }`,
    `[ "$1 $3" = "-u --" ] || { echo "faux sudo : $*" >&2; exit 1; }`,
    `FAUX_QUI="$2"; export FAUX_QUI; shift 3; exec "$@"`,
  ]);

  // Lancé sans terminal, sous le chef — comme par `ssh`.
  const lancer = (args: string[]): Promise<Fin> =>
    new Promise((resoudre, rejeter) => {
      const enfant = spawn(geste, ["calculus", "phones", ...args], { cwd: racine, env: { PATH: `${bin}:${process.env.PATH}`, HOME: "/home/chef" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
      let [sortie, erreur] = ["", ""];
      enfant.stdout.setEncoding("utf8").on("data", (bout: string) => (sortie += bout));
      enfant.stderr.setEncoding("utf8").on("data", (bout: string) => (erreur += bout));
      enfant.on("error", rejeter);
      enfant.on("close", (code) => resoudre({ code, sortie, erreur }));
    });
  return { registre, lancer };
}

const json = (fin: Fin) => {
  assert.equal(fin.code, 0, fin.erreur);
  return JSON.parse(fin.sortie) as Record<string, unknown>;
};

// Les deux tests lancent le geste de la station — deploy/brigade, un script
// bash — tel quel par `spawn`, derrière de faux `sudo`, `systemctl` et `id`
// écrits en `#!/bin/sh` : Windows n'exécute pas un script à shebang. Sautés
// dès leur arrivée, ils n'ont jamais tourné sur le job Windows ; le même
// geste lancé de la même façon par geste.test.ts y finit en `spawn
// …\usr\lib\brigade-station\brigade ENOENT` (run 40076391873).
describe("les téléphones par le geste de la station", { concurrency: 4 }, () => {
  test("le chef que la règle sudoers nomme tire un code et son QR, lit son état, liste les téléphones appairés et en révoque un — dans le registre de la station", { skip: posixOnly("draws a code and its QR, reads its status, lists and revokes a phone by spawning deploy/brigade (the station's gesture, a bash script) directly, through a fake sudo that execs it as the station account and fake systemctl and id written as #!/bin/sh scripts; Windows cannot spawn a shebang script: on the Windows job the same gesture spawned this way by geste.test.ts fails with spawn …\\usr\\lib\\brigade-station\\brigade ENOENT") }, async (t) => {
    const m = machine(t, { droit: true });

    const tire = json(await m.lancer(["code", "--url", "https://box.tail1234.ts.net"]));
    assert.deepEqual(lireContenuDuQr(String(tire.qr)), { code: tire.code, adresse: "https://box.tail1234.ts.net" });
    assert.equal(typeof tire.expiresAt, "string");
    assert.equal(json(await m.lancer(["status", String(tire.code)])).status, "valid");

    // Le téléphone s'appaire au guichet, qui lit le même registre.
    const telephones = ouvrirTelephones(m.registre);
    t.after(() => telephones.fermer());
    const { jeton } = telephones.appairer(String(tire.code), { nom: "pixel-8", machine: "Android 16" });
    assert.equal(json(await m.lancer(["status", String(tire.code)])).status, "used");
    assert.deepEqual(
      (json(await m.lancer(["list"])).phones as Array<{ name: string }>).map(({ name }) => name),
      ["pixel-8"],
    );

    assert.deepEqual(json(await m.lancer(["revoke", "pixel-8"])), { revoked: true, station: "pixel-8" });
    assert.deepEqual(json(await m.lancer(["list"])), { phones: [] });
    assert.equal(telephones.authentifier(jeton), null);
  });

  test("qui n'a pas le droit du geste est refusé, pour chacune des quatre, et rien n'est tiré, lu ni révoqué", { skip: posixOnly("checks the refusal with exit code 68 by spawning deploy/brigade (the station's gesture, a bash script) directly, whose fake sudo -n (a #!/bin/sh script) answers that a password is required; Windows cannot spawn a shebang script: on the Windows job the same gesture spawned this way by geste.test.ts fails with spawn …\\usr\\lib\\brigade-station\\brigade ENOENT") }, async (t) => {
    const m = machine(t, { droit: false });

    for (const args of [["code", "--url", "https://box.tail1234.ts.net"], ["status", "7KQ2-M9XD"], ["list"], ["revoke", "pixel-8"]]) {
      const fin = await m.lancer(args);
      assert.equal(fin.code, SANS_DROIT, args.join(" "));
      assert.equal(fin.sortie, "", args.join(" "));
      assert.match(fin.erreur, /« chef » n'a pas le droit de lancer le geste sur cette machine/, args.join(" "));
    }
    // La commande n'est jamais partie : la base des téléphones n'a même pas été ouverte.
    assert.equal(existsSync(cheminTelephones(m.registre)), false);
  });
});

// La capture d'un écran, jouée pour de bon : la commande lancée comme un cook la lance, un vrai
// navigateur sans tête, un vrai PNG. Ni `claude` ni `ssh` ni `gh` ne sont lancés — des doublures
// en tête du PATH le diraient —, et rien ne sort de la machine : la commande refuse ce que la page
// demanderait au réseau, et, là où l'on peut couper le réseau sans être root, elle tourne sans.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { promisify } from "node:util";
import { ecrans, fichierDe } from "../capture.ts";

const lancer = promisify(execFile);
const COMMANDE = join(import.meta.dirname, "..", "capture.ts");

// Le navigateur du paquet n'est livré que pour Linux x64 : ailleurs, BRIGADE_CAPTURE_CHROME en désigne un.
const SANS_NAVIGATEUR = (process.platform !== "linux" || process.arch !== "x64") && !process.env.BRIGADE_CAPTURE_CHROME ? "pas de navigateur ici : BRIGADE_CAPTURE_CHROME=<un Chrome>" : false;

// Des doublures de `claude`, `ssh` et `gh` : lancée, chacune écrit son nom dans la marque, et échoue.
function doublures(): { env: NodeJS.ProcessEnv; marque: string; dossier: string } {
  const dossier = mkdtempSync(join(tmpdir(), "capture-ecran-test-"));
  const marque = join(dossier, "lances");
  for (const nom of ["claude", "ssh", "gh"]) {
    const chemin = join(dossier, nom);
    writeFileSync(chemin, `#!/bin/sh\necho "${nom} $*" >> '${marque}'\nexit 1\n`);
    chmodSync(chemin, 0o755);
  }
  return { env: { ...process.env, PATH: `${dossier}:${process.env.PATH ?? ""}`, BRIGADE_CLAUDE_BIN: join(dossier, "claude"), BRIGADE_SSH_BIN: join(dossier, "ssh") }, marque, dossier };
}

// La signature d'un PNG, et la largeur et la hauteur de son en-tête.
function png(fichier: string): { octets: Buffer; largeur: number; hauteur: number } {
  const octets = readFileSync(fichier);
  assert.deepEqual([...octets.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${fichier} n'est pas un PNG`);
  assert.equal(octets.subarray(12, 16).toString("ascii"), "IHDR");
  return { octets, largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
}

describe("capturer un écran de l'app", { skip: SANS_NAVIGATEUR }, () => {
  test("deux captures vers deux chemins : deux PNG lisibles, identiques à l'octet, et ni claude, ni ssh, ni gh lancés", async () => {
    const { env, marque, dossier } = doublures();
    const avant = join(dossier, "avant", "rail.png");
    const apres = join(dossier, "apres.png");

    const premiere = await lancer(process.execPath, [COMMANDE, "espace-projet", avant], { env });
    const seconde = await lancer(process.execPath, [COMMANDE, "espace-projet", apres], { env });

    assert.match(premiere.stdout, /rail\.png — espace-projet, \d+ octets/);
    assert.match(seconde.stdout, /apres\.png — espace-projet, \d+ octets/);
    const [a, b] = [png(avant), png(apres)];
    assert.deepEqual([a.largeur, a.hauteur], [1440, 900]);
    assert.ok(a.octets.length > 20_000, `un écran rendu pèse plus que ${a.octets.length} octets`);
    assert.ok(a.octets.equals(b.octets), "le même écran, sur le même code, ne donne pas le même PNG");
    assert.equal(existsSync(marque), false, `lancé pendant la capture : ${existsSync(marque) ? readFileSync(marque, "utf8") : ""}`);
  });

  test("chaque écran de ecrans/ se rend — la vue n'y lève rien et n'y demande rien qui ne soit sur le disque", async () => {
    const { env, dossier } = doublures();
    const noms = [...(await ecrans()).keys()];
    assert.ok(noms.length >= 4, `trop peu d'écrans : ${noms.join(", ")}`);
    for (const nom of noms) {
      const sortie = join(dossier, `${nom}.png`);
      await lancer(process.execPath, [COMMANDE, nom, sortie], { env });
      const { largeur, octets } = png(sortie);
      assert.ok(largeur > 0 && octets.length > 20_000, `${nom} : ${octets.length} octets`);
    }
  });

  // `unshare -rn` : un espace de noms réseau neuf, sans aucune interface montée — pas même lo.
  const UNSHARE = (() => {
    try {
      execFileSync("unshare", ["-rn", "true"], { stdio: "ignore" });
      return false;
    } catch {
      return "unshare -rn indisponible ici : le réseau ne se coupe pas sans être root";
    }
  })();
  test("sans aucun réseau, la capture est la même", { skip: UNSHARE }, async () => {
    const { env, dossier } = doublures();
    const relie = join(dossier, "relie.png");
    const coupe = join(dossier, "coupe.png");

    await lancer(process.execPath, [COMMANDE, "tous-les-projets", relie], { env });
    await lancer("unshare", ["-rn", process.execPath, COMMANDE, "tous-les-projets", coupe], { env });

    assert.ok(png(relie).octets.equals(png(coupe).octets));
  });
});

describe("ce que la page reçoit", () => {
  test("un fichier de l'app, sous l'adresse de l'app", () => {
    const servi = fichierDe("http://app.brigade.invalid/src/vue/vue.js");
    assert.ok("fichier" in servi && servi.fichier.endsWith(join("app", "src", "vue", "vue.js")));
  });

  test("rien d'ailleurs : toute autre adresse est refusée", () => {
    for (const adresse of ["https://github.com/benomite/brigade", "http://127.0.0.1:20839/", "https://fonts.googleapis.com/css2?family=Archivo"]) {
      assert.ok("refusee" in fichierDe(adresse), adresse);
    }
  });

  test("rien hors de app/, ni un fichier qui n'y est pas", () => {
    for (const adresse of ["http://app.brigade.invalid/%2e%2e/runtime/package.json", "http://app.brigade.invalid/../CLAUDE.md", "http://app.brigade.invalid/src/vue/", "http://app.brigade.invalid/src/vue/absent.js"]) {
      assert.ok("absente" in fichierDe(adresse), adresse);
    }
  });
});

describe("la ligne de commande", () => {
  test("--liste dit chaque écran, sa taille et ce qu'il montre", async () => {
    const { stdout } = await lancer(process.execPath, [COMMANDE, "--liste"]);
    for (const nom of ["tous-les-projets", "espace-projet", "ajout", "fiche"]) assert.match(stdout, new RegExp(`^${nom} +1440×900  .+$`, "m"));
  });

  test("un écran inconnu est refusé, en nommant ceux qui existent, et rien n'est écrit", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "capture-ecran-test-"));
    const sortie = join(dossier, "x.png");
    await assert.rejects(lancer(process.execPath, [COMMANDE, "cuisine", sortie]), (erreur: { code: number; stderr: string }) => {
      assert.equal(erreur.code, 2);
      assert.match(erreur.stderr, /écran inconnu : cuisine — les écrans : ajout, espace-projet, fiche, file-ou-cuit, reglages-ordinaires-sans-bac, reglages-ordinaires, tous-les-projets/);
      return true;
    });
    assert.equal(existsSync(sortie), false);
  });

  test("un fichier de sortie qui n'est pas un .png est refusé", async () => {
    await assert.rejects(lancer(process.execPath, [COMMANDE, "ajout", "/tmp/capture.jpg"]), (erreur: { code: number; stderr: string }) => erreur.code === 2 && /doit finir par \.png/.test(erreur.stderr));
  });
});

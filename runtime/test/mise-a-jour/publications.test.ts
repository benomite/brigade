// Où la station trouve les versions publiées : les releases GitHub du dépôt,
// ou le répertoire d'une installation de test.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lirePublicationsGitHub, publications } from "../../src/mise-a-jour/publications.ts";
import { repertoireTemporaire } from "../outils.ts";

const LINUX = { os: "linux", arch: "x64" };
const MAC = { os: "darwin", arch: "arm64" };
const nom = (version: string, p = LINUX) => `brigade-station-${version}-${p.os}-${p.arch}.tar.gz`;
const asset = (name: string, extra: Record<string, unknown> = {}) => ({ name, browser_download_url: `https://github.com/acme/brigade/releases/download/x/${name}`, ...extra });

test("des releases de GitHub, seules comptent celles de la station, publiées, qui portent l'archive de la plateforme", () => {
  const empreinte = "a".repeat(64);
  const releases = [
    { tag_name: "station-1.2.0", draft: false, prerelease: false, assets: [asset(nom("1.2.0"), { digest: `sha256:${empreinte}` }), asset("installer-station.sh")] },
    { tag_name: "station-1.3.0", draft: true, prerelease: false, assets: [asset(nom("1.3.0"))] },
    { tag_name: "station-1.4.0~rc1", draft: false, prerelease: true, assets: [asset(nom("1.4.0~rc1"))] },
    { tag_name: "station-1.1.0", draft: false, prerelease: false, assets: [asset(nom("1.1.0", MAC))] },
    { tag_name: "v1.45.0", draft: false, prerelease: false, assets: [asset(nom("1.45.0"))] },
    { tag_name: "station-v1-final", draft: false, prerelease: false, assets: [asset(nom("v1-final"))] },
    { tag_name: "station-1.0.0", draft: false, prerelease: false, assets: [asset(nom("1.0.0"))] },
  ];
  assert.deepEqual(lirePublicationsGitHub(releases, LINUX), [
    { version: "1.2.0", archive: asset(nom("1.2.0")).browser_download_url, empreinte },
    { version: "1.0.0", archive: asset(nom("1.0.0")).browser_download_url, empreinte: null },
  ]);
  assert.deepEqual(lirePublicationsGitHub(releases, MAC).map((p) => p.version), ["1.1.0"]);
  assert.throws(() => lirePublicationsGitHub({ message: "Not Found" }, LINUX), /n'a pas rendu une liste de releases/);
});

test("la source se nomme : les releases d'un dépôt GitHub (aucun par défaut), un répertoire pour une installation de test ; autre chose est refusé", () => {
  assert.throws(() => publications(undefined, LINUX), /BRIGADE_MISE_A_JOUR_SOURCE is not set — say where the published versions are: github:<owner>\/<repo>/);
  assert.throws(() => publications("", LINUX), /BRIGADE_MISE_A_JOUR_SOURCE is not set/);
  assert.equal(publications("github:moi/fourche", LINUX).nom, "les releases de moi/fourche");
  assert.equal(publications("/srv/versions", LINUX).nom, "le répertoire /srv/versions");
  assert.throws(() => publications("https://exemple.org", LINUX), /BRIGADE_MISE_A_JOUR_SOURCE=https:\/\/exemple\.org — attendu github:<owner>\/<repo>/);
});

test("un répertoire de versions : un sous-répertoire par version, l'archive de la plateforme dedans ; elle se copie à la demande", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const [version, plateforme] of [["1.0.0", LINUX], ["1.1.0", LINUX], ["1.2.0", MAC], ["pas-une-version", LINUX]] as const) {
    mkdirSync(join(repertoire, version));
    writeFileSync(join(repertoire, version, nom(version, plateforme)), `archive ${version}`);
  }
  const source = publications(repertoire, LINUX);
  const liste = (await source.lister()).sort((a, b) => a.version.localeCompare(b.version));
  assert.deepEqual(liste.map((p) => p.version), ["1.0.0", "1.1.0"]);
  const cible = join(repertoireTemporaire(t), "1.1.0.tar.gz");
  await source.telecharger(liste[1] ?? { version: "", archive: "", empreinte: null }, cible);
  assert.equal(readFileSync(cible, "utf8"), "archive 1.1.0");
  await assert.rejects(publications(join(repertoire, "absent"), LINUX).lister(), /le répertoire des versions publiées .* n'existe pas/);
});

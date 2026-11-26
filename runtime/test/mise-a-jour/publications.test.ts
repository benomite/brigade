// Où la station trouve les versions publiées : les releases GitHub du dépôt,
// ou le répertoire d'une installation de test.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lirePublicationsGitHub, publications } from "../../src/mise-a-jour/publications.ts";
import { repertoireTemporaire } from "../outils.ts";

const asset = (name: string, extra: Record<string, unknown> = {}) => ({ name, browser_download_url: `https://github.com/acme/brigade/releases/download/x/${name}`, ...extra });

test("des releases de GitHub, seules comptent celles de la station, publiées, qui portent le paquet de l'architecture", () => {
  const empreinte = "a".repeat(64);
  const releases = [
    { tag_name: "station-1.2.0", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb", { digest: `sha256:${empreinte}` }), asset("installer-station.sh")] },
    { tag_name: "station-1.3.0", draft: true, prerelease: false, assets: [asset("brigade-station_amd64.deb")] },
    { tag_name: "station-1.4.0~rc1", draft: false, prerelease: true, assets: [asset("brigade-station_amd64.deb")] },
    { tag_name: "station-1.1.0", draft: false, prerelease: false, assets: [asset("brigade-station_arm64.deb")] },
    { tag_name: "v1.45.0", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb")] },
    { tag_name: "station-v1-final", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb")] },
    { tag_name: "station-1.0.0", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb")] },
  ];
  assert.deepEqual(lirePublicationsGitHub(releases, "amd64"), [
    { version: "1.2.0", paquet: asset("brigade-station_amd64.deb").browser_download_url, empreinte },
    { version: "1.0.0", paquet: asset("brigade-station_amd64.deb").browser_download_url, empreinte: null },
  ]);
  assert.deepEqual(lirePublicationsGitHub(releases, "arm64").map((p) => p.version), ["1.1.0"]);
  assert.throws(() => lirePublicationsGitHub({ message: "Not Found" }, "amd64"), /n'a pas rendu une liste de releases/);
});

test("la source se nomme : les releases d'un dépôt GitHub (aucun par défaut), un répertoire pour une installation de test ; autre chose est refusé", () => {
  assert.throws(() => publications(undefined, "amd64"), /BRIGADE_MISE_A_JOUR_SOURCE is not set — say where the published versions are: github:<owner>\/<repo>/);
  assert.throws(() => publications("", "amd64"), /BRIGADE_MISE_A_JOUR_SOURCE is not set/);
  assert.equal(publications("github:moi/fourche", "amd64").nom, "les releases de moi/fourche");
  assert.equal(publications("/srv/versions", "amd64").nom, "le répertoire /srv/versions");
  assert.throws(() => publications("https://exemple.org", "amd64"), /BRIGADE_MISE_A_JOUR_SOURCE=https:\/\/exemple\.org — attendu github:<owner>\/<repo>/);
});

test("un répertoire de versions : un sous-répertoire par version, le paquet de l'architecture dedans ; il se copie à la demande", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const [version, arch] of [["1.0.0", "amd64"], ["1.1.0", "amd64"], ["1.2.0", "arm64"], ["pas-une-version", "amd64"]]) {
    mkdirSync(join(repertoire, version ?? ""));
    writeFileSync(join(repertoire, version ?? "", `brigade-station_${arch}.deb`), `paquet ${version}`);
  }
  const source = publications(repertoire, "amd64");
  const liste = (await source.lister()).sort((a, b) => a.version.localeCompare(b.version));
  assert.deepEqual(liste.map((p) => p.version), ["1.0.0", "1.1.0"]);
  const cible = join(repertoireTemporaire(t), "1.1.0.deb");
  await source.telecharger(liste[1] ?? { version: "", paquet: "", empreinte: null }, cible);
  assert.equal(readFileSync(cible, "utf8"), "paquet 1.1.0");
  await assert.rejects(publications(join(repertoire, "absent"), "amd64").lister(), /le répertoire des versions publiées .* n'existe pas/);
});

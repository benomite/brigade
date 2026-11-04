// Où la station de l'ordinateur trouve ses versions : les releases
// `station-<version>` de la même source que la box, et l'archive du runtime
// pour sa plateforme — pas le paquet Debian.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { archiveDe, lireReleasesGitHub, sourceDesVersions } from "../../src/station-update/releases.ts";
import { statutVierge } from "../../src/station-update/statut.ts";
import { repertoireTemporaire } from "../outils.ts";
import { ARCHIVE_MAC, publier } from "./aides.ts";

const asset = (name: string, extra: Record<string, unknown> = {}) => ({ name, browser_download_url: `https://github.com/acme/brigade/releases/download/x/${name}`, ...extra });

test("l'archive d'un Mac, celle d'un PC ; Linux n'en a pas — la box prend le paquet", () => {
  assert.equal(archiveDe("darwin"), "brigade-station-mac.tar.gz");
  assert.equal(archiveDe("win32"), "brigade-station-windows.zip");
  assert.equal(archiveDe("linux"), null);
});

test("des releases de GitHub, seules comptent celles de la station, publiées ; celle sans l'archive de la plateforme compte, sans rien à télécharger", () => {
  const empreinte = "b".repeat(64);
  const releases = [
    { tag_name: "station-1.2.0", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb"), asset(ARCHIVE_MAC, { digest: `sha256:${empreinte}` })] },
    { tag_name: "station-1.3.0", draft: true, prerelease: false, assets: [asset(ARCHIVE_MAC)] },
    { tag_name: "station-1.4.0~rc1", draft: false, prerelease: true, assets: [asset(ARCHIVE_MAC)] },
    { tag_name: "station", draft: false, prerelease: false, assets: [asset(ARCHIVE_MAC)] },
    { tag_name: "app-v1.0.82", draft: false, prerelease: false, assets: [asset(ARCHIVE_MAC)] },
    { tag_name: "station-1.1.0", draft: false, prerelease: false, assets: [asset("brigade-station_amd64.deb")] },
  ];
  assert.deepEqual(lireReleasesGitHub(releases, ARCHIVE_MAC), [
    { version: "1.2.0", archive: asset(ARCHIVE_MAC).browser_download_url, empreinte },
    { version: "1.1.0", archive: null, empreinte: null },
  ]);
  assert.deepEqual(lireReleasesGitHub(releases, null), [
    { version: "1.2.0", archive: null, empreinte: null },
    { version: "1.1.0", archive: null, empreinte: null },
  ]);
  assert.throws(() => lireReleasesGitHub({ message: "Not Found" }, ARCHIVE_MAC), /GitHub did not return a list of releases/);
});

test("la source est celle de la box : un dépôt GitHub, ou un répertoire ; autre chose est refusé", async (t) => {
  assert.equal(sourceDesVersions("github:acme/brigade", ARCHIVE_MAC).nom, "the releases of acme/brigade");
  assert.throws(() => sourceDesVersions(undefined, ARCHIVE_MAC), /BRIGADE_MISE_A_JOUR_SOURCE is not set/);
  assert.throws(() => sourceDesVersions("https://exemple.org", ARCHIVE_MAC), /expected github:<owner>\/<repo>/);
  const publiees = repertoireTemporaire(t);
  publier(publiees, "1.0.0");
  const liste = await sourceDesVersions(publiees, ARCHIVE_MAC).lister();
  assert.deepEqual(liste, [{ version: "1.0.0", archive: join(publiees, "1.0.0", ARCHIVE_MAC), empreinte: null }]);
  await assert.rejects(sourceDesVersions(join(publiees, "absent"), ARCHIVE_MAC).lister(), /does not exist/);
});

test("`status` dit le statut de la station, en JSON : avant tout regard, sa version et aucun retard", (t) => {
  const racine = repertoireTemporaire(t);
  const sortie = execFileSync(process.execPath, [join(import.meta.dirname, "../../src/station-update/main.ts"), "status"], { encoding: "utf8", env: { ...process.env, BRIGADE_STATION_DIR: racine } });
  const lu = JSON.parse(sortie) as ReturnType<typeof statutVierge>;
  assert.deepEqual(Object.keys(lu).slice(0, 3), ["stationVersion", "latestStationVersion", "behind"]);
  assert.deepEqual([lu.latestStationVersion, lu.behind], [null, false]);
});

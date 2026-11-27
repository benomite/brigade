// Le flux des versions de l'app (update/flux.ts) : les étiquettes `app-v*` de GitHub, et le
// `latest-mac.yml` de chaque release, ou son `latest.yml` sous Windows (#1156) — contre un faux GitHub local.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, fluxOf, fluxGitHub, formatOf, readMetadata, MAC, WINDOWS } from "../../src/update/flux.ts";
import { nameOfSetup, oneFakeFlux, oneAddressSilent, ymlOf } from "./fake-flux.ts";

const flux = (address: string) => fluxGitHub({ api: address, telechargements: address, delaiMs: 60_000 });

test("les versions se comparent par leurs nombres, l'empreinte du commit ne compte pas", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("1.0", "1.0.1") < 0);
  assert.equal(compareVersions("1.0.0", "1.0"), 0);
  assert.equal(compareVersions("0.20261019.151600+g76f93fe", "0.20261019.151600+gabcdef0"), 0);
  assert.ok(compareVersions("0.20261020.000000+g1", "0.20261019.235959+g2") > 0);
});

test("latest-mac.yml se lit tel que le workflow l'écrit, et rien d'autre qu'un nom de .dmg n'en sort", () => {
  const dmg = Buffer.from("un dmg");
  assert.deepEqual(readMetadata(ymlOf("1.2.0", dmg)), { version: "1.2.0", nom: "Brigade-1.2.0-arm64.dmg", sha512: readMetadata(ymlOf("1.2.0", dmg)).sha512, taille: dmg.length });
  assert.throws(() => readMetadata(ymlOf("1.2.0", dmg, "../../ailleurs.dmg")), /names no \.dmg/);
  assert.throws(() => readMetadata(ymlOf("pas une version", dmg)), /no valid version/);
  assert.throws(() => readMetadata("version: 1.0.0\npath: Brigade.dmg\n"), /no sha512/);
});

test("la nouvelle version est la plus haute publiée au-dessus de la sienne, avec l'adresse de son .dmg", async (t) => {
  const dmg = Buffer.from("le dmg de 1.2.0");
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: Buffer.from("a") }, "1.2.0": { dmg }, "1.1.0": { dmg: Buffer.from("b") } });
  const newEntry = await flux(fake.adresse).nouvelle("1.0.0");
  assert.deepEqual(newEntry, {
    version: "1.2.0",
    nom: "Brigade-1.2.0-arm64.dmg",
    url: `${fake.adresse}/benomite/brigade/releases/download/app-v1.2.0/Brigade-1.2.0-arm64.dmg`,
    sha512: readMetadata(ymlOf("1.2.0", dmg)).sha512,
    taille: dmg.length,
  });
});

test("une étiquette posée dont la release n'est pas encore publiée n'est pas une nouvelle version", async (t) => {
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: Buffer.from("b") }, "1.2.0": { dmg: Buffer.from("c"), yml: null } });
  assert.equal((await flux(fake.adresse).nouvelle("1.0.0"))?.version, "1.1.0");
  assert.equal(await flux(fake.adresse).nouvelle("1.1.0"), undefined);
});

test("à jour, l'app ne demande que la liste des étiquettes", async (t) => {
  const fake = await oneFakeFlux(t, { "1.0.0": { dmg: Buffer.from("a") } });
  assert.equal(await flux(fake.adresse).nouvelle("1.0.0"), undefined);
  assert.deepEqual(fake.demandes, ["/repos/benomite/brigade/git/matching-refs/tags/app-v"]);
});

test("un GitHub qui refuse, ou qu'on ne joint pas, se dit en une erreur", async (t) => {
  const fake = await oneFakeFlux(t, {});
  fake.statutDeLAPI = 403;
  await assert.rejects(flux(fake.adresse).nouvelle("1.0.0"), /GitHub answered 403/);
  await assert.rejects(flux(await oneAddressSilent()).nouvelle("1.0.0"));
});

test("une source d'essai mal écrite n'empêche rien : chaque lecture dit l'erreur", async () => {
  await assert.rejects(fluxOf("ftp://ailleurs").nouvelle("1.0.0"), /expected an http\(s\) address/);
  assert.equal(fluxOf(undefined).nom, "the releases of benomite/brigade");
});

test("chaque poste lit les métadonnées de son installeur : latest-mac.yml et le .dmg sur un Mac, latest.yml et le setup .exe sous Windows", () => {
  assert.equal(formatOf("darwin"), MAC);
  assert.equal(formatOf("win32"), WINDOWS);
  assert.deepEqual(WINDOWS, { metadonnees: "latest.yml", extension: ".exe" });
  const exe = Buffer.from("un setup");
  assert.deepEqual(readMetadata(ymlOf("1.2.0+gabc1234", exe, nameOfSetup("1.2.0+gabc1234")), WINDOWS), { version: "1.2.0+gabc1234", nom: "Brigade-1.2.0+gabc1234-x64-setup.exe", sha512: readMetadata(ymlOf("1.2.0", exe), MAC).sha512, taille: exe.length });
  assert.throws(() => readMetadata(ymlOf("1.2.0", exe), WINDOWS), /^Error: latest\.yml names no \.exe$/);
  assert.throws(() => readMetadata(ymlOf("1.2.0", exe, "..\\ailleurs.exe"), WINDOWS), /names no \.exe/);
  assert.throws(() => readMetadata(ymlOf("1.2.0", exe, nameOfSetup("1.2.0")), MAC), /^Error: latest-mac\.yml names no \.dmg$/);
});

test("sous Windows, la nouvelle version est la plus haute dont latest.yml est publié, avec l'adresse de son setup", async (t) => {
  const exe = Buffer.from("le setup de 1.2.0");
  const fake = await oneFakeFlux(t, { "1.1.0": { dmg: Buffer.from("a"), exe: Buffer.from("b") }, "1.2.0": { dmg: Buffer.from("c"), exe }, "1.3.0": { dmg: Buffer.from("d"), exe: Buffer.from("e"), ymlExe: null } });
  const newEntry = await fluxOf(fake.adresse, WINDOWS).nouvelle("1.0.0");
  assert.deepEqual(newEntry, {
    version: "1.2.0",
    nom: "Brigade-1.2.0-x64-setup.exe",
    url: `${fake.adresse}/benomite/brigade/releases/download/app-v1.2.0/Brigade-1.2.0-x64-setup.exe`,
    sha512: readMetadata(ymlOf("1.2.0", exe), MAC).sha512,
    taille: exe.length,
  });
  assert.equal(fake.demandes.some((path) => path.endsWith("latest-mac.yml")), false);
  // Le Mac, sur la même source, lit toujours les siennes.
  assert.equal((await fluxOf(fake.adresse).nouvelle("1.0.0"))?.nom, "Brigade-1.3.0-arm64.dmg");
});

// Le flux des versions de l'app (mise-a-jour/flux.ts) : les étiquettes `app-v*` de GitHub, et le
// `latest-mac.yml` de chaque release — contre un faux GitHub local.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comparerVersions, fluxDe, fluxGitHub, lireMetadonnees } from "../../src/mise-a-jour/flux.ts";
import { unFauxFlux, uneAdresseMuette, ymlDe } from "./faux-flux.ts";

const flux = (adresse: string) => fluxGitHub({ api: adresse, telechargements: adresse, delaiMs: 60_000 });

test("les versions se comparent par leurs nombres, l'empreinte du commit ne compte pas", () => {
  assert.ok(comparerVersions("1.10.0", "1.9.0") > 0);
  assert.ok(comparerVersions("1.0", "1.0.1") < 0);
  assert.equal(comparerVersions("1.0.0", "1.0"), 0);
  assert.equal(comparerVersions("0.20261019.151600+g76f93fe", "0.20261019.151600+gabcdef0"), 0);
  assert.ok(comparerVersions("0.20261020.000000+g1", "0.20261019.235959+g2") > 0);
});

test("latest-mac.yml se lit tel que le workflow l'écrit, et rien d'autre qu'un nom de .dmg n'en sort", () => {
  const dmg = Buffer.from("un dmg");
  assert.deepEqual(lireMetadonnees(ymlDe("1.2.0", dmg)), { version: "1.2.0", nom: "Brigade-1.2.0-arm64.dmg", sha512: lireMetadonnees(ymlDe("1.2.0", dmg)).sha512, taille: dmg.length });
  assert.throws(() => lireMetadonnees(ymlDe("1.2.0", dmg, "../../ailleurs.dmg")), /names no \.dmg/);
  assert.throws(() => lireMetadonnees(ymlDe("pas une version", dmg)), /no valid version/);
  assert.throws(() => lireMetadonnees("version: 1.0.0\npath: Brigade.dmg\n"), /no sha512/);
});

test("la nouvelle version est la plus haute publiée au-dessus de la sienne, avec l'adresse de son .dmg", async (t) => {
  const dmg = Buffer.from("le dmg de 1.2.0");
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: Buffer.from("a") }, "1.2.0": { dmg }, "1.1.0": { dmg: Buffer.from("b") } });
  const nouvelle = await flux(faux.adresse).nouvelle("1.0.0");
  assert.deepEqual(nouvelle, {
    version: "1.2.0",
    nom: "Brigade-1.2.0-arm64.dmg",
    url: `${faux.adresse}/benomite/brigade/releases/download/app-v1.2.0/Brigade-1.2.0-arm64.dmg`,
    sha512: lireMetadonnees(ymlDe("1.2.0", dmg)).sha512,
    taille: dmg.length,
  });
});

test("une étiquette posée dont la release n'est pas encore publiée n'est pas une nouvelle version", async (t) => {
  const faux = await unFauxFlux(t, { "1.1.0": { dmg: Buffer.from("b") }, "1.2.0": { dmg: Buffer.from("c"), yml: null } });
  assert.equal((await flux(faux.adresse).nouvelle("1.0.0"))?.version, "1.1.0");
  assert.equal(await flux(faux.adresse).nouvelle("1.1.0"), undefined);
});

test("à jour, l'app ne demande que la liste des étiquettes", async (t) => {
  const faux = await unFauxFlux(t, { "1.0.0": { dmg: Buffer.from("a") } });
  assert.equal(await flux(faux.adresse).nouvelle("1.0.0"), undefined);
  assert.deepEqual(faux.demandes, ["/repos/benomite/brigade/git/matching-refs/tags/app-v"]);
});

test("un GitHub qui refuse, ou qu'on ne joint pas, se dit en une erreur", async (t) => {
  const faux = await unFauxFlux(t, {});
  faux.statutDeLAPI = 403;
  await assert.rejects(flux(faux.adresse).nouvelle("1.0.0"), /GitHub answered 403/);
  await assert.rejects(flux(await uneAdresseMuette()).nouvelle("1.0.0"));
});

test("une source d'essai mal écrite n'empêche rien : chaque lecture dit l'erreur", async () => {
  await assert.rejects(fluxDe("ftp://ailleurs").nouvelle("1.0.0"), /expected an http\(s\) address/);
  assert.equal(fluxDe(undefined).nom, "the releases of benomite/brigade");
});

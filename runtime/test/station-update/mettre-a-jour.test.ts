// La mise à jour de la station de l'ordinateur : une release plus récente est
// téléchargée sous le répertoire de la station, qui demande aussitôt sa relance
// sur elle — ses cooks lui survivent (#4401). Un regard ou un téléchargement qui
// rate la laisse telle quelle.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { configDeLaMiseAJour, demanderAuSuperviseur, LIGNE_DE_RELANCE, miseAJourDeLaStation, SANS_SUITE_MS, tenirLaMiseAJour, type OptionsDeLaMiseAJour } from "../../src/station-update/mettre-a-jour.ts";
import { sourceDesVersions, type SourceDesVersions } from "../../src/station-update/releases.ts";
import { lireDemande, lireStatut, type DemandeDeRelance } from "../../src/station-update/statut.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";
import { ARCHIVE_MAC, publier, publierIllisible } from "./aides.ts";

const releases = (racine: string) => join(racine, "station-update", "releases");
const versionsTelechargees = (racine: string) => (existsSync(releases(racine)) ? readdirSync(releases(racine)).sort() : []);

function station(t: Parameters<typeof repertoireTemporaire>[0], options: Partial<OptionsDeLaMiseAJour> = {}) {
  const racine = repertoireTemporaire(t);
  const publiees = repertoireTemporaire(t);
  const demandes: DemandeDeRelance[] = [];
  const dit: string[] = [];
  const ouvrir = (version: string, versions: SourceDesVersions = sourceDesVersions(publiees, ARCHIVE_MAC)) =>
    miseAJourDeLaStation({
      racine,
      version,
      versions,
      plateforme: "darwin",
      relancer: (demande) => {
        demandes.push(demande);
        demanderAuSuperviseur(racine, (ligne) => dit.push(ligne))(demande);
      },
      dire: (ligne) => dit.push(ligne),
      ...options,
    });
  return { racine, publiees, demandes, dit, ouvrir };
}

test("une release plus récente est téléchargée sous le répertoire de la station, et sa relance est demandée ; aucune plus récente : rien n'est téléchargé, rien n'est demandé", async (t) => {
  const { racine, publiees, demandes, dit, ouvrir } = station(t);
  publier(publiees, "0.20261101.090000");
  publier(publiees, "0.20261103.120000");

  // À jour : la plus récente publiée est celle qui tourne.
  const aJour = ouvrir("0.20261103.120000");
  const vu = await aJour.passer();
  assert.equal(vu.behind, false);
  assert.equal(vu.latestStationVersion, "0.20261103.120000");
  assert.deepEqual(versionsTelechargees(racine), []);
  assert.equal(demandes.length, 0);
  assert.equal(lireDemande(racine), null);

  // En retard : la release est téléchargée, vérifiée, et la relance demandée.
  const enRetard = ouvrir("0.20261101.090000");
  const passe = await enRetard.passer();
  assert.deepEqual(versionsTelechargees(racine), ["0.20261103.120000"]);
  const runtime = join(releases(racine), "0.20261103.120000", "runtime");
  assert.equal(JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")).version, "0.20261103.120000");
  assert.equal(demandes.length, 1);
  assert.deepEqual(demandes[0], { version: "0.20261103.120000", runtime, main: join(runtime, "src", "station", "main.ts"), from: "0.20261101.090000", at: demandes[0]?.at });
  assert.ok(existsSync(demandes[0]?.main ?? ""));
  // Ce que l'app lit : le fichier, et la ligne.
  assert.deepEqual(lireDemande(racine), demandes[0]);
  const ligne = dit.find((lue) => LIGNE_DE_RELANCE.test(lue));
  assert.deepEqual(LIGNE_DE_RELANCE.exec(ligne ?? "")?.slice(1), ["0.20261103.120000", join(runtime, "src", "station", "main.ts")]);
  assert.deepEqual(passe.restart, demandes[0]);
  assert.equal(lireStatut(racine)?.ready, "0.20261103.120000");

  // Demandée une fois : un regard de plus ne redemande rien.
  await enRetard.passer();
  assert.equal(demandes.length, 1);
});

test("le statut dit la version qui tourne, la plus récente publiée et le retard : en retard, puis à jour une fois la station relancée sur la release", async (t) => {
  const { racine, publiees, demandes, ouvrir } = station(t);
  publier(publiees, "0.20261101.100000");
  publier(publiees, "0.20261101.110000");
  await ouvrir("0.20261101.100000").passer();
  const avant = lireStatut(racine);
  assert.equal(avant?.stationVersion, "0.20261101.100000");
  assert.equal(avant?.latestStationVersion, "0.20261101.110000");
  assert.equal(avant?.behind, true);
  assert.equal(demandes[0]?.version, "0.20261101.110000");

  // L'app la relance sur la release demandée : la station dit sa nouvelle
  // version dès son démarrage, et n'est plus en retard.
  const apres = ouvrir("0.20261101.110000");
  assert.deepEqual([lireStatut(racine)?.stationVersion, lireStatut(racine)?.latestStationVersion, lireStatut(racine)?.behind], ["0.20261101.110000", "0.20261101.110000", false]);
  // La demande d'avant n'a plus d'objet.
  assert.equal(lireDemande(racine), null);
  await apres.passer();
  assert.deepEqual([lireStatut(racine)?.stationVersion, lireStatut(racine)?.latestStationVersion, lireStatut(racine)?.behind], ["0.20261101.110000", "0.20261101.110000", false]);
  assert.equal(demandes.length, 1);
});

test("le réseau coupé, ou une release mauvaise, laisse la station telle quelle : rien de téléchargé, aucune demande — et le regard suivant réessaie", async (t) => {
  const { racine, publiees, demandes, dit, ouvrir } = station(t);
  let coupe = true;
  const versions = sourceDesVersions(publiees, ARCHIVE_MAC);
  const reseau: SourceDesVersions = {
    nom: "the releases of acme/brigade",
    lister: () => (coupe ? Promise.reject(new Error("fetch failed")) : versions.lister()),
    telecharger: (release, fichier) => (coupe ? Promise.reject(new Error("fetch failed")) : versions.telecharger(release, fichier)),
  };
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000", reseau);

  // La liste ne se lit pas.
  let statut = await miseAJour.passer();
  assert.match(statut.check ?? "", /the published station versions do not read \(the releases of acme\/brigade\): fetch failed/);
  assert.deepEqual([versionsTelechargees(racine), demandes], [[], []]);
  assert.ok(dit.some((ligne) => /the station keeps running 0\.20261101\.100000, the next check tries again/.test(ligne)));

  // La liste se lit, l'archive non.
  const telechargement: SourceDesVersions = { ...reseau, lister: () => versions.lister(), telecharger: () => Promise.reject(new Error("fetch failed")) };
  statut = await ouvrir("0.20261101.100000", telechargement).passer();
  assert.match(statut.check ?? "", /release 0\.20261102\.100000 cannot be obtained: fetch failed/);
  assert.equal(statut.behind, true);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.restart], [[], [], null]);

  // Une archive qui ne s'extrait pas, puis un runtime qui ne dit pas sa version.
  publierIllisible(publiees, "0.20261103.100000");
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /release 0\.20261103\.100000 cannot be obtained: the archive does not extract/);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.restart], [[], [], null]);
  publier(publiees, "0.20261104.100000", { dit: "0.20261103.190000" });
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /release 0\.20261104\.100000 cannot be obtained: release 0\.20261104\.100000 is not a station release: its runtime says version 0\.20261103\.190000, not 0\.20261104\.100000/);
  publier(publiees, "0.20261105.100000", { sansPointDEntree: true });
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /its runtime carries no src\/station\/main\.ts/);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.restart], [[], [], null]);

  // Le réseau revient, une bonne release est publiée : le regard suivant la prend.
  coupe = false;
  publier(publiees, "0.20261106.100000");
  statut = await miseAJour.passer();
  assert.equal(statut.check, null);
  assert.deepEqual(versionsTelechargees(racine), ["0.20261106.100000"]);
  assert.equal(demandes[0]?.version, "0.20261106.100000");
});

test("sans personne pour la relancer, la station dit son retard sans rien télécharger ; une release sans archive pour sa plateforme non plus", async (t) => {
  const { racine, publiees, ouvrir } = station(t, { relancer: null });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  const statut = await miseAJour.passer();
  assert.equal(statut.behind, true);
  assert.match(statut.held ?? "", /nothing restarts this station on another release: 0\.20261102\.100000 waits/);
  assert.deepEqual(versionsTelechargees(racine), []);

  const linux = station(t);
  publier(linux.publiees, "0.20261102.100000");
  const sansArchive = await linux.ouvrir("0.20261101.100000", sourceDesVersions(linux.publiees, null)).passer();
  assert.equal(sansArchive.behind, true);
  assert.match(sansArchive.check ?? "", /release 0\.20261102\.100000 carries no station archive for this platform/);
  assert.deepEqual([versionsTelechargees(linux.racine), linux.demandes], [[], []]);
});

test("la mise à jour n'a lieu que sur la station de l'ordinateur : ni sur une box, qui a la sienne, ni sans source ; la relance attend que l'app la promette", () => {
  assert.equal(configDeLaMiseAJour({ BRIGADE_MISE_A_JOUR_SOURCE: "github:acme/brigade", BRIGADE_MISE_A_JOUR_DIR: "/var/lib/brigade-station" }), null);
  assert.equal(configDeLaMiseAJour({}), null);
  assert.equal(configDeLaMiseAJour({ BRIGADE_MISE_A_JOUR_SOURCE: "github:acme/brigade" })?.relance, false);
  assert.equal(configDeLaMiseAJour({ BRIGADE_MISE_A_JOUR_SOURCE: "github:acme/brigade", BRIGADE_STATION_RELANCE: "app" })?.relance, true);
  assert.equal(configDeLaMiseAJour({ BRIGADE_MISE_A_JOUR_SOURCE: "github:acme/brigade" })?.versions.nom, "the releases of acme/brigade");
});

test("le runtime que l'app embarque porte la version de l'app, celui d'un clone 0.0.0 : toute release publiée passe devant eux", async (t) => {
  for (const embarquee of ["1.0.82", "0.0.0"]) {
    const { racine, publiees, demandes, ouvrir } = station(t);
    publier(publiees, "0.20261103.120000");
    const statut = await ouvrir(embarquee).passer();
    assert.deepEqual([statut.stationVersion, statut.latestStationVersion, statut.behind], [embarquee, "0.20261103.120000", true]);
    assert.equal(demandes[0]?.version, "0.20261103.120000");
    // Relancée sur la release, elle est à jour.
    ouvrir("0.20261103.120000");
    assert.equal(lireStatut(racine)?.behind, false);
  }
});

test("une demande de relance qui ne s'écrit pas se dit, et le regard suivant redemande", async (t) => {
  const { publiees, ouvrir } = station(t, {
    relancer: () => {
      throw new Error("EACCES");
    },
  });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  const statut = await miseAJour.passer();
  assert.equal(statut.restart, null);
  assert.match(statut.check ?? "", /the restart request on release 0\.20261102\.100000 cannot be made: EACCES/);
});

test("une relance demandée que l'app ne joue pas ne retient pas la station pour toujours : passé SANS_SUITE_MS, elle ne redemande plus cette release, et demande la suivante (#2820)", async (t) => {
  let instant = Date.parse("2026-11-07T21:00:00Z");
  const { publiees, demandes, dit, ouvrir, racine } = station(t, { maintenant: () => new Date(instant) });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  await miseAJour.passer();
  assert.equal(demandes.length, 1);
  // L'app la relance dans le délai : rien ne bouge.
  instant += SANS_SUITE_MS - 1_000;
  await miseAJour.passer();
  assert.equal(demandes.length, 1);
  // Personne ne l'a relancée (une release refusée par l'app, par exemple).
  instant += 1_000;
  const statut = await miseAJour.passer();
  assert.deepEqual([statut.restart, lireDemande(racine)], [null, null]);
  assert.match(statut.held ?? "", /0\.20261102\.100000 was asked and did not come/);
  assert.ok(dit.some((ligne) => /did not come: the station keeps running 0\.20261101\.100000/.test(ligne)));
  // La même release ne se redemande pas ; une plus récente, si.
  await miseAJour.passer();
  assert.equal(demandes.length, 1);
  publier(publiees, "0.20261103.100000");
  await miseAJour.passer();
  assert.deepEqual([demandes.length, demandes[1]?.version], [2, "0.20261103.100000"]);
});

test("les regards continuent après la demande de relance : sans suite, le suivant l'efface (#2820)", async (t) => {
  const { publiees, demandes, ouvrir } = station(t, { sansSuiteMs: 20 });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  const arreter = tenirLaMiseAJour(miseAJour, { premierMs: 0, aleaMs: 0, intervalleMs: 60_000, sansSuiteMs: 20 });
  t.after(arreter);
  await jusqua(() => demandes.length === 1);
  await jusqua(() => miseAJour.statut().restart === null);
  assert.equal(demandes.length, 1);
});

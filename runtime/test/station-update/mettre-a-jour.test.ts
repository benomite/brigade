// La mise à jour de la station de l'ordinateur : une release plus récente est
// téléchargée sous le répertoire de la station, la station se vide de ses
// cooks sans en couper aucun, puis demande sa relance sur elle. Un regard ou un
// téléchargement qui rate la laisse telle quelle.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stationGitHub, type GitHubDuTour, type Prise, type TicketLu } from "../../src/brigade-github.ts";
import { configDeLaMiseAJour, demanderAuSuperviseur, LIGNE_DE_RELANCE, miseAJourDeLaStation, retenirLaPrise, type OptionsDeLaMiseAJour } from "../../src/station-update/mettre-a-jour.ts";
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
  const cooks = new Set<number>();
  // Combien de fois la mise à jour a regardé les cooks en vol.
  const regards = { n: 0 };
  const ouvrir = (version: string, versions: SourceDesVersions = sourceDesVersions(publiees, ARCHIVE_MAC)) =>
    miseAJourDeLaStation({
      racine,
      version,
      versions,
      plateforme: "darwin",
      enVol: () => {
        regards.n++;
        return [...cooks];
      },
      relancer: (demande) => {
        demandes.push(demande);
        demanderAuSuperviseur(racine, (ligne) => dit.push(ligne))(demande);
      },
      dire: (ligne) => dit.push(ligne),
      pasDuDrainMs: 5,
      ...options,
    });
  return { racine, publiees, demandes, dit, cooks, regards, ouvrir };
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
  assert.equal(aJour.retenue(), false);

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

test("un cook en vol retient la demande de relance jusqu'à ce qu'il ait fini : il n'est pas coupé, et la station ne prend plus de ticket entre-temps", async (t) => {
  const { publiees, demandes, cooks, regards, ouvrir, racine } = station(t);
  publier(publiees, "0.20261102.100000");
  cooks.add(41);
  const miseAJour = ouvrir("0.20261101.100000");
  const passage = miseAJour.passer();
  await jusqua(() => lireStatut(racine)?.draining !== null && lireStatut(racine)?.draining !== undefined);
  assert.equal(miseAJour.retenue(), true);
  assert.deepEqual(lireStatut(racine)?.draining?.cooks, [41]);
  // Le cook travaille : regardé de nouveau, il retient toujours la demande.
  const vus = regards.n;
  await jusqua(() => regards.n >= vus + 3);
  assert.equal(demandes.length, 0);
  assert.equal(lireDemande(racine), null);
  // Il a fini : la demande part.
  cooks.delete(41);
  const statut = await passage;
  assert.equal(demandes.length, 1);
  assert.equal(statut.restart?.version, "0.20261102.100000");
  assert.deepEqual(lireStatut(racine)?.draining?.cooks, []);
});

test("pendant le drain, la station GitHub seul garde son cook en vol et ne prend plus de ticket ; la relance est demandée quand ce cook a livré", async (t) => {
  // Les cooks en vol que la mise à jour regarde : ceux de la station GitHub seul.
  let enCuisine = (): number[] => [];
  const { publiees, demandes, ouvrir } = station(t, { enVol: () => enCuisine() });
  publier(publiees, "0.20261102.100000");
  const ecrits: string[] = [];
  let tickets: TicketLu[] = [{ number: 7, title: "sept", labels: ["fire", "model:opus", "effort:high"], state: "open" }];
  const github = {
    checksDeLaBase: async () => [],
    ci: async () => [],
    corpsDuTicket: async () => "",
    prsOuvertes: async () => [],
    fires: async () => tickets,
    prDuTicket: async () => null,
    ouvrirPR: async ({ branche }: { branche: string }) => void ecrits.push(`pr ${branche}`),
    labelliser: async (numero: number, labels: string[]) => void ecrits.push(`+${labels.join(",")} #${numero}`),
    delabelliser: async (numero: number, label: string) => void ecrits.push(`-${label} #${numero}`),
    commenter: async (numero: number) => void ecrits.push(`comment #${numero}`),
  } as unknown as GitHubDuTour;
  const prises: number[] = [];
  const prise: Prise = { prendre: async (issue) => (prises.push(issue.number), { prise: true }), lacher: async () => true };
  let livrer = () => {};
  let miseAJour: ReturnType<typeof ouvrir> | null = null;
  const tenue = stationGitHub({
    nom: "mac/claude",
    places: 2,
    base: "main",
    github,
    prise: retenirLaPrise(prise, () => miseAJour?.retenue() ?? false),
    cuisiner: (ticket) => new Promise((resoudre) => void (livrer = () => resoudre({ branche: `cook/${ticket.number}-github` }))),
    juger: async () => ({ verdict: "approve", motif: "" }),
    avertir: () => {},
  });
  enCuisine = () => tenue.enCuisine();
  await tenue.tour();
  assert.deepEqual(tenue.enCuisine(), [7]);

  const ouverte = ouvrir("0.20261101.100000");
  miseAJour = ouverte;
  const passage = ouverte.passer();
  await jusqua(() => ouverte.retenue());
  // Un ticket libre arrive, une place est libre : la station ne le prend pas.
  tickets = [...tickets, { number: 8, title: "huit", labels: ["fire", "model:opus", "effort:high"], state: "open" }];
  await tenue.tour();
  assert.deepEqual(prises, [7]);
  assert.deepEqual(tenue.enCuisine(), [7]);
  assert.equal(demandes.length, 0);
  // Le cook livre : sa PR part, puis la relance est demandée.
  livrer();
  await passage;
  assert.ok(ecrits.includes("pr cook/7-github"));
  assert.equal(demandes[0]?.version, "0.20261102.100000");
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

test("le réseau coupé, ou une release mauvaise, laisse la station telle quelle : rien de téléchargé, aucun drain, aucune demande — et le regard suivant réessaie", async (t) => {
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
  assert.equal(miseAJour.retenue(), false);
  assert.deepEqual([versionsTelechargees(racine), demandes], [[], []]);
  assert.ok(dit.some((ligne) => /the station keeps running 0\.20261101\.100000, the next check tries again/.test(ligne)));

  // La liste se lit, l'archive non.
  const telechargement: SourceDesVersions = { ...reseau, lister: () => versions.lister(), telecharger: () => Promise.reject(new Error("fetch failed")) };
  statut = await ouvrir("0.20261101.100000", telechargement).passer();
  assert.match(statut.check ?? "", /release 0\.20261102\.100000 cannot be obtained: fetch failed/);
  assert.equal(statut.behind, true);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.draining], [[], [], null]);

  // Une archive qui ne s'extrait pas, puis un runtime qui ne dit pas sa version.
  publierIllisible(publiees, "0.20261103.100000");
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /release 0\.20261103\.100000 cannot be obtained: the archive does not extract/);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.draining], [[], [], null]);
  publier(publiees, "0.20261104.100000", { dit: "0.20261103.190000" });
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /release 0\.20261104\.100000 cannot be obtained: release 0\.20261104\.100000 is not a station release: its runtime says version 0\.20261103\.190000, not 0\.20261104\.100000/);
  publier(publiees, "0.20261105.100000", { sansPointDEntree: true });
  statut = await ouvrir("0.20261101.100000").passer();
  assert.match(statut.check ?? "", /its runtime carries no src\/station\/main\.ts/);
  assert.deepEqual([versionsTelechargees(racine), demandes, statut.draining], [[], [], null]);

  // Le réseau revient, une bonne release est publiée : le regard suivant la prend.
  coupe = false;
  publier(publiees, "0.20261106.100000");
  statut = await miseAJour.passer();
  assert.equal(statut.check, null);
  assert.deepEqual(versionsTelechargees(racine), ["0.20261106.100000"]);
  assert.equal(demandes[0]?.version, "0.20261106.100000");
});

test("sans personne pour la relancer, la station dit son retard sans rien télécharger ni se vider ; une release sans archive pour sa plateforme non plus", async (t) => {
  const { racine, publiees, ouvrir } = station(t, { relancer: null });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  const statut = await miseAJour.passer();
  assert.equal(statut.behind, true);
  assert.match(statut.held ?? "", /nothing restarts this station on another release: 0\.20261102\.100000 waits/);
  assert.equal(miseAJour.retenue(), false);
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

test("une demande de relance qui ne s'écrit pas rend ses tickets à la station : elle ne reste pas vidée sans personne pour la relancer", async (t) => {
  const { publiees, ouvrir } = station(t, {
    relancer: () => {
      throw new Error("EACCES");
    },
  });
  publier(publiees, "0.20261102.100000");
  const miseAJour = ouvrir("0.20261101.100000");
  const statut = await miseAJour.passer();
  assert.equal(miseAJour.retenue(), false);
  assert.equal(statut.restart, null);
  assert.match(statut.check ?? "", /the restart request on release 0\.20261102\.100000 cannot be made: EACCES/);
});

// Le déménagement de la cuisine d'un projet entre stations, tel que les
// stations le mènent par leurs gists : contre des gists en mémoire, des
// stations doublées dont la cuisine n'est que son verrou — pris tant que sa
// ligne est dans la configuration, comme la station le tient. Le cook en vol
// repris sur l'autre station se prouve sur de vraies cuisines, plus bas.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import type { Verification } from "../../src/bac-a-sable/local.ts";
import { principal as demenager } from "../../src/demenagement/demenager.ts";
import { lireRemise, recevoir, remettre, RemiseRetenue } from "../../src/demenagement/remise.ts";
import type { Evenement } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lignesDuBloc } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { PROJECTIONS } from "../../src/projections.ts";
import { prendreVerrou, type Verrou } from "../../src/verrou.ts";
import { cuisine, fauxGitHub, issue, montre } from "../aides/cuisine.ts";
import { aArreter, jusqua, photographier, repertoireTemporaire, temporaireDuFichier, vivant } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const AUJOURDHUI = "2026-10-20T08:00:00.000Z";
const SHOP = {
  nom: "shop",
  depot: "acme/shop",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-20T07:00:00.000Z",
  demandeLe: "2026-10-20T07:01:00.000Z",
};
const SANS_SEATBELT = "le bac à sable de Claude Code n'est pas disponible sur ce poste — pas de Seatbelt (/usr/bin/sandbox-exec)";

// Les gists du compte du chef : chaque station a le sien, et lit ceux des autres.
function compte() {
  const gists = new Map<string, Fichiers>();
  const canal: Canal = {
    creer: async () => assert.fail("aucun gist ne se crée pendant un déménagement"),
    async ecrire(id, fichiers) {
      const gist = gists.get(id);
      if (gist === undefined) return "absent";
      Object.assign(gist, fichiers);
      return "ecrit";
    },
    lire: async (id) => {
      const gist = gists.get(id);
      return gist === undefined ? null : { ...gist };
    },
  };
  return { gists, canal };
}

type Compte = ReturnType<typeof compte>;

function uneStation(t: TestContext, leCompte: Compte, nom: string, options: { locale?: boolean; bac?: () => Verification } = {}) {
  const gist = `gist${nom}`;
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist, appairee: true, code: null, expireLe: null, echus: [] }));
  leCompte.gists.set(gist, { [FICHIER_STATION]: JSON.stringify({ brigade: "station", format: 1, nom }) });
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  // La cuisine de chaque projet de la configuration : son verrou, pris tant
  // que sa ligne y est — ce que la station fait en l'ouvrant et en la fermant.
  const cuisines = new Map<string, Verrou>();
  const ouvrir = () => {
    const voulus = new Set(lignesDuBloc(configuration()).map((ligne) => ligne.split(" ")[0] ?? ""));
    for (const [projet, verrou] of [...cuisines]) {
      if (voulus.has(projet)) continue;
      verrou.relacher();
      cuisines.delete(projet);
    }
    for (const projet of voulus) {
      if (cuisines.has(projet)) continue;
      const etat = join(racine, "etat", projet);
      mkdirSync(etat, { recursive: true });
      cuisines.set(projet, prendreVerrou(etat));
    }
  };
  aArreter(t, () => {
    for (const verrou of cuisines.values()) verrou.relacher();
    cuisines.clear();
  });
  const lignes: string[] = [];
  let preparations = 0;
  let fermerLaCuisine = true;
  const projets = tenirProjetsDeLApp({
    racine,
    canal: leCompte.canal,
    station: nom,
    env: {},
    locale: options.locale,
    verifierBacASable: options.bac,
    servis: { projets: () => [...cuisines.keys()], refus: () => null },
    apresEcriture: () => void (fermerLaCuisine && ouvrir()),
    dire: (ligne) => lignes.push(ligne),
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse(AUJOURDHUI),
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => void mkdirSync(join(clone, ".git"), { recursive: true }),
    // Le clone doublé n'a pas de remote : son accès au dépôt se prouve dans `../projets/acces.test.ts`.
    verifierAcces: async () => ({ etat: "libre" }),
    ouvrirLaPreparation: async (_projet, repertoireEtat) => {
      const fichier = join(repertoireEtat, "preparation-depot.json");
      if (existsSync(fichier)) return { ticket: 7, ouvert: false };
      preparations += 1;
      writeFileSync(fichier, `${JSON.stringify({ ticket: 7, ouvertLe: AUJOURDHUI })}\n`);
      return { ticket: 7, ouvert: true };
    },
  });
  aArreter(t, () => projets.arreter());
  const suivi = (projet = "shop") => (JSON.parse(leCompte.gists.get(gist)?.[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets.find((un) => un.nom === projet);
  return {
    nom,
    gist,
    racine,
    etat: (projet = "shop") => join(racine, "etat", projet),
    relire: () => projets.relire(),
    configuration,
    sert: (projet = "shop") => cuisines.has(projet),
    suivi,
    lignes,
    preparations: () => preparations,
    // La station ne ferme plus la cuisine d'un projet dont la ligne part.
    retenirLaCuisine: () => void (fermerLaCuisine = false),
    demander: (...demandes: object[]) => void Object.assign(leCompte.gists.get(gist) ?? {}, { [FICHIER_PROJETS]: JSON.stringify({ brigade: "projets", format: 1, projets: demandes }) }),
  };
}

type Station = ReturnType<typeof uneStation>;

// L'app lance le déménagement : la commande du runtime, sur les gists de ses stations.
async function deplacer(leCompte: Compte, projet: string, vers: Station, stations: Station[], options: { local?: Station; bac?: () => Verification; a?: string } = {}) {
  const dit: string[] = [];
  let code = 0;
  try {
    await demenager(
      { args: [projet, vers.gist, ...stations.map(({ gist }) => gist)], env: {}, dire: (ligne) => dit.push(ligne), redire: (ligne) => dit.push(ligne) },
      { canal: leCompte.canal, maintenant: () => new Date(options.a ?? AUJOURDHUI), gistLocal: options.local?.gist ?? null, verifierBacASable: options.bac ?? (() => ({ ok: true, version: "2.1.300" })) },
    );
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { code, rendu: JSON.parse(dit.at(-1) ?? "null") as Record<string, unknown> | null };
}

// Ce qui fait le projet : son histoire, et tout ce qui en dérive — tickets,
// grants, réglages.
function etatDuProjet(repertoireEtat: string) {
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    return { evenements: journal.tout(), projections: photographier(journal, PROJECTIONS) };
  } finally {
    journal.fermer();
  }
}

// Le projet sert sur la box : il y a son histoire — ses décisions posées à
// l'ajout, un ticket mis de côté, un autre en attente, un grant.
async function unProjetServiSurLaBox(t: TestContext) {
  const leCompte = compte();
  const box = uneStation(t, leCompte, "box");
  const mac = uneStation(t, leCompte, "mac", { locale: true, bac: () => ({ ok: true, version: "2.1.300" }) });
  const serveur = uneStation(t, leCompte, "serveur");
  box.demander(SHOP);
  await box.relire();
  assert.equal(box.sert(), true);
  const journal = ouvrirJournal(box.etat());
  try {
    const noter = (ticket: number | null, fait: Record<string, unknown>) => journal.ajouter({ project: "shop", ticket, author: "runtime", ...fait } as never);
    noter(12, { type: "ticket.arrived", payload: { title: "Ticket 12", priority: 1, createdAt: "2026-10-19T10:00:00Z", url: "https://github.com/acme/shop/issues/12", model: "opus", effort: "high", card: null } });
    noter(13, { type: "ticket.arrived", payload: { title: "Ticket 13", priority: 2, createdAt: "2026-10-19T11:00:00Z", url: "https://github.com/acme/shop/issues/13", model: "sonnet", effort: "low", card: null } });
    noter(13, { type: "ticket.86", payload: { reason: "quota", until: "2026-10-20T12:00:00.000Z" } });
    journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge", uses: 3 } });
  } finally {
    journal.fermer();
  }
  return { leCompte, box, mac, serveur, stations: [box, mac, serveur] };
}

// Jamais deux cuisines du projet ouvertes à la fois.
const uneSeule = (stations: Station[]) => assert.ok(stations.filter((station) => station.sert()).length <= 1, `${stations.filter((station) => station.sert()).map(({ nom }) => nom).join(" et ")} servent shop ensemble`);

// Les deux stations lisent leurs gists, l'une après l'autre, autant de fois
// qu'il faut — et à chaque lecture, une cuisine au plus.
async function lireJusquA(stations: Station[], fait: () => boolean, ordre: Station[]) {
  for (let tour = 0; tour < 4 && !fait(); tour += 1) {
    for (const station of ordre) {
      await station.relire();
      uneSeule(stations);
    }
  }
  assert.ok(fait(), "le déménagement ne s'est pas achevé");
}

const sansDemenagements = (evenements: Evenement[]) => evenements.filter(({ type }) => type !== "kitchen.moved");

test("la cuisine d'un projet ajouté depuis l'app va de la box à cet ordinateur, revient, puis va sur une autre station — sans retrait ni rajout, son histoire, ses tickets, ses grants et ses réglages intacts", { skip: posixOnly("moves a kitchen from the box to this computer, back to the box, then to a third station, and expects its history, tickets, grants and settings intact at each stop; the return sets the box's old state directory aside with a rename, which Windows refuses while a file under it is still open, so the move does not complete") }, async (t) => {
  const { leCompte, box, mac, serveur, stations } = await unProjetServiSurLaBox(t);
  const avant = etatDuProjet(box.etat());

  // Vers cet ordinateur.
  const aller = await deplacer(leCompte, "shop", mac, stations, { local: mac });
  assert.deepEqual(aller, { code: 0, rendu: { moved: true, project: "shop", from: "box", to: "mac", askedAt: AUJOURDHUI } });
  await lireJusquA(stations, () => mac.sert(), [mac, box]);
  assert.equal(box.sert(), false);
  assert.doesNotMatch(box.configuration(), /shop/);
  const surLeMac = etatDuProjet(mac.etat());
  // Tout ce qui fait le projet est là, à l'identique ; s'y ajoute le seul déménagement.
  assert.deepEqual(sansDemenagements(surLeMac.evenements), avant.evenements);
  assert.deepEqual(surLeMac.projections, avant.projections);
  assert.deepEqual(surLeMac.evenements.at(-1)?.payload, { from: "box", to: "mac", askedAt: AUJOURDHUI, cooks: [] });
  // Son dépôt est déjà préparé : aucun ticket de préparation ne se rouvre.
  assert.equal(mac.preparations(), 0);
  assert.equal(existsSync(join(mac.etat(), "preparation-depot.json")), true);
  // Où il cuit : sur cet ordinateur — chaque station le dit.
  assert.deepEqual(
    [mac.suivi()?.etat, mac.suivi()?.cuitSur, mac.suivi()?.ici, mac.suivi()?.bascule?.etape],
    ["servi", "mac", true, "recue"],
  );
  assert.deepEqual([box.suivi()?.etat, box.suivi()?.cuitSur, box.suivi()?.ici, box.suivi()?.bascule?.etape], ["secondaire", "mac", false, "remise"]);
  assert.ok(box.lignes.includes("brigade : station — shop remis à mac : sa cuisine est fermée ici, son état publié — il cuit là-bas désormais"));

  // Retour sur la box : l'état qu'elle en gardait est mis de côté, pas écrasé.
  const retour = await deplacer(leCompte, "shop", box, stations, { local: mac, a: "2026-10-20T09:00:00.000Z" });
  assert.equal(retour.code, 0);
  await lireJusquA(stations, () => box.sert(), [box, mac]);
  assert.equal(mac.sert(), false);
  const revenu = etatDuProjet(box.etat());
  assert.deepEqual(sansDemenagements(revenu.evenements), avant.evenements);
  assert.deepEqual(revenu.projections, avant.projections);
  assert.deepEqual(revenu.evenements.filter(({ type }) => type === "kitchen.moved").map(({ payload }) => payload), [
    { from: "box", to: "mac", askedAt: AUJOURDHUI, cooks: [] },
    { from: "mac", to: "box", askedAt: "2026-10-20T09:00:00.000Z", cooks: [] },
  ]);
  assert.equal(readdirSync(join(box.racine, "etat")).filter((nom) => nom.startsWith(".shop.avant-")).length, 1);
  assert.deepEqual([box.suivi()?.cuitSur, box.suivi()?.ici], ["box", false]);

  // Puis vers une autre station.
  const ailleurs = await deplacer(leCompte, "shop", serveur, stations, { local: mac, a: "2026-10-20T10:00:00.000Z" });
  assert.equal(ailleurs.code, 0);
  await lireJusquA(stations, () => serveur.sert(), [serveur, box]);
  const surLeServeur = etatDuProjet(serveur.etat());
  assert.deepEqual(sansDemenagements(surLeServeur.evenements), avant.evenements);
  assert.deepEqual(surLeServeur.projections, avant.projections);
  assert.deepEqual([serveur.suivi()?.cuitSur, serveur.suivi()?.ici], ["serveur", false]);
});

test("tant que la station visée ne s'est pas dite prête, l'ancienne sert toujours ; elle ne remet qu'une cuisine fermée, et la nouvelle ne s'ouvre qu'une fois la remise publiée", async (t) => {
  const { leCompte, box, mac, stations } = await unProjetServiSurLaBox(t);
  await deplacer(leCompte, "shop", mac, stations, { local: mac });

  // La box lit avant le Mac : rien ne bouge chez elle.
  await box.relire();
  assert.equal(box.sert(), true);
  assert.match(box.configuration(), /shop acme\/shop main/);
  assert.deepEqual([box.suivi()?.etat, box.suivi()?.cuitSur, box.suivi()?.bascule?.etape], ["servi", "box", "demandee"]);
  assert.match(box.suivi()?.dit ?? "", /moving to mac is asked: it cooks here until mac is ready to take it over/);

  // Le Mac se dit prêt, sans rien ouvrir : la box ne lui a rien remis.
  await mac.relire();
  assert.equal(mac.sert(), false);
  assert.deepEqual([mac.suivi()?.etat, mac.suivi()?.bascule?.etape], ["en-preparation", "acceptee"]);

  // Sa cuisine ne se fermant pas, la box ne remet rien : son verrou le prouve.
  box.retenirLaCuisine();
  await box.relire();
  assert.equal(box.sert(), true);
  assert.equal(lireRemise(leCompte.gists.get(box.gist) ?? null, "shop"), null);
  assert.match(box.suivi()?.dit ?? "", /its kitchen is still open on box: the handover waits for it to close/);
  const journal = ouvrirJournal(box.etat(), { lectureSeule: true });
  try {
    assert.equal(journal.tout().some(({ type }) => type === "kitchen.moved"), false);
  } finally {
    journal.fermer();
  }
  await mac.relire();
  assert.equal(mac.sert(), false);
});

test("vers cet ordinateur sans bac à sable : le déménagement est refusé avec sa raison, en une phrase, et rien ne change", async (t) => {
  const { leCompte, box, mac, stations } = await unProjetServiSurLaBox(t);
  const avant = etatDuProjet(box.etat());
  const demandes = () => stations.map((station) => leCompte.gists.get(station.gist)?.[FICHIER_PROJETS]);
  const demandesAvant = demandes();

  // La commande refuse avant d'écrire quoi que ce soit.
  const refus = await deplacer(leCompte, "shop", mac, stations, { local: mac, bac: () => ({ ok: false, raison: SANS_SEATBELT }) });
  assert.deepEqual(refus, { code: 1, rendu: { moved: false, said: SANS_SEATBELT } });
  assert.deepEqual(demandes(), demandesAvant);

  // Et la station de cet ordinateur refuse de même, si la demande lui arrive autrement.
  const leMac = uneStation(t, leCompte, "mac2", { locale: true, bac: () => ({ ok: false, raison: SANS_SEATBELT }) });
  await deplacer(leCompte, "shop", leMac, [...stations, leMac]);
  await leMac.relire();
  await box.relire();
  await leMac.relire();
  assert.equal(leMac.sert(), false);
  assert.deepEqual([leMac.suivi()?.etat, leMac.suivi()?.dit, leMac.suivi()?.bascule?.etape], ["refuse", SANS_SEATBELT, "refusee"]);
  assert.equal(box.sert(), true);
  assert.deepEqual([box.suivi()?.etat, box.suivi()?.cuitSur, box.suivi()?.bascule?.etape], ["servi", "box", "refusee"]);
  assert.match(box.suivi()?.dit ?? "", new RegExp(`moving to mac2 is refused, so it stays here — ${SANS_SEATBELT.replace(/[()/]/g, "\\$&")}`));
  assert.deepEqual(etatDuProjet(box.etat()), avant);

  // Refusé, il se reprend vers la box, qui le sert toujours.
  const annule = await deplacer(leCompte, "shop", box, [...stations, leMac], { a: "2026-10-20T09:00:00.000Z" });
  assert.equal(annule.code, 0);
  await box.relire();
  await leMac.relire();
  assert.equal(box.sert(), true);
  assert.deepEqual([box.suivi()?.etat, box.suivi()?.bascule ?? null], ["servi", null]);
  assert.equal(leMac.suivi()?.etat, "secondaire");
});

test("la commande refuse un déménagement qui n'a pas de sens, en une phrase : un projet qui ne cuit nulle part, une station qu'il occupe déjà, un déménagement en cours", async (t) => {
  const { leCompte, box, mac, serveur, stations } = await unProjetServiSurLaBox(t);
  assert.deepEqual(await deplacer(leCompte, "espace", mac, stations), { code: 1, rendu: { moved: false, said: "espace cooks on none of your stations: add it rather than move it" } });
  assert.deepEqual(await deplacer(leCompte, "shop", box, stations), { code: 1, rendu: { moved: false, said: "shop already cooks on box" } });
  await deplacer(leCompte, "shop", mac, stations, { local: mac });
  await mac.relire();
  assert.deepEqual(await deplacer(leCompte, "shop", serveur, stations, { a: "2026-10-20T09:00:00.000Z" }), {
    code: 1,
    rendu: { moved: false, said: "shop is already moving from box to mac: wait until mac serves it" },
  });
});

test("une station ne rouvre pas d'elle-même une cuisine qu'elle a remise : elle dit où il cuit", async (t) => {
  const { leCompte, box, mac, stations } = await unProjetServiSurLaBox(t);
  await deplacer(leCompte, "shop", mac, stations, { local: mac });
  await lireJusquA(stations, () => mac.sert(), [mac, box]);
  // Une demande réécrite sans le déménagement lui redonne la principale.
  box.demander(SHOP);
  await box.relire();
  assert.equal(box.sert(), false);
  assert.deepEqual([box.suivi()?.etat, box.suivi()?.cuitSur], ["refuse", "mac"]);
  assert.match(box.suivi()?.dit ?? "", /it was handed over to mac .* and cooks there: move it back to bring it here/);
});

test("un ticket en cours de cuisson sur la station qu'il quitte est repris sur la nouvelle : son cook arrêté par le déménagement, ni perdu, ni en échec", async (t) => {
  const box = join(repertoireTemporaire(t), "etat", "brigade");
  const mac = join(repertoireTemporaire(t), "etat", "brigade");
  mkdirSync(box, { recursive: true });
  const gh = fauxGitHub(issue(15));
  const heure = montre();
  const premiere = cuisine(t, { scenario: "commite-puis-attend", lieux: { repertoire: box, origine: "", clone: "", gh, heure } });
  await jusqua(() => premiere.cooks().length === 1 && premiere.dernier("cook.launched", 15) !== undefined);
  const run = String(premiere.dernier("cook.launched", 15)?.run);
  const fichierDuPid = join(box, "runs", `${run}.cook.pid`);
  await jusqua(() => existsSync(fichierDuPid));
  const pid = Number(readFileSync(fichierDuPid, "utf8"));
  // La cuisine de la box se ferme : son cook, qu'un relais porte, tourne encore.
  premiere.runtime.arreter("SIGTERM");
  assert.equal(vivant(pid), true);

  const fichiers = await remettre({ repertoireEtat: box, projet: "brigade", de: "box", vers: "mac", demandeLe: AUJOURDHUI });
  // La remise ne part qu'une fois ce cook arrêté et mort.
  await jusqua(() => !vivant(pid));
  const remise = lireRemise(fichiers, "brigade");
  assert.ok(remise !== null);
  assert.deepEqual(recevoir({ repertoireEtat: mac, remise, fichiers }), { evenements: remise.journal?.evenements, dernierSeq: remise.journal?.dernierSeq });

  const seconde = cuisine(t, { scenario: "livre", lieux: { repertoire: mac, origine: "", clone: "", gh, heure }, stations: [{ nom: "mac/claude", moteur: "claude", fournit: ["code"], cooks: 1 }] });
  await jusqua(() => seconde.journal.duTicket(15).filter(({ type }) => type === "cook.launched").length === 2);
  const lancements = seconde.journal.duTicket(15).filter(({ type }) => type === "cook.launched");
  assert.equal((lancements[1]?.payload as { station?: string }).station, "mac/claude");
  const fin = seconde.journal.duTicket(15).find(({ type, payload }) => type === "cook.exited" && (payload as { run: string }).run === run);
  const { outcome, cause } = (fin?.payload ?? {}) as { outcome?: string; cause?: string };
  assert.deepEqual([outcome, cause], ["stop", "move"]);
  // Ni interrompu, ni en échec, ni mis de côté : le disjoncteur n'a rien compté.
  assert.deepEqual(seconde.types(15).filter((type) => ["cook.interrupted", "ticket.86", "guard.tripped"].includes(type)), []);
  assert.equal(etatDesGardeFous(seconde.journal.base).failures, 0);
  const deplace = seconde.journal.tout().find(({ type }) => type === "kitchen.moved");
  assert.deepEqual(deplace?.payload, { from: "box", to: "mac", askedAt: AUJOURDHUI, cooks: [run] });
});

test("une remise demandée pendant que la cuisine tient encore son verrou est retenue, sans rien écrire", async (t) => {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
  journal.fermer();
  const verrou = prendreVerrou(etat);
  try {
    await assert.rejects(remettre({ repertoireEtat: etat, projet: "shop", de: "box", vers: "mac", demandeLe: AUJOURDHUI }), RemiseRetenue);
  } finally {
    verrou.relacher();
  }
  assert.deepEqual(etatDuProjet(etat).evenements.map(({ type }) => type), ["grant.activated"]);
});

test("demenagement.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

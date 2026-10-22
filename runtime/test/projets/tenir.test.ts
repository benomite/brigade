// Les projets que le chef ajoute depuis l'app, tels que la station les tient :
// contre un gist en mémoire, une autorisation et un clone doublés — sauf pour
// l'accès au dépôt, où le clone est un vrai clone, et l'accès vérifié par un
// vrai git. La station
// elle-même, son vrai `gh` et son vrai clone se prouvent dans `../0-en-premier/recette.test.ts`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { decisionsPosees } from "../../src/decisions.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import type { Onboarding } from "../../src/onboarding/etat.ts";
import type { Autorisation } from "../../src/projets/preparer.ts";
import { refus } from "../../src/projets/refus.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { depotQuiRefuse } from "../aides/depot-qui-refuse.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, BASE, depotGit, ENV_GIT, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const GIST = "gist1";
const PARADE = {
  nom: "parade",
  depot: "benomite/parade",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-15T12:00:00.000Z",
  demandeLe: "2026-10-15T12:01:00.000Z",
};

// `remote` : le clone est un vrai clone d'une origine nue, et ce rappel en
// règle le remote ; l'accès est alors vérifié par un vrai git — sans
// configuration globale, donc sans credential helper.
function uneStation(t: TestContext, options: { appairee?: boolean; remote?: (clone: string) => void } = {}) {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST, appairee: options.appairee ?? true, code: null, expireLe: null, echus: [] }));
  const fichiers: Fichiers = {};
  const ecritures: Fichiers[] = [];
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist pour ses projets"),
    async ecrire(id, ecrits) {
      assert.equal(id, GIST);
      ecritures.push(ecrits);
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === GIST ? { ...fichiers } : null),
  };
  // Ce que la station sert : ce que sa configuration nomme, sauf ce qu'elle refuse.
  const refuses = new Map<string, string>();
  let relectures = 0;
  const servis = () => {
    const texte = existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "";
    return texte
      .split("\n")
      .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"))
      .map((ligne) => ligne.split(/\s+/)[0] ?? "")
      .filter((nom) => !refuses.has(nom));
  };
  const lignes: string[] = [];
  const autorisations = new Map<string, Autorisation>();
  const clones: string[] = [];
  let clonage: Error | null = null;
  const { remote } = options;
  const origine = remote === undefined ? null : depotGit(t).origine;
  // Le ticket qui prépare le dépôt : ce que la station en a demandé, et la panne de GitHub.
  const preparations: string[] = [];
  let preparation: Error | null = null;
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: remote === undefined ? {} : { ...ENV_GIT, HOME: repertoireTemporaire(t), GIT_SSL_NO_VERIFY: "1" },
    servis: { projets: servis, refus: (nom) => refuses.get(nom) ?? null },
    apresEcriture: () => void relectures++,
    dire: (ligne) => lignes.push(ligne),
    // Le minuteur ne bat pas pendant un test : c'est lui qui bat la mesure.
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-10-15T12:02:00Z"),
    autoriser: async (depot) => autorisations.get(depot) ?? { autorisee: true },
    cloner: async (depot, clone) => {
      if (clonage !== null) throw clonage;
      clones.push(`${depot} → ${clone}`);
      if (origine === null || remote === undefined) return void mkdirSync(join(clone, ".git"), { recursive: true });
      if (existsSync(join(clone, ".git"))) return;
      git(racine, "clone", "-q", origine, clone);
      remote(clone);
    },
    // Le clone doublé n'a pas de remote : rien à vérifier.
    ...(remote === undefined ? { verifierAcces: async () => ({ etat: "libre" as const }) } : {}),
    ouvrirLaPreparation: async (projet, repertoireEtat, clone) => {
      if (preparation !== null) throw preparation;
      preparations.push(`${projet.depot} ${projet.base} → ${repertoireEtat} ${clone}`);
      return { ticket: 7, ouvert: preparations.length === 1 };
    },
  });
  aArreter(t, () => projets.arreter());
  // Ce que l'app écrit : les projets que le chef demande à cette station.
  const demander = (...demandes: object[]) => void (fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: demandes }));
  const suivi = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets;
  const onboarding = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { onboarding?: Record<string, Onboarding> } | null)?.onboarding;
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const ecrireTelQuel = (texte: string) => void (fichiers[FICHIER_PROJETS] = texte);
  return { racine, origine, projets, demander, ecrireTelQuel, suivi, onboarding, configuration, lignes, ecritures, autorisations, clones, refuses, relectures: () => relectures, echouerLeClone: (erreur: Error | null) => (clonage = erreur), preparations, echouerLaPreparation: (erreur: Error | null) => (preparation = erreur) };
}

test("un projet dont la station est la principale : cloné, ses décisions posées, sa ligne écrite — il est servi, et le suivi le dit", async (t) => {
  const station = uneStation(t);
  station.demander(PARADE);
  await station.projets.relire();

  assert.deepEqual(station.clones, [`benomite/parade → ${join(station.racine, "clones/parade")}`]);
  assert.equal(station.configuration(), `${DEBUT}\nparade benomite/parade main\n${FIN}\n`);
  assert.equal(station.relectures(), 1);
  const journal = ouvrirJournal(join(station.racine, "etat/parade"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), {
      BRIGADE_STATIONS: "box/claude:2:code+raisonnement",
      BRIGADE_MANAGER_MODEL: "sonnet",
      BRIGADE_MANAGER_EFFORT: "medium",
      BRIGADE_REVIEWER_MODEL: "opus",
      BRIGADE_REVIEWER_EFFORT: "high",
    });
    assert.ok(journal.tout().every((evenement) => evenement.author === "chef" && evenement.project === "parade"));
  } finally {
    journal.fermer();
  }
  assert.deepEqual(station.suivi(), [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null }]);
  assert.ok(station.lignes.includes("brigade : station — parade ajouté depuis l'app : sa ligne est écrite dans la configuration"));

  // Relu sans changement : ni clone, ni ligne, ni suivi réécrit.
  const ecritures = station.ecritures.length;
  await station.projets.relire();
  assert.equal(station.clones.length, 1);
  assert.equal(station.relectures(), 1);
  assert.equal(station.ecritures.length, ecritures);
});

test("une demande sans branche ni calibrage : le dépôt cloné les déclare — la ligne n'écrit pas de branche, seule la station est posée au journal", async (t) => {
  const station = uneStation(t);
  // Le clone que la station tire du dépôt : sa branche par défaut n'est pas
  // sa branche d'intégration, que `.claude/brigade/projet.json` déclare.
  projetSurGit(t, { reglages: { integrationBranch: "v2", defaultCalibrations: { manager: { model: "opus", effort: "high" } } }, parDefaut: "main", autres: ["v2"], clone: join(station.racine, "clones/parade") });
  const { base: _base, manager: _manager, reviewer: _reviewer, ...sansReglages } = PARADE;
  station.demander({ ...sansReglages, base: null });
  await station.projets.relire();

  assert.equal(station.configuration(), `${DEBUT}\nparade benomite/parade\n${FIN}\n`);
  // Le ticket qui prépare le dépôt vise la branche que le dépôt déclare.
  assert.deepEqual(station.preparations, [`benomite/parade v2 → ${join(station.racine, "etat/parade")} ${join(station.racine, "clones/parade")}`]);
  const journal = ouvrirJournal(join(station.racine, "etat/parade"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), { BRIGADE_STATIONS: "box/claude:2:code+raisonnement" });
  } finally {
    journal.fermer();
  }
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("une demande sans branche, sur un dépôt qui n'en déclare aucune : refusée, rien n'est écrit", async (t) => {
  const station = uneStation(t);
  const { base: _base, ...sansBranche } = PARADE;
  station.demander(sansBranche);
  await station.projets.relire();

  assert.equal(station.configuration(), "");
  assert.deepEqual(station.preparations, []);
  const [suivi] = station.suivi() ?? [];
  assert.equal(suivi?.etat, "refuse");
  assert.equal(suivi?.refus?.code, "configuration-invalid");
  assert.match(suivi?.dit ?? "", /benomite\/parade does not declare its integration branch \(\.claude\/brigade\/projet\.json, or the “Branche d'intégration” line of its CLAUDE\.md\), and the app names none/);
});

test("le ticket qui prépare le dépôt s'ouvre avant la ligne du projet, une fois ; GitHub muet, rien n'est écrit et la station réessaie", async (t) => {
  const station = uneStation(t);
  station.echouerLaPreparation(new Error("HTTP 502"));
  station.demander(PARADE);
  await station.projets.relire();
  // Sans son premier ticket, la cuisine partirait sans rien attendre : sa ligne attend.
  assert.equal(station.configuration(), "");
  assert.equal(station.relectures(), 0);
  assert.equal(station.suivi()?.[0]?.etat, "en-preparation");
  assert.match(station.suivi()?.[0]?.dit ?? "", /could not open the ticket that prepares benomite\/parade; it retries — HTTP 502/);
  assert.ok(station.lignes.includes("brigade : station — parade : le ticket qui prépare son dépôt n'est pas ouvert sur GitHub, la station réessaie : HTTP 502"));

  station.echouerLaPreparation(null);
  await station.projets.relire();
  assert.deepEqual(station.preparations, [`benomite/parade main → ${join(station.racine, "etat/parade")} ${join(station.racine, "clones/parade")}`]);
  assert.equal(station.configuration(), `${DEBUT}\nparade benomite/parade main\n${FIN}\n`);
  assert.ok(
    station.lignes.includes("brigade : station — parade : ticket #7 ouvert sur benomite/parade pour préparer le dépôt (gates, setup de worktree, sites autorisés) — le rail n'en sert aucun autre avant son merge"),
  );
  // Sa ligne écrite, il n'est plus préparé : rien ne repart vers GitHub.
  await station.projets.relire();
  assert.equal(station.preparations.length, 1);
});

test("retiré depuis l'app, sa ligne quitte la configuration — celles écrites à la main restent", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "brigade benomite/brigade v2\n");
  station.demander(PARADE);
  await station.projets.relire();
  assert.equal(station.configuration(), `brigade benomite/brigade v2\n\n${DEBUT}\nparade benomite/parade main\n${FIN}\n`);

  station.demander();
  await station.projets.relire();
  assert.equal(station.configuration(), "brigade benomite/brigade v2\n");
  assert.equal(station.relectures(), 2);
  assert.deepEqual(station.suivi(), []);
  assert.ok(station.lignes.includes("brigade : station — parade retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)"));
  assert.ok(existsSync(join(station.racine, "clones/parade/.git")));
});

test("Apps non autorisées sur le dépôt : rien n'est cloné ni écrit, le suivi porte les pages où le chef les autorise — autorisées, le projet est servi", async (t) => {
  const station = uneStation(t);
  const pages = ["https://github.com/apps/brigade-cook/installations/new", "https://github.com/apps/brigade-pass/installations/new"];
  station.autorisations.set("benomite/parade", { autorisee: false, pages });
  station.demander(PARADE);
  await station.projets.relire();
  assert.deepEqual(station.clones, []);
  assert.equal(station.configuration(), "");
  assert.deepEqual(station.suivi(), [{ nom: "parade", etat: "a-autoriser", dit: "authorize brigade on benomite/parade, on GitHub: one click per page", autoriser: pages, serviLe: null, cuitSur: null, ici: false, bascule: null }]);
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne.includes("attend que le chef autorise")).length, 1);

  station.autorisations.delete("benomite/parade");
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("GitHub muet sur l'autorisation, ou clone en échec : le projet attend, la station réessaie, rien n'est écrit", async (t) => {
  const station = uneStation(t);
  station.autorisations.set("benomite/parade", { panne: "identité « cook » : GitHub injoignable" });
  station.demander(PARADE);
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "en-preparation");
  assert.match(station.suivi()?.[0]?.dit ?? "", /GitHub could not tell .* GitHub injoignable/);

  station.autorisations.delete("benomite/parade");
  station.echouerLeClone(new Error("clone de benomite/parade en échec — Repository not found"));
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0], { nom: "parade", etat: "refuse", dit: "the station could not clone benomite/parade; it retries — clone de benomite/parade en échec — Repository not found", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, refus: refus("clone-failed") });
  assert.equal(station.configuration(), "");

  station.echouerLeClone(null);
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("une station qui n'est pas la principale ne lui écrit aucune ligne ; une ligne écrite à la main garde la main", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "espace benomite/espace main\n");
  station.demander({ ...PARADE, principale: false }, { ...PARADE, nom: "espace", depot: "benomite/espace" });
  await station.projets.relire();
  assert.equal(station.configuration(), "espace benomite/espace main\n");
  assert.deepEqual(
    station.suivi()?.map(({ nom, etat }) => [nom, etat]),
    [
      ["parade", "secondaire"],
      ["espace", "refuse"],
    ],
  );
  assert.deepEqual(station.clones, []);
});

test("refusé par la station, le suivi dit pourquoi", async (t) => {
  const station = uneStation(t);
  station.refuses.set("parade", "le clone du projet n'existe pas");
  station.demander(PARADE);
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0], { nom: "parade", etat: "refuse", dit: "the station refuses to serve it — le clone du projet n'existe pas", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, refus: refus("unexpected") });
});

test("un projet refusé porte un refus structuré — statut, code, phrase, action — que le projet servi ne porte plus", async (t) => {
  const station = uneStation(t);
  station.refuses.set("parade", "le clone du projet n'existe pas");
  station.demander(PARADE);
  await station.projets.relire();
  const refuse = station.suivi()?.[0];
  assert.equal(refuse?.etat, "refuse");
  assert.deepEqual(refuse?.refus, refus("unexpected"));
  assert.equal(refuse?.refus?.status, "refused");
  // La station le sert enfin : le refus est effacé du suivi.
  station.refuses.delete("parade");
  await station.projets.relire();
  const servi = station.suivi()?.[0];
  assert.equal(servi?.etat, "servi");
  assert.equal("refus" in (servi ?? {}), false);
  assert.equal("refus" in (JSON.parse(JSON.stringify(servi)) as object), false);
});

test("un projet écrit à la main dans la configuration : son refus dit pourquoi", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "parade benomite/parade main\n");
  station.demander(PARADE);
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0]?.refus, refus("hand-written-line"));
});

// L'accès au dépôt, vérifié sur le remote du clone avant que rien ne soit
// préparé. Le dépôt de PARADE est sur `main`, l'origine du test sur `v2`.
const SUR_BASE = { ...PARADE, base: BASE };
function uneSeulePhrase(texte: string) {
  assert.match(texte, /^[A-Za-z0-9][^\n]*\.$/);
  assert.doesNotMatch(texte.slice(0, -1), /[.!?] [A-Z]/);
}

test("un dépôt qui refuse la récupération : l'accès est bloqué, en une phrase — rien n'est préparé ; le geste fait, le projet est servi à la cadence suivante", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 403 });
  const station = uneStation(t, { remote: (clone) => git(clone, "remote", "set-url", "origin", distant.url) });
  station.demander(SUR_BASE);
  await station.projets.relire();

  const [suivi] = station.suivi() ?? [];
  assert.equal(suivi?.etat, "refuse");
  assert.equal(suivi?.acces?.bloque, "fetch");
  uneSeulePhrase(suivi?.acces?.raison ?? "");
  assert.match(suivi?.acces?.raison ?? "", /^box cannot fetch from benomite\/parade: /);
  assert.equal(suivi?.dit, `${suivi?.acces?.raison} ${suivi?.acces?.geste}`);
  // Ni décisions, ni ticket de préparation, ni ligne : la préparation n'est pas tentée.
  assert.deepEqual(station.preparations, []);
  assert.equal(station.configuration(), "");
  assert.equal(existsSync(join(station.racine, "etat/parade")), false);
  // L'onboarding le dit à l'étape du dépôt, avec le geste, sur la station.
  const depot = station.onboarding()?.parade?.etapes.find(({ etape }) => etape === "depot");
  assert.equal(depot?.etat, "courante");
  assert.equal(depot?.dit, suivi?.acces?.raison);
  assert.deepEqual(depot?.geste, { quoi: suivi?.acces?.geste, ou: "On box, under the account that runs it.", liens: [] });
  assert.equal(station.lignes.filter((ligne) => ligne.startsWith("brigade : station — parade n'est pas servi, son dépôt refuse le fetch : ")).length, 1);
  // Revérifié à la cadence suivante, toujours refusé : dit une fois.
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne.includes("son dépôt refuse le fetch")).length, 1);

  // Le geste fait — le remote joint le dépôt —, la station le sert seule.
  git(join(station.racine, "clones/parade"), "remote", "set-url", "origin", station.origine ?? "");
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "servi");
  assert.equal(station.suivi()?.[0]?.acces, undefined);
  assert.equal(station.preparations.length, 1);
});

test("un dépôt en https sans credential helper : l'accès bloqué nomme `gh auth setup-git` comme geste", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 401, tls: true });
  const station = uneStation(t, { remote: (clone) => git(clone, "remote", "set-url", "origin", distant.url) });
  station.demander(SUR_BASE);
  await station.projets.relire();

  const [suivi] = station.suivi() ?? [];
  assert.equal(suivi?.acces?.bloque, "fetch");
  assert.match(suivi?.acces?.raison ?? "", /no credential helper/);
  assert.match(suivi?.acces?.geste ?? "", /^Run `gh auth setup-git` on box, under the account that runs it/);
  assert.match(suivi?.dit ?? "", /`gh auth setup-git`/);
  assert.equal(station.configuration(), "");
});

test("un dépôt qui laisse récupérer mais refuse de pousser : l'accès est bloqué, avec une raison propre au push", async (t) => {
  const distant = await depotQuiRefuse(t, { statut: 403 });
  const station = uneStation(t, { remote: (clone) => git(clone, "remote", "set-url", "--push", "origin", distant.url) });
  station.demander(SUR_BASE);
  await station.projets.relire();

  const [suivi] = station.suivi() ?? [];
  assert.equal(suivi?.etat, "refuse");
  assert.equal(suivi?.acces?.bloque, "push");
  uneSeulePhrase(suivi?.acces?.raison ?? "");
  assert.match(suivi?.acces?.raison ?? "", /^box can fetch from benomite\/parade but cannot push to it: its GitHub account has no write access to it/);
  assert.deepEqual(station.preparations, []);
  assert.equal(station.configuration(), "");
});

test("un dépôt joignable, où la station peut pousser : servi comme avant, sans accès bloqué", async (t) => {
  const station = uneStation(t, { remote: () => {} });
  station.demander(SUR_BASE);
  await station.projets.relire();

  assert.deepEqual(station.suivi(), [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null }]);
  assert.equal(station.configuration(), `${DEBUT}\nparade benomite/parade ${BASE}\n${FIN}\n`);
  assert.equal(station.preparations.length, 1);
});

test("un worktree que la cuisine d'un projet servi n'a pas pu préparer : le suivi porte sa raison, l'heure du prochain essai et le geste, jusqu'à ce qu'un worktree se prépare", async (t) => {
  const station = uneStation(t);
  station.demander(PARADE);
  await station.projets.relire();
  const servi = { nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null };
  assert.deepEqual(station.suivi(), [servi]);
  // Ce que la cuisine du projet écrit à son journal (`station.ts`).
  const noter = (fait: Fait) => {
    const journal = ouvrirJournal(join(station.racine, "etat/parade"));
    try {
      journal.ajouter({ project: "parade", ticket: 433, author: "station:box/claude", ...fait });
    } finally {
      journal.fermer();
    }
  };
  const why = "git fetch : fatal: could not read Username for 'https://github.com': terminal prompts disabled";
  const access = { blocked: "fetch" as const, reason: "box cannot fetch from benomite/parade: git has no credentials for https://github.com and no credential helper to ask for them (git: could not read Username for 'https://github.com': terminal prompts disabled).", gesture: "Run `gh auth setup-git` on box, under the account that runs it: git then takes its credentials from gh." };
  noter({ type: "ticket.86", payload: { reason: "worktree-failed", until: "2026-10-15T12:12:00.000Z", why, access } });
  await station.projets.relire();
  const acces = { bloque: "fetch", raison: access.reason, geste: access.gesture };
  assert.deepEqual(station.suivi(), [{ ...servi, worktree: { ticket: 433, raison: why, prochainEssai: "2026-10-15T12:12:00.000Z", acces } }]);

  // Un autre essai raté : son heure remplace la précédente.
  noter({ type: "ticket.86", payload: { reason: "worktree-failed", until: "2026-10-15T12:22:00.000Z", why: access.reason, access } });
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0]?.worktree, { ticket: 433, raison: access.reason, prochainEssai: "2026-10-15T12:22:00.000Z", acces });

  // Un ticket mis de côté pour une autre cause ne le lève pas ; un worktree préparé, si.
  noter({ type: "ticket.86", payload: { reason: "no-calibration", until: null } });
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.worktree?.prochainEssai, "2026-10-15T12:22:00.000Z");
  noter({ type: "worktree.prepared", payload: { station: "box/claude" } });
  await station.projets.relire();
  assert.deepEqual(station.suivi(), [servi]);
});

test("une demande illisible ne fait rien retirer ; une station pas encore appairée ne lit rien", async (t) => {
  const station = uneStation(t);
  station.demander(PARADE);
  await station.projets.relire();
  const avant = station.configuration();
  station.ecrireTelQuel("{ pas du JSON");
  await station.projets.relire();
  assert.equal(station.configuration(), avant);
  assert.ok(station.lignes.some((ligne) => ligne.includes("est illisible : la station n'en change rien")));

  const neuve = uneStation(t, { appairee: false });
  neuve.demander(PARADE);
  await neuve.projets.relire();
  assert.equal(neuve.configuration(), "");
  assert.equal(neuve.suivi(), undefined);
});

test("tenir.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

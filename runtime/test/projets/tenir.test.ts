// Les projets que le chef ajoute depuis l'app, tels que la station les tient :
// contre un gist en mémoire, une autorisation et un clone doublés. La station
// elle-même, son vrai `gh` et son vrai clone se prouvent dans `recette.test.ts`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { decisionsPosees } from "../../src/decisions.ts";
import { openLog } from "../../src/log.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import type { Autorisation } from "../../src/projets/preparer.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

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

function uneStation(t: TestContext, options: { appairee?: boolean } = {}) {
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
  const servedOnes = () => {
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
  // Le ticket qui prépare le dépôt : ce que la station en a demandé, et la panne de GitHub.
  const preparations: string[] = [];
  let preparation: Error | null = null;
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: servedOnes, refus: (nom) => refuses.get(nom) ?? null },
    apresEcriture: () => void relectures++,
    dire: (ligne) => lignes.push(ligne),
    // Le minuteur ne bat pas pendant un test : c'est lui qui bat la mesure.
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-10-15T12:02:00Z"),
    autoriser: async (depot) => autorisations.get(depot) ?? { autorisee: true },
    cloner: async (depot, clone) => {
      if (clonage !== null) throw clonage;
      clones.push(`${depot} → ${clone}`);
      mkdirSync(join(clone, ".git"), { recursive: true });
    },
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
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const ecrireTelQuel = (texte: string) => void (fichiers[FICHIER_PROJETS] = texte);
  return { racine, projets, demander, ecrireTelQuel, suivi, configuration, lignes, ecritures, autorisations, clones, refuses, relectures: () => relectures, echouerLeClone: (erreur: Error | null) => (clonage = erreur), preparations, echouerLaPreparation: (erreur: Error | null) => (preparation = erreur) };
}

test("un projet dont la station est la principale : cloné, ses décisions posées, sa ligne écrite — il est servi, et le suivi le dit", async (t) => {
  const station = uneStation(t);
  station.demander(PARADE);
  await station.projets.relire();

  assert.deepEqual(station.clones, [`benomite/parade → ${join(station.racine, "clones/parade")}`]);
  assert.equal(station.configuration(), `${DEBUT}\nparade benomite/parade main\n${FIN}\n`);
  assert.equal(station.relectures(), 1);
  const log = openLog(join(station.racine, "etat/parade"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(log.base), {
      BRIGADE_STATIONS: "box/claude:2:code+raisonnement",
      BRIGADE_MANAGER_MODEL: "sonnet",
      BRIGADE_MANAGER_EFFORT: "medium",
      BRIGADE_REVIEWER_MODEL: "opus",
      BRIGADE_REVIEWER_EFFORT: "high",
    });
    assert.ok(log.tout().every((evenement) => evenement.author === "chef" && evenement.project === "parade"));
  } finally {
    log.fermer();
  }
  assert.deepEqual(station.suivi(), [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z" }]);
  assert.ok(station.lignes.includes("brigade : station — parade ajouté depuis l'app : sa ligne est écrite dans la configuration"));

  // Relu sans changement : ni clone, ni ligne, ni suivi réécrit.
  const ecritures = station.ecritures.length;
  await station.projets.relire();
  assert.equal(station.clones.length, 1);
  assert.equal(station.relectures(), 1);
  assert.equal(station.ecritures.length, ecritures);
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
  assert.deepEqual(station.suivi(), [{ nom: "parade", etat: "a-autoriser", dit: "authorize brigade on benomite/parade, on GitHub: one click per page", autoriser: pages, serviLe: null }]);
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
  assert.deepEqual(station.suivi()?.[0], { nom: "parade", etat: "refuse", dit: "the station could not clone benomite/parade; it retries — clone de benomite/parade en échec — Repository not found", autoriser: [], serviLe: null });
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
  assert.deepEqual(station.suivi()?.[0], { nom: "parade", etat: "refuse", dit: "the station refuses to serve it — le clone du projet n'existe pas", autoriser: [], serviLe: null });
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

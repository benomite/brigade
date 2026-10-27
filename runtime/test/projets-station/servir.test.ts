// La station sert les projets choisis pour elle dans l'app (#1707) : la
// sélection, lue dans le gist de son enregistrement, passe par
// `projets/tenir.ts` comme une demande de l'app — un dépôt coché est préparé
// et servi à la lecture suivante, un dépôt décoché quitte la configuration, et
// sans sélection elle ne sert rien, et le dit. GitHub est une doublure de
// gists en mémoire ; le clone, un vrai clone d'un dépôt local.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL as APPAIRAGE_LOCAL } from "../../src/appairage/presence.ts";
import { decisionsPosees } from "../../src/decisions.ts";
import { FICHIER_ENREGISTREMENT, FICHIER_SELECTION } from "../../src/enregistrement-station/contrat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { ENQUETE_MUETTE } from "../../src/projets/echec-du-clone.ts";
import { CADENCE_MS, tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { AUCUN_PROJET, RAPPEL_MS, sourceDesProjets } from "../../src/projets-station/source.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const ENREGISTREMENT = "enreg1";
const APPAIRAGE = "appair1";
const DEPART = Date.parse("2026-10-26T10:00:00Z");

// `declarent` : les dépôts dont le clone déclare sa branche d'intégration (`v2`) ;
// les autres n'en déclarent aucune, et leur branche par défaut est `main`.
function uneStation(t: TestContext, options: { appairee?: boolean; declarent?: string[] } = {}) {
  const racine = repertoireTemporaire(t);
  const gists: Record<string, Fichiers> = { [ENREGISTREMENT]: { [FICHIER_ENREGISTREMENT]: "{}\n" } };
  if (options.appairee) {
    gists[APPAIRAGE] = {};
    writeFileSync(join(racine, APPAIRAGE_LOCAL), JSON.stringify({ gist: APPAIRAGE, appairee: true, code: null, expireLe: null, echus: [] }));
  }
  const ecritures: Array<{ gist: string; noms: string[] }> = [];
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist pour ses projets"),
    async ecrire(id, ecrits) {
      const gist = gists[id];
      if (gist === undefined) return "absent";
      ecritures.push({ gist: id, noms: Object.keys(ecrits) });
      Object.assign(gist, ecrits);
      return "ecrit";
    },
    lire: async (id) => (gists[id] === undefined ? null : { ...gists[id] }),
  };
  let enregistree: string | null = ENREGISTREMENT;
  let instant = DEPART;
  const lignes: string[] = [];
  const dire = (ligne: string) => void lignes.push(ligne);
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const servis = () =>
    configuration()
      .split("\n")
      .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"))
      .map((ligne) => ligne.split(/\s+/)[0] ?? "");
  const clones: string[] = [];
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: servis, refus: () => null },
    apresEcriture: () => {},
    dire,
    // Le minuteur ne bat pas pendant un test : c'est lui qui bat la mesure.
    cadenceMs: 3_600_000,
    maintenant: () => instant,
    autoriser: async () => ({ autorisee: true }),
    cloner: async (depot, clone) => {
      clones.push(depot);
      if (existsSync(join(clone, ".git"))) return;
      projetSurGit(t, { parDefaut: "main", clone, ...((options.declarent ?? []).includes(depot) ? { autres: ["v2"], reglages: { integrationBranch: "v2" } } : {}) });
    },
    enqueter: async () => ENQUETE_MUETTE,
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async () => ({ ticket: 7, ouvert: false }),
    source: sourceDesProjets({ racine, canal, gist: () => enregistree, env: {}, dire, coeurs: 8, maintenant: () => instant }),
  });
  aArreter(t, () => projets.arreter());
  // Ce que l'app écrit : la sélection entière, à chaque changement.
  const choisir = (...repositories: string[]) => void ((gists[ENREGISTREMENT] as Fichiers)[FICHIER_SELECTION] = `${JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: new Date(instant).toISOString() })}\n`);
  const suivi = () => (JSON.parse((gists[ENREGISTREMENT] as Fichiers)[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets;
  return {
    racine,
    gists,
    projets,
    choisir,
    suivi,
    configuration,
    lignes,
    ecritures,
    clones,
    avancer: (ms: number) => void (instant += ms),
    desenregistrer: () => void (enregistree = null),
  };
}

test("un dépôt coché dans l'app est servi à la lecture suivante : cloné, ses décisions posées, sa ligne écrite — sans aucune configuration à la main", async (t) => {
  const station = uneStation(t, { declarent: ["acme/shop"] });
  station.choisir("acme/shop");
  await station.projets.relire();

  // Le dépôt déclare sa branche : la ligne n'en nomme aucune.
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  assert.deepEqual(station.clones, ["acme/shop"]);
  assert.equal(station.suivi()?.[0]?.etat, "servi");
  assert.equal(station.suivi()?.[0]?.dit, "served by box");
  const journal = ouvrirJournal(join(station.racine, "etat/shop"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), {
      BRIGADE_STATIONS: "box/claude:3:code+raisonnement",
      BRIGADE_MANAGER_MODEL: "sonnet",
      BRIGADE_MANAGER_EFFORT: "medium",
      BRIGADE_REVIEWER_MODEL: "sonnet",
      BRIGADE_REVIEWER_EFFORT: "medium",
    });
  } finally {
    journal.fermer();
  }
  assert.ok(station.lignes.includes("brigade : station — projet choisi pour elle dans l'app : acme/shop — elle les prépare et les sert"));
  assert.ok(station.lignes.includes("brigade : station — shop ajouté depuis l'app : sa ligne est écrite dans la configuration"));
  // Elle ne répond que par son suivi : ni son enregistrement ni la sélection de l'app ne sont réécrits ici.
  assert.deepEqual(station.ecritures, [{ gist: ENREGISTREMENT, noms: [FICHIER_SUIVI] }]);

  // Relue sans changement : rien ne se redit, rien ne se réécrit.
  const [lignes, ecritures] = [station.lignes.length, station.ecritures.length];
  await station.projets.relire();
  assert.equal(station.lignes.length, lignes);
  assert.equal(station.ecritures.length, ecritures);
});

test("un dépôt qui ne déclare aucune branche est servi sur sa branche par défaut, à la lecture qui suit son clone", async (t) => {
  const station = uneStation(t);
  station.choisir("acme/site");
  // Deux lectures : celle du démarrage le clone — sa branche n'y est pas encore
  // connue —, celle-ci nomme sa branche par défaut.
  await station.projets.relire();
  assert.deepEqual(station.clones, ["acme/site", "acme/site"]);
  assert.equal(station.configuration(), `${DEBUT}\nsite acme/site main\n${FIN}\n`);
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("un dépôt décoché n'est plus servi à la lecture suivante : sa ligne quitte la configuration, son état et son clone restent", async (t) => {
  const station = uneStation(t, { declarent: ["acme/shop", "acme/site"] });
  station.choisir("acme/shop", "acme/site");
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\nsite acme/site\n${FIN}\n`);

  station.choisir("acme/site");
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nsite acme/site\n${FIN}\n`);
  assert.deepEqual(station.suivi()?.map(({ nom, etat }) => `${nom} ${etat}`), ["site servi"]);
  assert.ok(station.lignes.includes("brigade : station — shop retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)"));
  assert.ok(station.lignes.includes("brigade : station — projet choisi pour elle dans l'app : acme/site — elle les prépare et les sert"));
  assert.ok(existsSync(join(station.racine, "clones/shop/.git")));
  assert.ok(existsSync(join(station.racine, "etat/shop")));

  // Tout décoché : elle ne sert plus rien de l'app, et le dit.
  station.choisir();
  await station.projets.relire();
  assert.equal(station.configuration(), "");
  assert.deepEqual(station.suivi(), []);
  assert.ok(station.lignes.includes(AUCUN_PROJET));
  assert.ok(station.lignes.includes("brigade : station — site retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)"));
});

test("sans sélection, la station ne sert aucun projet et le dit au journal de service — de nouveau chaque heure, pas avant", async (t) => {
  const station = uneStation(t);
  // Une ligne écrite à la main reste : seule celle de l'app dépend de la sélection.
  writeFileSync(join(station.racine, "projets"), `brigade acme/brigade v2\n\n${DEBUT}\nshop acme/shop\n${FIN}\n`);
  await station.projets.relire();
  assert.equal(station.configuration(), "brigade acme/brigade v2\n");
  assert.deepEqual(station.suivi(), []);
  assert.deepEqual(
    station.lignes.filter((ligne) => ligne === AUCUN_PROJET),
    [AUCUN_PROJET],
  );
  assert.match(AUCUN_PROJET, /aucun projet n'est choisi pour elle dans l'app : elle n'en sert aucun/);

  station.avancer(RAPPEL_MS - CADENCE_MS);
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne === AUCUN_PROJET).length, 1);
  station.avancer(CADENCE_MS);
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne === AUCUN_PROJET).length, 2);

  // Un projet choisi, puis plus aucun : elle le redit aussitôt.
  station.choisir("acme/site");
  await station.projets.relire();
  station.choisir();
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne === AUCUN_PROJET).length, 3);
});

test("pas encore enregistrée sous un compte, ni appairée : rien n'est lu, rien ne change", async (t) => {
  const station = uneStation(t);
  station.desenregistrer();
  writeFileSync(join(station.racine, "projets"), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  assert.deepEqual(station.ecritures, []);
  assert.deepEqual(station.lignes, []);
});

test("une sélection illisible ne change rien à ce qu'elle sert, et c'est dit une fois", async (t) => {
  const station = uneStation(t, { declarent: ["acme/shop"] });
  station.choisir("acme/shop");
  await station.projets.relire();
  (station.gists[ENREGISTREMENT] as Fichiers)[FICHIER_SELECTION] = '{"brigade":"station-selection","format":99}';
  await station.projets.relire();
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  assert.deepEqual(
    station.lignes.filter((ligne) => ligne.includes("illisible")),
    [`brigade : station — ce que l'app demande (${FICHIER_SELECTION}) est illisible : la station n'en change rien`],
  );
});

test("appairée par code et sans sélection, elle sert ce que l'app lui demande par l'appairage ; la sélection écrite, c'est elle qu'elle sert", async (t) => {
  const station = uneStation(t, { appairee: true, declarent: ["acme/shop", "acme/site"] });
  (station.gists[APPAIRAGE] as Fichiers)[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: "shop", depot: "acme/shop", base: null, principale: true, cooks: 2 }] });
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  assert.ok(station.lignes.includes("brigade : station — aucun projet n'est choisi pour elle dans l'app : elle sert ce que l'app lui demande par son appairage"));
  assert.ok(!station.lignes.includes(AUCUN_PROJET));
  // Son suivi va là où l'app l'a demandé.
  assert.ok((station.gists[APPAIRAGE] as Fichiers)[FICHIER_SUIVI]);

  station.choisir("acme/site");
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nsite acme/site\n${FIN}\n`);
  assert.deepEqual(station.suivi()?.map(({ nom, etat }) => `${nom} ${etat}`), ["site servi"]);
});

test("sa sélection écrite, elle tient aussi les projets que le chef lui ajoute depuis la page d'un projet (« + station ») : la demande de son appairage les porte, sans la dire principale", async (t) => {
  const station = uneStation(t, { appairee: true, declarent: ["acme/site"] });
  station.choisir("acme/site");
  const ajoute = { nom: "shop", depot: "acme/shop", base: null, principale: false, cooks: 2, fournit: ["macos"] };
  // Une ligne principale de l'appairage reste ignorée : la sélection dit ce dont elle est la principale.
  const autre = { nom: "blog", depot: "acme/blog", base: null, principale: true, cooks: 1 };
  (station.gists[APPAIRAGE] as Fichiers)[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [ajoute, autre] });
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nsite acme/site\n${FIN}\n`);
  assert.deepEqual(station.clones, ["acme/site"], "rien n'est cloné pour le projet ajouté : elle n'en ouvre pas la cuisine");
  // Aucune station ne le sert encore ici : elle attend sa principale (`projets/rejoindre.ts`).
  assert.deepEqual(station.suivi()?.map(({ nom, etat }) => `${nom} ${etat}`), ["site servi", "shop secondaire"]);

  // Coché aussi sur sa page : la sélection le porte, une seule fois.
  station.choisir("acme/site", "acme/shop");
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.map(({ nom }) => nom), ["site", "shop"]);
});

test("deux dépôts choisis du même nom : le premier est servi, l'autre est dit une fois", async (t) => {
  const station = uneStation(t, { declarent: ["acme/site"] });
  station.choisir("acme/site", "autre/site");
  await station.projets.relire();
  await station.projets.relire();
  assert.equal(station.configuration(), `${DEBUT}\nsite acme/site\n${FIN}\n`);
  assert.equal(station.lignes.filter((ligne) => ligne === "brigade : station — autre/site, choisi dans l'app, n'est pas servi : acme/site sert déjà sous le nom de projet « site »").length, 1);
});

test("le délai que la doc donne est celui de la relecture : 30 s", () => {
  assert.equal(CADENCE_MS, 30_000);
  const readme = readFileSync(join(import.meta.dirname, "../../src/projets-station/README.md"), "utf8");
  assert.match(readme, /within \*\*30 s\*\*/);
});

test("servir.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

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
import { chiffresDuProjet } from "../../src/chiffres-du-projet.ts";
import { decisionsPosees } from "../../src/decisions.ts";
import type { Fait } from "../../src/evenements.ts";
import { leverBlocageDans, poserBlocageDans } from "../../src/installation/blocages/blocages.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import type { Onboarding } from "../../src/onboarding/etat.ts";
import { ENQUETE_MUETTE, PAGE_DES_JETONS_FINS, type Enquete } from "../../src/projets/echec-du-clone.ts";
import { CloneEnEchec, type Autorisation } from "../../src/projets/preparer.ts";
import { refus } from "../../src/projets/refus.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { depotQuiRefuse } from "../aides/depot-qui-refuse.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const GIST = "gist1";
const SHOP = {
  nom: "shop",
  depot: "acme/shop",
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
// `gists` : ceux des autres stations du compte, que son canal lit aussi.
// `gh` : la station clone par son vrai chemin (`clonerEnReparant`), sous ce
// `gh` et cet environnement, et vérifie l'accès par un vrai git.
function uneStation(t: TestContext, options: { appairee?: boolean; remote?: (clone: string) => void; gists?: Record<string, Fichiers>; clonesServis?: Record<string, string>; gh?: { bin: string; env: Record<string, string> } } = {}) {
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
    lire: async (id) => (id === GIST ? { ...fichiers } : options.gists?.[id] === undefined ? null : { ...options.gists[id] }),
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
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const lignes: string[] = [];
  const autorisations = new Map<string, Autorisation>();
  const clones: string[] = [];
  let clonage: Error | null = null;
  let enquete: Enquete = ENQUETE_MUETTE;
  const { remote } = options;
  const origine = remote === undefined ? null : depotGit(t).origine;
  // Le ticket qui prépare le dépôt : ce que la station en a demandé, et la panne de GitHub.
  const preparations: string[] = [];
  let preparation: Error | null = null;
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: options.gh !== undefined ? { ...options.gh.env, BRIGADE_GH_BIN: options.gh.bin, HOME: repertoireTemporaire(t) } : remote === undefined ? {} : { ...ENV_GIT, HOME: repertoireTemporaire(t), GIT_SSL_NO_VERIFY: "1" },
    servis: { projets: servis, depots: () => Object.fromEntries(configuration().split("\n").filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#") && !ligne.startsWith(DEBUT) && !ligne.startsWith(FIN)).map((ligne) => ligne.split(/\s+/)).filter(([nom]) => servis().includes(nom ?? "")).map(([nom, depot]) => [nom, depot])), clones: () => options.clonesServis ?? {}, refus: (nom) => refuses.get(nom) ?? null },
    apresEcriture: () => void relectures++,
    dire: (ligne) => lignes.push(ligne),
    // Le minuteur ne bat pas pendant un test : c'est lui qui bat la mesure.
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-10-15T12:02:00Z"),
    autoriser: async (depot) => autorisations.get(depot) ?? { autorisee: true },
    ...(options.gh !== undefined ? {} : { cloner: async (depot: string, clone: string) => {
      if (clonage !== null) throw clonage;
      clones.push(`${depot} → ${clone}`);
      if (origine === null || remote === undefined) return void mkdirSync(join(clone, ".git"), { recursive: true });
      if (existsSync(join(clone, ".git"))) return;
      git(racine, "clone", "-q", origine, clone);
      remote(clone);
    } }),
    // Le `gh` de la station, doublé : aucun vrai gh n'est joint.
    enqueter: async () => enquete,
    // Le clone doublé n'a pas de remote : rien à vérifier.
    ...(remote === undefined && options.gh === undefined ? { verifierAcces: async () => ({ etat: "libre" as const }) } : {}),
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
  const ecrireTelQuel = (texte: string) => void (fichiers[FICHIER_PROJETS] = texte);
  return { racine, origine, projets, demander, ecrireTelQuel, suivi, onboarding, configuration, lignes, ecritures, autorisations, clones, refuses, relectures: () => relectures, echouerLeClone: (erreur: Error | null) => (clonage = erreur), enqueteDuGh: (lue: Enquete) => (enquete = lue), preparations, echouerLaPreparation: (erreur: Error | null) => (preparation = erreur) };
}

// Le délai que la station publie d'un projet qu'elle vient de préparer : ajouté à l'heure (figée) de la station, aucun ticket servi.
// Les temps des tickets que la station publie : aucun fichier dans le clone, aucun enregistrement et le seuil du temps perdu par défaut (#2346, #2670).
// Avec les quatre chiffres du projet (#2672), qui n'ont rien à dire.
const SANS_TEMPS = { enregistrements: [], lostTimeMaxMin: 2, resume: null, chiffres: chiffresDuProjet({ enregistrements: [], qualites: new Map(), ratios: [], projet: null }) };
const AJOUTE = { ajouteLe: "2026-10-15T12:02:00.000Z", serviLe: null, duree: null };

test("un projet dont la station est la principale : cloné, ses décisions posées, sa ligne écrite — il est servi, et le suivi le dit", async (t) => {
  const station = uneStation(t);
  station.demander(SHOP);
  await station.projets.relire();

  assert.deepEqual(station.clones, [`acme/shop → ${join(station.racine, "clones/shop")}`]);
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop main\n${FIN}\n`);
  assert.equal(station.relectures(), 1);
  const journal = ouvrirJournal(join(station.racine, "etat/shop"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), {
      BRIGADE_STATIONS: "box/claude:2:code+raisonnement",
      BRIGADE_MANAGER_MODEL: "sonnet",
      BRIGADE_MANAGER_EFFORT: "medium",
      BRIGADE_REVIEWER_MODEL: "opus",
      BRIGADE_REVIEWER_EFFORT: "high",
    });
    assert.ok(journal.tout().every((evenement) => evenement.project === "shop" && evenement.author === (evenement.type === "project.added" ? "station:box" : "chef")));
    assert.equal(journal.tout().filter((evenement) => evenement.type === "project.added").length, 1);
  } finally {
    journal.fermer();
  }
  assert.deepEqual(station.suivi(), [{ nom: "shop", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null, delai: AJOUTE, temps: SANS_TEMPS }]);
  assert.ok(station.lignes.includes("brigade : station — shop ajouté depuis l'app : sa ligne est écrite dans la configuration"));

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
  projetSurGit(t, { reglages: { integrationBranch: "v2", defaultCalibrations: { manager: { model: "opus", effort: "high" } } }, parDefaut: "main", autres: ["v2"], clone: join(station.racine, "clones/shop") });
  const { base: _base, manager: _manager, reviewer: _reviewer, ...sansReglages } = SHOP;
  station.demander({ ...sansReglages, base: null });
  await station.projets.relire();

  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop\n${FIN}\n`);
  // Le ticket qui prépare le dépôt vise la branche que le dépôt déclare.
  assert.deepEqual(station.preparations, [`acme/shop v2 → ${join(station.racine, "etat/shop")} ${join(station.racine, "clones/shop")}`]);
  const journal = ouvrirJournal(join(station.racine, "etat/shop"), { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), { BRIGADE_STATIONS: "box/claude:2:code+raisonnement" });
  } finally {
    journal.fermer();
  }
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("une demande sans branche, sur un dépôt qui n'en déclare aucune : refusée, rien n'est écrit", async (t) => {
  const station = uneStation(t);
  const { base: _base, ...sansBranche } = SHOP;
  station.demander(sansBranche);
  await station.projets.relire();

  assert.equal(station.configuration(), "");
  assert.deepEqual(station.preparations, []);
  const [suivi] = station.suivi() ?? [];
  assert.equal(suivi?.etat, "refuse");
  assert.equal(suivi?.refus?.code, "configuration-invalid");
  assert.match(suivi?.dit ?? "", /acme\/shop does not declare its integration branch \(\.claude\/brigade\/projet\.json, or the “Branche d'intégration” line of its CLAUDE\.md\), and the app names none/);
});

test("le ticket qui prépare le dépôt s'ouvre avant la ligne du projet, une fois ; GitHub muet, rien n'est écrit et la station réessaie", async (t) => {
  const station = uneStation(t);
  station.echouerLaPreparation(new Error("HTTP 502"));
  station.demander(SHOP);
  await station.projets.relire();
  // Sans son premier ticket, la cuisine partirait sans rien attendre : sa ligne attend.
  assert.equal(station.configuration(), "");
  assert.equal(station.relectures(), 0);
  assert.equal(station.suivi()?.[0]?.etat, "en-preparation");
  assert.match(station.suivi()?.[0]?.dit ?? "", /could not open the ticket that prepares acme\/shop; it retries — HTTP 502/);
  assert.ok(station.lignes.includes("brigade : station — shop : le ticket qui prépare son dépôt n'est pas ouvert sur GitHub, la station réessaie : HTTP 502"));

  station.echouerLaPreparation(null);
  await station.projets.relire();
  assert.deepEqual(station.preparations, [`acme/shop main → ${join(station.racine, "etat/shop")} ${join(station.racine, "clones/shop")}`]);
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop main\n${FIN}\n`);
  assert.ok(
    station.lignes.includes("brigade : station — shop : ticket #7 ouvert sur acme/shop pour préparer le dépôt (gates, setup de worktree, sites autorisés) — le rail n'en sert aucun autre avant son merge"),
  );
  // Sa ligne écrite, il n'est plus préparé : rien ne repart vers GitHub.
  await station.projets.relire();
  assert.equal(station.preparations.length, 1);
});

test("retiré depuis l'app, sa ligne quitte la configuration — celles écrites à la main restent", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "brigade acme/brigade v2\n");
  station.demander(SHOP);
  await station.projets.relire();
  assert.equal(station.configuration(), `brigade acme/brigade v2\n\n${DEBUT}\nshop acme/shop main\n${FIN}\n`);

  station.demander();
  await station.projets.relire();
  assert.equal(station.configuration(), "brigade acme/brigade v2\n");
  assert.equal(station.relectures(), 2);
  assert.deepEqual(station.suivi(), []);
  assert.ok(station.lignes.includes("brigade : station — shop retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)"));
  assert.ok(existsSync(join(station.racine, "clones/shop/.git")));
});

test("Apps non autorisées sur le dépôt : rien n'est cloné ni écrit, le suivi porte les pages où le chef les autorise — autorisées, le projet est servi", async (t) => {
  const station = uneStation(t);
  const pages = ["https://github.com/apps/brigade-cook/installations/new", "https://github.com/apps/brigade-pass/installations/new"];
  station.autorisations.set("acme/shop", { autorisee: false, pages });
  station.demander(SHOP);
  await station.projets.relire();
  assert.deepEqual(station.clones, []);
  assert.equal(station.configuration(), "");
  assert.deepEqual(station.suivi(), [{ nom: "shop", etat: "a-autoriser", dit: "authorize brigade on acme/shop, on GitHub: one click per page", autoriser: pages, serviLe: null, cuitSur: null, ici: false, bascule: null, temps: SANS_TEMPS }]);
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne.includes("attend que le chef autorise")).length, 1);

  station.autorisations.delete("acme/shop");
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "servi");
});

test("GitHub muet sur l'autorisation, ou clone en échec : le projet attend, la station réessaie, rien n'est écrit", async (t) => {
  const station = uneStation(t);
  station.autorisations.set("acme/shop", { panne: "identité « cook » : GitHub injoignable" });
  station.demander(SHOP);
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "en-preparation");
  assert.match(station.suivi()?.[0]?.dit ?? "", /GitHub could not tell .* GitHub injoignable/);

  station.autorisations.delete("acme/shop");
  station.echouerLeClone(new Error("clone de acme/shop en échec — Repository not found"));
  await station.projets.relire();
  const { clone: muet, blocages, ...sansClone } = station.suivi()?.[0] ?? assert.fail("pas de suivi");
  assert.deepEqual(sansClone, { nom: "shop", etat: "refuse", dit: `${muet?.raison} ${muet?.geste}`, autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, temps: SANS_TEMPS, refus: refus("clone-failed") });
  assert.equal(muet?.cause, "account-cannot-see");
  assert.deepEqual(blocages?.map(({ id, message }) => [id, message]), [["clone", muet?.raison]]);
  assert.equal(station.configuration(), "");

  station.echouerLeClone(null);
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.blocages, undefined);
  assert.equal(station.suivi()?.[0]?.etat, "servi");
  assert.equal(station.suivi()?.[0]?.clone, undefined);
});

test("un clone en échec se dit en clair : la cause, le compte GitHub de la station, le geste et sa page — la sortie de git n'est qu'au détail ; le geste fait, l'étape passe au vert seule", async (t) => {
  const station = uneStation(t);
  const erreurs = "remote: Repository not found.\nfatal: repository 'https://github.com/ACME-tech/widgets.git/' not found\nfailed to run git: exit status 128";
  station.echouerLeClone(new CloneEnEchec("ACME-tech/widgets", erreurs));
  station.enqueteDuGh({ compte: "shop-box", jeton: "fine-grained", proprietaire: true });
  station.demander({ ...SHOP, nom: "widgets", depot: "ACME-tech/widgets" });
  await station.projets.relire();

  const suivi = station.suivi()?.[0];
  assert.equal(suivi?.etat, "refuse");
  assert.equal(suivi?.refus?.code, "clone-failed");
  assert.deepEqual(suivi?.clone, {
    cause: "token-excludes-repository",
    raison: "The token used by shop-box does not include ACME-tech/widgets, so GitHub answers that it does not exist and box cannot clone it.",
    geste: "Add ACME-tech/widgets to the repositories of the token used by shop-box (its resource owner must be ACME-tech): edit the token, and select ACME-tech/widgets under “Repository access”.",
    ou: "On GitHub, in the fine-grained tokens of the account.",
    liens: [PAGE_DES_JETONS_FINS],
    compte: "shop-box",
    detail: erreurs,
    reessaieToutesLes: 3600,
  });
  // Ni la sortie de git ni le message du runtime dans ce que le chef lit d'abord.
  assert.equal(suivi?.dit, `${suivi?.clone?.raison} ${suivi?.clone?.geste}`);
  assert.doesNotMatch(suivi?.dit ?? "", /exit status|fatal:|clone de|en échec/);
  // Le journal de la station garde ce que git a dit.
  assert.ok(station.lignes.some((ligne) => ligne.includes("widgets n'est pas cloné") && ligne.includes("repository 'https://github.com/ACME-tech/widgets.git/' not found")), station.lignes.join("\n"));

  const depot = station.onboarding()?.widgets?.etapes.find(({ etape }) => etape === "depot");
  assert.equal(depot?.etat, "courante");
  assert.equal(depot?.dit, `${suivi?.clone?.raison} box tries again within 60 min: this step turns green by itself once it is fixed.`);
  assert.deepEqual(depot?.geste, { quoi: suivi?.clone?.geste, ou: "On GitHub, in the fine-grained tokens of the account.", liens: [PAGE_DES_JETONS_FINS] });

  // Le chef ajoute le dépôt au jeton : à l'essai suivant, le clone passe, l'étape est faite.
  station.echouerLeClone(null);
  await station.projets.relire();
  assert.equal(station.suivi()?.[0]?.etat, "servi");
  assert.equal(station.suivi()?.[0]?.clone, undefined);
  assert.equal(station.onboarding()?.widgets?.etapes.find(({ etape }) => etape === "depot")?.etat, "faite");
});

test("une ligne de la demande qui ne la dit pas principale (« + station ») est préparée et servie comme toute autre (#2713) ; une ligne écrite à la main garde la main, et sert le projet", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "espace acme/espace main\n");
  station.demander({ ...SHOP, principale: false }, { ...SHOP, nom: "espace", depot: "acme/espace" });
  await station.projets.relire();
  assert.equal(station.configuration(), `espace acme/espace main\n\n${DEBUT}\nshop acme/shop main\n${FIN}\n`);
  assert.deepEqual(
    station.suivi()?.map(({ nom, etat }) => [nom, etat]),
    [
      ["shop", "servi"],
      ["espace", "servi"],
    ],
  );
  assert.deepEqual(station.clones, [`acme/shop → ${join(station.racine, "clones/shop")}`]);
});

test("refusé par la station, le suivi dit pourquoi", async (t) => {
  const station = uneStation(t);
  station.refuses.set("shop", "le clone du projet n'existe pas");
  station.demander(SHOP);
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0], { nom: "shop", etat: "refuse", dit: "the station refuses to serve it — le clone du projet n'existe pas", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, delai: AJOUTE, temps: SANS_TEMPS, refus: refus("unexpected") });
});

test("un projet refusé porte un refus structuré — statut, code, phrase, action — que le projet servi ne porte plus", async (t) => {
  const station = uneStation(t);
  station.refuses.set("shop", "le clone du projet n'existe pas");
  station.demander(SHOP);
  await station.projets.relire();
  const refuse = station.suivi()?.[0];
  assert.equal(refuse?.etat, "refuse");
  assert.deepEqual(refuse?.refus, refus("unexpected"));
  assert.equal(refuse?.refus?.status, "refused");
  // La station le sert enfin : le refus est effacé du suivi.
  station.refuses.delete("shop");
  await station.projets.relire();
  const servi = station.suivi()?.[0];
  assert.equal(servi?.etat, "servi");
  assert.equal("refus" in (servi ?? {}), false);
  assert.equal("refus" in (JSON.parse(JSON.stringify(servi)) as object), false);
});

test("un projet écrit à la main dans la configuration, que la station ne sert pas ou pour un autre dépôt : son refus dit pourquoi", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "shop acme/shop main\n");
  station.refuses.set("shop", "le clone du projet n'existe pas");
  station.demander(SHOP);
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0]?.refus, refus("hand-written-line"));
  // Servi, mais pour un autre dépôt sous le même nom.
  station.refuses.delete("shop");
  writeFileSync(join(station.racine, "projets"), "shop autre/shop main\n");
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0]?.refus, refus("hand-written-line"));
});

test("#2444 : un projet que la station sert déjà par une ligne de sa configuration est servi, jamais refusé — une seule cuisine", async (t) => {
  const station = uneStation(t);
  writeFileSync(join(station.racine, "projets"), "brigade benomite/brigade main\ncalculus-workspace BOBL-tech/calculus-workspace main\nespace BOBL-tech/espace main\nmirrorlab BOBL-tech/mirrorlab main\n");
  const choisis = [
    { ...SHOP, nom: "brigade", depot: "benomite/brigade" },
    { ...SHOP, nom: "mirrorlab", depot: "BOBL-tech/mirrorlab" },
    { ...SHOP, nom: "espace", depot: "BOBL-tech/espace" },
    { ...SHOP, nom: "mirrorscreen", depot: "BOBL-tech/mirrorscreen" },
  ];
  station.demander(...choisis);
  await station.projets.relire();
  const suivi = station.suivi() ?? [];
  for (const nom of ["brigade", "mirrorlab", "espace"]) {
    const un = suivi.find((dit) => dit.nom === nom);
    assert.equal(un?.etat, "servi", nom);
    assert.equal(un?.cuitSur, "box", nom);
    assert.equal("refus" in (un ?? {}), false, nom);
  }
  assert.notEqual(suivi.find((dit) => dit.nom === "mirrorscreen")?.etat, "refuse");
  // La ligne écrite à la main reste seule : le bloc de l'app ne la double pas.
  const configuration = readFileSync(join(station.racine, "projets"), "utf8");
  assert.equal(configuration.split("\n").filter((ligne) => ligne.startsWith("brigade ")).length, 1);
  assert.match(configuration, /^mirrorscreen /m);
});

// L'accès au dépôt, vérifié sur le remote du clone avant que rien ne soit
// préparé. Le dépôt de SHOP est sur `main`, l'origine du test sur `v2`.
const SUR_BASE = { ...SHOP, base: BASE };
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
  assert.match(suivi?.acces?.raison ?? "", /^box cannot fetch from acme\/shop: /);
  assert.equal(suivi?.dit, `${suivi?.acces?.raison} ${suivi?.acces?.geste}`);
  // Ni décisions, ni ticket de préparation, ni ligne : la préparation n'est pas tentée.
  assert.deepEqual(station.preparations, []);
  assert.equal(station.configuration(), "");
  assert.equal(existsSync(join(station.racine, "etat/shop")), false);
  // L'onboarding le dit à l'étape du dépôt, avec le geste, sur la station.
  const depot = station.onboarding()?.shop?.etapes.find(({ etape }) => etape === "depot");
  assert.equal(depot?.etat, "courante");
  assert.equal(depot?.dit, suivi?.acces?.raison);
  assert.deepEqual(depot?.geste, { quoi: suivi?.acces?.geste, ou: "On box, under the account that runs it.", liens: [] });
  assert.equal(station.lignes.filter((ligne) => ligne.startsWith("brigade : station — shop n'est pas servi, son dépôt refuse le fetch : ")).length, 1);
  // Revérifié à la cadence suivante, toujours refusé : dit une fois.
  await station.projets.relire();
  assert.equal(station.lignes.filter((ligne) => ligne.includes("son dépôt refuse le fetch")).length, 1);

  // Le geste fait — le remote joint le dépôt —, la station le sert seule.
  git(join(station.racine, "clones/shop"), "remote", "set-url", "origin", station.origine ?? "");
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
  assert.match(suivi?.acces?.raison ?? "", /^box can fetch from acme\/shop but cannot push to it: its GitHub account has no write access to it/);
  assert.deepEqual(station.preparations, []);
  assert.equal(station.configuration(), "");
});

test("un dépôt joignable, où la station peut pousser : servi comme avant, sans accès bloqué", async (t) => {
  const station = uneStation(t, { remote: () => {} });
  station.demander(SUR_BASE);
  await station.projets.relire();

  assert.deepEqual(station.suivi(), [{ nom: "shop", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null, delai: AJOUTE, temps: SANS_TEMPS }]);
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop ${BASE}\n${FIN}\n`);
  assert.equal(station.preparations.length, 1);
});

// #3197 : le 2026-11-11, une station avait cloné un dépôt encore vide ; les
// commits arrivés ensuite, son clone restait sans commit, et le push à blanc
// de la vérification d'accès, sur « src refspec HEAD does not match any », se
// lisait comme un droit d'écriture qui manque.
test("#3197 : un projet ajouté quand son dépôt est vide attend, sa panne de clone dite sans refus d'écriture ; un commit arrivé sur le dépôt, la station le rapatrie et le sert", async (t) => {
  const origines = repertoireTemporaire(t);
  const origine = join(origines, "acme/shop.git");
  mkdirSync(origine, { recursive: true });
  git(origine, "init", "-q", "--bare", "-b", "main");
  const station = uneStation(t, { gh: { bin: join(import.meta.dirname, "faux-gh.ts"), env: { ...ENV_GIT, FAUX_ORIGINES: origines, FAUX_GISTS: repertoireTemporaire(t) } } });
  const clone = join(station.racine, "clones/shop");
  station.demander(SHOP);
  await station.projets.relire();

  const [vide] = station.suivi() ?? [];
  assert.equal(vide?.etat, "en-preparation");
  assert.equal(vide?.refus, undefined);
  assert.equal(vide?.acces, undefined);
  assert.match(vide?.dit ?? "", /^box could not check that it may push to acme\/shop: its clone has no commit to push yet .*\(git: src refspec HEAD does not match any\); this is not an access refusal; the station retries every 3600 s$/);
  assert.doesNotMatch(vide?.dit ?? "", /no write access/);
  assert.equal(station.lignes.filter((ligne) => ligne.includes("son clone est en cause, pas son accès")).length, 1);
  assert.equal(station.configuration(), "");
  assert.deepEqual(station.preparations, []);

  // Un commit arrive sur le dépôt, poussé d'ailleurs : sans aucune commande git à la main, le projet est servi.
  const ailleurs = join(repertoireTemporaire(t), "ailleurs");
  git(origines, "clone", "-q", origine, ailleurs);
  commiter(ailleurs, "LISEZMOI");
  git(ailleurs, "push", "-q", "origin", "HEAD:refs/heads/main");
  await station.projets.relire();

  assert.equal(station.suivi()?.[0]?.etat, "servi");
  assert.equal(git(clone, "rev-parse", "HEAD"), git(ailleurs, "rev-parse", "HEAD"));
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "main");
  assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop main\n${FIN}\n`);
  assert.equal(station.preparations.length, 1);
});

test("un worktree que la cuisine d'un projet servi n'a pas pu préparer : le suivi porte sa raison, l'heure du prochain essai et le geste, jusqu'à ce qu'un worktree se prépare", async (t) => {
  const station = uneStation(t);
  station.demander(SHOP);
  await station.projets.relire();
  const servi = { nom: "shop", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null, delai: AJOUTE, temps: SANS_TEMPS };
  assert.deepEqual(station.suivi(), [servi]);
  // Ce que la cuisine du projet écrit à son journal (`station.ts`).
  const noter = (fait: Fait) => {
    const journal = ouvrirJournal(join(station.racine, "etat/shop"));
    try {
      journal.ajouter({ project: "shop", ticket: 433, author: "station:box/claude", ...fait });
    } finally {
      journal.fermer();
    }
  };
  const why = "git fetch : fatal: could not read Username for 'https://github.com': terminal prompts disabled";
  const access = { blocked: "fetch" as const, reason: "box cannot fetch from acme/shop: git has no credentials for https://github.com and no credential helper to ask for them (git: could not read Username for 'https://github.com': terminal prompts disabled).", gesture: "Run `gh auth setup-git` on box, under the account that runs it: git then takes its credentials from gh." };
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

test("les blocages d'un projet, posés à son journal, sont publiés dans son suivi — aucun, le champ manque ; levés, ils en sortent", async (t) => {
  const station = uneStation(t);
  station.demander(SHOP);
  await station.projets.relire();
  const servi = { nom: "shop", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:02:00.000Z", cuitSur: "box", ici: false, bascule: null, delai: AJOUTE, temps: SANS_TEMPS };
  assert.deepEqual(station.suivi(), [servi]);

  const etat = join(station.racine, "etat/shop");
  const qui = { projet: "shop", auteur: "station:box" };
  const postgres = { id: "need:postgres", message: "The tests of shop need a Postgres that box does not have.", cause: "The worktree setup runs psql against a local database.", action: "choose-station" };
  const jeton = { id: "token", message: "The token of brigade-cook does not include acme/shop.", cause: "failed to run git: exit status 128", link: "https://github.com/settings/personal-access-tokens" };
  poserBlocageDans(etat, qui, postgres);
  poserBlocageDans(etat, qui, jeton);
  await station.projets.relire();
  assert.deepEqual(station.suivi(), [
    {
      ...servi,
      blocages: [
        postgres,
        // La sortie brute de git n'est jamais publiée comme cause : elle passe dans le détail.
        { id: "token", message: jeton.message, cause: "The station did not recognise what went wrong.", link: jeton.link, detail: "failed to run git: exit status 128" },
      ],
    },
  ]);

  leverBlocageDans(etat, qui, "need:postgres");
  leverBlocageDans(etat, qui, "token");
  await station.projets.relire();
  assert.deepEqual(station.suivi(), [servi]);
});

test("une demande illisible ne fait rien retirer ; une station pas encore appairée ne lit rien", async (t) => {
  const station = uneStation(t);
  station.demander(SHOP);
  await station.projets.relire();
  const avant = station.configuration();
  station.ecrireTelQuel("{ pas du JSON");
  await station.projets.relire();
  assert.equal(station.configuration(), avant);
  assert.ok(station.lignes.some((ligne) => ligne.includes("est illisible : la station n'en change rien")));

  const neuve = uneStation(t, { appairee: false });
  neuve.demander(SHOP);
  await neuve.projets.relire();
  assert.equal(neuve.configuration(), "");
  assert.equal(neuve.suivi(), undefined);
});

test("tenir.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

test("le délai de l'ajout au premier ticket servi est publié, exact et figé : un second ticket servi ne le change pas", async (t) => {
  const station = uneStation(t);
  station.demander(SHOP);
  await station.projets.relire();
  assert.deepEqual(station.suivi()?.[0]?.delai, AJOUTE);

  const servir = async (ticket: number, instant: string) => {
    const journal = ouvrirJournal(join(station.racine, "etat/shop"), { maintenant: () => new Date(instant) });
    try {
      journal.ajouter({ project: "shop", ticket, author: "runtime", type: "ticket.served", payload: {} });
    } finally {
      journal.fermer();
    }
    await station.projets.relire();
  };
  await servir(7, "2026-10-15T14:36:56.789Z");
  const fige = { ajouteLe: "2026-10-15T12:02:00.000Z", serviLe: "2026-10-15T14:36:56.789Z", duree: 9_296_789 };
  assert.deepEqual(station.suivi()?.[0]?.delai, fige);
  await servir(8, "2026-10-16T09:00:00.000Z");
  assert.deepEqual(station.suivi()?.[0]?.delai, fige);
});

test("la boîte du 2026-11-06 : une ligne écrite à la main, 13 enregistrements dans le clone qu'elle sert — le suivi les porte (#2567)", async (t) => {
  const clone = repertoireTemporaire(t);
  mkdirSync(join(clone, ".claude", "brigade"), { recursive: true });
  const enregistrements = Array.from({ length: 13 }, (_, i) => ({ ticket: 2535 + i, claimedAt: "2026-11-06T07:00:00.000Z", mergedAt: `2026-11-06T07:${String(10 + i).padStart(2, "0")}:00.000Z`, cuisson: 300, cuissonTests: 60, attentePasse: 60, revue: 120, ci: 90, merge: 30 }));
  writeFileSync(join(clone, ".claude", "brigade", "temps-tickets.json"), JSON.stringify(enregistrements));
  const station = uneStation(t, { clonesServis: { shop: clone } });
  writeFileSync(join(station.racine, "projets"), "shop acme/shop main BRIGADE_REPO_DIR=" + clone + "\n");
  station.demander({ ...SHOP, principale: false });
  await station.projets.relire();

  const temps = station.suivi()?.[0]?.temps;
  assert.equal(temps?.enregistrements.length, 13);
  assert.equal(temps?.lostTimeMaxMin, 2);
  // Les quatre chiffres sont publiés avec eux, dans l'ordre de la table du ticket #2672.
  assert.deepEqual(temps?.chiffres?.map(({ cle }) => cle), ["perdu", "estimation", "premier-coup", "reparations"]);
  assert.match(temps?.chiffres?.[0]?.valeur ?? "", /^[\d.]+ min median, [\d.]+ min p75$/);
});

// #3015 : le résumé des temps que l'app lit (`temps.resume`) est publié avec les enregistrements du clone servi.
const enregistrementMerge = (ticket: number, mergedAt: string) => ({ ticket, claimedAt: "2026-10-15T09:00:00Z", mergedAt, cuisson: 900, cuissonTests: 100, attentePasse: 60, revue: 120, ci: 200, merge: 30 });

test("un projet servi dont des tickets ont été mergés dans les dernières 24 h publie le résumé de leurs temps", async (t) => {
  const clone = repertoireTemporaire(t);
  mkdirSync(join(clone, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(clone, ".claude", "brigade", "temps-tickets.json"), JSON.stringify({ tickets: [enregistrementMerge(1, "2026-10-14T10:00:00Z"), enregistrementMerge(2, "2026-10-15T10:00:00Z"), enregistrementMerge(3, "2026-10-15T11:00:00Z")] }));
  const station = uneStation(t, { clonesServis: { shop: clone } });
  station.demander(SUR_BASE);
  await station.projets.relire();

  const resume = station.suivi()?.[0]?.temps?.resume;
  assert.equal(resume?.n, 3);
  assert.ok(resume !== null && resume !== undefined && resume.medianMin > 0 && resume.p75Min > 0);
});

test("un projet servi sans ticket mergé dans les dernières 24 h ne publie aucun résumé", async (t) => {
  const clone = repertoireTemporaire(t);
  mkdirSync(join(clone, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(clone, ".claude", "brigade", "temps-tickets.json"), JSON.stringify({ tickets: [enregistrementMerge(1, "2026-10-13T10:00:00Z")] }));
  const station = uneStation(t, { clonesServis: { shop: clone } });
  station.demander(SUR_BASE);
  await station.projets.relire();

  assert.equal(station.suivi()?.[0]?.temps?.resume, null);
});

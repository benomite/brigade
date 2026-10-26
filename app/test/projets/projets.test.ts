// « Add a project » : l'app écrit la demande dans le gist de chaque station choisie, relit ce que
// chacune en dit, et retire le projet de toutes. Contre une doublure de `gh` qui tient les gists du
// compte et ses dépôts dans un répertoire : ni réseau, ni GitHub, ni station — GitHub est le seul
// canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FICHIER_PROJETS, FICHIER_SUIVI } from "../../src/projets/demande.ts";
import { depotsDuChef } from "../../src/projets/github.ts";
import { plafondDesCoeurs } from "../../../runtime/src/projections/stations.ts";
import { projetDuClone } from "../../../runtime/src/projets/ajout-de-station.ts";
import type { ProjetDemande } from "../../src/projets/demande.ts";
import { avertissement, CALIBRAGE_MESURE, calibrageRecommande, cooksDesCoeurs, estUnOrdinateur, lireConfiance, lireSaisie, machineProposee, nomDuProjet, principaleRecommandee, refusDeConfiance, refusDeSaisie, tenirProjets, type OptionsProjets, type VuDesProjets } from "../../src/projets/projets.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { ghDuRepertoire } from "../aides/gh-du-repertoire.ts";
import { repondre } from "./faux-gh.ts";
import { SANS_POSIX } from "../aides/posix.ts";

const SOURCES = join(import.meta.dirname, "../../src/projets");
const MAINTENANT = Date.parse("2026-10-15T12:01:00Z");
const OUVERT = "2026-10-15T12:00:00.000Z";

const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const ETEINTE: StationVue = { id: "g3", nom: "vieux", machine: "Linux 5.10", etat: "hors-ligne", ligne: "offline for 3 min · version 1.3.0 · no project", pannes: [], dit: "offline for 3 min", version: "1.3.0", projets: [], max: null };

const SAISIE = {
  depot: "benomite/parade",
  base: "main",
  stations: ["g1", "g2"],
  principale: "g1",
  cooks: "2",
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: OUVERT,
  capacites: [] as string[],
};

// GitHub : les gists des stations et les dépôts du compte, dans un répertoire que la doublure lit et écrit.
function unGitHub(t: TestContext, stations: StationVue[] = [BOX, MAC], plus: Partial<OptionsProjets> = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-projets-"));
  writeFileSync(join(repertoire, "appels"), "");
  const gh = ghDuRepertoire(repertoire, repondre);
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(fichier(id), "utf8")) as { files: Record<string, { filename: string; content: string }> };
  for (const { id } of stations) writeFileSync(fichier(id), JSON.stringify({ id, description: "brigade — station", public: false, updated_at: "2026-10-15T11:00:00Z", files: { "brigade-station.json": { filename: "brigade-station.json", content: "{}" }, "brigade-appairage.json": { filename: "brigade-appairage.json", content: "{}" } } }));
  const demande = (id: string) => (JSON.parse(gist(id).files[FICHIER_PROJETS]?.content ?? "null") as { projets: Array<Record<string, unknown>> } | null)?.projets;
  // Ce que la station écrit de ses projets demandés (runtime/src/projets/tenir.ts).
  const suivre = (id: string, projets: object[]) => {
    const lu = gist(id);
    lu.files[FICHIER_SUIVI] = { filename: FICHIER_SUIVI, content: JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-15T12:02:00Z", projets }) };
    writeFileSync(fichier(id), JSON.stringify(lu));
  };
  const lectures: VuDesProjets[] = [];
  const projets = tenirProjets({
    github: githubDesStations({ gh, delaiMs: 30_000 }),
    stations: () => stations,
    depots: depotsDuChef({ gh, delaiMs: 30_000 }),
    surLecture: (vu) => lectures.push(vu),
    maintenant: () => MAINTENANT,
    ...plus,
  });
  return { repertoire, projets, lectures, demande, suivre, gist, depots: (liste: object[]) => writeFileSync(join(repertoire, "depots"), JSON.stringify(liste)), panne: () => writeFileSync(join(repertoire, "panne"), "") };
}

test("la principale recommandée est une station serveur, en ligne d'abord ; un ordinateur choisi se dit au moment du choix", () => {
  assert.equal(principaleRecommandee([MAC, ETEINTE, BOX]), "g1");
  assert.equal(principaleRecommandee([MAC, ETEINTE]), "g3");
  assert.equal(principaleRecommandee([MAC]), undefined);
  assert.equal(estUnOrdinateur(MAC), true);
  assert.equal(estUnOrdinateur({ machine: "Windows 10.0.26100" }), true);
  assert.equal(avertissement(BOX), undefined);
  assert.equal(avertissement(MAC), "macbook is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.");
});

const TELEPHONE: StationVue = { id: "g4", nom: "pixel", machine: "Android 15", cuisine: false, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };

test("un téléphone ne cuit rien : jamais recommandé, et refusé de toute saisie qui le choisit", () => {
  assert.equal(principaleRecommandee([TELEPHONE]), undefined);
  assert.equal(principaleRecommandee([TELEPHONE, BOX]), "g1");
  const stations = [BOX, MAC, TELEPHONE];
  assert.equal(refusDeSaisie({ ...SAISIE, stations: ["g1", "g4"] }, stations, []).stations, "pixel does not cook: choose a station that does.");
  assert.equal(refusDeSaisie(SAISIE, stations, []).stations, undefined);
  const confiance = { ...SAISIE, nom: "parade", stations: ["g4"] };
  assert.equal(refusDeConfiance(confiance, stations, { portee: [], principale: false }).stations, "pixel does not cook: choose a station that does.");
});

test("les cooks proposés sont ceux que les cœurs de la machine permettent — le plafond même que la station en dérive", () => {
  for (let coeurs = 1; coeurs <= 64; coeurs++) assert.equal(cooksDesCoeurs(coeurs), plafondDesCoeurs(coeurs), `${coeurs} cœurs`);
  assert.deepEqual(machineProposee({ ...BOX, coeurs: 8 }), { toujoursAllumee: true, implique: "always on: it keeps cooking while your computer sleeps", cooks: 3, cooksDit: "from box's 8 cores: two are kept for the kitchen itself, then about two per cook" });
  assert.deepEqual(machineProposee({ ...MAC, coeurs: 12 }), { toujoursAllumee: false, implique: "stops when you close the app on this computer", cooks: 5, cooksDit: "from macbook's 12 cores: two are kept for the kitchen itself, then about two per cook" });
  // Une station qui ne publie pas encore ses cœurs : un départ prudent, dit comme tel.
  assert.deepEqual([machineProposee(BOX).cooks, machineProposee(BOX).cooksDit], [2, "box does not publish its cores yet: 2, a careful start"]);
});

test("le calibrage proposé est celui du projet confié le plus récemment ; sans autre projet, la valeur de départ mesurée", () => {
  const demande = (nom: string, demandeLe: string | null, manager: { modele: string; effort: string }): ProjetDemande => ({ nom, depot: `benomite/${nom}`, base: "main", principale: true, cooks: 2, manager, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe });
  assert.deepEqual(calibrageRecommande([]), { manager: CALIBRAGE_MESURE, reviewer: CALIBRAGE_MESURE, dit: "the starting value measured on brigade's own box, for lack of another project on your stations" });
  assert.deepEqual(CALIBRAGE_MESURE, { modele: "sonnet", effort: "medium" });
  assert.deepEqual(
    calibrageRecommande([demande("ancien", "2026-10-01T00:00:00.000Z", { modele: "haiku", effort: "low" }), demande("cantine", "2026-10-12T00:00:00.000Z", { modele: "opus", effort: "medium" }), demande("vieux", null, { modele: "sonnet", effort: "max" })]),
    { manager: { modele: "opus", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, dit: "what cantine runs on, your project most recently given to a station" },
  );
  // Un calibrage que la station n'accepterait pas ne se propose pas.
  assert.equal(calibrageRecommande([demande("bizarre", "2026-10-19T00:00:00.000Z", { modele: "gpt", effort: "medium" })]).dit, calibrageRecommande([]).dit);
});

test("le nom du projet vient de son dépôt ; ce qui manque est signalé champ par champ", () => {
  assert.equal(nomDuProjet("benomite/Calculus_Workspace"), "calculus-workspace");
  assert.deepEqual(refusDeSaisie(lireSaisie(SAISIE), [BOX, MAC], []), {});
  assert.deepEqual(refusDeSaisie(lireSaisie({}), [BOX, MAC], []), {
    depot: "Choose the project's GitHub repository — `<owner>/<name>`.",
    base: "The integration branch is missing: the branch the kitchen delivers to.",
    stations: "Choose at least one station to serve this project.",
    principale: "Choose its main station: the one that runs its manager and its pass.",
    cooks: "How many cooks may the main station run at once for this project?",
    "manager-modele": "Choose the manager's model.",
    "manager-effort": "Choose the manager's effort.",
    "reviewer-modele": "Choose the reviewer's model.",
    "reviewer-effort": "Choose the reviewer's effort.",
  });
  assert.deepEqual(refusDeSaisie(lireSaisie({ ...SAISIE, depot: "parade", principale: "g9", cooks: "0" }), [BOX, MAC], []), {
    depot: "“parade” is not a GitHub repository: expected `<owner>/<name>`.",
    principale: "The main station must be one of the chosen stations.",
    cooks: "The number of cooks is a whole number, 1 or more.",
  });
  assert.deepEqual(refusDeSaisie(lireSaisie({ ...SAISIE, stations: ["g1", "g7"] }), [BOX, MAC], ["parade"]), {
    depot: "A project named parade is already on your stations: remove it first.",
    stations: "A chosen station is no longer paired with this app.",
  });
});

describe("l'ajout, la lecture et le retrait d'un projet, contre un GitHub de test", { concurrency: 7 }, () => {
  test("ajouté : la demande s'écrit dans le gist de chaque station choisie, la principale marquée — telle que la station la lit", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, MAC, ETEINTE]);
    assert.deepEqual(await projets.ajouter(SAISIE), { ajoute: "parade" });
    const attendu = { nom: "parade", depot: "benomite/parade", base: "main", cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OUVERT, demandeLe: "2026-10-15T12:01:00.000Z" };
    assert.deepEqual(demande("g1"), [{ ...attendu, principale: true }]);
    assert.deepEqual(demande("g2"), [{ ...attendu, principale: false }]);
    assert.equal(demande("g3"), undefined);
    // Le même projet ne s'ajoute pas deux fois.
    assert.deepEqual(await projets.ajouter(SAISIE), { signales: { depot: "A project named parade is already on your stations: remove it first." } });
  });

  test("une saisie incomplète n'écrit rien ; GitHub muet, le refus le dit en une ligne", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande, panne } = unGitHub(t);
    const rendu = await projets.ajouter({ ...SAISIE, cooks: "" });
    assert.deepEqual(rendu, { signales: { cooks: "How many cooks may the main station run at once for this project?" } });
    assert.equal(demande("g1"), undefined);
    panne();
    const refuse = await projets.ajouter(SAISIE);
    assert.ok("refus" in refuse && /^parade was not added: GitHub could not be read or written — error connecting to api\.github\.com$/.test(refuse.refus), JSON.stringify(refuse));
  });

  test("ce que chaque station dit du projet se lit sous lui : servi, et en combien de temps depuis le parcours ouvert ; à autoriser, avec ses pages", { skip: SANS_POSIX }, async (t) => {
    const { projets, suivre } = unGitHub(t);
    await projets.ajouter(SAISIE);
    const avant = await projets.relire();
    assert.deepEqual(
      avant.projets[0]?.stations.map(({ nom, principale, etat }) => [nom, principale, etat]),
      [
        ["box", true, "attendu"],
        ["macbook", false, "attendu"],
      ],
    );
    assert.equal(avant.recommandee, "g1");
    assert.deepEqual(Object.keys(avant.avertissements), ["g2"]);
    // Ce que l'écran de confiance propose : chaque station lisible, et le calibrage de parade, confié à l'instant.
    assert.deepEqual(Object.keys(avant.machines), ["g1", "g2"]);
    assert.deepEqual(avant.calibrage, { manager: SAISIE.manager, reviewer: SAISIE.reviewer, dit: "what parade runs on, your project most recently given to a station" });

    const pages = ["https://github.com/apps/brigade-cook/installations/new"];
    suivre("g1", [{ nom: "parade", etat: "a-autoriser", dit: "authorize brigade on benomite/parade, on GitHub: one click per page", autoriser: [...pages, "https://ailleurs.example/piege"], serviLe: null }]);
    suivre("g2", [{ nom: "parade", etat: "secondaire", dit: "not its main station: it runs neither its manager nor its pass", autoriser: [], serviLe: null }]);
    const aAutoriser = await projets.relire();
    assert.deepEqual(aAutoriser.projets[0]?.stations[0]?.autoriser, pages);
    assert.deepEqual(projets.pages(), pages);
    assert.equal(aAutoriser.projets[0]?.servi, null);

    suivre("g1", [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:03:05.000Z" }]);
    const servi = await projets.relire();
    assert.equal(servi.projets[0]?.stations[0]?.etat, "servi");
    assert.equal(servi.projets[0]?.servi, "served by box 3 min 05 s after “add a project” was opened");
    assert.deepEqual(projets.pages(), []);

    // Un clone en échec (#1390) : la page GitHub de son geste s'ouvre, même sans onboarding publié ; une autre, jamais.
    const jetons = "https://github.com/settings/personal-access-tokens";
    const clone = { cause: "token-excludes-repository", raison: "The token used by box does not include benomite/parade.", geste: "Add benomite/parade to the repositories of the token used by box.", ou: "On GitHub.", liens: [jetons, "https://ailleurs.example/piege"], compte: "box", detail: "fatal: repository not found", reessaieToutesLes: 30 };
    suivre("g1", [{ nom: "parade", etat: "refuse", dit: `${clone.raison} ${clone.geste}`, autoriser: [], serviLe: null, clone }]);
    const sansCopie = await projets.relire();
    assert.deepEqual(sansCopie.projets[0]?.clone?.liens, [jetons]);
    assert.deepEqual(projets.pages(), [jetons]);

    // Ses blocages (#1394, #1399) : chacun sous le projet, et la page de GitHub où le lever s'ouvre ; une autre, jamais.
    const reglages = "https://github.com/benomite/parade/settings/access";
    const blocages = [
      { id: "access", message: "box cannot push to benomite/parade.", cause: "Its account only reads this repository.", link: reglages },
      { id: "piege", message: "Something else blocks parade.", cause: "A page outside GitHub.", link: "https://ailleurs.example/piege" },
    ];
    suivre("g1", [{ nom: "parade", etat: "en-preparation", dit: "", autoriser: [], serviLe: null, blocages }]);
    const bloque = await projets.relire();
    assert.deepEqual(bloque.projets[0]?.blocages?.map(({ id, link }) => [id, link]), [["access", reglages], ["piege", undefined]]);
    assert.deepEqual(projets.pages(), [reglages]);
    suivre("g1", [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:03:05.000Z" }]);
    assert.equal((await projets.relire()).projets[0]?.blocages, undefined, "levés, ils quittent le projet");
  });

  test("l'onboarding que la principale publie se lit sous le projet (#1111), et ses pages de GitHub s'ouvrent ; celui d'une secondaire, jamais", { skip: SANS_POSIX }, async (t) => {
    const { projets, gist, repertoire } = unGitHub(t);
    await projets.ajouter(SAISIE);
    const issue = "https://github.com/benomite/parade/issues/7";
    const pr = "https://github.com/benomite/parade/pull/8";
    const onboarding = {
      etat: "en-cours",
      termine: false,
      courante: "preparation",
      etapes: [
        { etape: "depot", titre: "Repository", etat: "faite", dit: "benomite/parade is authorized and cloned on box.", geste: null },
        { etape: "machine", titre: "Cooking machine", etat: "faite", dit: "box cooks parade.", geste: null },
        { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The preparation PR awaits you: no other ticket leaves before its merge.", geste: { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr, "https://ailleurs.example/piege"] } },
        { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: "Once benomite/parade is prepared, post your first ticket with the `fire` label.", geste: null },
      ],
      preparation: { ticket: 7, url: issue, etat: "a-relire", raison: null, prochainEssai: null, pr },
      sansBacASable: false,
    };
    // Ce que la station écrit (runtime/src/projets/demande.ts, `documentDeSuivi`) : l'onboarding à côté de la liste.
    const ecrire = (id: string, contenu: object) => {
      const lu = gist(id);
      lu.files[FICHIER_SUIVI] = { filename: FICHIER_SUIVI, content: JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-15T12:02:00Z", projets: [{ nom: "parade", etat: "servi", dit: "served", autoriser: [], serviLe: null }], ...contenu }) };
      writeFileSync(join(repertoire, `${id}.gist.json`), JSON.stringify(lu));
    };
    ecrire("g2", { onboarding: { parade: { ...onboarding, etat: "pret", termine: true } } });
    assert.equal((await projets.relire()).projets[0]?.onboarding, undefined, "une secondaire n'en dit rien qui compte");
    ecrire("g1", { onboarding: { parade: onboarding } });
    const lu = (await projets.relire()).projets[0]?.onboarding;
    assert.equal(lu?.courante, "preparation");
    assert.deepEqual(lu?.etapes.map(({ etat }) => etat), ["faite", "faite", "courante", "a-venir"]);
    assert.deepEqual(lu?.etapes[2]?.geste, { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr] });
    assert.deepEqual(lu?.preparation, { ticket: 7, url: issue, etat: "a-relire", raison: null, prochainEssai: null, pr });
    assert.deepEqual(projets.pages().sort(), [issue, pr].sort());
  });

  test("retiré : le projet quitte la demande de chacune de ses stations, les autres projets restent", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t);
    await projets.ajouter(SAISIE);
    await projets.ajouter({ ...SAISIE, depot: "benomite/espace", stations: ["g1"] });
    assert.deepEqual(await projets.retirer("parade"), { retire: "parade" });
    assert.deepEqual(
      demande("g1")?.map(({ nom }) => nom),
      ["espace"],
    );
    assert.deepEqual(demande("g2"), []);
    assert.deepEqual(await projets.retirer("parade"), { refus: "parade is on none of your stations" });
  });

  test("les dépôts du chef : les plus récents d'abord, ni archivés ni forks, avec leur branche par défaut ; GitHub muet, le refus le dit", { skip: SANS_POSIX }, async (t) => {
    const { projets, depots, panne } = unGitHub(t);
    depots([
      { full_name: "benomite/parade", default_branch: "main" },
      { full_name: "benomite/vieux", default_branch: "master", archived: true },
      { full_name: "benomite/fourche", default_branch: "main", fork: true },
      { full_name: "benomite/brigade", default_branch: "v2" },
    ]);
    assert.deepEqual(await projets.depots(), {
      depots: [
        { depot: "benomite/parade", base: "main" },
        { depot: "benomite/brigade", base: "v2" },
      ],
    });
    panne();
    assert.deepEqual(await projets.depots(), { refus: "your repositories could not be read on GitHub — error connecting to api.github.com" });
  });

  // La page d'un projet de l'app le confie à des stations (#983) : à une première, ou à une de plus.
  const CONFIANCE = { ...SAISIE, nom: "parade", stations: ["g1"] };
  const ATTENDU = { nom: "parade", depot: "benomite/parade", base: "main", cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OUVERT, demandeLe: "2026-10-15T12:01:00.000Z" };

  test("confier un projet à sa première station : elle en devient la principale, avec le plafond et le calibrage choisis", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, MAC]);
    assert.deepEqual(await projets.confier(CONFIANCE), { ajoute: "parade" });
    assert.deepEqual(demande("g1"), [{ ...ATTENDU, principale: true }]);
    assert.equal(demande("g2"), undefined);
  });

  test("le nom est celui du projet dans l'app, pas celui que son dépôt donnerait", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX]);
    assert.deepEqual(await projets.confier({ ...CONFIANCE, nom: "mon-parade" }), { ajoute: "mon-parade" });
    assert.equal(demande("g1")?.[0]?.nom, "mon-parade");
    assert.deepEqual(refusDeConfiance(lireConfiance({ ...CONFIANCE, nom: "Mon Parade" }), [BOX], { portee: [], principale: false }).nom, "“Mon Parade” cannot be a project's name on a station: lowercase letters, digits and dashes.");
  });

  test("une station de plus reprend ce que l'app a déjà demandé, sans principale : ni plafond ni calibrage à redire, et celle d'avant ne bouge pas", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, MAC]);
    await projets.confier(CONFIANCE);
    const avant = demande("g1");
    const ajout = { nom: "parade", depot: "benomite/parade", base: "main", stations: ["g2"], principale: "", cooks: "", manager: { modele: "", effort: "" }, reviewer: { modele: "", effort: "" }, ouvertLe: OUVERT };
    assert.deepEqual(await projets.confier(ajout), { ajoute: "parade" });
    assert.deepEqual(demande("g2"), [{ ...ATTENDU, principale: false }]);
    assert.deepEqual(demande("g1"), avant);
  });

  test("une station qui porte déjà le projet ne se choisit pas une seconde fois, et un projet qui a sa principale n'en prend pas d'autre", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, MAC]);
    await projets.confier(CONFIANCE);
    assert.deepEqual(await projets.confier({ ...CONFIANCE, stations: ["g1", "g2"], principale: "g2" }), {
      signales: {
        stations: "box already cooks it: choose another station.",
        principale: "It already has its main station: the stations you add run neither its manager nor its pass.",
      },
    });
    assert.equal(demande("g2"), undefined);
  });

  test("un projet qu'une station sert sans l'app a déjà sa principale : une station de plus est secondaire, et dit son plafond et son calibrage", { skip: SANS_POSIX }, async (t) => {
    const SERT: StationVue = { ...BOX, projets: ["parade"] };
    const { projets, demande } = unGitHub(t, [SERT, MAC]);
    const ajout = { ...CONFIANCE, stations: ["g2"], principale: "" };
    assert.deepEqual(await projets.confier({ ...ajout, cooks: "" }), { signales: { cooks: "box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["cooks"] });
    assert.deepEqual(await projets.confier({ ...ajout, stations: ["g1"] }), { signales: { stations: "box already cooks it: choose another station." } });
    assert.deepEqual(await projets.confier(ajout), { ajoute: "parade" });
    assert.deepEqual(demande("g2"), [{ ...ATTENDU, principale: false }]);
    assert.equal(demande("g1"), undefined);
  });

  const SANS_RIEN = { nom: "parade", depot: "", base: "", stations: ["g2"], principale: "", cooks: "", manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OUVERT };
  const SERVI = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: "2026-10-15T11:30:00Z" };

  test("une station de plus d'un projet que la première sert sans l'app reprend son dépôt, sa branche et son plafond : le chef n'en dit aucun", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande, suivre } = unGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    suivre("g1", [{ ...SERVI, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projets.confier(SANS_RIEN), { ajoute: "parade" });
    const ecrit = demande("g2")?.[0];
    assert.deepEqual([ecrit?.depot, ecrit?.base, ecrit?.cooks, ecrit?.principale], ["benomite/parade", "v2", 3, false]);
    assert.equal(demande("g1"), undefined);
  });

  test("ce que la première station sert l'emporte sur le dépôt et la branche que la saisie dit ; les cooks sont ceux de la machine ajoutée", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande, suivre } = unGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    suivre("g1", [{ ...SERVI, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projets.confier({ ...SANS_RIEN, cooks: "trois" }), { signales: { cooks: "The number of cooks is a whole number, 1 or more." } });
    assert.deepEqual(await projets.confier({ ...SANS_RIEN, depot: "autre/depot", base: "main", cooks: "9" }), { ajoute: "parade" });
    const ecrit = demande("g2")?.[0];
    assert.deepEqual([ecrit?.depot, ecrit?.base, ecrit?.cooks], ["benomite/parade", "v2", 9]);
  });

  test("une valeur que la première station ne dit pas est nommée, champ par champ, au lieu du refus générique", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande, suivre } = unGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    suivre("g1", [{ ...SERVI, base: "v2", cooks: 3 }]);
    const sans = await projets.confier(SANS_RIEN);
    assert.deepEqual(sans, { signales: { depot: "box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] });
    suivre("g1", [{ ...SERVI, depot: "benomite/parade", cooks: 3 }]);
    assert.deepEqual(await projets.confier(SANS_RIEN), { signales: { base: "box does not say which integration branch it delivers to for parade, and neither does its folder on this computer." }, manque: ["base"] });
    suivre("g1", [{ ...SERVI, depot: "benomite/parade", base: "v2" }]);
    assert.deepEqual(await projets.confier(SANS_RIEN), { signales: { cooks: "box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["cooks"] });
    assert.equal(demande("g2"), undefined);
    // Donnée par le chef, la valeur manquante suffit.
    assert.deepEqual(await projets.confier({ ...SANS_RIEN, cooks: "2" }), { ajoute: "parade" });
    assert.equal(demande("g2")?.[0]?.cooks, 2);
  });

  // Ajouter une station ne demande que ce qui est à sa machine (#1307) : le dépôt et la branche que la première ne dit
  // pas, le clone du projet sur cet ordinateur les dit — lu par l'opération même du runtime (#1306).
  test("une station de plus prend au clone du projet sur cet ordinateur le dépôt et la branche que la première ne dit pas", { skip: SANS_POSIX }, async (t) => {
    const clone = mkdtempSync(join(tmpdir(), "brigade-app-clone-"));
    t.after(() => rmSync(clone, { recursive: true, force: true }));
    execFileSync("git", ["init", "--quiet", clone]);
    execFileSync("git", ["-C", clone, "remote", "add", "origin", "https://github.com/benomite/parade.git"]);
    writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `v2`\n");
    const lus: string[] = [];
    const { projets, demande } = unGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC], {
      leClone: async (nom) => {
        lus.push(nom);
        const { depot, base } = await projetDuClone(clone);
        return { depot, base };
      },
    });
    assert.deepEqual(await projets.confier({ ...SANS_RIEN, cooks: "4" }), { ajoute: "parade" });
    const ecrit = demande("g2")?.[0];
    assert.deepEqual([ecrit?.depot, ecrit?.base, ecrit?.cooks, ecrit?.principale], ["benomite/parade", "v2", 4, false]);
    assert.deepEqual(lus, ["parade"]);
    // Rien ne s'écrit dans le clone : il n'est que lu.
    assert.equal(execFileSync("git", ["-C", clone, "status", "--porcelain"], { encoding: "utf8" }), "?? CLAUDE.md\n");
  });

  test("ce que la première dit, ou ce que l'app a déjà demandé, dispense de lire le clone ; un clone illisible se tait", { skip: SANS_POSIX }, async (t) => {
    const lus: string[] = [];
    const { projets, suivre } = unGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC], {
      leClone: async (nom) => {
        lus.push(nom);
        throw new Error("not a git repository");
      },
    });
    suivre("g1", [{ ...SERVI, base: "v2", cooks: 3 }]);
    assert.deepEqual(await projets.confier(SANS_RIEN), { signales: { depot: "box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] });
    assert.deepEqual(lus, ["parade"]);
    suivre("g1", [{ ...SERVI, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projets.confier(SANS_RIEN), { ajoute: "parade" });
    assert.deepEqual(lus, ["parade"]);
  });

  test("les capacités cochées partent dans la demande de la station ajoutée, et seulement la sienne ; une autre écriture les garde", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, MAC]);
    await projets.confier(CONFIANCE);
    const ajout = { ...SANS_RIEN, depot: "benomite/parade", base: "main", cooks: "5", capacites: ["navigateur-headless", "android", "navigateur-headless", "pas une capacité", 7] };
    assert.deepEqual(await projets.confier(ajout), { ajoute: "parade" });
    assert.deepEqual(demande("g2")?.[0]?.fournit, ["navigateur-headless", "android"]);
    assert.equal(demande("g2")?.[0]?.cooks, 5);
    assert.equal("fournit" in (demande("g1")?.[0] ?? {}), false);
    // Un autre projet confié à la même station réécrit sa demande : ce que parade y déclare reste.
    assert.deepEqual(await projets.confier({ ...CONFIANCE, nom: "cantine", depot: "benomite/cantine", stations: ["g2"], principale: "g2" }), { ajoute: "cantine" });
    assert.deepEqual(demande("g2")?.find(({ nom }) => nom === "parade")?.fournit, ["navigateur-headless", "android"]);
  });

  test("ce que l'appairage d'un Mac dit qu'il fournit part dans sa demande quand il est ajouté au projet, avec ce que le chef a coché (#1757)", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande } = unGitHub(t, [BOX, { ...MAC, fournit: ["macos", "docker"] }]);
    await projets.confier(CONFIANCE);
    assert.equal("fournit" in (demande("g1")?.[0] ?? {}), false, "la box n'en dit rien : sa demande non plus");
    assert.deepEqual(await projets.confier({ ...SANS_RIEN, depot: "benomite/parade", base: "main", cooks: "3", capacites: ["navigateur-headless", "docker"] }), { ajoute: "parade" });
    const ecrit = demande("g2")?.[0];
    assert.deepEqual([ecrit?.principale, ecrit?.fournit], [false, ["navigateur-headless", "docker", "macos"]]);
  });

  test("un Mac ajouté avant que son appairage ne dise ce qu'il fournit : sa demande le reprend à la lecture suivante, sans geste du chef (#1757)", { skip: SANS_POSIX }, async (t) => {
    const mac: StationVue = { ...MAC };
    const { projets, demande } = unGitHub(t, [BOX, mac]);
    await projets.confier(CONFIANCE);
    await projets.confier({ ...SANS_RIEN, depot: "benomite/parade", base: "main", cooks: "3", capacites: ["docker"] });
    assert.deepEqual(demande("g2")?.[0]?.fournit, ["docker"]);
    await projets.relire();
    assert.deepEqual(demande("g2")?.[0]?.fournit, ["docker"], "rien à reprendre : rien n'est réécrit");
    mac.fournit = ["macos"];
    await projets.relire();
    // La reprise passe à la suite des gestes du chef : un retrait qui ne trouve rien la suit, et n'écrit rien.
    assert.deepEqual(await projets.retirer("absent"), { refus: "absent is on none of your stations" });
    assert.deepEqual(demande("g2")?.[0]?.fournit, ["docker", "macos"]);
    assert.equal("fournit" in (demande("g1")?.[0] ?? {}), false);
  });

  test("la station ajoutée est dite atteinte, ou pas et pourquoi, telle que la principale la tient (#1756, #1757)", { skip: SANS_POSIX }, async (t) => {
    const { projets, suivre } = unGitHub(t);
    await projets.confier(CONFIANCE);
    await projets.confier({ ...SANS_RIEN, depot: "benomite/parade", base: "main", cooks: "3" });
    suivre("g2", [{ nom: "parade", etat: "secondaire", dit: "not its main station", autoriser: [], serviLe: null }]);
    const lue = async () => (await projets.relire()).projets[0]?.stations.find(({ id }) => id === "g2");
    assert.equal((await lue())?.atteinte, undefined, "la principale n'en dit rien encore");
    const tenue = { nom: "macbook", station: "macbook/claude", gist: "g2", cooks: 3, fournit: ["code", "raisonnement", "macos"] };
    suivre("g1", [{ ...SERVI, secondaires: [{ ...tenue, atteinte: true, dit: "reached: it is online on GitHub" }] }]);
    assert.deepEqual((await lue())?.atteinte, { oui: true, dit: "reached: it is online on GitHub" });
    suivre("g1", [{ ...SERVI, secondaires: [{ ...tenue, atteinte: false, dit: "not reached: it stopped at 2026-10-15T11:50:00.000Z" }] }]);
    assert.deepEqual((await lue())?.atteinte, { oui: false, dit: "not reached: it stopped at 2026-10-15T11:50:00.000Z", pourquoi: "not reached", geste: "open Brigade on that computer" });
    // Le geste que la principale publie (#1758) est celui de la phrase.
    suivre("g1", [{ ...SERVI, secondaires: [{ ...tenue, atteinte: false, dit: "not reached: it stopped at 2026-10-15T11:50:00.000Z", raison: "arretee", geste: "start Brigade on that computer again" }] }]);
    assert.deepEqual([(await lue())?.atteinte?.pourquoi, (await lue())?.atteinte?.geste], ["not reached", "start Brigade on that computer again"]);
    // Une secondaire illisible, ou celle d'une autre station, ne dit rien de celle-ci.
    suivre("g1", [{ ...SERVI, secondaires: [{ ...tenue, gist: "g9", atteinte: true, dit: "reached" }, { ...tenue, atteinte: "oui", dit: "reached" }] }]);
    assert.equal((await lue())?.atteinte, undefined);
  });

  test("rien de choisi, rien d'écrit ; GitHub muet, le refus le dit en une ligne", { skip: SANS_POSIX }, async (t) => {
    const { projets, demande, panne } = unGitHub(t, [BOX]);
    assert.deepEqual(await projets.confier({ ...CONFIANCE, stations: [], principale: "" }), {
      signales: { stations: "Choose at least one station to cook parade.", principale: "Choose its main station: the one that runs its manager and its pass." },
    });
    assert.equal(demande("g1"), undefined);
    panne();
    const refuse = await projets.confier(CONFIANCE);
    assert.ok("refus" in refuse && /^parade was not entrusted to a station: GitHub could not be read — error connecting to api\.github\.com$/.test(refuse.refus), JSON.stringify(refuse));
  });
});

test("l'app ne joint aucune station : ce module ne parle qu'au `gh` du poste", () => {
  for (const fichier of ["projets.ts", "github.ts", "demande.ts"]) {
    const source = readFileSync(join(SOURCES, fichier), "utf8");
    assert.doesNotMatch(source, /node:(net|http|https|dgram|tls)|fetch\(|WebSocket|\bssh\b/, fichier);
  }
});

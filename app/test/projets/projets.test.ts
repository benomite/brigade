// « Add a project » : l'app écrit la demande dans le gist de chaque station choisie, relit ce que
// chacune en dit, et retire le projet de toutes. Contre une doublure de `gh` qui tient les gists du
// compte et ses dépôts dans un répertoire : ni réseau, ni GitHub, ni station — GitHub est le seul
// canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { FICHIER_PROJETS, FICHIER_SUIVI } from "../../src/projets/demande.ts";
import { depotsDuChef } from "../../src/projets/github.ts";
import { avertissement, estUnOrdinateur, lireSaisie, nomDuProjet, principaleRecommandee, refusDeSaisie, tenirProjets, type VuDesProjets } from "../../src/projets/projets.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";

const FAUX_GH = join(import.meta.dirname, "faux-gh.ts");
const SOURCES = join(import.meta.dirname, "../../src/projets");
const MAINTENANT = Date.parse("2026-10-15T12:01:00Z");
const OUVERT = "2026-10-15T12:00:00.000Z";

const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project" };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project" };
const ETEINTE: StationVue = { id: "g3", nom: "vieux", machine: "Linux 5.10", etat: "hors-ligne", ligne: "offline for 3 min · version 1.3.0 · no project" };

const SAISIE = {
  depot: "benomite/parade",
  base: "main",
  stations: ["g1", "g2"],
  principale: "g1",
  cooks: "2",
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: OUVERT,
};

// GitHub : les gists des stations et les dépôts du compte, dans un répertoire que la doublure lit et écrit.
function unGitHub(t: TestContext, stations: StationVue[] = [BOX, MAC]) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-projets-"));
  writeFileSync(join(repertoire, "appels"), "");
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => {
    if (avant === undefined) delete process.env.FAUX_GISTS;
    else process.env.FAUX_GISTS = avant;
    rmSync(repertoire, { recursive: true, force: true });
  });
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
    github: githubDesStations({ gh: FAUX_GH, delaiMs: 30_000 }),
    stations: () => stations,
    depots: depotsDuChef({ gh: FAUX_GH, delaiMs: 30_000 }),
    surLecture: (vu) => lectures.push(vu),
    maintenant: () => MAINTENANT,
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

test("ajouté : la demande s'écrit dans le gist de chaque station choisie, la principale marquée — telle que la station la lit", async (t) => {
  const { projets, demande } = unGitHub(t, [BOX, MAC, ETEINTE]);
  assert.deepEqual(await projets.ajouter(SAISIE), { ajoute: "parade" });
  const attendu = { nom: "parade", depot: "benomite/parade", base: "main", cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OUVERT, demandeLe: "2026-10-15T12:01:00.000Z" };
  assert.deepEqual(demande("g1"), [{ ...attendu, principale: true }]);
  assert.deepEqual(demande("g2"), [{ ...attendu, principale: false }]);
  assert.equal(demande("g3"), undefined);
  // Le même projet ne s'ajoute pas deux fois.
  assert.deepEqual(await projets.ajouter(SAISIE), { signales: { depot: "A project named parade is already on your stations: remove it first." } });
});

test("une saisie incomplète n'écrit rien ; GitHub muet, le refus le dit en une ligne", async (t) => {
  const { projets, demande, panne } = unGitHub(t);
  const rendu = await projets.ajouter({ ...SAISIE, cooks: "" });
  assert.deepEqual(rendu, { signales: { cooks: "How many cooks may the main station run at once for this project?" } });
  assert.equal(demande("g1"), undefined);
  panne();
  const refuse = await projets.ajouter(SAISIE);
  assert.ok("refus" in refuse && /^parade was not added: GitHub could not be read or written — error connecting to api\.github\.com$/.test(refuse.refus), JSON.stringify(refuse));
});

test("ce que chaque station dit du projet se lit sous lui : servi, et en combien de temps depuis le parcours ouvert ; à autoriser, avec ses pages", async (t) => {
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
});

test("retiré : le projet quitte la demande de chacune de ses stations, les autres projets restent", async (t) => {
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

test("les dépôts du chef : les plus récents d'abord, ni archivés ni forks, avec leur branche par défaut ; GitHub muet, le refus le dit", async (t) => {
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

test("l'app ne joint aucune station : ce module ne parle qu'au `gh` du poste", () => {
  for (const fichier of ["projets.ts", "github.ts", "demande.ts"]) {
    const source = readFileSync(join(SOURCES, fichier), "utf8");
    assert.doesNotMatch(source, /node:(net|http|https|dgram|tls)|fetch\(|WebSocket|\bssh\b/, fichier);
  }
});

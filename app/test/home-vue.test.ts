// L'accueil, la vue jouée (#870) : une ligne par projet — sa pastille, son nom, ce qui s'y passe —, que
// tout un clic ouvre, et qui ne porte aucun autre geste ; la ligne de santé en bas ; et rien de ce qui
// a quitté l'accueil : le code de l'app, les blocs par projet, les projets des stations, l'ajout d'un
// projet, une commande, le texte brut d'une erreur. Ce que les lignes disent se calcule dans
// home.ts (home.test.ts) : ici, ce que la vue en pose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdHome, type Home } from "../src/home.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { HEADINGS } from "../src/tabs.ts";
import type { Seen as SeenOfCode } from "../src/delay.ts";
import type { SeenOfProjects } from "../src/projects/projects.ts";
import type { SeenOfStations } from "../src/stations/stations.ts";
import { type Fake, playTheVue, repos } from "./helpers/false-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
const PROJECTS: Project[] = [
  { nom: "brigade", dossier: "/tmp/brigade" },
  { nom: "espace", dossier: "/tmp/espace" },
  { nom: "calculus", dossier: "/tmp/calculus" },
];
const HOME: Home = {
  projets: [
    { nom: "brigade", ton: "jaune", dit: "1 decision awaits you · #867 cooking", survol: "read at 12:00:00 PM — open it to act", attend: 1 },
    { nom: "espace", ton: "jaune", dit: "5 decisions await you, for 2 d", survol: "read at 12:00:00 PM — open it to act", attend: 5 },
    { nom: "calculus", ton: "rouge", dit: "base red · #655 being repaired", survol: "read at 12:00:00 PM — open it to act" },
  ],
  stations: [{ id: "g1", nom: "parade-box", ton: "vert", dit: "online · 2 cooks · brigade, espace, calculus", phrase: "online · 2 cooks running", survol: "Linux 6.1.0 · version 1.4.0" }],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "Max: …\nGitHub: …" },
};
// Le code de l'app en retard : ce qui, avant, s'écrivait en tête de l'accueil, avec sa commande.
const CODE: SeenOfCode = { a: A, clones: [{ id: "app", etat: "en-retard", tete: "this app's code is 3 commits behind origin/v2", lignes: ["the app relaunches on the new version"], commande: "git -C /tmp/brigade pull" }], alerte: "this app's code is 3 commits behind" } as unknown as SeenOfCode;

const startup = (home: Home | undefined = HOME, code: SeenOfCode | undefined = CODE, stations?: SeenOfStations) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code,
  ...(home === undefined ? {} : { accueil: home }),
  ...(stations === undefined ? {} : { stations }),
});

// L'état que la ligne dit des quatre (home/projects/), d'après la pastille que l'accueil lui donne.
const STATE_SAYS: Record<string, string> = { jaune: "waiting for the chef", rouge: "held" };
const theLines = (section: Fake) => section.children.filter(({ className }) => className === "ligne");
// Ce qui se lit à l'écran : les textes posés, sans ce qui ne s'y voit qu'au survol.
const visible = (pose: Fake) => pose.textContent.replace(/\s+/g, " ");

async function theHome(home?: Home) {
  const vue = await playTheVue({ demarrage: () => startup(home), espace: () => [] });
  return { vue, projets: () => vue.element("accueil-projets") };
}

test("l'accueil montre une ligne par projet, dans l'ordre du fichier : sa pastille, son nom et ce qui s'y passe", async () => {
  const { projets: projects } = await theHome();
  assert.deepEqual(
    theLines(projects()).map((line) => ({ ton: line.children[0]?.dataset.ton, nom: line.children[1]?.textContent, dit: line.children[2]?.textContent, survol: line.title })),
    HOME.projets.map(({ ton: your, nom: name, dit: said, survol: hover }) => ({ ton: your, nom: name, dit: STATE_SAYS[your], survol: `${said} — ${hover}` })),
  );
  // La pastille a sa forme, pas sa seule couleur.
  assert.deepEqual(theLines(projects()).map((line) => line.children[0]?.dataset.forme), ["losange", "losange", "carre"]);
});

test("un clic n'importe où sur la ligne ouvre le projet ; la ligne ne porte aucun bouton de geste", async () => {
  const { vue, projets: projects } = await theHome();
  const [, space] = theLines(projects());
  assert.ok(space);
  assert.equal(space.balise, "button", "toute la ligne est ce qui se clique");
  assert.deepEqual(space.dessous("button"), [], "rien d'autre ne se clique dans la ligne");
  assert.deepEqual(projects().dessous("button").filter(({ className }) => className === "ligne"), theLines(projects()), "sous la liste des projets, les lignes sont les seuls boutons de ligne");
  space.click();
  await repos();
  assert.equal(vue.element("espace").textContent, "espace");
  assert.equal(vue.element("tous").hidden, true);
});

test("une station injoignable se dit en une ligne, rouge : ni code de sortie, ni ce que la station a écrit", async () => {
  const { vue, projets: projects } = await theHome({ ...HOME, projets: [] });
  const home = holdHome({ projets: () => PROJECTS.map(({ nom: name }) => ({ nom: name, servi: true })) });
  const seenOne = home.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ node geste.ts brigade facts\nspawn node ENOENT\n→ exit code 255", atteinte: false, cas: null }) ?? assert.fail("rien à redessiner");
  vue.dire("surAccueil", seenOne);
  await repos();
  const [brigade, space] = theLines(projects());
  assert.equal(brigade?.children[0]?.dataset.ton, "rouge");
  assert.equal(brigade?.children[2]?.textContent, "held");
  assert.match(brigade?.title ?? "", /station unreachable/);
  assert.equal(space?.children[2]?.textContent, "idle");
  assert.match(space?.title ?? "", /first read in progress/);
  for (const text of [visible(vue.element("tous")), ...vue.element("tous").dessous("button").map(({ title }) => title)]) assert.doesNotMatch(text, /exit code|ENOENT|spawn/);
});

test("l'accueil s'ouvre sur la promesse, ce qu'elle veut dire, la gratuité et les quatre mots de la cuisine, chacun expliqué (#3219)", async () => {
  const { vue } = await theHome();
  const [promise] = vue.element("tous").children;
  assert.equal(promise?.id, "accueil-promesse");
  assert.equal(promise?.children[0]?.textContent, "You decide. The kitchen ships.");
  assert.match(promise?.children[1]?.textContent ?? "", /write the ticket.*cook takes it.*pass merges it.*only for product choices/);
  assert.equal(promise?.children[2]?.textContent, "Open source, free, no Brigade account — just GitHub and your Claude subscription.");
  const words = promise?.children[3]?.children.map(({ textContent }) => textContent) ?? [];
  assert.deepEqual(words.map((m) => m.split(" — ")[0]), ["rail", "cook", "pass", "second"]);
  for (const m of words) assert.ok((m.split(" — ")[1] ?? "").length > 10, m);
});

test("l'accueil a trois blocs, les projets, la station de cet ordinateur, puis toutes les stations, et rien d'autre (#2638, #3195)", async () => {
  const { vue, projets: projects } = await theHome();
  const all = vue.element("tous");
  assert.deepEqual(
    all.children.slice(1).map(({ id, children }) => [id, children[0]?.children[0]?.textContent ?? children[0]?.textContent]),
    [
      ["accueil-bloc-projets", "Projects"],
      ["accueil-bloc-station", "This computer's station"],
      // Toutes les stations et « + station » valent pour le compte : revenues de l'onglet Stations d'un projet (#3195).
      ["toutes-les-stations", "All stations"],
    ],
  );
  assert.equal(projects().parentElement, all.children[1], "les lignes des projets sont dans leur bloc");
  // Hors de toutes les stations : ni « + station », ni Cost, ni Closer (Kitchen > Health), ni version de l'app, ni santé
  // (retirées) : ni sur l'accueil, ni cachées dans la page.
  for (const other of all.children.slice(1, 3)) assert.doesNotMatch(visible(other), /Stations|\+ station|Cost|Closer|Brigade \d|Max|GitHub/);
  for (const gone of ["de-tous-les-projets", "accueil-app", "sante", "hors-de-l-accueil"]) assert.throws(() => vue.element(gone), gone);
});

test("ce qui a quitté l'accueil n'y est plus : le code de l'app, les blocs par projet, les projets des stations, l'ajout d'un projet — ni commande, ni champ ouvert", async () => {
  const { vue } = await theHome();
  const all = vue.element("tous");
  const text = visible(all);
  for (const gone of [/commits behind/, /what the station said/, /Projects on your stations/, /add a project/, /what awaits you/, /served 24 h|at pass/, /read at/]) assert.doesNotMatch(text, gone);
  assert.deepEqual(all.dessous("article"), []);
  assert.deepEqual(all.dessous("pre"), []);
  assert.doesNotMatch(text, /\b(brigade|gh|git)\s+(-|\S+\s)/);
  // Un seul champ, replié : celui du code d'appairage, sous « + station », dans toutes les stations (#3195).
  assert.deepEqual(all.dessous("input").map(({ ariaLabel, parentElement }) => [ariaLabel, parentElement?.hidden, parentElement?.parentElement?.id]), [["pairing code", true, "toutes-les-stations"]]);
  // Le code de l'app est dans Settings, sous cette machine (#1700), et au survol de « T ».
  assert.equal(vue.element("code").parentElement, vue.element("reglages-machine"));
  assert.match(vue.element("projets").children[0]?.title ?? "", /^All projects — this app's code is 3 commits behind$/);
});

// Une page vit tant que sa fenêtre est ouverte, ses minuteries avec elle ; une vue jouée ne se ferme
// jamais. Si les siennes retenaient le process, un `node --test` à la main sur ce fichier — ou sur
// n'importe lequel qui joue la vue — ne rendrait jamais la main (#2537).
test("la vue jouée ne retient pas le process : ses minuteries n'ajoutent rien de ce qui le tient en vie", async () => {
  const heldEntries = () => process.getActiveResourcesInfo().filter((type) => type === "Timeout").length;
  const before = heldEntries();
  await theHome();
  assert.equal(heldEntries(), before);
});

test("le bloc Projects de l'accueil : un seul bouton par ligne, son état et ses stations ; « Add a project » ouvre l'écran d'ajout", async () => {
  const stations = { stations: [{ id: "s1", nom: "parade-box", machine: "", etat: "en-ligne", ligne: "", dit: "online", version: "", projets: ["brigade", "espace"], max: null }], projets: [] } as unknown as SeenOfStations;
  const vue = await playTheVue({ demarrage: () => startup(HOME, undefined, stations), espace: () => [] });
  const block = vue.element("accueil-projets");
  const [brigade] = theLines(block);
  assert.deepEqual(brigade?.children.map((c) => c.textContent).filter((t) => t !== ""), ["brigade", "waiting for the chef", "1 decision awaits you · #867 cooking", "1 awaiting you", "›"]);
  assert.match(brigade?.ariaLabel ?? "", /parade-box$/, "ses stations se lisent dans le nom de la ligne");
  assert.deepEqual(brigade?.dessous("button"), [], "la ligne est un seul bouton");
  const addition = vue.element("tous").dessous("button").find(({ textContent }) => textContent === "Add a project");
  assert.ok(addition, "« Add a project » est sur l'accueil");
  addition.click();
  await repos();
  assert.equal(vue.element("ajout").hidden, false, "l'écran d'ajout s'ouvre");
  assert.equal(vue.element("ajout").dessous("section").length > 0, true);
});

test("le bloc de la station, dans la vue jouée : sans id local il n'est pas installé, avec lui il lie sa page et liste les autres (#2640)", async () => {
  const { vue } = await theHome();
  const block = () => vue.element("accueil-bloc-station");
  const station = (id: string, name: string) => ({ id, nom: name, machine: "m", etat: "en-ligne" as const, ligne: "online", dit: "", version: "1.4.0", projets: [], max: null });
  const buttons = () => block().dessous("button").map(({ textContent }) => textContent);
  vue.dire("surStations", { a: A, stations: [station("g1", "Mac"), station("g2", "box")] });
  await repos();
  assert.deepEqual(buttons(), ["Install this computer's station"], "locale inconnue : installer, jamais « Station settings » sur un id vide");
  vue.dire("surProjetsDesStations", { a: A, locale: "g1", projets: [] } as unknown as SeenOfProjects);
  await repos();
  assert.ok(buttons().includes("Station settings"));
  assert.ok(!buttons().includes("Install this computer's station"));
  assert.match(block().textContent, /Mac/);
  assert.ok(buttons().includes("box online") || block().textContent.includes("box"));
});

test("la ligne d'un projet dit ce qui s'y passe et, quand le chef est attendu, combien de décisions — et « Add a project » est à droite du titre (#2912)", async () => {
  const { vue, projets: projects } = await theHome();
  const lines = theLines(projects());
  const awaiting = (line: Fake) => line.children.filter(({ className }) => className === "attend").map(({ textContent }) => textContent);
  assert.deepEqual(lines.map(awaiting), [["1 awaiting you"], ["5 awaiting you"], []], "une pastille par projet que le chef attend, aucune pour les autres");
  assert.equal(lines[0]?.children.find(({ className }) => className === "maintenant")?.textContent, "1 decision awaits you · #867 cooking");
  const block = vue.element("tous").children[1] as Fake;
  const header = block.children[0] as Fake;
  assert.deepEqual(header.children.map(({ textContent }) => textContent), ["Projects", "Add a project"], "le bouton est dans l'en-tête du bloc");
  assert.equal(projects().dessous("button").filter(({ className }) => className !== "ligne").length, 0, "plus de bouton sous la liste");
});

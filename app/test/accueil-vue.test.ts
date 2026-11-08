// L'accueil, la vue jouée (#870) : une ligne par projet — sa pastille, son nom, ce qui s'y passe —, que
// tout un clic ouvre, et qui ne porte aucun autre geste ; la ligne de santé en bas ; et rien de ce qui
// a quitté l'accueil : le code de l'app, les blocs par projet, les projets des stations, l'ajout d'un
// projet, une commande, le texte brut d'une erreur. Ce que les lignes disent se calcule dans
// accueil.ts (accueil.test.ts) : ici, ce que la vue en pose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirAccueil, type Accueil } from "../src/accueil.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Vu as VuDuCode } from "../src/retard.ts";
import type { VuDesProjets } from "../src/projets/projets.ts";
import type { VuDesStations } from "../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
const PROJETS: Projet[] = [
  { nom: "brigade", dossier: "/tmp/brigade" },
  { nom: "espace", dossier: "/tmp/espace" },
  { nom: "calculus", dossier: "/tmp/calculus" },
];
const ACCUEIL: Accueil = {
  projets: [
    { nom: "brigade", ton: "jaune", dit: "1 decision awaits you · #867 cooking", survol: "read at 12:00:00 PM — open it to act" },
    { nom: "espace", ton: "jaune", dit: "5 decisions await you, for 2 d", survol: "read at 12:00:00 PM — open it to act" },
    { nom: "calculus", ton: "rouge", dit: "base red · #655 being repaired", survol: "read at 12:00:00 PM — open it to act" },
  ],
  stations: [{ id: "g1", nom: "parade-box", ton: "vert", dit: "online · 2 cooks · brigade, espace, calculus", phrase: "online · 2 cooks running", survol: "Linux 6.1.0 · version 1.4.0" }],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "Max: …\nGitHub: …" },
};
// Le code de l'app en retard : ce qui, avant, s'écrivait en tête de l'accueil, avec sa commande.
const CODE: VuDuCode = { a: A, clones: [{ id: "app", etat: "en-retard", tete: "this app's code is 3 commits behind origin/v2", lignes: ["the app relaunches on the new version"], commande: "git -C /tmp/brigade pull" }], alerte: "this app's code is 3 commits behind" } as unknown as VuDuCode;

const demarrage = (accueil: Accueil | undefined = ACCUEIL, code: VuDuCode | undefined = CODE, stations?: VuDesStations) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code,
  ...(accueil === undefined ? {} : { accueil }),
  ...(stations === undefined ? {} : { stations }),
});

// L'état que la ligne dit des quatre (accueil/projets/), d'après la pastille que l'accueil lui donne.
const ETAT_DIT: Record<string, string> = { jaune: "waiting for the chef", rouge: "held" };
const lesLignes = (section: Faux) => section.children.filter(({ className }) => className === "ligne");
// Ce qui se lit à l'écran : les textes posés, sans ce qui ne s'y voit qu'au survol.
const visible = (pose: Faux) => pose.textContent.replace(/\s+/g, " ");

async function lAccueil(accueil?: Accueil) {
  const vue = await jouerLaVue({ demarrage: () => demarrage(accueil), espace: () => [] });
  return { vue, projets: () => vue.element("accueil-projets") };
}

test("l'accueil montre une ligne par projet, dans l'ordre du fichier : sa pastille, son nom et ce qui s'y passe", async () => {
  const { projets } = await lAccueil();
  assert.deepEqual(
    lesLignes(projets()).map((ligne) => ({ ton: ligne.children[0]?.dataset.ton, nom: ligne.children[1]?.textContent, dit: ligne.children[2]?.textContent, survol: ligne.title })),
    ACCUEIL.projets.map(({ ton, nom, dit, survol }) => ({ ton, nom, dit: ETAT_DIT[ton], survol: `${dit} — ${survol}` })),
  );
  // La pastille a sa forme, pas sa seule couleur.
  assert.deepEqual(lesLignes(projets()).map((ligne) => ligne.children[0]?.dataset.forme), ["losange", "losange", "carre"]);
});

test("un clic n'importe où sur la ligne ouvre le projet ; la ligne ne porte aucun bouton de geste", async () => {
  const { vue, projets } = await lAccueil();
  const [, espace] = lesLignes(projets());
  assert.ok(espace);
  assert.equal(espace.balise, "button", "toute la ligne est ce qui se clique");
  assert.deepEqual(espace.dessous("button"), [], "rien d'autre ne se clique dans la ligne");
  assert.deepEqual(projets().dessous("button").filter(({ className }) => className === "ligne"), lesLignes(projets()), "sous la liste des projets, les lignes sont les seuls boutons de ligne");
  espace.click();
  await repos();
  assert.equal(vue.element("espace").textContent, "espace");
  assert.equal(vue.element("tous").hidden, true);
});

test("une station injoignable se dit en une ligne, rouge : ni code de sortie, ni ce que la station a écrit", async () => {
  const { vue, projets } = await lAccueil({ ...ACCUEIL, projets: [] });
  const accueil = tenirAccueil({ projets: () => PROJETS.map(({ nom }) => ({ nom, servi: true })) });
  const vu = accueil.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ node geste.ts brigade facts\nspawn node ENOENT\n→ exit code 255", atteinte: false, cas: null }) ?? assert.fail("rien à redessiner");
  vue.dire("surAccueil", vu);
  await repos();
  const [brigade, espace] = lesLignes(projets());
  assert.equal(brigade?.children[0]?.dataset.ton, "rouge");
  assert.equal(brigade?.children[2]?.textContent, "held");
  assert.match(brigade?.title ?? "", /station unreachable/);
  assert.equal(espace?.children[2]?.textContent, "idle");
  assert.match(espace?.title ?? "", /first read in progress/);
  for (const texte of [visible(vue.element("tous")), ...vue.element("tous").dessous("button").map(({ title }) => title)]) assert.doesNotMatch(texte, /exit code|ENOENT|spawn/);
});

test("l'accueil n'a que deux blocs, les projets puis la station de cet ordinateur, et rien d'autre (#2638)", async () => {
  const { vue, projets } = await lAccueil();
  const tous = vue.element("tous");
  assert.deepEqual(
    tous.children.map(({ id, children }) => [id, children[0]?.textContent]),
    [
      ["accueil-bloc-projets", "Projects"],
      ["accueil-bloc-station", "This computer's station"],
    ],
  );
  assert.equal(projets().parentElement, tous.children[0], "les lignes des projets sont dans leur bloc");
  // Ni toutes les stations, ni « + station » (onglet Stations), ni Cost, ni Closer (Kitchen > Health), ni version de l'app,
  // ni santé (retirées) : ni sur l'accueil, ni cachées dans la page.
  assert.doesNotMatch(visible(tous), /Stations|\+ station|Cost|Closer|Brigade \d|Max|GitHub/);
  for (const parti of ["toutes-les-stations", "de-tous-les-projets", "accueil-app", "sante", "hors-de-l-accueil"]) assert.throws(() => vue.element(parti), parti);
});

test("ce qui a quitté l'accueil n'y est plus : le code de l'app, les blocs par projet, les projets des stations, l'ajout d'un projet — ni commande, ni champ ouvert", async () => {
  const { vue } = await lAccueil();
  const tous = vue.element("tous");
  const texte = visible(tous);
  for (const parti of [/commits behind/, /what the station said/, /Projects on your stations/, /add a project/, /what awaits you/, /served 24 h|at pass|awaiting you/, /read at/]) assert.doesNotMatch(texte, parti);
  assert.deepEqual(tous.dessous("article"), []);
  assert.deepEqual(tous.dessous("pre"), []);
  assert.doesNotMatch(texte, /\b(brigade|gh|git)\s+(-|\S+\s)/);
  // Aucun champ : celui du code d'appairage, sous « + station », est dans l'onglet Stations (#2638).
  assert.deepEqual(tous.dessous("input"), []);
  // Le code de l'app est dans Settings, sous cette machine (#1700), et au survol de « T ».
  assert.equal(vue.element("code").parentElement, vue.element("reglages-machine"));
  assert.match(vue.element("projets").children[0]?.title ?? "", /^All projects — this app's code is 3 commits behind$/);
});

// Une page vit tant que sa fenêtre est ouverte, ses minuteries avec elle ; une vue jouée ne se ferme
// jamais. Si les siennes retenaient le process, un `node --test` à la main sur ce fichier — ou sur
// n'importe lequel qui joue la vue — ne rendrait jamais la main (#2537).
test("la vue jouée ne retient pas le process : ses minuteries n'ajoutent rien de ce qui le tient en vie", async () => {
  const tenues = () => process.getActiveResourcesInfo().filter((type) => type === "Timeout").length;
  const avant = tenues();
  await lAccueil();
  assert.equal(tenues(), avant);
});

test("le bloc Projects de l'accueil : un seul bouton par ligne, son état et ses stations ; « Add a project » ouvre le parcours d'ajout", async () => {
  const stations = { stations: [{ id: "s1", nom: "parade-box", machine: "", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "", projets: ["brigade", "espace"], max: null }], projets: [] } as unknown as VuDesStations;
  const vue = await jouerLaVue({ demarrage: () => demarrage(ACCUEIL, undefined, stations), espace: () => [] });
  const bloc = vue.element("accueil-projets");
  const [brigade] = lesLignes(bloc);
  assert.deepEqual(brigade?.children.map((c) => c.textContent).filter((t) => t !== ""), ["brigade", "waiting for the chef", "parade-box", "›"]);
  assert.deepEqual(brigade?.dessous("button"), [], "la ligne est un seul bouton");
  const ajout = bloc.dessous("button").find(({ textContent }) => textContent === "Add a project");
  assert.ok(ajout, "« Add a project » est sur l'accueil");
  ajout.click();
  await repos();
  assert.equal(vue.element("ajout").hidden, false, "le parcours d'ajout s'ouvre");
  assert.equal(vue.element("parcours-de-l-ajout").dessous("section").length > 0, true);
});

test("le bloc de la station, dans la vue jouée : sans id local il n'est pas installé, avec lui il lie sa page et liste les autres (#2640)", async () => {
  const { vue } = await lAccueil();
  const bloc = () => vue.element("accueil-bloc-station");
  const station = (id: string, nom: string) => ({ id, nom, machine: "m", etat: "en-ligne" as const, ligne: "online", pannes: [], dit: "", version: "1.4.0", projets: [], max: null });
  const boutons = () => bloc().dessous("button").map(({ textContent }) => textContent);
  vue.dire("surStations", { a: A, stations: [station("g1", "Mac"), station("g2", "box")] });
  await repos();
  assert.deepEqual(boutons(), ["Install this computer's station"], "locale inconnue : installer, jamais « Open its page » sur un id vide");
  vue.dire("surProjetsDesStations", { a: A, locale: "g1", projets: [] } as unknown as VuDesProjets);
  await repos();
  assert.ok(boutons().includes("Open its page"));
  assert.ok(!boutons().includes("Install this computer's station"));
  assert.match(bloc().textContent, /Mac/);
  assert.ok(boutons().includes("box online") || bloc().textContent.includes("box"));
});

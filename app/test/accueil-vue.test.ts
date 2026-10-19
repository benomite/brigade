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
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Vu as VuDuCode } from "../src/retard.ts";
import type { VuDesStations } from "../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
const PROJETS: Projet[] = [
  { nom: "brigade", dossier: "/tmp/brigade", box: { hote: "box" } },
  { nom: "espace", dossier: "/tmp/espace", box: { hote: "box" } },
  { nom: "calculus", dossier: "/tmp/calculus", box: { hote: "box" } },
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
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code,
  ...(accueil === undefined ? {} : { accueil }),
  ...(stations === undefined ? {} : { stations }),
});

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
    ACCUEIL.projets.map(({ ton, nom, dit, survol }) => ({ ton, nom, dit, survol })),
  );
  // La pastille a sa forme, pas sa seule couleur.
  assert.deepEqual(lesLignes(projets()).map((ligne) => ligne.children[0]?.dataset.forme), ["losange", "losange", "carre"]);
});

test("un clic n'importe où sur la ligne ouvre le projet ; la ligne ne porte aucun bouton de geste", async () => {
  const { vue, projets } = await lAccueil();
  const [, space] = lesLignes(projets());
  assert.ok(space);
  assert.equal(space.balise, "button", "toute la ligne est ce qui se clique");
  assert.deepEqual(space.dessous("button"), [], "rien d'autre ne se clique dans la ligne");
  assert.deepEqual(projets().dessous("button"), lesLignes(projets()), "sous la liste des projets, rien ne se clique que ses lignes");
  space.click();
  await repos();
  assert.equal(vue.element("espace").textContent, "espace");
  assert.equal(vue.element("tous").hidden, true);
});

test("une box injoignable se dit en une ligne, rouge : ni `ssh`, ni code de sortie, ni ce que la box a écrit", async () => {
  const { vue, projets } = await lAccueil({ ...ACCUEIL, projets: [] });
  const accueil = tenirAccueil({ projets: () => PROJETS.map(({ nom }) => ({ nom, box: true, desinstalle: false })) });
  const vu = accueil.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ ssh -o BatchMode=yes box brigade brigade facts\nssh: connect to host box port 22: Connection refused\n→ exit code 255", atteinte: false, cas: "ssh-en-echec" }) ?? assert.fail("rien à redessiner");
  vue.dire("surAccueil", vu);
  await repos();
  const [brigade, space] = lesLignes(projets());
  assert.equal(brigade?.children[0]?.dataset.ton, "rouge");
  assert.equal(brigade?.children[2]?.textContent, "station unreachable");
  assert.equal(space?.children[2]?.textContent, "first read in progress…");
  for (const texte of [visible(vue.element("tous")), ...vue.element("tous").dessous("button").map(({ title }) => title)]) assert.doesNotMatch(texte, /ssh|exit code|Connection refused|port 22/);
});

test("en bas, la ligne de santé : verte et discrète quand tout va, une phrase quand Max ou GitHub cloche", async () => {
  const { vue } = await lAccueil();
  const sante = vue.element("sante");
  assert.equal(vue.element("tous").children.at(-1), sante, "la santé est en bas de page");
  assert.equal(sante.dataset.ok, "true");
  assert.equal(visible(sante), "Max ✓ · GitHub ✓");
  vue.dire("surAccueil", { ...ACCUEIL, sante: { ton: "rouge", dit: "Max ✓  ·  GitHub limits calls, back around 3:16 PM", survol: "" } });
  await repos();
  assert.equal(sante.dataset.ok, "false");
  assert.equal(sante.children[0]?.dataset.ton, "rouge");
  assert.equal(visible(sante), "Max ✓ · GitHub limits calls, back around 3:16 PM");
});

test("ce qui a quitté l'accueil n'y est plus : le code de l'app, les blocs par projet, les projets des stations, l'ajout d'un projet — ni commande, ni champ ouvert", async () => {
  const { vue } = await lAccueil();
  const tous = vue.element("tous");
  const texte = visible(tous);
  for (const parti of [/commits behind/, /what the station said/, /Projects on your stations/, /add a project/, /what awaits you/, /served 24 h|at pass|awaiting you/, /read at/]) assert.doesNotMatch(texte, parti);
  assert.deepEqual(tous.dessous("article"), []);
  assert.deepEqual(tous.dessous("pre"), []);
  assert.doesNotMatch(texte, /\b(brigade|gh|git|ssh)\s+(-|\S+\s)/);
  // Le seul champ de l'accueil est celui du code d'appairage, replié sous « + station ».
  assert.ok(tous.dessous("input").every((champ) => champ.parentElement?.hidden === true));
  // Le code de l'app est dans Paramètres, et au survol de « T ».
  assert.equal(vue.element("code").parentElement, vue.element("etat"));
  assert.match(vue.element("projets").children[0]?.title ?? "", /^All projects — this app's code is 3 commits behind$/);
});

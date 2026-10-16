// « Add a project » sur la page d'une station, ouverte d'un clic sur sa ligne de l'accueil, la vue
// jouée : un projet que l'app lui a ajouté (tous ses projets : stations/ses-projets.test.ts), et le
// parcours — le dépôt, les stations, la principale proposée d'office, l'avertissement d'un
// ordinateur, valider, retirer. Rien ne s'y tape dans un terminal.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/installation.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import type { Ajout, VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const ACCUEIL: Accueil = {
  projets: [],
  stations: [
    { id: "g1", nom: "box", ton: "vert", dit: "online · idle · no project", phrase: "online · no cook running", survol: "Linux 6.1.0 · version 1.4.0" },
    { id: "g2", nom: "macbook", ton: "vert", dit: "online · idle · no project", phrase: "online · no cook running", survol: "macOS 25.0.0 · version 1.4.0" },
  ],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const AVERTI = "macbook is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.";
const SANS_PROJET: VuDesProjets = { a: A, projets: [], recommandee: "g1", avertissements: { g2: AVERTI } };
const PARADE: VuDesProjets = {
  ...SANS_PROJET,
  projets: [
    {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      stations: [
        { id: "g1", nom: "box", principale: true, etat: "a-autoriser", dit: "authorize brigade on benomite/parade, on GitHub: one click per page", autoriser: ["https://github.com/apps/brigade-cook/installations/new"] },
        { id: "g2", nom: "macbook", principale: false, etat: "secondaire", dit: "not its main station: it runs neither its manager nor its pass", autoriser: [] },
      ],
      servi: null,
    },
  ],
};

const demarrage = (projetsDesStations?: VuDesProjets) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "ancien", dossier: "/tmp/ancien", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  ...(projetsDesStations === undefined ? {} : { projetsDesStations }),
});

async function laHome(projets: VuDesProjets | undefined, ajouter: () => Ajout = () => ({ ajoute: "parade" })) {
  const jouee = await jouerLaVue({
    demarrage: () => demarrage(projets),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }, { depot: "benomite/brigade", base: "v2" }] }),
    ajouterAUneStation: ajouter,
    retirerDUneStation: (nom) => ({ retire: nom }),
    autoriserSurGitHub: () => true,
    espace: () => [],
  });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  // Le parcours n'est pas sur l'accueil : il est sur la page de la station.
  assert.equal(jouee.element("tous").dessous("button").some(({ textContent }) => textContent === "+ add a project"), false);
  (jouee.element("accueil-stations").dessous("button").find(({ textContent }) => textContent.startsWith("box")) ?? assert.fail("pas de ligne « box »")).click();
  await repos();
  const section = () => jouee.element("station");
  const bouton = (texte: string | RegExp) => section().dessous("button").find((candidat) => (typeof texte === "string" ? candidat.textContent === texte : texte.test(candidat.textContent))) ?? assert.fail(`pas de bouton « ${texte} »`);
  const formulaire = () => section().dessous("form")[0] ?? assert.fail("pas de parcours");
  return { jouee, section, bouton, formulaire };
}

const choix = (formulaire: Faux, type: string) => formulaire.dessous("input").filter((champ) => champ.type === type) as Array<Faux & { checked?: boolean }>;

test("sur la page d'une station, un projet que l'app lui a ajouté : sa ligne dit qu'elle en est la principale et ce qu'elle en dit, puis le bouton qui autorise brigade sur GitHub, et celui qui retire", async () => {
  const { jouee, section, bouton } = await laHome(PARADE);
  assert.equal(section().children[4]?.textContent, "Projects");
  const ligne = section().children[5]?.dessous("button").find(({ dataset }) => dataset.projet === "parade") ?? assert.fail("pas de ligne « parade »");
  assert.equal(ligne.ariaLabel, "parade — main — waiting for your authorization on GitHub");
  // Son dépôt et ce que la station en dit sont au survol.
  assert.match(ligne.title, /benomite\/parade · main/);
  assert.match(ligne.title, /authorize brigade on benomite\/parade/);

  bouton("authorize on GitHub: brigade-cook").click();
  await repos();
  assert.deepEqual(jouee.dernier("autoriserSurGitHub"), ["https://github.com/apps/brigade-cook/installations/new"]);

  // Retirer se fait en deux clics.
  bouton("remove").click();
  await repos();
  assert.equal(jouee.appels.some(({ geste }) => geste === "retirerDUneStation"), false);
  bouton("remove parade from its stations? click again").click();
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("retirerDUneStation"), ["parade"]);
  assert.equal(section().children[8]?.textContent, "parade is removed: each of its stations takes it out of its configuration within a minute");
});

test("le parcours propose d'office la station serveur pour principale ; choisir un ordinateur affiche l'avertissement", async () => {
  const { jouee, bouton, formulaire } = await laHome(SANS_PROJET);
  assert.equal(formulaire().hidden, true);
  bouton("+ add a project").click();
  await repos();
  await repos();
  assert.equal(formulaire().hidden, false);
  assert.ok(jouee.appels.some(({ geste }) => geste === "depotsDuChef"));
  const [cocheBox, cocheMac] = choix(formulaire(), "checkbox");
  const [principaleBox, principaleMac] = choix(formulaire(), "radio");
  assert.equal(cocheBox?.checked, true);
  assert.equal(principaleBox?.checked, true);
  assert.equal(cocheMac?.checked, false);
  assert.match(formulaire().textContent, /box — Linux 6\.1\.0 · {2}main \(recommended: always on\)/);
  assert.equal(formulaire().children[3]?.textContent, "");

  principaleMac?.declencher("change");
  await repos();
  const [, cocheMacApres] = choix(formulaire(), "checkbox");
  assert.equal(cocheMacApres?.checked, true);
  assert.equal(formulaire().children[3]?.textContent, AVERTI);
  // Une relecture des stations ne perd pas le choix du chef.
  jouee.dire("surStations", STATIONS);
  jouee.dire("surProjetsDesStations", SANS_PROJET);
  await repos();
  assert.equal(choix(formulaire(), "radio")[1]?.checked, true);
  assert.equal(formulaire().children[3]?.textContent, AVERTI);
});

test("valider envoie le dépôt, sa branche, les stations, la principale, les décisions et l'heure d'ouverture ; ce qui manque se lit dessous", async () => {
  let rendu: Ajout = { signales: { cooks: "How many cooks may the main station run at once for this project?" } };
  const { jouee, section, bouton, formulaire } = await laHome(SANS_PROJET, () => rendu);
  bouton("+ add a project").click();
  await repos();
  await repos();
  const [depot] = formulaire().dessous("select");
  assert.ok(depot);
  assert.deepEqual(
    depot.children.map(({ value }) => value),
    ["", "benomite/parade", "benomite/brigade"],
  );
  depot.value = "benomite/brigade";
  depot.declencher("change");
  const [base, cooks] = formulaire().dessous("input").filter((champ) => champ.type !== "checkbox" && champ.type !== "radio");
  assert.equal(base?.value, "v2");
  const [, managerModele, managerEffort, reviewerModele, reviewerEffort] = formulaire().dessous("select");
  for (const [liste, valeur] of [
    [managerModele, "sonnet"],
    [managerEffort, "medium"],
    [reviewerModele, "sonnet"],
    [reviewerEffort, "high"],
  ] as const) {
    assert.ok(liste);
    // Rien n'est choisi d'avance : une décision du chef n'a pas de défaut.
    assert.equal(liste.value, "");
    liste.value = valeur;
  }

  formulaire().declencher("submit");
  await repos();
  await repos();
  const [envoye] = jouee.dernier("ajouterAUneStation") as [Record<string, unknown>];
  assert.deepEqual({ ...envoye, ouvertLe: typeof envoye.ouvertLe }, {
    depot: "benomite/brigade",
    base: "v2",
    stations: ["g1"],
    principale: "g1",
    cooks: "",
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "high" },
    ouvertLe: "string",
  });
  assert.equal(formulaire().children.at(-1)?.textContent, "How many cooks may the main station run at once for this project?");
  assert.equal(formulaire().hidden, false);

  assert.ok(cooks);
  cooks.value = "2";
  rendu = { ajoute: "brigade" };
  formulaire().declencher("submit");
  await repos();
  await repos();
  assert.equal(formulaire().hidden, true);
  assert.match(section().children[8]?.textContent ?? "", /^brigade is asked of its stations: its main station prepares it and adds it within a minute/);
});

// Kitchen > Cooks (#2492) : les spécialisations des cooks, chacune avec son modèle, son effort et ses capacités, et « Add a
// specialization », qui en crée une sur place. Le bloc est joué seul avec le faux élément de l'app (aides/fausse-vue.ts),
// puis la vue entière, devant un dépôt GitHub en mémoire (aides/depot-github.ts) que lisent et écrivent les vrais
// lecteurs de l'app (specialisations.ts) : ajoutée, la spécialisation est dans la liste — et encore là quand l'app,
// relancée, relit le dépôt.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../../src/allumage.ts";
import { mettreAPart } from "../../../../src/attend.ts";
import { pourLaBarre } from "../../../../src/barre.ts";
import { EXEMPLE } from "../../../../src/config.ts";
import { PALETTE } from "../../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../../src/projets/projets.ts";
import { ajouterUneSpecialisation, lireLesSpecialisations, type LectureDesSpecialisations } from "../../../../src/specialisations.ts";
import { AJOUTER, ATTENDU, AUCUNE, poserBlocSpecialisations, saisieVide } from "../../../../src/vue/projet/cuisine/cuisiniers/Specialisations.js";
import { DEPOT, github } from "../../../aides/depot-github.ts";
import { Faux, jouerLaVue, ouvrirOnglet, repos, type Jouee } from "../../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const texte = (racine: Faux) => racine.textContent;
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));
const lignes = (bloc: Faux) => [...bloc.descendants()].filter(({ dataset }) => dataset.specialisation !== undefined);
const cellules = (ligne: Faux) => ligne.dessous("td").map(texte);
const bouton = (racine: Faux, libelle: string) => racine.dessous("button").find((pose) => pose.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const champ = (racine: Faux, nom: string) => [...racine.descendants()].find(({ dataset }) => dataset.champ === nom) ?? assert.fail(`pas de champ « ${nom} »`);

const LUES: LectureDesSpecialisations = {
  branche: "main",
  specialisations: [
    { nom: "design", fichier: "agents/cook-design.md", description: "Interface tickets.", modele: null, effort: "medium", capacites: [] },
    { nom: "security", fichier: "agents/cook-security.md", description: "Auth, secrets and permissions.", modele: "opus", effort: "high", capacites: ["code", "acces-prod"] },
  ],
};

describe("le bloc des spécialisations", () => {
  test("chacune avec son modèle, son effort et ses capacités ; ce qui n'est pas posé se dit", () => {
    const bloc: Faux = poserBlocSpecialisations(doc, { lecture: LUES });
    assert.equal(bloc.dataset.bloc, "specialisations");
    assert.deepEqual(bloc.dessous("th").map(texte), ["Cook", "Model", "Effort", "Capabilities"]);
    assert.deepEqual(lignes(bloc).map(cellules), [
      ["designInterface tickets.", "per ticket", "medium", "none"],
      ["securityAuth, secrets and permissions.", "opus", "high", "codeacces-prod"],
    ]);
    assert.deepEqual(parClasse(bloc, "capacite").map(texte), ["code", "acces-prod"]);
    assert.equal(parClasse(bloc, "par-ticket")[0]?.title, "not set: the ticket's calibration decides", "pourquoi « per ticket », au survol");
  });

  test("sans spécialisation, une phrase ; tant que rien n'est lu, une ligne ; une lecture ratée tient en une ligne", () => {
    assert.match(texte(poserBlocSpecialisations(doc, { lecture: { branche: "main", specialisations: [] } })), new RegExp(AUCUNE));
    assert.match(texte(poserBlocSpecialisations(doc, {})), /reading the specializations of the repository…/);
    const rate = poserBlocSpecialisations(doc, { lecture: { sans: "specializations unavailable", detail: "GitHub refused (HTTP 401)" } });
    assert.match(texte(rate), /specializations unavailable/);
    assert.doesNotMatch(texte(rate), /HTTP 401/, "le détail est au survol, pas à l'écran");
  });

  test("« Add a specialization » n'est là qu'avec ses gestes ; ouvert, ce qu'on attend en tête, « add » recommandé, le refus en une ligne", () => {
    const sansGestes: Faux = poserBlocSpecialisations(doc, { lecture: LUES });
    assert.deepEqual(sansGestes.dessous("button").filter(({ className }) => className !== "aide"), [], "sans gestes, pas de bouton");
    const gestes = { ouvrir: () => {}, saisir: () => {}, ajouter: () => {}, annuler: () => {} };
    assert.ok(bouton(poserBlocSpecialisations(doc, { lecture: LUES, gestes }), AJOUTER));

    const saisie = { ...saisieVide(), nom: "my cook" };
    const ouvert: Faux = poserBlocSpecialisations(doc, { lecture: LUES, gestes, etat: { ouvert: true, saisie, refus: { refus: "nothing was added: its name is lowercase letters", detail: "" } } });
    const ajout = parClasse(ouvert, "ajout-de-specialisation")[0] ?? assert.fail("pas de formulaire");
    assert.equal(parClasse(ajout, "attendu")[0]?.textContent, ATTENDU);
    assert.equal(bouton(ajout, "add").className, "recommande");
    assert.notEqual(bouton(ajout, "cancel").className, "recommande");
    assert.equal(champ(ajout, "nom").value, "my cook", "ce que le chef a rempli reste");
    assert.deepEqual(champ(ajout, "modele").dessous("option").map(texte), ["per ticket", ...MODELES]);
    assert.deepEqual(champ(ajout, "effort").dessous("option").map(texte), ["per ticket", ...EFFORTS]);
    assert.match(texte(parClasse(ajout, "refus")[0] ?? assert.fail("pas de refus")), /nothing was added/);
    assert.deepEqual(bouton(poserBlocSpecialisations(doc, { lecture: LUES, gestes, etat: { ouvert: true, saisie, enCours: true } }), "adding…").disabled, true);
  });
});

// La vue entière : parade, ses faits lus, ouvert sur Kitchen > Cooks.
const A = "2026-10-20T10:04:12.000Z";
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       1 en attente", ""].join("\n");
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
function dessinable(): Dessinable {
  const tenus = tenirFaits(() => new Map());
  tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}

// L'app, lancée devant ce dépôt : ses gestes sont ceux du process principal (main.ts), sur ce GitHub-là.
async function lancer(depot: ReturnType<typeof github>): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    machines: () => [],
    specialisations: () => lireLesSpecialisations({ depot: DEPOT, branche: "main", client: depot.client }),
    ajouterSpecialisation: (_projet: string, demande: unknown) => ajouterUneSpecialisation({ depot: DEPOT, branche: "main", demande, client: depot.client }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  await ouvrirOnglet(vue, "Cooks");
  await repos();
  return vue;
}
const blocDe = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "specialisations") ?? assert.fail("pas de spécialisations sur Cooks");
const noms = (vue: Jouee) => lignes(blocDe(vue)).map(({ dataset }) => dataset.specialisation);
const SECURITE = ["---", "name: cook-security", "description: Auth, secrets and permissions.", "model: opus", "effort: high", "capabilities: code, acces-prod", "---", ""].join("\n");

describe("Cooks, dans la vue", () => {
  test("les spécialisations du dépôt sont lues à l'ouverture de Cooks, et seulement là", async () => {
    const vue = await lancer(github({ "agents/cook-security.md": SECURITE }));
    assert.deepEqual(vue.dernier("specialisations"), ["parade"]);
    assert.deepEqual(lignes(blocDe(vue)).map(cellules), [["securityAuth, secrets and permissions.", "opus", "high", "codeacces-prod"]]);
    for (const onglet of ["Rail", "Stations", "Health"] as const) {
      await ouvrirOnglet(vue, onglet);
      assert.equal(
        vue.element("rail").children.find(({ dataset }) => dataset.bloc === "specialisations"),
        undefined,
        onglet,
      );
    }
  });

  test("« Add a specialization » en crée une ici : elle entre dans la liste, et y est encore quand l'app relancée relit le dépôt", async () => {
    const depot = github({ "agents/cook-security.md": SECURITE });
    const vue = await lancer(depot);
    bouton(blocDe(vue), AJOUTER).click();
    await repos();
    const remplir = (nom: string, valeur: string) => {
      const pose = champ(blocDe(vue), nom);
      pose.value = valeur;
      pose.declencher(pose.balise === "select" ? "change" : "input");
    };
    remplir("nom", "migrations");
    remplir("description", "Database schema changes and their migrations.");
    remplir("modele", "sonnet");
    remplir("effort", "medium");
    remplir("capacites", "code, postgres");
    bouton(blocDe(vue), "add").click();
    await repos();
    await repos();

    assert.ok(depot.fichier("agents/cook-migrations.md"), "le fichier est écrit dans le dépôt");
    assert.deepEqual(noms(vue), ["migrations", "security"]);
    assert.deepEqual(cellules(lignes(blocDe(vue))[0] ?? assert.fail()), ["migrationsDatabase schema changes and their migrations.", "sonnet", "medium", "codepostgres"]);
    assert.match(texte(blocDe(vue)), /migrations added in the repository/);
    assert.equal(parClasse(blocDe(vue), "ajout-de-specialisation").length, 0, "le formulaire s'est refermé");

    const relancee = await lancer(depot);
    assert.deepEqual(noms(relancee), ["migrations", "security"]);
    assert.deepEqual(cellules(lignes(blocDe(relancee))[0] ?? assert.fail()), ["migrationsDatabase schema changes and their migrations.", "sonnet", "medium", "codepostgres"]);
  });

  test("refusée, rien n'est écrit : le refus se dit sous le formulaire, ce qui était rempli reste ; « cancel » le ferme", async () => {
    const depot = github({ "agents/cook-security.md": SECURITE });
    const vue = await lancer(depot);
    bouton(blocDe(vue), AJOUTER).click();
    await repos();
    const nom = champ(blocDe(vue), "nom");
    nom.value = "security";
    nom.declencher("input");
    const description = champ(blocDe(vue), "description");
    description.value = "Another one.";
    description.declencher("input");
    bouton(blocDe(vue), "add").click();
    await repos();
    await repos();

    assert.match(texte(parClasse(blocDe(vue), "refus")[0] ?? assert.fail("pas de refus")), /nothing was added: security is already a specialization/);
    assert.equal(champ(blocDe(vue), "nom").value, "security");
    assert.equal(depot.fichier("agents/cook-security.md"), SECURITE);
    bouton(blocDe(vue), "cancel").click();
    await repos();
    assert.equal(parClasse(blocDe(vue), "ajout-de-specialisation").length, 0);
    assert.deepEqual(noms(vue), ["security"]);
  });
});

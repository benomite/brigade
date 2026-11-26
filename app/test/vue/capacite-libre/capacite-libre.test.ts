// Une capacité hors du catalogue, dans « What it provides » (#1959, épique #1950) : sous les cases du formulaire d'une
// station, un champ et « Add ». Le nom tapé devient une case cochée, et part aussitôt avec les autres — aucun « Save »
// (#2920) ; relue, la station la fournit, cochée à sa prochaine ouverture, et le formulaire d'une autre station l'offre.
// Un nom vide ou déjà dans le formulaire est refusé en une ligne, et rien n'est envoyé. La règle du nom est celle du runtime
// (runtime/src/capacite-libre/), que la vue ne peut pas importer : ce test les tient identiques. La vue jouée telle
// qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { capaciteLibre as duRuntime } from "../../../../runtime/src/capacite-libre/capacite-libre.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../../src/service.ts";
import { AJOUTER, capaciteLibre } from "../../../src/vue/capacite-libre/capacite-libre.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-01T10:04:12.000Z";
const PARADE = "parade";
const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade" };
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-01T10:04:11.000Z",
  dernierTick: "2026-11-01T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};
// Ce que cet ordinateur sait déclarer : le catalogue de « + station ».
const DEFAUTS = { cooks: 4, cooksDit: "from this computer's 10 cores", espaceDeTravail: "/tmp/worktrees", capacites: [{ capacite: "docker", nom: "Docker", detectee: true }] };

// Ce que `installation stations --json` rend (runtime/src/declarer-stations.ts, `faitsDesStations`).
const declarees = (claude: string[]) =>
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: claude, cooks: 3, distante: false },
        { nom: "mac/claude", moteur: "claude", fournit: ["navigateur-headless"], cooks: 1, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station of this computer runs with the app" },
  termine: true,
  controle: { a: A, stations },
});

async function ouvrir() {
  const envoyes: unknown[][] = [];
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    service: () => guide(declarees(["code"])),
    defautsDeStation: () => DEFAUTS,
    changerUneStation: (...args: unknown[]) => {
      envoyes.push(args);
      return { fait: `${String(args[1])} saved; the other stations are unchanged` };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [] }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return { vue, envoyes };
}

const attendre = async () => {
  for (let tour = 0; tour < 10; tour++) await repos();
};
// La carte d'une station sur l'onglet Stations (#3195), et ses réglages, dans « Details », qu'on déplie.
const ligne = (vue: Jouee, nom: string) => vue.element("rail").dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === nom) ?? assert.fail(`pas de carte ${nom}`);
const formulaire = (vue: Jouee, nom: string) => ligne(vue, nom).dessous("section").find(({ className }) => className === "station-reglee") ?? assert.fail(`pas de réglages de ${nom}`);
const editer = async (vue: Jouee, nom: string) => {
  const details = ligne(vue, nom).dessous("details")[0] ?? assert.fail(`pas de « Details » sur ${nom}`);
  (details as unknown as { open: boolean }).open = true;
  details.declencher("toggle");
  await attendre();
  return formulaire(vue, nom);
};
const bouton = (dans: Faux, texte: string) => dans.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const champ = (forme: Faux) => forme.dessous("input").find(({ type }) => type === "text") ?? assert.fail("pas de champ pour une capacité hors des cases");
// Les cases du formulaire, telles qu'elles se lisent : leur nom, cochées ou non.
const cases = (forme: Faux) => forme.dessous("input").filter(({ type }) => type === "checkbox").map(({ ariaLabel, checked }) => [ariaLabel, checked] as const);
const taper = (forme: Faux, texte: string) => {
  const pose = champ(forme);
  pose.value = texte;
  pose.declencher("input");
};
const refus = (forme: Faux) => forme.dessous("div").find(({ className }) => className === "capacite-libre")?.dessous("p").find(({ className }) => className === "indisponible")?.textContent;

describe("une capacité hors du catalogue, tapée dans « What it provides »", () => {
  test("la vue applique au nom tapé la règle du runtime, mot pour mot", () => {
    const presentes = ["code", "docker", "chrome-connecté", "navigateur-headless"];
    const tapes = ["", "  ", "``", "enregistrement-ecran", "  machine vierge  comptes tiers ", "`enregistrement-ecran`", "Xcode", "caméra".normalize("NFD"), "docker", " `code` ", "chrome connecté", "a+b", "-x", "a:b", "point.", "Docker"];
    for (const tape of tapes) assert.deepEqual(capaciteLibre(tape, presentes), duRuntime(tape, presentes), JSON.stringify(tape));
  });

  test("tapée et ajoutée, elle devient une case cochée et part aussitôt ; relue, elle est cochée chez sa station et offerte à l'autre", async () => {
    const { vue, envoyes } = await ouvrir();
    let forme = await editer(vue, "box/claude");
    assert.deepEqual(cases(forme), [
      ["code", true],
      ["navigateur-headless", false],
      ["docker", false],
    ]);
    assert.equal(champ(forme).placeholder, "a capability not listed");

    // Aucun « Save » dans le formulaire.
    assert.equal(forme.dessous("button").some(({ textContent }) => textContent === "Save"), false);
    taper(forme, " enregistrement ecran ");
    bouton(forme, AJOUTER).click();
    await attendre();
    forme = formulaire(vue, "box/claude");
    assert.deepEqual(cases(forme).at(-1), ["enregistrement-ecran", true]);
    assert.equal(champ(forme).value, "");
    assert.equal(refus(forme), undefined);
    // Ajoutée, elle part aussitôt : la déclaration entière de la station, elle dedans.
    assert.deepEqual(envoyes, [[PARADE, "box/claude", { cooks: 3, fournit: ["code", "enregistrement-ecran"] }]]);
    const rangee = forme.children.find(({ dataset }) => dataset.cle === "capacites") ?? assert.fail("pas de rangée des capacités");
    assert.ok(rangee.children.some(({ className, textContent }) => className === "dit fait" && /saved/.test(textContent)));

    // La station relue fournit la capacité : sa rangée la dit, ses cases la cochent, celles de l'autre l'offrent.
    vue.dire("surGuide", guide(declarees(["code", "enregistrement-ecran"])));
    await attendre();
    forme = formulaire(vue, "box/claude");
    const capacites = forme.children.find(({ dataset }) => dataset.cle === "capacites") ?? assert.fail("pas de rangée des capacités");
    assert.equal(capacites.children[1]?.children[0]?.textContent, "code, enregistrement-ecran");
    assert.deepEqual(cases(forme).slice(0, 2), [
      ["code", true],
      ["enregistrement-ecran", true],
    ]);
    const autre = await editer(vue, "mac/claude");
    assert.ok(cases(autre).some(([nom, cochee]) => nom === "enregistrement-ecran" && !cochee), JSON.stringify(cases(autre)));
  });

  test("un nom vide, ou déjà dans le formulaire, est refusé en une ligne : aucune case de plus, et rien n'est envoyé", async () => {
    const { vue, envoyes } = await ouvrir();
    let forme = await editer(vue, "box/claude");
    const avant = cases(forme);

    taper(forme, "   ");
    bouton(forme, AJOUTER).click();
    forme = formulaire(vue, "box/claude");
    assert.equal(refus(forme), "Nothing added: type the capability's name first.");
    assert.deepEqual(cases(forme), avant);

    // Une case du catalogue, décochée, est déjà dans le formulaire : la cocher suffit.
    taper(forme, "docker");
    champ(forme).declencher("keydown", { key: "Enter" });
    forme = formulaire(vue, "box/claude");
    assert.equal(refus(forme), "Nothing added: “docker” is already in the form — tick its box.");
    assert.deepEqual(cases(forme), avant);
    // Le texte refusé reste dans le champ, à corriger.
    assert.equal(champ(forme).value, "docker");

    assert.equal(envoyes.length, 0);

    // Une capacité qu'il vient d'ajouter aussi : l'ajout est parti, le second est refusé sans rien envoyer.
    taper(forme, "enregistrement-ecran");
    bouton(forme, AJOUTER).click();
    await attendre();
    forme = formulaire(vue, "box/claude");
    taper(forme, "`enregistrement-ecran`");
    bouton(forme, AJOUTER).click();
    forme = formulaire(vue, "box/claude");
    assert.equal(refus(forme), "Nothing added: “enregistrement-ecran” is already in the form — tick its box.");
    assert.equal(cases(forme).filter(([nom]) => nom === "enregistrement-ecran").length, 1);
    assert.equal(envoyes.length, 1);

    // Rien de plus n'est envoyé.
    assert.equal(envoyes.length, 1);
  });

  test("les réglages reposés — la confirmation d'un arrêt ouverte sur la carte — gardent la case ajoutée, cochée, et ce qui était tapé", async () => {
    const { vue } = await ouvrir();
    let forme = await editer(vue, "box/claude");
    taper(forme, "enregistrement-ecran");
    bouton(forme, AJOUTER).click();
    await attendre();
    forme = formulaire(vue, "box/claude");
    taper(forme, "machine-vier");
    // L'arrêter est sur sa carte, pas dans ses réglages (#2914, #3195) ; sa confirmation s'ouvre sur la carte.
    assert.equal(forme.dessous("button").some(({ textContent }) => /remove|stop/i.test(textContent)), false);
    bouton(ligne(vue, "box/claude"), "Stop cooking here").click();
    await attendre();
    forme = formulaire(vue, "box/claude");
    assert.ok(ligne(vue, "box/claude").children.some(({ className }) => className === "confirmation"), "la confirmation n'est pas ouverte");
    assert.deepEqual(cases(forme).at(-1), ["enregistrement-ecran", true]);
    assert.equal(champ(forme).value, "machine-vier");
    assert.equal(champ(forme).dataset.cle, "station:box/claude");
  });
});

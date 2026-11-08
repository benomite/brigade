// Une capacité hors du catalogue, dans « What it provides » (#1959, épique #1950) : sous les cases du formulaire d'une
// station, un champ et « Add ». Le nom tapé devient une case cochée, « Save » l'envoie avec les autres ; relue, la
// station la fournit, cochée à sa prochaine ouverture, et le formulaire d'une autre station l'offre. Un nom vide ou déjà
// dans le formulaire est refusé en une ligne, et rien n'est envoyé. La règle du nom est celle du runtime
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
const DEFAUTS = { cooks: 4, cooksDit: "from this machine's 10 cores", espaceDeTravail: "/tmp/worktrees", capacites: [{ capacite: "docker", nom: "Docker", detectee: true }] };

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
const ligne = (vue: Jouee, nom: string) => vue.element("rail").dessous("li").find(({ className, dataset }) => className === "station-de-cuisson" && dataset.station === nom) ?? assert.fail(`pas de ligne ${nom}`);
const formulaire = (vue: Jouee, nom: string) => ligne(vue, nom).dessous("div").find(({ className }) => className === "edition") ?? assert.fail(`le formulaire de ${nom} n'est pas ouvert`);
const editer = async (vue: Jouee, nom: string) => {
  (ligne(vue, nom).dessous("button").find(({ className }) => className === "editer") ?? assert.fail(`pas de « edit » sur ${nom}`)).click();
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

  test("tapée et ajoutée, elle devient une case cochée ; « Save » l'envoie ; relue, elle est cochée chez sa station et offerte à l'autre", async () => {
    const { vue, envoyes } = await ouvrir();
    let forme = await editer(vue, "box/claude");
    assert.deepEqual(cases(forme), [
      ["code", true],
      ["navigateur-headless", false],
      ["docker", false],
    ]);
    assert.equal(champ(forme).placeholder, "a capability not listed");

    taper(forme, " enregistrement ecran ");
    bouton(forme, AJOUTER).click();
    forme = formulaire(vue, "box/claude");
    assert.deepEqual(cases(forme).at(-1), ["enregistrement-ecran", true]);
    assert.equal(champ(forme).value, "");
    assert.equal(refus(forme), undefined);
    // Rien n'est parti : seul « Save » envoie.
    assert.equal(envoyes.length, 0);

    bouton(forme, "Save").click();
    await attendre();
    assert.deepEqual(envoyes, [[PARADE, "box/claude", { cooks: 3, fournit: ["code", "enregistrement-ecran"] }]]);

    // La station relue fournit la capacité : sa ligne la dit, son formulaire la coche, celui de l'autre l'offre.
    vue.dire("surGuide", guide(declarees(["code", "enregistrement-ecran"])));
    await attendre();
    assert.deepEqual(
      ligne(vue, "box/claude")
        .dessous("li")
        .filter(({ className }) => className === "capacite mono")
        .map(({ textContent }) => textContent),
      ["code", "enregistrement-ecran"],
    );
    forme = await editer(vue, "box/claude");
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

    // Une capacité qu'il vient d'ajouter aussi.
    taper(forme, "enregistrement-ecran");
    bouton(forme, AJOUTER).click();
    taper(forme, "`enregistrement-ecran`");
    bouton(forme, AJOUTER).click();
    forme = formulaire(vue, "box/claude");
    assert.equal(refus(forme), "Nothing added: “enregistrement-ecran” is already in the form — tick its box.");
    assert.equal(cases(forme).filter(([nom]) => nom === "enregistrement-ecran").length, 1);
    assert.equal(envoyes.length, 0);

    // « Cancel » : rien n'est envoyé, et le formulaire rouvert ne garde rien de ce qui a été tapé.
    bouton(forme, "Cancel").click();
    await attendre();
    forme = await editer(vue, "box/claude");
    assert.deepEqual(cases(forme), avant);
    assert.equal(refus(forme), undefined);
    assert.equal(envoyes.length, 0);
  });

  test("le formulaire reposé — la confirmation d'un retrait ouverte — garde la case ajoutée, cochée, et ce qui était tapé", async () => {
    const { vue } = await ouvrir();
    let forme = await editer(vue, "box/claude");
    taper(forme, "enregistrement-ecran");
    bouton(forme, AJOUTER).click();
    taper(forme, "machine-vier");
    bouton(forme, "Remove").click();
    await attendre();
    forme = formulaire(vue, "box/claude");
    assert.ok(forme.dessous("section").some(({ className }) => className === "confirmation"), "la confirmation n'est pas ouverte");
    assert.deepEqual(cases(forme).at(-1), ["enregistrement-ecran", true]);
    assert.equal(champ(forme).value, "machine-vier");
    assert.equal(champ(forme).dataset.cle, "station:box/claude");
  });
});

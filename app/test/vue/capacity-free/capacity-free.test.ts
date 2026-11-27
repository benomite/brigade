// Une capacité hors du catalogue, dans « What it provides » (#1959, épique #1950) : sous les cases du formulaire d'une
// station, un champ et « Add ». Le nom tapé devient une case cochée, et part aussitôt avec les autres — aucun « Save »
// (#2920) ; relue, la station la fournit, cochée à sa prochaine ouverture, et le formulaire d'une autre station l'offre.
// Un nom vide ou déjà dans le formulaire est refusé en une ligne, et rien n'est envoyé. La vue jouée telle qu'elle est,
// devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { readStations, type Guide, type StationsRead } from "../../../src/service.ts";
import { ADD } from "../../../src/vue/capacity-free/capacity-free.js";
import { type Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-01T10:04:12.000Z";
const PARADE = "parade";
const PROJECT: Project = { nom: PARADE, dossier: "/tmp/parade" };
const FACTS: Facts = {
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
const DEFAULTS = { cooks: 4, cooksDit: "from this computer's 10 cores", espaceDeTravail: "/tmp/worktrees", capacites: [{ capacite: "docker", nom: "Docker", detectee: true }] };

// Ce que `installation stations --json` rend (runtime/src/declarer-stations.ts, `faitsDesStations`).
const declaredEntries = (claude: string[]) =>
  readStations(
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

const guide = (stations: StationsRead): Guide => ({
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

async function open() {
  const sent: unknown[][] = [];
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    service: () => guide(declaredEntries(["code"])),
    defautsDeStation: () => DEFAULTS,
    changerUneStation: (...args: unknown[]) => {
      sent.push(args);
      return { fait: `${String(args[1])} saved; the other stations are unchanged` };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [] }) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await openTab(vue, "Stations");
  return { vue, envoyes: sent };
}

const wait = async () => {
  for (let tour = 0; tour < 10; tour++) await repos();
};
// La carte d'une station sur l'onglet Stations (#3195), et ses réglages, dans « Details », qu'on déplie.
const line = (vue: Played, name: string) => vue.element("rail").dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === name) ?? assert.fail(`pas de carte ${name}`);
const form = (vue: Played, name: string) => line(vue, name).dessous("section").find(({ className }) => className === "station-reglee") ?? assert.fail(`pas de réglages de ${name}`);
const edit = async (vue: Played, name: string) => {
  const details = line(vue, name).dessous("details")[0] ?? assert.fail(`pas de « Details » sur ${name}`);
  (details as unknown as { open: boolean }).open = true;
  details.declencher("toggle");
  await wait();
  return form(vue, name);
};
const button = (inside: Fake, text: string) => inside.dessous("button").find((pose) => pose.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
const field = (shape: Fake) => shape.dessous("input").find(({ type }) => type === "text") ?? assert.fail("pas de champ pour une capacité hors des cases");
// Les cases du formulaire, telles qu'elles se lisent : leur nom, cochées ou non.
const cases = (shape: Fake) => shape.dessous("input").filter(({ type }) => type === "checkbox").map(({ ariaLabel, checked }) => [ariaLabel, checked] as const);
const type = (shape: Fake, text: string) => {
  const pose = field(shape);
  pose.value = text;
  pose.declencher("input");
};
const refusal = (shape: Fake) => shape.dessous("div").find(({ className }) => className === "capacite-libre")?.dessous("p").find(({ className }) => className === "indisponible")?.textContent;

describe("une capacité hors du catalogue, tapée dans « What it provides »", () => {
  test("tapée et ajoutée, elle devient une case cochée et part aussitôt ; relue, elle est cochée chez sa station et offerte à l'autre", async () => {
    const { vue, envoyes: sent } = await open();
    let shape = await edit(vue, "box/claude");
    assert.deepEqual(cases(shape), [
      ["code", true],
      ["navigateur-headless", false],
      ["docker", false],
    ]);
    assert.equal(field(shape).placeholder, "a capability not listed");

    // Aucun « Save » dans le formulaire.
    assert.equal(shape.dessous("button").some(({ textContent }) => textContent === "Save"), false);
    type(shape, " enregistrement ecran ");
    button(shape, ADD).click();
    await wait();
    shape = form(vue, "box/claude");
    assert.deepEqual(cases(shape).at(-1), ["enregistrement-ecran", true]);
    assert.equal(field(shape).value, "");
    assert.equal(refusal(shape), undefined);
    // Ajoutée, elle part aussitôt : la déclaration entière de la station, elle dedans.
    assert.deepEqual(sent, [[PARADE, "box/claude", { cooks: 3, fournit: ["code", "enregistrement-ecran"] }]]);
    const row = shape.children.find(({ dataset }) => dataset.cle === "capacites") ?? assert.fail("pas de rangée des capacités");
    assert.ok(row.children.some(({ className, textContent }) => className === "dit fait" && /saved/.test(textContent)));

    // La station relue fournit la capacité : sa rangée la dit, ses cases la cochent, celles de l'autre l'offrent.
    vue.dire("surGuide", guide(declaredEntries(["code", "enregistrement-ecran"])));
    await wait();
    shape = form(vue, "box/claude");
    const capacities = shape.children.find(({ dataset }) => dataset.cle === "capacites") ?? assert.fail("pas de rangée des capacités");
    assert.equal(capacities.children[1]?.children[0]?.textContent, "code, enregistrement-ecran");
    assert.deepEqual(cases(shape).slice(0, 2), [
      ["code", true],
      ["enregistrement-ecran", true],
    ]);
    const other = await edit(vue, "mac/claude");
    assert.ok(cases(other).some(([name, tickedOne]) => name === "enregistrement-ecran" && !tickedOne), JSON.stringify(cases(other)));
  });

  test("un nom vide, ou déjà dans le formulaire, est refusé en une ligne : aucune case de plus, et rien n'est envoyé", async () => {
    const { vue, envoyes: sent } = await open();
    let shape = await edit(vue, "box/claude");
    const before = cases(shape);

    type(shape, "   ");
    button(shape, ADD).click();
    shape = form(vue, "box/claude");
    assert.equal(refusal(shape), "Nothing added: type the capability's name first.");
    assert.deepEqual(cases(shape), before);

    // Une case du catalogue, décochée, est déjà dans le formulaire : la cocher suffit.
    type(shape, "docker");
    field(shape).declencher("keydown", { key: "Enter" });
    shape = form(vue, "box/claude");
    assert.equal(refusal(shape), "Nothing added: “docker” is already in the form — tick its box.");
    assert.deepEqual(cases(shape), before);
    // Le texte refusé reste dans le champ, à corriger.
    assert.equal(field(shape).value, "docker");

    assert.equal(sent.length, 0);

    // Une capacité qu'il vient d'ajouter aussi : l'ajout est parti, le second est refusé sans rien envoyer.
    type(shape, "enregistrement-ecran");
    button(shape, ADD).click();
    await wait();
    shape = form(vue, "box/claude");
    type(shape, "`enregistrement-ecran`");
    button(shape, ADD).click();
    shape = form(vue, "box/claude");
    assert.equal(refusal(shape), "Nothing added: “enregistrement-ecran” is already in the form — tick its box.");
    assert.equal(cases(shape).filter(([name]) => name === "enregistrement-ecran").length, 1);
    assert.equal(sent.length, 1);

    // Rien de plus n'est envoyé.
    assert.equal(sent.length, 1);
  });

  test("les réglages reposés — la confirmation d'un arrêt ouverte sur la carte — gardent la case ajoutée, cochée, et ce qui était tapé", async () => {
    const { vue } = await open();
    let shape = await edit(vue, "box/claude");
    type(shape, "enregistrement-ecran");
    button(shape, ADD).click();
    await wait();
    shape = form(vue, "box/claude");
    type(shape, "machine-vier");
    // L'arrêter est sur sa carte, pas dans ses réglages (#2914, #3195) ; sa confirmation s'ouvre sur la carte.
    assert.equal(shape.dessous("button").some(({ textContent }) => /remove|stop/i.test(textContent)), false);
    button(line(vue, "box/claude"), "Stop cooking here").click();
    await wait();
    shape = form(vue, "box/claude");
    assert.ok(line(vue, "box/claude").children.some(({ className }) => className === "confirmation"), "la confirmation n'est pas ouverte");
    assert.deepEqual(cases(shape).at(-1), ["enregistrement-ecran", true]);
    assert.equal(field(shape).value, "machine-vier");
    assert.equal(field(shape).dataset.cle, "station:box/claude");
  });
});

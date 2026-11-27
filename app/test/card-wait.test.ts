// « after #N » sur la carte d'un ticket du rail qui en attend d'autres (ticket 3510, épique 3502). Le champ `attend` de
// son entrée du rail (numéros de tickets, écrit par l'ordonnancement du rail) se lit, puis la vue le dit sur la carte :
//   - `attend: [42]` → « after #42 » ; deux numéros → « after #12, #15 » ;
//   - `attend` vide ou absent → rien de plus sur la carte ;
//   - un `attend` qui n'est pas une liste de numéros n'est pas lu (la lecture des faits le refuse) : la carte ne dit rien.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { brandAfter } from "../src/vue/card-wait/card-wait.js";
import { cardOfTicket, Fake, playTheVue, repos, type Played } from "./helpers/false-vue.ts";

const A = "2026-11-11T12:04:12.000Z";

describe("les mots de la marque", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) } as never;
  test("un numéro, deux numéros", () => {
    assert.equal(brandAfter(doc, [42])?.textContent, "after #42");
    assert.equal(brandAfter(doc, [12, 15])?.textContent, "after #12, #15");
  });

  test("`attend` vide ou absent : pas de marque", () => {
    assert.equal(brandAfter(doc, []), null);
    assert.equal(brandAfter(doc, undefined), null);
  });
});

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

const inFile = (ticket: number, awaiting?: unknown) => ({ ticket, etat: "en attente", titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, ...(awaiting === undefined ? {} : { attend: awaiting }) });
const facts = (rail: unknown[]): Facts =>
  ({ etat: "ouverte", lu: "2026-11-11T12:04:11.000Z", dernierTick: "2026-11-11T12:04:11.000Z", compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] }) as unknown as Facts;
const drawable = (rail: unknown[]): Drawable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(rail)) }] });

async function open(rail: unknown[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(rail), demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const marks = (vue: Played, ticket: number) => (cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`)).dessous("span").filter(({ className }) => className.includes("apres")).map(({ textContent }) => textContent);

describe("la carte d'un ticket du rail qui en attend d'autres", () => {
  test("un ticket attendu : « after #42 » ; deux : « after #12, #15 » ; aucun, ou `attend` vide : rien de plus", async () => {
    const vue = await open([inFile(21, [42]), inFile(23, [12, 15]), inFile(22, []), inFile(24)]);
    assert.deepEqual(marks(vue, 21), ["after #42"]);
    assert.deepEqual(marks(vue, 23), ["after #12, #15"]);
    assert.deepEqual(marks(vue, 22), []);
    assert.deepEqual(marks(vue, 24), []);
  });

  test("un `attend` qui n'est pas une liste de numéros n'est pas lu : la carte ne dit rien qu'elle n'ait lu", async () => {
    const vue = await open([inFile(21, "#42"), inFile(22, [-1])]);
    assert.deepEqual(marks(vue, 21), []);
    assert.deepEqual(marks(vue, 22), []);
  });
});

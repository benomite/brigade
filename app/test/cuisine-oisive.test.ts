// La cuisine oisive, des cartes sur le rail, en tête du rail (#1863) : une panne, en rouge — depuis combien de temps,
// et combien de cartes. Ce que la box rend est écrit ici par le runtime lui-même — `faits` joué dans ce process sur un
// vrai journal (runtime/src/cuisine-oisive.ts, #1862) —, lu comme le process principal le lit, puis posé par la vue.
// Sans panne, la tête du rail est celle d'avant ; et la panne part dès que `facts` ne la porte plus.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, tenirFaits, type Dessinable, type Tableau } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { jouerLaVue, repos, type Faux } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const MINUTE_MS = 60_000;
const DEBUT = Date.parse("2026-10-15T10:00:00.000Z");
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// Le runtime en marche depuis 10:00, #7 et #8 sur le rail, et un cook fini à 10:02 : la cuisine est oisive depuis là.
// `rendre(m)` : ce que `facts` rend à 10:00 + m minutes, tel que la box l'écrit.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-cuisine-oisive-"));
  let instant = DEBUT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const a = (minutes: number) => void (instant = DEBUT + minutes * MINUTE_MS);
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => void journal.ajouter({ project: PARADE, ticket, author, ...fait });
  const arriver = (ticket: number) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [], problems: [] } } },
      ticket,
      "github",
    );
  const lancer = (run: string, ticket: number) => noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl` } }, ticket);
  const finir = (run: string, ticket: number) => noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 10, durationMs: MINUTE_MS } }, ticket);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  arriver(7);
  arriver(8);
  a(1);
  lancer("r1", 7);
  a(2);
  finir("r1", 7);
  const rendre = (minutes: number) => {
    const maintenant = new Date(DEBUT + minutes * MINUTE_MS);
    return faitsDuRuntime(lireEtat(journal, maintenant), maintenant) as unknown as Record<string, unknown>;
  };
  return { a, lancer, rendre };
}

// Ce que le process principal donne à la vue d'une lecture de `facts`.
function dessine(faits: Record<string, unknown>): Dessinable {
  return tenirFaits().recevoir({ projet: PARADE, demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: `${JSON.stringify(faits)}\n` }] });
}
const tableauDe = (dessinable: Dessinable): Tableau => ("tableau" in dessinable ? dessinable.tableau : assert.fail(`pas de tableau : ${JSON.stringify(dessinable)}`));
// Ce que `faits` rendait avant la panne : la même forme, sans le champ.
const sansLeChamp = ({ cuisineOisive: _, ...reste }: Record<string, unknown>) => reste;

describe("la panne, lue dans `facts`", () => {
  test("30 min sans cook, deux cartes sur le rail : le tableau dit la panne — depuis combien de temps, combien de cartes — et ses tickets au survol", (t) => {
    const { rendre } = cuisine(t);
    const faits = rendre(32);
    assert.deepEqual(faits.cuisineOisive, { depuis: "2026-10-15T10:02:00.000Z", cartes: [7, 8] });

    const { panne } = tableauDe(dessine(faits));
    assert.equal(panne?.dit, "Kitchen idle for 30 min with 2 cards on the rail");
    assert.match(panne?.survol ?? "", /^No cook has run for 30 min, though the project is on and #7, #8 wait to be cooked\./);
    // La durée se compte d'une lecture à l'autre, depuis le même repère.
    assert.equal(tableauDe(dessine(rendre(2 + 130))).panne?.dit, "Kitchen idle for 2 h 10 with 2 cards on the rail");
  });

  test("une seule carte : au singulier", () => {
    const faits = { etat: "ouverte", lu: "2026-10-15T11:00:00.000Z", dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cuisineOisive: { depuis: "2026-10-15T10:15:00.000Z", cartes: [9] } };
    const { panne } = tableauDe(dessine(faits));
    assert.equal(panne?.dit, "Kitchen idle for 45 min with 1 card on the rail");
    assert.match(panne?.survol ?? "", / and #9 waits to be cooked\./);
  });

  test("29 min sans cook : `facts` ne porte pas la panne, et le tableau ne la dit pas — ni d'un runtime d'avant ce champ", (t) => {
    const { rendre } = cuisine(t);
    const faits = rendre(31);
    assert.equal(faits.cuisineOisive, null);
    assert.equal(tableauDe(dessine(faits)).panne, undefined);
    assert.equal(tableauDe(dessine(sansLeChamp(rendre(32)))).panne, undefined);
  });

  test("une panne d'une autre forme n'est pas la forme : rien n'est complété", () => {
    const base = { etat: "ouverte", lu: "2026-10-15T11:00:00.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [] };
    for (const [mauvaise, dit] of [
      [{ depuis: "hier", cartes: [7] }, "“cuisineOisive.depuis” is not a time"],
      [{ depuis: "2026-10-15T10:00:00.000Z", cartes: 7 }, "“cuisineOisive.cartes” is not a list"],
      [{ depuis: "2026-10-15T10:00:00.000Z", cartes: ["#7"] }, "“cuisineOisive.cartes[0]” is not a non-negative integer"],
      ["oisive", "“cuisineOisive” is not an object"],
    ] as const) {
      assert.deepEqual(comprendre(JSON.stringify({ ...base, cuisineOisive: mauvaise })), { informe: dit });
    }
  });
});

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const REPONSES = {
  demarrage: () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  }),
  espace: () => [SECOND],
};

// L'espace de `parade` ouvert sur son rail ; `montrer` y pose une lecture de `facts`.
async function espace() {
  const vue = await jouerLaVue(REPONSES);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  const montrer = async (faits: Record<string, unknown>) => {
    vue.dire("surFaits", { ...dessine(faits), demande: vue.dernier("faits")[0] as number });
    await repos();
    return vue.element("rail");
  };
  return { vue, montrer };
}
const pannesDe = (rail: Faux) => rail.children.filter(({ className }) => className === "panne-du-rail");
// La tête du rail, élément par élément, jusqu'aux colonnes : sa balise, sa classe, son texte.
const teteDe = (rail: Faux) => {
  const avantLesColonnes = rail.children.findIndex(({ className }) => className === "colonnes");
  return rail.children.slice(0, avantLesColonnes).map(({ balise, className, textContent, title }) => ({ balise, className, textContent, title }));
};

describe("la panne en tête du rail", () => {
  test("la panne tient : la tête du rail la pose en premier, marquée FAULT, d'une ligne — ses tickets et ce qu'en faire au survol", async (t) => {
    const { rendre } = cuisine(t);
    const { montrer } = await espace();
    const rail = await montrer(rendre(42));

    const [panne, ...autres] = pannesDe(rail);
    assert.ok(panne !== undefined, "aucune panne en tête du rail");
    assert.equal(autres.length, 0);
    assert.equal(rail.children.indexOf(panne), rail.children.findIndex(({ className }) => className !== "fraicheur"));
    assert.equal(panne.balise, "p");
    assert.equal(panne.role, "alert");
    assert.deepEqual(panne.children.map(({ balise, className, textContent }) => ({ balise, className, textContent })), [
      { balise: "span", className: "marque", textContent: "FAULT" },
      { balise: "strong", className: "", textContent: "Kitchen idle for 40 min with 2 cards on the rail" },
    ]);
    assert.ok(!panne.textContent.includes("\n"));
    assert.match(panne.title, /#7, #8 wait to be cooked/);
  });

  test("sans panne, la tête du rail est celle d'avant : la même qu'un runtime d'avant ce champ, élément pour élément", async (t) => {
    const { rendre } = cuisine(t);
    const sans = await espace();
    const avant = teteDe(await sans.montrer(sansLeChamp(rendre(42))));
    const nulle = await espace();
    const rail = await nulle.montrer({ ...rendre(42), cuisineOisive: null });
    assert.deepEqual(pannesDe(rail), []);
    assert.deepEqual(teteDe(rail), avant);
    // À 29 min, le runtime ne la porte pas : rien non plus.
    assert.deepEqual(pannesDe(await nulle.montrer(rendre(31))), []);
  });

  test("la panne part dès que `facts` ne la porte plus : un cook lancé, la lecture suivante ne la pose plus", async (t) => {
    const { a, lancer, rendre } = cuisine(t);
    const { montrer } = await espace();
    assert.equal(pannesDe(await montrer(rendre(42))).length, 1);

    a(43);
    lancer("r2", 8);
    const faits = rendre(43);
    assert.equal(faits.cuisineOisive, null);
    assert.deepEqual(pannesDe(await montrer(faits)), []);
  });
});

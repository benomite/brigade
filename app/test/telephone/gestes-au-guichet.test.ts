// Les gestes de la file depuis une carte, sur le téléphone appairé (#1420) : merger une PR, retirer un ticket du rail,
// le renvoyer en cuisine. La fiche d'une carte propose ceux que le guichet de la station porte, et la lecture du pont
// (app/android/web/lecture.ts) les joue par `POST /projects/<nom>/gestures` (runtime/src/telephone/guichet.ts) : la
// commande que le desktop lance pour le même bouton, sur la station, dont le desktop lit le changement à sa lecture
// suivante. Ici, la vue est jouée telle quelle (aides/fausse-vue.ts), la lecture du pont telle quelle derrière elle ;
// seul le guichet est un faux, qui rend ce que le vrai rend — et dont la file change quand un geste y est fait. Un geste
// refusé, ou une station qui ne se joint pas, se dit en une phrase, et la carte reste où elle était. Ce que le pont
// envoie au HTTP natif est éprouvé à part (packaging/android.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import { ouvrirLaLecture, type ProjetDuGuichet, type Reponse } from "../../android/web/lecture.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { FauxEcran, FauxStockage, type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T08:04:12.000Z";
const STATION = "atelier";
const ADRESSE = "http://192.168.1.20:7010";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

type Station = FaitsDuRuntime["stations"][number];
const CUISINE: Station = { station: "atelier/claude", distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [] };
// Dans TODO, trois décisions : #12, verte, que la pass ne merge pas sans le grant — la merger ; #31, dont la PR a été
// fermée sans merge — la sortir du rail ; #44, revenu de WAITING — le renvoyer en cuisine. #21 est sur le rail.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-23T08:04:11.000Z",
  dernierTick: "2026-10-23T08:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 2, attend: 3, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null },
    { ticket: 31, etat: "en pass", titre: "Le tri des fournisseurs", url: issue(31), activite: null },
    { ticket: 44, etat: "86", titre: "Le relevé des mesures", url: issue(44), activite: null },
  ],
  cooks: [],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: issue(12), decision: { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/chef/parade/pull/40" } },
    { ticket: 31, titre: "Le tri des fournisseurs", url: issue(31), decision: { quoi: "fermee", motif: null, cause: null, pr: null } },
    { ticket: 44, titre: "Le relevé des mesures", url: issue(44), decision: { quoi: "repris", motif: null, cause: null, pr: null } },
  ],
  stations: [CUISINE],
};
const PROJETS: ProjetDuGuichet[] = [{ name: "parade", repository: "chef/parade", state: "served" }];
const STATUS = "état : cuisine ouverte\n";

// Ce que chaque geste fait de la file sur la station, quand sa commande l'a fait.
const FAIT: Record<string, (faits: Faits, ticket: number) => Faits> = {
  merge: (faits, ticket) => ({ ...faits, rail: faits.rail.map((ligne) => (ligne.ticket === ticket ? { ...ligne, etat: "servi" } : ligne)), attend: (faits.attend ?? []).filter((attendu) => attendu.ticket !== ticket) }),
  remove: (faits, ticket) => ({ ...faits, rail: faits.rail.filter((ligne) => ligne.ticket !== ticket), attend: (faits.attend ?? []).filter((attendu) => attendu.ticket !== ticket) }),
  "back-to-kitchen": (faits, ticket) => ({ ...faits, rail: faits.rail.map((ligne) => (ligne.ticket === ticket ? { ...ligne, etat: "en attente" } : ligne)), attend: (faits.attend ?? []).filter((attendu) => attendu.ticket !== ticket) }),
};
// Ce que la commande dit, faite.
const DIT: Record<string, (ticket: number) => string> = {
  merge: (ticket) => `#${ticket}: merged (PR #40)`,
  remove: (ticket) => `#${ticket} left the rail`,
  "back-to-kitchen": (ticket) => `#${ticket} is back in the kitchen`,
};

type Geste = { gesture: string; ticket: number };
// Le guichet de la station, faux : sa file, et ce que le vrai rend à chaque demande. `geste` : ce qu'il rend d'un geste
// — par défaut, la commande l'a fait, et la file change. Chaque demande est notée.
function guichet(geste?: (demande: Geste) => Reponse | Error) {
  let faits = FAITS;
  const demandes: { methode: string; chemin: string; corps?: unknown }[] = [];
  const requete = async (chemin: string): Promise<Reponse> => {
    demandes.push({ methode: "GET", chemin });
    if (chemin === "/projects") return { status: 200, data: { projects: PROJETS } };
    if (chemin === "/projects/parade/queue") return { status: 200, data: { project: "parade", repository: "chef/parade", facts: faits, status: STATUS } };
    return { status: 404, data: { said: "unknown" } };
  };
  const envoyer = async (chemin: string, corps: unknown): Promise<Reponse> => {
    demandes.push({ methode: "POST", chemin, corps });
    const demande = corps as Geste;
    if (geste !== undefined) {
      const rendu = geste(demande);
      if (rendu instanceof Error) throw rendu;
      return rendu;
    }
    faits = (FAIT[demande.gesture] ?? assert.fail(`pas de geste ${demande.gesture}`))(faits, demande.ticket);
    const dit = (DIT[demande.gesture] ?? assert.fail("pas de phrase"))(demande.ticket);
    return { status: 200, data: { done: true, said: dit, detail: `$ brigade parade ${demande.gesture} ${demande.ticket}\nbrigade : ${dit}\n→ exit code 0` } };
  };
  return { requete, envoyer, demandes };
}

const CONSTANTES = {
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
};

// Le téléphone appairé à `atelier` : sa lecture ouverte sur le guichet, la vue devant elle — chaque demande de la vue
// part à la lecture, comme le pont la lui passe (app/android/web/pont.js) —, et l'espace de parade ouvert.
async function telephone(station: ReturnType<typeof guichet>): Promise<Jouee> {
  let vue: Jouee | undefined;
  const enAttente: { canal: string; args: unknown[] }[] = [];
  const lecture = ouvrirLaLecture({
    requete: station.requete,
    envoyer: station.envoyer,
    station: STATION,
    adresse: ADRESSE,
    connus: PROJETS,
    maintenant: () => new Date(A),
    planifier: () => () => undefined,
    dire: ((canal: string, ...args: unknown[]) => {
      if (vue !== undefined) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
      else enAttente.push({ canal, args });
    }) as Parameters<typeof ouvrirLaLecture>[0]["dire"],
  });
  vue = await jouerLaVue(
    {
      demarrage: () => ({ ...CONSTANTES, configuration: lecture.configuration(), telephone: lecture.telephone() }),
      faits: (demande) => void lecture.faits(demande),
      tous: (demande) => void lecture.tous(demande),
      regarder: (projet, demande) => void lecture.regarder(projet, demande),
      relireBox: () => void lecture.relire(),
      gestesDeFiche: async (carte) => lecture.gestesDeFiche(carte),
      gesteDeFiche: (projet, id, ticket) => lecture.geste(projet, id, ticket),
      oublierLeTelephone: async () => undefined,
      espace: () => [],
      machines: () => [],
    },
    { ecran: new FauxEcran(true), stockage: new FauxStockage() },
  );
  for (const { canal, args } of enAttente.splice(0)) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
  await calme();
  (vue.element("projets").children.find((pose) => pose.title.startsWith("parade — ")) ?? assert.fail("pas de case pour parade")).click();
  await calme();
  return vue;
}
// Le guichet faux répond sans attendre : quelques tours de la boucle suffisent à ce que tout soit lu et posé.
async function calme(): Promise<void> {
  for (let tour = 0; tour < 30; tour++) await repos();
}

const rail = (vue: Jouee) => vue.element("rail");
// Les tickets de chaque colonne de Rail, par son nom.
const file = (vue: Jouee) =>
  Object.fromEntries(
    rail(vue)
      .dessous("section")
      .filter((pose) => pose.className === "colonne")
      .map((colonne) => [colonne.children[0]?.children[0]?.textContent, colonne.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent)]),
  );
const fiche = (vue: Jouee) => vue.element("fiche");
async function toucherLaCarte(vue: Jouee, numero: number): Promise<void> {
  const carte = rail(vue).dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de carte #${numero}`);
  carte.click();
  await calme();
}
const gestes = (vue: Jouee) => fiche(vue).dessous("section").find((pose) => pose.className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
// Les gestes que la fiche propose, par leur nom.
const proposes = (vue: Jouee) => gestes(vue).dessous("li").map((ligne) => ligne.dataset.geste);
// Le bouton d'un geste de la fiche — pas l'icône de son survol.
const geste = (vue: Jouee, id: string): Faux => gestes(vue).dessous("li").find((ligne) => ligne.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} »`);
// Toucher un geste qui coûte, puis son « oui ».
async function confirmer(vue: Jouee, id: string): Promise<void> {
  geste(vue, id).click();
  await calme();
  const confirmation = gestes(vue).dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
  (confirmation.dessous("button").find((pose) => pose.className === "recommande") ?? assert.fail("pas de « oui »")).click();
  await calme();
}
// Ce que la fiche dit sous ses gestes : sa ligne, sa classe, et son survol.
const issueDuGeste = (vue: Jouee) => gestes(vue).children.filter((pose) => pose.balise === "p").map((pose) => ({ classe: pose.className, dit: pose.textContent, survol: pose.title }));
const envoyes = (station: ReturnType<typeof guichet>) => station.demandes.filter(({ methode }) => methode === "POST").map(({ chemin, corps }) => ({ chemin, corps }));
const lectures = (station: ReturnType<typeof guichet>) => station.demandes.filter(({ methode }) => methode === "GET").length;

describe("la fiche d'une carte, sur le téléphone, propose les gestes que la station joue pour lui", () => {
  test("chaque décision de TODO a son geste recommandé, et seulement ceux que le guichet porte : ni l'issue, ni le second, ni la priorité", async () => {
    const vue = await telephone(guichet());
    assert.deepEqual(file(vue).TODO, ["#12", "#31", "#44"]);
    for (const [ticket, attendus, recommande] of [
      [12, ["merger"], "merger"],
      [31, ["retirer"], "retirer"],
      [44, ["cuisine", "retirer"], "cuisine"],
      [21, ["retirer"], undefined],
    ] as const) {
      await toucherLaCarte(vue, ticket);
      assert.deepEqual(proposes(vue), attendus, `#${ticket}`);
      if (recommande !== undefined) assert.equal(geste(vue, recommande).className, "recommande", `#${ticket}`);
    }
  });
});

describe("depuis une carte, sur le téléphone, chaque geste part à la station et la file suit", () => {
  for (const [ticket, id, nom, dit, apres] of [
    [12, "merger", "merge", "#12: merged (PR #40)", { TODO: ["#31", "#44"], Served: ["#12"] }],
    [31, "retirer", "remove", "#31 left the rail", { TODO: ["#12", "#44"] }],
    [44, "cuisine", "back-to-kitchen", "#44 is back in the kitchen", { TODO: ["#12", "#31"] }],
  ] as const) {
    test(`#${ticket}, « ${id} » confirmé : « ${nom} » part au guichet, la fiche dit ce que la station a fait, et la station relue, #${ticket} quitte TODO`, async () => {
      const station = guichet();
      const vue = await telephone(station);
      await toucherLaCarte(vue, ticket);
      await confirmer(vue, id);
      assert.deepEqual(envoyes(station), [{ chemin: "/projects/parade/gestures", corps: { gesture: nom, ticket } }]);
      assert.deepEqual(issueDuGeste(vue), [{ classe: "dit", dit, survol: `$ brigade parade ${nom} ${ticket}\nbrigade : ${dit}\n→ exit code 0` }]);
      const colonnes = file(vue);
      for (const [colonne, tickets] of Object.entries(apres)) assert.deepEqual(colonnes[colonne], tickets, colonne);
      if (id === "retirer") assert.ok(!Object.values(colonnes).flat().includes("#31"), "#31 n'est plus nulle part dans la file");
      if (id === "cuisine") assert.ok((colonnes["On the rail"] ?? []).includes("#44"), "#44 est de nouveau sur le rail");
    });
  }
});

describe("depuis une carte, sur le téléphone, un geste qui échoue le dit en une phrase et laisse la carte où elle était", () => {
  const REFUSE = { done: false, said: "#12 was not merged: GitHub refused the merge", detail: "$ brigade parade rail merge 12\nbrigade : #12 was not merged: GitHub refused the merge\n→ exit code 1" };
  for (const [cas, rendu, dit, survol, relue] of [
    ["refusé par la station (409)", { status: 409, data: REFUSE }, REFUSE.said, REFUSE.detail, false],
    ["la station injoignable", new Error("failed to connect to /192.168.1.20 (port 7010) after 10000ms"), "atelier could not be reached: nothing was changed", "failed to connect to /192.168.1.20 (port 7010) after 10000ms", false],
    ["le guichet derrière `tailscale serve` qui ne répond pas (502 sans corps)", { status: 502, data: "" }, "atelier's phone desk does not answer: nothing was changed", `${ADRESSE} answered 502: nothing answers behind it`, false],
    ["un téléphone que la station ne connaît plus (401)", { status: 401, data: { said: "unknown token" } }, "atelier no longer knows this phone: pair it again", "unknown token", false],
    ["la réponse qui n'arrive pas à temps : la station est relue", new Error("timeout"), "atelier did not answer: the next read shows whether it went through", "timeout", true],
  ] as const) {
    test(`${cas} : une ligne, son détail au survol seulement ; #12 reste dans TODO, et le geste se rejoue`, async () => {
      const station = guichet(() => rendu);
      const vue = await telephone(station);
      const avant = file(vue);
      await toucherLaCarte(vue, 12);
      const lues = lectures(station);
      await confirmer(vue, "merger");
      assert.deepEqual(envoyes(station), [{ chemin: "/projects/parade/gestures", corps: { gesture: "merge", ticket: 12 } }]);
      assert.deepEqual(issueDuGeste(vue), [{ classe: "refus", dit, survol }]);
      assert.doesNotMatch(gestes(vue).textContent, /brigade :|failed to connect|exit code/, "le détail n'est qu'au survol");
      assert.equal(lectures(station) > lues, relue, relue ? "la station est relue" : "la station n'est pas relue");
      assert.deepEqual(file(vue), avant);
      assert.equal(geste(vue, "merger").disabled, false, "le geste se rejoue");
    });
  }
});

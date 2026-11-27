// L'offre du téléphone juste après le premier ticket servi (#3303, offre-telephone/) : d'abord ses morceaux devant un faux
// document — le premier projet servi, l'offre tenue et son stockage, la ligne à chaque état —, puis la vue jouée entière
// contre le faux pont : la page du premier projet servi l'offre, l'accepter montre le lien de l'app Android sans passer par
// Settings, la décliner ou suivre son lien la range, un lancement suivant ne la remontre pas, et un téléphone déjà connecté
// au compte GitHub ne la laisse pas paraître.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Delay } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { RETRY } from "../../src/vue/lexicon.js";
import {
  ACCEPT,
  KEY_OF_THE_OFFER,
  DECLINE,
  UNREADABLE,
  READING,
  SAME_ACCOUNT,
  OFFER,
  setTheOffer,
  firstProjectServed,
  REREAD_MS,
  DOWNLOAD,
  holdTheOffer,
} from "../../src/vue/offer-phone/offer-phone.js";
import { Fake, FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const APK = "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk";
const SERVED: Delay = { ajouteLe: "2026-11-10T09:00:00.000Z", serviLe: "2026-11-10T09:20:00.000Z", duree: 20 * 60_000 };
const IN_PROGRESS: Delay = { ajouteLe: "2026-11-10T09:00:00.000Z", serviLe: null, duree: null };
const EARLIER = (delay: Delay): Delay => ({ ...delay, ajouteLe: "2026-11-01T09:00:00.000Z" });
const texts = (root: Fake) => [...root.descendants()].map(({ textContent }) => textContent);
const button = (root: Fake, wording: string) => root.dessous("button").find(({ textContent }) => textContent === wording);

describe("le premier projet servi", () => {
  test("le projet ajouté le plus tôt, une fois son premier ticket servi", () => {
    assert.equal(firstProjectServed([{ nom: "parade", delai: SERVED }, { nom: "cantine", delai: { ...SERVED, ajouteLe: "2026-11-10T10:00:00.000Z" } }]), "parade");
  });
  test("le premier projet sans ticket servi : rien, même si un projet ajouté après en a un", () => {
    assert.equal(firstProjectServed([{ nom: "parade", delai: SERVED }, { nom: "cantine", delai: EARLIER(IN_PROGRESS) }]), undefined);
  });
  test("un projet sans délai publié, ou d'un ajout illisible, ne compte pas", () => {
    assert.equal(firstProjectServed([{ nom: "cantine" }, { nom: "atelier", delai: { ...SERVED, ajouteLe: "pas une date" } }, { nom: "parade", delai: SERVED }]), "parade");
    assert.equal(firstProjectServed([]), undefined);
  });
});

describe("l'offre tenue", () => {
  // `null` : aucun stockage.
  const heldOne = (read: () => Promise<unknown>, storage: FakeStorage | null = new FakeStorage(), connected: () => Promise<unknown> = async () => ({ connecte: false })) => {
    const openOnes: string[] = [];
    let renderedOnes = 0;
    let instant = 0;
    const offer = holdTheOffer({ stockage: storage ?? undefined, lire: read, connecte: connected, ouvrir: (link) => openOnes.push(link), rendre: () => void renderedOnes++, maintenant: () => "2026-11-11T10:00:00.000Z", horloge: () => instant });
    return { offre: offer, ouverts: openOnes, stockage: storage, rendus: () => renderedOnes, avancer: (ms: number) => void (instant += ms) };
  };

  test("montrable une fois la trace lue sans téléphone connecté ; pas avant", async () => {
    const readings: number[] = [];
    const { offre: offer } = heldOne(async () => APK, new FakeStorage(), async () => (readings.push(1), { connecte: false }));
    assert.equal(offer.montrable(), false, "pas avant la réponse");
    assert.equal(offer.montrable(), false);
    await repos();
    assert.equal(readings.length, 1, "une seule lecture à la fois");
    assert.equal(offer.montrable(), true);
  });

  test("un téléphone déjà connecté : jamais montrable, et la trace n'est plus relue", async () => {
    const readings: number[] = [];
    const { offre: offer, avancer: advance } = heldOne(async () => APK, new FakeStorage(), async () => (readings.push(1), { connecte: true }));
    offer.montrable();
    await repos();
    assert.equal(offer.montrable(), false);
    advance(REREAD_MS);
    assert.equal(offer.montrable(), false);
    await repos();
    assert.equal(readings.length, 1);
  });

  test("une trace illisible — le pont lève, ne rend rien, ou autre chose — ne la montre pas, et se relit après RELIRE_MS", async () => {
    for (const readOne of [async () => Promise.reject(new Error("ipc")), async () => undefined, async () => ({ illisible: "gh is missing" }), async () => ({ connecte: "oui" })]) {
      let answer: () => Promise<unknown> = readOne;
      const { offre: offer, avancer: advance } = heldOne(async () => APK, new FakeStorage(), () => answer());
      offer.montrable();
      await repos();
      assert.equal(offer.montrable(), false);
      answer = async () => ({ connecte: false });
      advance(REREAD_MS - 1);
      offer.montrable();
      await repos();
      assert.equal(offer.montrable(), false, "pas relue avant le délai");
      advance(1);
      offer.montrable();
      await repos();
      assert.equal(offer.montrable(), true);
    }
  });

  test("un téléphone connecté après coup : la relecture le voit, et l'offre se retire", async () => {
    let connected = false;
    const { offre: offer, avancer: advance } = heldOne(async () => APK, new FakeStorage(), async () => ({ connecte: connected }));
    offer.montrable();
    await repos();
    assert.equal(offer.montrable(), true);
    connected = true;
    advance(REREAD_MS);
    assert.equal(offer.montrable(), true, "la réponse d'avant tient pendant la relecture");
    await repos();
    assert.equal(offer.montrable(), false);
  });

  test("rangée : ni montrable, ni la trace lue", async () => {
    const readings: number[] = [];
    const { offre: offer } = heldOne(async () => APK, new FakeStorage(), async () => (readings.push(1), { connecte: false }));
    offer.decliner();
    assert.equal(offer.montrable(), false);
    await repos();
    assert.equal(readings.length, 0);
  });

  test("acceptée : la lecture, puis le lien lu", async () => {
    const { offre: offer, rendus: renderedOnes } = heldOne(async () => APK);
    assert.deepEqual(offer.etat, { etape: "offerte" });
    offer.accepter();
    assert.deepEqual(offer.etat, { etape: "lecture" });
    await repos();
    assert.deepEqual(offer.etat, { etape: "lien", lien: APK });
    assert.equal(renderedOnes(), 2);
  });

  test("un pont qui lève, ne rend rien, ou rend autre chose qu'une adresse https : illisible, et elle se relit", async () => {
    for (const read of [async () => Promise.reject(new Error("ipc")), async () => undefined, async () => "http://exemple.org/brigade.apk", async () => 42]) {
      const { offre: offer } = heldOne(read);
      offer.accepter();
      await repos();
      assert.deepEqual(offer.etat, { etape: "illisible" });
      assert.equal(offer.rangee(), false, "une lecture ratée ne range pas l'offre");
    }
  });

  test("déclinée : rangée, et gardée dans le stockage", () => {
    const { offre: offer, stockage: storage } = heldOne(async () => APK);
    assert.equal(offer.rangee(), false);
    offer.decliner();
    assert.equal(offer.rangee(), true);
    assert.deepEqual(JSON.parse(storage?.getItem(KEY_OF_THE_OFFER) ?? "null"), { declinee: "2026-11-11T10:00:00.000Z" });
  });

  test("son lien suivi : ouvert, puis rangée et gardée", () => {
    const { offre: offer, stockage: storage, ouverts: openOnes } = heldOne(async () => APK);
    offer.suivre(APK);
    assert.deepEqual(openOnes, [APK]);
    assert.equal(offer.rangee(), true);
    assert.deepEqual(JSON.parse(storage?.getItem(KEY_OF_THE_OFFER) ?? "null"), { suivie: "2026-11-11T10:00:00.000Z" });
  });

  test("un stockage absent ou illisible ne la montre pas ; une trace qui ne s'écrit pas la range pour ce lancement", () => {
    assert.equal(heldOne(async () => APK, null).offre.rangee(), true);
    const unreadable = new FakeStorage();
    unreadable.getItem = () => {
      throw new Error("refusé");
    };
    assert.equal(heldOne(async () => APK, unreadable).offre.rangee(), true);
    const silent = new FakeStorage();
    silent.setItem = () => {
      throw new Error("plein");
    };
    const { offre: offer } = heldOne(async () => APK, silent);
    assert.equal(offer.rangee(), false);
    offer.decliner();
    assert.equal(offer.rangee(), true);
  });
});

describe("la ligne", () => {
  const actions = () => {
    const facts: string[] = [];
    return { faits: facts, geste: { accepter: () => facts.push("accepter"), decliner: () => facts.push("decliner"), suivre: (link: string) => facts.push(`suivre ${link}`) } };
  };

  test("offerte : la phrase, « set up my phone » recommandé, « no thanks »", () => {
    const { faits: facts, geste: action } = actions();
    const line: Fake = setTheOffer(doc, { etape: "offerte" }, action);
    assert.equal(texts(line).includes(OFFER), true);
    assert.deepEqual(line.dessous("button").map(({ textContent }) => textContent), [ACCEPT, DECLINE]);
    button(line, ACCEPT)?.click();
    button(line, DECLINE)?.click();
    assert.deepEqual(facts, ["accepter", "decliner"]);
  });

  test("en lecture : la phrase qui le dit, sans « set up my phone »", () => {
    const line: Fake = setTheOffer(doc, { etape: "lecture" }, actions().geste);
    assert.equal(texts(line).includes(READING), true);
    assert.deepEqual(line.dessous("button").map(({ textContent }) => textContent), [DECLINE]);
  });

  test("le lien : « download the Android app », vers l'APK, et « Sign in with the same GitHub account »", () => {
    const { faits: facts, geste: action } = actions();
    const line: Fake = setTheOffer(doc, { etape: "lien", lien: APK }, action);
    const [link] = line.dessous("a") as (Fake & { href?: string })[];
    assert.equal(link?.textContent, DOWNLOAD);
    assert.equal(link?.href, APK);
    assert.equal(texts(line).includes(SAME_ACCOUNT), true);
    link?.click();
    assert.deepEqual(facts, [`suivre ${APK}`]);
  });

  test("illisible : la ligne qui le dit, et « Try again » relance la lecture", () => {
    const { faits: facts, geste: action } = actions();
    const line: Fake = setTheOffer(doc, { etape: "illisible" }, action);
    assert.equal(texts(line).includes(UNREADABLE), true);
    button(line, RETRY)?.click();
    assert.deepEqual(facts, ["accepter"]);
  });
});

describe("sur la page du projet", () => {
  const A = "2026-11-11T10:00:00.000Z";
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
  const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
  const seenOne = (name: string, delay: Delay): ProjectSeen => ({
    nom: name,
    depot: `benomite/${name}`,
    base: "main",
    suiviPar: { id: "g1", nom: "box" },
    stations: [{ id: "g1", nom: "box", etat: "servi", dit: "", autoriser: [] }],
    servi: null,
    cuitSur: { id: "g1", nom: "box", ici: false },
    delai: delay,
  });
  const startup = (projects: ProjectSeen[]) => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [] } satisfies SeenOfStations,
    accueil: HOME,
    projetsDesStations: { a: A, projets: projects, recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) } satisfies SeenOfProjects,
  });

  // `case` : 1 pour parade, 2 pour cantine.
  async function thePage(
    projects: ProjectSeen[],
    { stockage: storage = new FakeStorage(), lien: link = async () => APK, rang: rank = 1, connecte: connected = async () => ({ connecte: false }) }: { stockage?: FakeStorage; lien?: () => Promise<string>; rang?: number; connecte?: () => Promise<{ connecte: boolean } | { illisible: string }> } = {},
  ) {
    const played = await playTheVue({ demarrage: () => startup(projects), espace: () => [], lienDeLApk: link, telephoneConnecte: connected, ouvrirLaPage: () => true }, { stockage: storage });
    (played.element("projets").children.at(rank) ?? assert.fail("pas de case du projet")).click();
    await repos();
    await repos();
    return { jouee: played, section: played.element("offre-telephone") };
  }

  test("le premier projet servi : l'offre ; acceptée, le lien de l'app Android et le même compte GitHub, sur place", async () => {
    const { jouee: played, section } = await thePage([seenOne("parade", SERVED), seenOne("cantine", { ...SERVED, ajouteLe: "2026-11-10T10:00:00.000Z" })]);
    assert.equal(section.hidden, false);
    assert.equal(texts(section).includes(OFFER), true);
    button(section, ACCEPT)?.click();
    await repos();
    assert.equal(played.appels.some(({ geste: action }) => action === "lienDeLApk"), true);
    const [link] = section.dessous("a") as (Fake & { href?: string })[];
    assert.equal(link?.href, APK);
    assert.equal(texts(section).includes(SAME_ACCOUNT), true);
    assert.equal(played.element("onglets-du-projet").children.find((tab) => tab.ariaSelected === "true")?.textContent ?? "Rail", "Rail", "rien ne passe par Settings");
  });

  test("son lien suivi : la page s'ouvre, l'offre se range, et ne revient pas au lancement suivant", async () => {
    const storage = new FakeStorage();
    const { jouee: played, section } = await thePage([seenOne("parade", SERVED)], { stockage: storage });
    button(section, ACCEPT)?.click();
    await repos();
    section.dessous("a")[0]?.click();
    assert.deepEqual(played.dernier("ouvrirLaPage"), [APK]);
    assert.equal(section.hidden, true);
    const relaunched = await thePage([seenOne("parade", SERVED)], { stockage: storage });
    assert.equal(relaunched.section.hidden, true);
  });

  test("déclinée : rangée, et pas remontrée au lancement suivant", async () => {
    const storage = new FakeStorage();
    const { section } = await thePage([seenOne("parade", SERVED)], { stockage: storage });
    button(section, DECLINE)?.click();
    assert.equal(section.hidden, true);
    assert.notEqual(storage.getItem(KEY_OF_THE_OFFER), null);
    assert.equal((await thePage([seenOne("parade", SERVED)], { stockage: storage })).section.hidden, true);
  });

  test("un téléphone déjà connecté au compte GitHub, ou une trace illisible : pas d'offre", async () => {
    assert.equal((await thePage([seenOne("parade", SERVED)], { connecte: async () => ({ connecte: true }) })).section.hidden, true);
    assert.equal((await thePage([seenOne("parade", SERVED)], { connecte: async () => ({ illisible: "gh is missing" }) })).section.hidden, true);
    const { jouee: played } = await thePage([seenOne("parade", SERVED)]);
    assert.equal(played.appels.some(({ geste: action }) => action === "telephoneConnecte"), true);
  });

  test("ni avant le premier ticket servi, ni sur un autre projet que le premier", async () => {
    assert.equal((await thePage([seenOne("parade", IN_PROGRESS)])).section.hidden, true);
    assert.equal((await thePage([seenOne("parade", SERVED), seenOne("cantine", EARLIER(SERVED))])).section.hidden, true);
    assert.equal((await thePage([seenOne("parade", SERVED), seenOne("cantine", EARLIER(SERVED))], { rang: 2 })).section.hidden, false);
  });
});

// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (#3400, épique #3396) : sa page demande
// aussitôt quelle station le sert, cet ordinateur en tête. D'abord l'état tenu et la question devant un faux document ;
// puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : « Add a project », un dépôt choisi et donné à une station
// du compte hors ligne, sa mise en place lue pas faite ; sa PR de mise en place mergée, la lecture suivante le dit prêt —
// aucune station ne le sert, la question vient, et « this computer » l'ajoute à la liste que sert cet ordinateur, le geste
// de Settings (`servirUnProjet`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import type { StationRecorded } from "../../../src/stations-of-account.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { SeenOfStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { CLOSE, NOBODY, LATER, setTheRequestOfStation, QUESTION, SERVED_HERE, SERVED_BY, holdTheRequestsOfStation } from "../../../src/vue/installation-project/installation-project.js";
import { HERE, type Choice } from "../../../src/vue/stations-tab/choice.js";
import { Fake, playTheVue, type Played, type Answers, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
// La question posée devant le faux document : ce qu'elle rend est un `Faux`.
const set = (...args: Parameters<typeof setTheRequestOfStation>) => setTheRequestOfStation(...args) as unknown as Fake;
const REPOSITORY = "chef/secondes";
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${buttons(or).join(", ")}`);

describe("l'état tenu", () => {
  test("pas préparé puis préparé : à juger ; servi, rien n'est demandé ; sinon, la question", () => {
    const renderedOnes: string[] = [];
    const requests = holdTheRequestsOfStation({ rendre: (project) => void renderedOnes.push(project) });
    requests.preparation("secondes", "manque");
    assert.equal(requests.de("secondes"), undefined);
    requests.preparation("secondes", "prepare");
    assert.deepEqual(requests.de("secondes"), { etape: "a-juger" });
    requests.juger("secondes", false);
    assert.deepEqual(requests.de("secondes"), { etape: "question" });

    requests.preparation("cantine", "en-route");
    requests.preparation("cantine", "prepare");
    requests.juger("cantine", true);
    assert.equal(requests.de("cantine"), undefined);
    assert.deepEqual(renderedOnes, ["secondes", "secondes", "cantine", "cantine"]);
  });

  test("prêt d'emblée, sans avoir été lu pas préparé : rien n'est demandé", () => {
    const requests = holdTheRequestsOfStation({ rendre: () => {} });
    requests.preparation("secondes", "prepare");
    assert.equal(requests.de("secondes"), undefined);
  });

  test("« not now » : la question part, et ne revient pas tant que l'app tourne", () => {
    const requests = holdTheRequestsOfStation({ rendre: () => {} });
    requests.preparation("secondes", "manque");
    requests.preparation("secondes", "prepare");
    requests.juger("secondes", false);
    requests.ecarter("secondes");
    assert.equal(requests.de("secondes"), undefined);
    requests.preparation("secondes", "manque");
    requests.preparation("secondes", "prepare");
    requests.juger("secondes", false);
    assert.equal(requests.de("secondes"), undefined);
  });

  test("le choix : en cours, puis servi — ou refusé en une ligne, les boutons rendus", () => {
    const requests = holdTheRequestsOfStation({ rendre: () => {} });
    requests.preparation("secondes", "manque");
    requests.preparation("secondes", "prepare");
    requests.juger("secondes", false);
    requests.choisir("secondes", "g1");
    assert.deepEqual(requests.de("secondes"), { etape: "enCours", cle: "g1" });
    requests.choisi("secondes", { ligne: "nothing was written: GitHub refused", detail: "HTTP 403" }, { nom: "atelier", ici: false, absente: false });
    assert.deepEqual(requests.de("secondes"), { etape: "refus", ligne: "nothing was written: GitHub refused", detail: "HTTP 403" });
    requests.choisir("secondes", HERE);
    requests.choisi("secondes", "ajoutee", { nom: "this computer", ici: true, absente: false });
    assert.deepEqual(requests.de("secondes"), { etape: "servi", nom: "this computer", ici: true, absente: false });
    requests.fermer("secondes");
    assert.equal(requests.de("secondes"), undefined);
  });
});

describe("ce que la page dit", () => {
  const choice: Choice[] = [
    { cle: HERE, nom: "this computer", horsLigne: false, recommande: false, hote: "mac-du-chef" },
    { cle: "g1", nom: "parade-box", horsLigne: false, recommande: true },
  ];
  const actions = () => {
    const facts: string[] = [];
    return { faits: facts, choisir: (oneOf: Choice) => void facts.push(`choisir ${oneOf.cle}`), ecarter: () => void facts.push("ecarter"), fermer: () => void facts.push("fermer") };
  };

  test("la question, sa raison, un bouton par machine — cet ordinateur en tête — et « not now »", () => {
    const g = actions();
    const card = set(doc, { depot: REPOSITORY, etat: { etape: "question" }, choix: choice }, g);
    assert.equal(card.dessous("h2")[0]?.textContent, QUESTION(REPOSITORY));
    assert.ok(card.dessous("p").some(({ textContent }) => textContent === NOBODY(REPOSITORY)));
    assert.deepEqual(buttons(card), ["this computer", "parade-box", LATER]);
    button(card, "this computer").click();
    button(card, LATER).click();
    assert.deepEqual(g.faits, [`choisir ${HERE}`, "ecarter"]);
  });

  test("un choix qui s'écrit grise les boutons ; refusé, une ligne, les boutons rendus", () => {
    const inProgress = set(doc, { depot: REPOSITORY, etat: { etape: "enCours", cle: HERE }, choix: choice }, actions());
    assert.ok(inProgress.dessous("button").filter(({ className }) => className !== "aide").every(({ disabled }) => disabled === true));
    const refusal = set(doc, { depot: REPOSITORY, etat: { etape: "refus", ligne: "nothing was written: the list cannot be read", detail: "EACCES" }, choix: choice }, actions());
    assert.ok(refusal.descendants().some(({ textContent }) => textContent === "nothing was written: the list cannot be read"));
    assert.equal(button(refusal, "this computer").disabled, false);
  });

  test("servi : une phrase — cet ordinateur, dans les deux minutes ; une station du compte ; une station hors ligne — et « close »", () => {
    const g = actions();
    const here = set(doc, { depot: REPOSITORY, etat: { etape: "servi", nom: "this computer", ici: true, absente: false }, choix: choice }, g);
    assert.equal(here.dessous("p")[0]?.textContent, SERVED_HERE(REPOSITORY));
    assert.deepEqual(buttons(here), [CLOSE]);
    button(here, CLOSE).click();
    assert.deepEqual(g.faits, ["fermer"]);
    const other = set(doc, { depot: REPOSITORY, etat: { etape: "servi", nom: "parade-box", ici: false, absente: false }, choix: choice }, g);
    assert.equal(other.dessous("p")[0]?.textContent, SERVED_BY("parade-box", REPOSITORY));
    const absent = set(doc, { depot: REPOSITORY, etat: { etape: "servi", nom: "atelier", ici: false, absente: true }, choix: choice }, g);
    assert.equal(absent.dessous("p")[0]?.textContent, `atelier is offline: it takes ${REPOSITORY} when it comes back.`);
  });
});

// La vue jouée entière.
const PATH = "/home/chef/.config/brigade/app.json";
const A = "2026-11-12T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "secondes", genre: "second", titre: "second · claude", note: "", arrete: false };
const MISSING = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const READY = { ready: true, missingBindings: [], missingLabels: [] };
const NO_STATION = { a: A, stations: [] } as unknown as SeenOfStations;
// Une station du compte, hors ligne depuis hier : choisie, elle ne sert le projet qu'à son retour.
const ATELIER: StationRecorded = {
  id: "g1",
  name: "atelier",
  platform: "linux",
  machine: "atelier",
  version: "1.0.0",
  account: "octo-chef",
  available: false,
  registeredAt: "2026-11-01T00:00:00.000Z",
  lastSeen: "2026-11-11T10:00:00.000Z",
  stoppedAt: null,
  refreshMs: 30_000,
  selection: [],
  ...{ offlineSince: "2026-11-11T10:00:00.000Z" },
};
const startup = (stations: SeenOfStations | undefined) => () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
});
// Le rail de secondes, lu sur GitHub : ses tickets fire attendent, aucun cook.
const facts = (): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 9, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
});
const request = (vue: Played) => vue.element("installation-projet");

// « Add a project », le dépôt chef/secondes, sa page ouverte, sa mise en place lue pas faite.
// `merger()` : la PR de mise en place mergée, la lecture suivante du rail la relit.
async function seconds(answers: Answers = {}, stations: SeenOfStations | null = NO_STATION) {
  let ready = false;
  let vue: Played | undefined;
  vue = await playTheVue({
    demarrage: startup(stations ?? undefined),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [ATELIER], unreadable: [] }),
    choisirLesProjets: (_, repositories) => ({ selection: repositories }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    checkRepoSetup: () => (ready ? READY : MISSING),
    ...answers,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  button(vue.element("ajout"), REPOSITORY).click();
  await repos();
  const played = vue;
  const read = async () => {
    played.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] }), demande: played.dernier("faits")[0] as number });
    await repos();
    await repos();
  };
  await read();
  assert.equal(request(vue).hidden, true, "nothing is asked while the setup is not done");
  return {
    vue,
    merger: async () => {
      ready = true;
      await read();
    },
  };
}

describe("la vue jouée : la mise en place mergée, aucune station ne le sert", () => {
  test("la question vient aussitôt, cet ordinateur en tête ; un clic l'ajoute à la liste que sert cet ordinateur", async () => {
    const servedOnes: [string, boolean][] = [];
    const { vue, merger } = await seconds({ servirUnProjet: (repository, served) => (servedOnes.push([repository, served]), { depots: [repository] }) });
    // Tant que la mise en place n'est pas faite, rien n'est demandé.
    assert.equal(request(vue).hidden, true);

    await merger();
    assert.equal(request(vue).hidden, false);
    const card = request(vue).dessous("section")[0] ?? assert.fail("pas de question");
    assert.equal(card.dessous("h2")[0]?.textContent, QUESTION(REPOSITORY));
    assert.ok(card.dessous("p").some(({ textContent }) => textContent === NOBODY(REPOSITORY)));
    assert.deepEqual(buttons(card), ["this computer", "atelier", LATER]);

    button(card, "this computer").click();
    await repos();
    await repos();
    assert.deepEqual(servedOnes, [[REPOSITORY, true]]);
    const served = request(vue).dessous("section")[0] ?? assert.fail("pas de confirmation");
    assert.equal(served.dataset.etape, "servi");
    assert.equal(served.dessous("p")[0]?.textContent, SERVED_HERE(REPOSITORY));
    button(served, CLOSE).click();
    await repos();
    assert.equal(request(vue).hidden, true);
  });

  test("cet ordinateur le sert déjà : rien n'est demandé", async () => {
    const { vue, merger } = await seconds({ projetsServis: () => ({ depots: [REPOSITORY] }) });
    await merger();
    assert.equal(request(vue).hidden, true);
  });

  test("une station dit le servir : rien n'est demandé", async () => {
    const stations = { a: A, stations: [{ id: "g1", nom: "atelier", etat: "servi", dit: "", autoriser: [], projets: ["secondes"] }] } as unknown as SeenOfStations;
    const { vue, merger } = await seconds({}, stations);
    await merger();
    assert.equal(request(vue).hidden, true);
  });

  test("« not now » range la question ; elle ne revient pas aux lectures suivantes", async () => {
    const { vue, merger } = await seconds();
    await merger();
    button(request(vue), LATER).click();
    await repos();
    assert.equal(request(vue).hidden, true);
    await merger();
    vue.dire("surStations", NO_STATION);
    await repos();
    assert.equal(request(vue).hidden, true);
  });

  test("la liste de cet ordinateur ne se lit pas : rien n'est décidé, ni demandé", async () => {
    const { vue, merger } = await seconds({ projetsServis: () => ({ refus: "this station's served projects cannot be read" }) });
    await merger();
    assert.equal(request(vue).hidden, true);
  });

  test("les stations pas encore lues : rien n'est décidé ; lues, la question vient", async () => {
    const { vue, merger } = await seconds({}, null);
    await merger();
    assert.equal(request(vue).hidden, true);
    vue.dire("surStations", NO_STATION);
    await repos();
    assert.equal(request(vue).hidden, false);
  });
});

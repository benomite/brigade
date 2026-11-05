// L'étape « station » du parcours d'ajout (ticket 2477) : « Who cooks this project? », cet ordinateur d'abord, en un
// clic, puis les stations appairées ; sans aucune, cet ordinateur seul. Un clic confie le projet par la logique de
// station de l'app — `servirUnProjet` pour cet ordinateur, la sélection du gist pour une autre —, puis le parcours suit ;
// un refus se dit en une ligne, et rien ne bouge.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ATTENDU, HORS_LIGNE, ILLISIBLES, poserEtapeStation, selectionAvec, stationsProposees } from "../../src/vue/parcours-projet/etape-station.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/parade";
const station = (name: string, autres: Partial<{ id: string; available: boolean; lastSeen: string; selection: string[] | null }> = {}) => ({
  id: `gist${name.replace(/[^a-z]/g, "")}`,
  name,
  platform: "linux",
  machine: name,
  version: "2.4.0",
  account: "chef",
  available: true,
  registeredAt: "2026-10-01T00:00:00Z",
  lastSeen: "2026-11-05T10:00:00Z",
  stoppedAt: null,
  refreshMs: 30_000,
  selection: null as string[] | null,
  ...autres,
});
const STATIONS = [station("parade-box", { selection: ["chef/brigade"] }), station("nas", { available: false }), station("macbook")];

type Options = {
  stations?: ReturnType<typeof station>[] | { refus: string };
  servirIci?: ((depot: string) => Promise<{ depots: string[] } | { refus: string }>) | null;
  choisir?: (id: string, depots: string[]) => Promise<{ selection: string[] } | { refus: string; detail?: string }>;
};

function monter(options: Options = {}) {
  const servis: string[] = [];
  const choisis: Array<{ id: string; depots: string[] }> = [];
  let suites = 0;
  const servirIci = options.servirIci === null ? undefined : (options.servirIci ?? (async (depot: string) => (servis.push(depot), { depots: [depot] })));
  const racine = poserEtapeStation(doc, {
    depot: DEPOT,
    ici: "this Mac",
    nomIci: "macbook",
    stations: options.stations ?? STATIONS,
    ...(servirIci === undefined ? {} : { servirIci }),
    choisir: options.choisir ?? (async (id, depots) => (choisis.push({ id, depots }), { selection: depots })),
    suivante: () => void suites++,
  }) as Faux;
  const tous = () => [...racine.descendants()];
  const un = (classe: string) => tous().find((element) => element.className.split(" ").includes(classe));
  // Les machines proposées, dans l'ordre de l'écran : cet ordinateur (`ici`), puis chaque station par son nom.
  const machines = () => tous().filter((element) => element.dataset.station !== undefined).map((element) => element.dataset.station);
  const cliquer = async (machine: string) => {
    const ligne = tous().find((element) => element.dataset.station === machine)!;
    ligne.dessous("button")[0]!.click();
    await new Promise((resoudre) => setImmediate(resoudre));
  };
  return { racine, un, machines, cliquer, servis, choisis, suites: () => suites };
}

describe("la question, et cet ordinateur d'abord", () => {
  test("l'étape demande « Who cooks this project? » en tête", () => {
    const etape = monter();
    assert.equal(etape.racine.children[0]?.textContent, ATTENDU);
    assert.equal(ATTENDU, "Who cooks this project?");
  });
  test("cet ordinateur est la première machine proposée, et son bouton est le recommandé", () => {
    const etape = monter();
    assert.equal(etape.machines()[0], "ici");
    const bouton = etape.un("ici")!.dessous("button")[0]!;
    assert.equal(bouton.textContent, "this Mac");
    assert.equal(bouton.className, "recommande");
  });
  test("un clic sur cet ordinateur : sa station sert le dépôt, et le parcours suit", async () => {
    const etape = monter();
    await etape.cliquer("ici");
    assert.deepEqual(etape.servis, [DEPOT]);
    assert.deepEqual(etape.choisis, []);
    assert.equal(etape.suites(), 1);
  });
  test("cet ordinateur refuse : une ligne, son détail au survol, et le parcours ne suit pas", async () => {
    const etape = monter({ servirIci: async () => ({ refus: "brigade: chef/parade cannot be cloned — the repository is archived" }) });
    await etape.cliquer("ici");
    assert.equal(etape.suites(), 0);
    const erreur = etape.un("erreur")!;
    assert.match(erreur.textContent, /^nothing was written: chef\/parade cannot be cloned/);
    assert.equal(erreur.dessous("button")[0]?.ariaLabel, "the repository is archived");
  });
  test("une station injoignable se dit en une phrase, sans erreur brute", async () => {
    const etape = monter({
      servirIci: async () => {
        throw new Error("EPIPE");
      },
    });
    await etape.cliquer("ici");
    assert.equal(etape.un("erreur")!.textContent, "this Mac could not be given the project.");
    assert.equal(etape.suites(), 0);
  });
});

describe("sans aucune station appairée", () => {
  test("seul cet ordinateur est proposé, et l'étape marche", async () => {
    const etape = monter({ stations: [] });
    assert.deepEqual(etape.machines(), ["ici"]);
    assert.equal(etape.un("autres"), undefined);
    await etape.cliquer("ici");
    assert.deepEqual(etape.servis, [DEPOT]);
    assert.equal(etape.suites(), 1);
  });
  test("cet ordinateur seul enregistré sous le compte : il ne se propose pas deux fois", () => {
    assert.deepEqual(monter({ stations: [station("MacBook")] }).machines(), ["ici"]);
  });
  test("les stations illisibles : cet ordinateur reste proposé, la lecture se dit en une ligne", async () => {
    const etape = monter({ stations: { refus: "gh: HTTP 502" } });
    assert.deepEqual(etape.machines(), ["ici"]);
    const ligne = etape.un("indisponible")!;
    assert.match(ligne.textContent, new RegExp(`^${ILLISIBLES}`));
    assert.equal(ligne.dessous("button")[0]?.ariaLabel, "gh: HTTP 502");
    await etape.cliquer("ici");
    assert.equal(etape.suites(), 1);
  });
});

describe("avec plusieurs stations appairées", () => {
  test("elles suivent cet ordinateur, une par machine, dans l'ordre des noms", () => {
    assert.deepEqual(monter().machines(), ["ici", "nas", "parade-box"]);
  });
  test("une station hors ligne se propose, et le dit", () => {
    const ligne = [...monter().racine.descendants()].find((element) => element.dataset.station === "nas")!;
    assert.match(ligne.textContent, new RegExp(HORS_LIGNE));
  });
  test("un clic sur une station : le dépôt rejoint sa sélection, et le parcours suit", async () => {
    const etape = monter();
    await etape.cliquer("parade-box");
    assert.deepEqual(etape.choisis, [{ id: "gistparadebox", depots: ["chef/brigade", DEPOT] }]);
    assert.deepEqual(etape.servis, []);
    assert.equal(etape.suites(), 1);
  });
  test("une station sans sélection encore reçoit le dépôt seul", async () => {
    const etape = monter();
    await etape.cliquer("nas");
    assert.deepEqual(etape.choisis, [{ id: "gistnas", depots: [DEPOT] }]);
  });
  test("GitHub refuse la sélection : sa ligne, son détail au survol, et le parcours ne suit pas", async () => {
    const etape = monter({ choisir: async () => ({ refus: "not saved: GitHub did not take the change", detail: "HTTP 404" }) });
    await etape.cliquer("parade-box");
    const erreur = etape.un("erreur")!;
    assert.match(erreur.textContent, /^not saved: GitHub did not take the change/);
    assert.equal(erreur.dessous("button")[0]?.ariaLabel, "HTTP 404");
    assert.equal(etape.suites(), 0);
  });
  test("un appareil sans station (un téléphone) ne propose que les stations", () => {
    assert.deepEqual(monter({ servirIci: null }).machines(), ["nas", "parade-box"]);
  });
});

describe("la logique de station reprise", () => {
  test("selectionAvec ajoute le dépôt à la fin, une seule fois, sans égard à la casse", () => {
    assert.deepEqual(selectionAvec(null, DEPOT), [DEPOT]);
    assert.deepEqual(selectionAvec(["chef/brigade"], DEPOT), ["chef/brigade", DEPOT]);
    assert.deepEqual(selectionAvec(["Chef/Parade"], DEPOT), ["Chef/Parade"]);
  });
  test("stationsProposees : deux enregistrements d'un même nom n'en font qu'un, celui qui est en ligne", () => {
    const vieille = station("nas", { id: "vieux", available: false, lastSeen: "2026-10-01T00:00:00Z" });
    const vive = station("NAS", { id: "vif" });
    assert.deepEqual(stationsProposees([vieille, vive], "macbook").map(({ id }) => id), ["vif"]);
  });
});

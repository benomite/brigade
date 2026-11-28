// L'accueil (#870) : une ligne par projet, une par station, et la ligne de santé — chacune dite en
// quelques mots de l'app, sa pastille posée d'après des règles fixes, et rien de brut : ni commande,
// ni texte d'erreur. Ce qui se calcule ici ; ce que la vue en pose est dans accueil-vue.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lineOfProject, lineOfStation, health, holdHome, type ReadFacts, type ProjectOfTheHome } from "../src/home.ts";
import type { Facts } from "../src/facts.ts";
import { hourShort } from "../src/format.ts";
import type { StationVue, SeenOfStations } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";
const NOW = Date.parse(A);
const PROJECT: ProjectOfTheHome = { nom: "brigade", servi: true };

const someFacts = (fields: Partial<Facts> = {}, counters: Partial<Facts["compteurs"]> = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 4, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 2, ...counters },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  livres: [],
 
  ...fields,
});
const readOnes = (facts: Facts): ReadFacts => ({ a: A, faits: facts });
const cook = (ticket: number, station = "parade-box") => ({ ticket, titre: `ticket ${ticket}`, station });
// Le bloc `attend` tel que `status` l'écrit (l'ancien runtime/src/attend.ts, `decrireAttentes`).
const ONE = "attend     1 décision attend le chef depuis 2 j\n  #867  depuis 2 j  merge à faire  Titre\nfin attend\n";
const FIVE = "attend     5 décisions attendent le chef — la plus ancienne depuis 2 j\n  #1  depuis 2 j  merge\nfin attend\n";
const BASE_RED = [
  "nothing cooks: base red since 3 h 05 ago, repair #655 in progress",
  "kitchen    held",
  "base       RED since 3 h 05 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "",
  "rail       …",
].join("\n");
// La même, comme la box l'écrivait avant #928 : l'app la lit toujours.
const BASE_RED_IN_FRENCH = [
  "rien ne cuit : base rouge depuis 3 h 05, réparation #655 en cours",
  "cuisine    retenue",
  "base       ROUGE depuis 3 h 05 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge",
  "",
  "rail       …",
].join("\n");

// Rien de ce qui se lit sur l'accueil n'est une commande, ni le texte brut d'une erreur.
const withoutNothingOfRaw = (text: string) => {
  assert.doesNotMatch(text, /\b(brigade|gh|git|sudo|systemctl|claude)\s+\S/, text);
  assert.doesNotMatch(text, /api\.github\.com|HTTP \d{3}|exit code|`/, text);
};

describe("la ligne d'un projet : sa pastille, et ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
  test("rien n'attend le chef : vert, et ce qui cuit", () => {
    assert.deepEqual(lineOfProject(PROJECT, readOnes(someFacts({ cooks: [cook(867)] }, { auTravail: 1 })), undefined), { nom: "brigade", ton: "vert", dit: "#867 cooking", survol: `read at ${new Date(A).toLocaleTimeString("en-US")} — open it to act` });
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({ cooks: [cook(1), cook(2), cook(3)] })), undefined).dit, "3 cooks at work");
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({ cooks: [cook(1), cook(2)] })), undefined).dit, "#1 and #2 cooking");
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts()), undefined).dit, "nothing cooking, nothing waits for you");
  });

  test("une décision l'attend : jaune, combien, depuis quand — puis ce qui cuit", () => {
    const one = lineOfProject(PROJECT, readOnes(someFacts({ cooks: [cook(870)] }, { attend: 1 })), { texte: "cuisine    ouverte", attend: ONE });
    assert.equal(one.ton, "jaune");
    assert.equal(one.dit, "1 decision awaits you, for 2 d · #870 cooking");
    const five = lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 5 })), { texte: "", attend: FIVE });
    assert.equal(five.dit, "5 decisions await you, for 2 d");
    // Le bloc en anglais (#927) se lit de même.
    const inEnglish = (block: string) => lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 5 })), { texte: "", attend: block }).dit;
    assert.equal(inEnglish("awaiting   5 decisions await the chef — the oldest for 2 d\n  #1  for 2 d  merge\nend awaiting\n"), "5 decisions await you, for 2 d");
    assert.equal(inEnglish("awaiting   1 decision awaits the chef — for 3 h 00\n  #1  for 3 h 00  merge\nend awaiting\n"), "5 decisions await you, for 3 h 00");
    // Sans `status` lu, le nombre se dit, pas depuis quand.
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({}, { attend: 5 })), undefined).dit, "5 decisions await you");
  });

  test("bloqué : rouge — base rouge et sa réparation, cuisine arrêtée ou retenue, runtime éteint, box injoignable", () => {
    const red = lineOfProject(PROJECT, readOnes(someFacts({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_RED });
    assert.deepEqual([red.ton, red.dit], ["rouge", "base red · #655 being repaired"]);
    assert.deepEqual(lineOfProject(PROJECT, readOnes(someFacts({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_RED_IN_FRENCH }), red);
    for (const [state, said] of [["arrêtée", "kitchen stopped"], ["éteinte", "runtime stopped"], ["retenue", "kitchen held"]] as const) {
      const line = lineOfProject(PROJECT, readOnes(someFacts({ etat: state })), undefined);
      assert.deepEqual([line.ton, line.dit], ["rouge", said], state);
    }
    const unreachable = lineOfProject(PROJECT, { a: A, injoignable: true }, undefined);
    assert.deepEqual([unreachable.ton, unreachable.dit], ["rouge", "station unreachable"]);
    // Les causes que `status` dit d'une cuisine retenue.
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({ etat: "retenue" })), { texte: "cuisine    retenue — disjoncteur OUVERT après 3 échecs\nconnexion  perdue sur box : se reconnecter" }).dit, "breaker open · Max connection down");
    assert.equal(lineOfProject(PROJECT, readOnes(someFacts({ etat: "retenue" })), { texte: "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)\nconnection Max EXPIRED for 1 h 00 on station/claude — no ticket is taken any more: `claude /login`" }).dit, "breaker open · Max connection down");
  });

  test("dans l'ordre : ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
    const line = lineOfProject(PROJECT, readOnes(someFacts({ etat: "retenue", cooks: [cook(655), cook(870)] }, { attend: 2 })), { texte: BASE_RED, attend: FIVE.replace("5 décisions", "2 décisions") });
    assert.deepEqual([line.ton, line.dit], ["rouge", "base red · #655 being repaired · 2 decisions await you, for 2 d · #870 cooking"]);
  });

  test("rien de lu n'est dit sain : gris, sans station, pas encore lu, ou une lecture que l'app ne comprend pas", () => {
    assert.equal(lineOfProject({ ...PROJECT, servi: false }, undefined, undefined).ton, "gris");
    assert.deepEqual(lineOfProject(PROJECT, undefined, undefined).dit, "first read in progress…");
    assert.equal(lineOfProject(PROJECT, { a: A, illisible: true }, undefined).ton, "gris");
  });
});

const station = (fields: Partial<StationVue> = {}): StationVue => ({
  id: "g1",
  nom: "parade-box",
  machine: "Linux 6.1.0-47-amd64",
  etat: "en-ligne",
  ligne: "",
 
  dit: "online",
  version: "code 0123456789ab",
  projets: ["brigade", "espace", "calculus"],
  max: "connectee",
  ...fields,
});

describe("la ligne d'une station : son état, ce qu'elle fait, ses projets — sa machine et sa version au survol seulement", () => {
  test("en ligne, ses cooks et ses projets", () => {
    const line = lineOfStation(station(), 2);
    assert.deepEqual(line, { id: "g1", nom: "parade-box", ton: "vert", dit: "online · 2 cooks · brigade, espace, calculus", phrase: "online · 2 cooks running", survol: "Linux 6.1.0-47-amd64 · version code 0123456789ab" });
    assert.doesNotMatch(line.dit, /Linux|6\.1\.0|code /);
    assert.equal(lineOfStation(station({ projets: [] }), 0).dit, "online · idle · runs no kitchen");
  });

  test("aucune pastille grise sans sa phrase : chaque état d'une station qui ne cuit pas dit pourquoi, et le geste (#1758)", () => {
    const states: StationVue[] = [
      station({ etat: "hors-ligne", dit: "offline for 4 min" }),
      station({ etat: "illisible", dit: "unreadable", projets: [] }),
      station({ projets: [] }),
      station({ cuisine: false, etat: "hors-ligne", dit: "offline for 4 min", projets: [] }),
      station({ cuisine: false, projets: [] }),
      station(),
    ];
    for (const state of states) {
      const line = lineOfStation(state, 0);
      if (line.ton === "gris") assert.ok(line.raison !== undefined && line.raison.phrase !== "" && line.raison.bouton.libelle !== "", JSON.stringify(line));
    }
    const outside = lineOfStation(station({ etat: "hors-ligne", dit: "offline for 4 min" }), 0).raison;
    assert.deepEqual([outside?.cle, outside?.phrase, outside?.bouton], ["hors-ligne", "not reached", { libelle: "check again", geste: "relire" }]);
    assert.match(outside?.survol ?? "", /^start Brigade on parade-box's computer/);
    assert.deepEqual(lineOfStation(station({ etat: "illisible", dit: "unreadable" }), 0).raison?.bouton, { libelle: "open its page", geste: "ouvrir-la-page" });
    const without = lineOfStation(station({ projets: [] }), 0).raison;
    assert.deepEqual([without?.phrase, without?.bouton], ["not added to any project", { libelle: "add a project", geste: "ajouter-un-projet" }]);
    // Une phrase tient sur une ligne : quelques mots, le reste au survol.
    for (const reason of [outside, without]) assert.ok((reason?.phrase.length ?? 99) <= 30);
    assert.equal(lineOfStation(station(), 0).raison, undefined);
    assert.equal(lineOfStation(station({ projets: [] }), 0, [{ projet: "a", station: "box" }]).raison, undefined);
  });

  test("en ligne sans cuisine : elle le dit, nomme la station qui porte les cuisines de l'ordinateur, et sa page dit si c'est normal", () => {
    const elsewhere = [{ projet: "a", station: "parade-box" }, { projet: "b", station: "parade-box" }, { projet: "c", station: "parade-box" }];
    const line = lineOfStation(station({ projets: [] }), 0, elsewhere);
    assert.equal(line.dit, "online · idle · runs no kitchen");
    assert.match(line.survol, /your 3 projects cook on parade-box$/);
    assert.match(line.note ?? "", /^Normal: .*parade-box.*nothing requires it\.$/);
    assert.match(lineOfStation(station({ projets: [] }), 0).note ?? "", /^Normal: a station that runs no kitchen/);
    assert.equal(lineOfStation(station(), 0, elsewhere).note, undefined);
    assert.doesNotMatch(lineOfStation(station(), 0, elsewhere).survol, /cook on/);
  });

  test("un téléphone : « does not cook », sans cooks ni projets, et sa page dit qu'il n'est jamais proposé pour cuire ; hors ligne, la mention reste", () => {
    const line = lineOfStation(station({ projets: [], cuisine: false }), 0, [{ projet: "a", station: "parade-box" }]);
    assert.equal(line.dit, "online · does not cook");
    assert.equal(line.phrase, "online · does not cook");
    assert.equal(line.ton, "vert");
    assert.doesNotMatch(line.survol, /cook on/);
    assert.match(line.note ?? "", /^A phone: it runs no cook/);
    assert.equal(lineOfStation(station({ projets: [], cuisine: false, etat: "hors-ligne", dit: "offline for 12 min" }), 0).dit, "offline for 12 min · does not cook");
    assert.equal(lineOfStation(station({ projets: [] }), 0).dit, "online · idle · runs no kitchen");
  });

  test("hors ligne : depuis quand, en gris", () => {
    assert.deepEqual(
      [lineOfStation(station({ etat: "hors-ligne", dit: "offline for 12 min", projets: [], max: null }), 0)].map(({ ton: your, dit: said }) => ({ ton: your, dit: said })),
      [{ ton: "gris", dit: "offline for 12 min · no project" }],
    );
  });

  test("l'état en une phrase, en tête de sa page : en ligne et ses cooks, hors ligne depuis quand — ni machine, ni version, ni projets", () => {
    assert.deepEqual(
      [
        lineOfStation(station(), 2),
        lineOfStation(station(), 1),
        lineOfStation(station(), 0),
        lineOfStation(station({ etat: "hors-ligne", dit: "offline for 12 min", max: null }), 0),
        lineOfStation(station(), 3),
        lineOfStation(station({ etat: "illisible", dit: "unreadable", machine: "", version: "", projets: [] }), 0),
      ].map(({ phrase: sentence }) => sentence),
      ["online · 2 cooks running", "online · 1 cook running", "online · no cook running", "offline for 12 min", "online · 3 cooks running", "unreadable"],
    );
    for (const cooks of [0, 2]) assert.doesNotMatch(lineOfStation(station(), cooks).phrase, /Linux|version|brigade|espace/);
  });
});

const READ: SeenOfStations = { a: A, stations: [station()] };

describe("la ligne de santé : Max et GitHub, verte et discrète quand tout va, une phrase quand l'un cloche", () => {
  test("tout va : vert, deux coches", () => {
    assert.deepEqual(health(READ, undefined, [], NOW).ton, "vert");
    assert.equal(health(READ, undefined, [], NOW).dit, "Max ✓  ·  GitHub ✓");
  });

  test("GitHub limite les appels : il le dit, et l'heure de la reprise quand GitHub l'a donnée", () => {
    const resumption = "2026-10-16T13:16:00.000Z";
    const limited = health({ ...READ, sans: "your stations could not be read on GitHub — gh: API rate limit exceeded for user ID 1. (HTTP 403)", limite: { reprise: resumption } }, undefined, [], NOW);
    assert.equal(limited.ton, "rouge");
    assert.equal(limited.dit, `Max ✓  ·  GitHub limits calls, back around ${hourShort(resumption)}`);
    withoutNothingOfRaw(limited.dit);
    assert.equal(health({ ...READ, sans: "your stations could not be read on GitHub — error connecting to api.github.com" }, undefined, [], NOW).dit, "Max ✓  ·  GitHub cannot be reached");
    assert.equal(health({ ...READ, sans: "your stations could not be read on GitHub — something unheard of" }, undefined, [], NOW).dit, "Max ✓  ·  GitHub could not be read");
  });

  test("Max : une connexion perdue sur une station, ou le jeton qu'une box dit près de son échéance", () => {
    assert.equal(health({ a: A, stations: [station({ max: "perdue" })] }, undefined, [], NOW).dit, "Max: connection lost on parade-box  ·  GitHub ✓");
    const block = "attend     1 décision attend le chef depuis 2 h 00\n  jeton  depuis 2 h 00  jeton de la connexion Max près de son échéance — il échoit le 2026-11-05, 365 jours après sa création (2025-11-05) — à faire avant : refaire le jeton — `claude setup-token` …\nfin attend\n";
    const tokenValue = health(READ, undefined, [block], NOW);
    assert.deepEqual([tokenValue.ton, tokenValue.dit], ["rouge", "Max: token to redo within 20 d  ·  GitHub ✓"]);
    // Le même bloc, en anglais (#927) : `token`, `for`, `it expires on`, `EXPIRED`.
    const token = "awaiting   1 decision awaits the chef — for 2 h 00\n  token  for 2 h 00  Max connection token close to its expiry — it expires on 2026-11-05, 365 days after its creation (2025-11-05) — to do before then: remake the token …\nend awaiting\n";
    assert.equal(health(READ, undefined, [token], NOW).dit, "Max: token to redo within 20 d  ·  GitHub ✓");
    const echu = "  token  for 2 h 00  Max connection token EXPIRED since 2026-10-01, 365 days after its creation (2025-10-01) — to do: remake the token …";
    assert.equal(health(READ, undefined, [echu], NOW).dit, "Max: token expired, to redo  ·  GitHub ✓");
    const session = "  session  for 2 h 00  Max session renewal failing (http: 401) — expiry unknown — to restore: …";
    assert.equal(health(READ, undefined, [session], NOW).dit, "Max: session renewal failed  ·  GitHub ✓");
    withoutNothingOfRaw(tokenValue.dit);
  });

  test("ce qui n'est pas su ne se dit pas bon : gris, avec un point d'interrogation", () => {
    const notRead = health(undefined, undefined, [], NOW);
    assert.deepEqual([notRead.ton, notRead.dit], ["gris", "Max ?  ·  GitHub ?"]);
    assert.match(notRead.survol, /not checked/);
    assert.equal(health({ a: A, stations: [station({ max: null })] }, undefined, [], NOW).dit, "Max ?  ·  GitHub ✓");
  });
});

describe("l'accueil tenu : chaque lecture rend l'accueil à redessiner, rien quand il ne change pas", () => {
  test("`faits`, `status` et les stations se combinent : les cooks de chaque projet comptent pour leur station", () => {
    const home = holdHome({ projets: () => [PROJECT, { nom: "espace", servi: true }], maintenant: () => NOW });
    const facts = (project: string, fields: Partial<Facts>, counters: Partial<Facts["compteurs"]> = {}) => ({ projet: project, demande: 1, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(someFacts(fields, counters)) }] });
    assert.ok(home.faits(facts("brigade", { cooks: [cook(867)] })));
    assert.equal(home.faits(facts("brigade", { cooks: [cook(867)] })), undefined, "rien n'a changé");
    home.faits(facts("espace", { cooks: [cook(12)] }, { attend: 5 }));
    const seenOne = home.stations(READ);
    assert.deepEqual(seenOne?.stations?.map(({ dit: said }) => said), ["online · 2 cooks · brigade, espace, calculus"]);
    assert.equal(home.status({ projet: "espace", demande: 1, a: A, attend: FIVE, sorties: [{ commande: "status", texte: "cuisine    ouverte" }] })?.projets[1]?.dit, "5 decisions await you, for 2 d · #12 cooking");
    // Le `status` que plus rien ne rafraîchit est lâché.
    assert.equal(home.veiller(["brigade"])?.projets[1]?.dit, "5 decisions await you · #12 cooking");
    // Hors ligne (#1818) : rien ne change, la ligne garde ce qui a été lu en dernier — sa station n'y est pour rien.
    const outsideLine = { projet: "espace", demande: 1, a: A, erreur: "GitHub could not be reached to read the Kitchen board of acme/espace: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true } as const;
    assert.equal(home.faits(outsideLine), undefined);
    assert.equal(home.status(outsideLine), undefined);
    // Une box qui n'est pas jointe se dit injoignable — rien du brut de l'erreur.
    const unreachable = home.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ brigade brigade facts\nconnect to host box port 22: Connection refused\n→ exit code 255", atteinte: false, cas: null });
    assert.deepEqual(unreachable?.projets[0], lineOfProject(PROJECT, { a: A, injoignable: true }, undefined));
    for (const line of [...(unreachable?.projets ?? []), ...(unreachable?.stations ?? []), unreachable?.sante]) withoutNothingOfRaw(`${line?.dit}\n${line?.survol}`);
  });
});

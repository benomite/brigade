// L'accueil (#870) : une ligne par projet, une par station, et la ligne de santé — chacune dite en
// quelques mots de l'app, sa pastille posée d'après des règles fixes, et rien de brut : ni commande,
// ni texte d'erreur. Ce qui se calcule ici ; ce que la vue en pose est dans accueil-vue.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireEtat, lireEtat } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import type { EtatStation } from "../../runtime/src/projections/stations.ts";
import { lineDeProject, lineDeStation, sante, holdHome, type ReadFacts, type ProjectDeLHome } from "../src/home.ts";
import type { Facts } from "../src/facts.ts";
import { heureCourte } from "../src/format.ts";
import type { Outage } from "../src/outages/outages.ts";
import type { StationVue, VuDesStations } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";
const MAINTENANT = Date.parse(A);
const PROJECT: ProjectDeLHome = { nom: "brigade", servi: true };

const someFacts = (champs: Partial<Facts> = {}, compteurs: Partial<Facts["compteurs"]> = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 4, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 2, ...compteurs },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  livres: [],
  urgence: null,
  ...champs,
});
const lus = (facts: Facts): ReadFacts => ({ a: A, faits: facts });
const cook = (ticket: number, station = "parade-box") => ({ ticket, titre: `ticket ${ticket}`, station });
// Le bloc `attend` tel que `status` l'écrit (runtime/src/attend.ts, `decrireAttentes`).
const UNE = "attend     1 décision attend le chef depuis 2 j\n  #867  depuis 2 j  merge à faire  Titre\nfin attend\n";
const CINQ = "attend     5 décisions attendent le chef — la plus ancienne depuis 2 j\n  #1  depuis 2 j  merge\nfin attend\n";
const BASE_RED = [
  "nothing cooks: base red since 3 h 05 ago, repair #655 in progress",
  "kitchen    held",
  "base       RED since 3 h 05 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "",
  "rail       …",
].join("\n");
// La même, comme la box l'écrivait avant #928 : l'app la lit toujours.
const BASE_RED_EN_FRANCAIS = [
  "rien ne cuit : base rouge depuis 3 h 05, réparation #655 en cours",
  "cuisine    retenue",
  "base       ROUGE depuis 3 h 05 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge",
  "",
  "rail       …",
].join("\n");

// Rien de ce qui se lit sur l'accueil n'est une commande, ni le texte brut d'une erreur.
const sansRienDeBrut = (texte: string) => {
  assert.doesNotMatch(texte, /\b(brigade|gh|git|sudo|systemctl|claude)\s+\S/, texte);
  assert.doesNotMatch(texte, /api\.github\.com|HTTP \d{3}|exit code|`/, texte);
};

describe("la ligne d'un projet : sa pastille, et ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
  test("rien n'attend le chef : vert, et ce qui cuit", () => {
    assert.deepEqual(lineDeProject(PROJECT, lus(someFacts({ cooks: [cook(867)] }, { auTravail: 1 })), undefined), { nom: "brigade", ton: "vert", dit: "#867 cooking", survol: `read at ${new Date(A).toLocaleTimeString("en-US")} — open it to act` });
    assert.equal(lineDeProject(PROJECT, lus(someFacts({ cooks: [cook(1), cook(2), cook(3)] })), undefined).dit, "3 cooks at work");
    assert.equal(lineDeProject(PROJECT, lus(someFacts({ cooks: [cook(1), cook(2)] })), undefined).dit, "#1 and #2 cooking");
    assert.equal(lineDeProject(PROJECT, lus(someFacts()), undefined).dit, "nothing cooking, nothing waits for you");
  });

  test("une décision l'attend : jaune, combien, depuis quand — puis ce qui cuit", () => {
    const une = lineDeProject(PROJECT, lus(someFacts({ cooks: [cook(870)] }, { attend: 1 })), { texte: "cuisine    ouverte", attend: UNE });
    assert.equal(une.ton, "jaune");
    assert.equal(une.dit, "1 decision awaits you, for 2 d · #870 cooking");
    const cinq = lineDeProject(PROJECT, lus(someFacts({}, { attend: 5 })), { texte: "", attend: CINQ });
    assert.equal(cinq.dit, "5 decisions await you, for 2 d");
    // Le bloc en anglais (#927) se lit de même.
    const enAnglais = (bloc: string) => lineDeProject(PROJECT, lus(someFacts({}, { attend: 5 })), { texte: "", attend: bloc }).dit;
    assert.equal(enAnglais("awaiting   5 decisions await the chef — the oldest for 2 d\n  #1  for 2 d  merge\nend awaiting\n"), "5 decisions await you, for 2 d");
    assert.equal(enAnglais("awaiting   1 decision awaits the chef — for 3 h 00\n  #1  for 3 h 00  merge\nend awaiting\n"), "5 decisions await you, for 3 h 00");
    // Sans `status` lu, le nombre se dit, pas depuis quand.
    assert.equal(lineDeProject(PROJECT, lus(someFacts({}, { attend: 5 })), undefined).dit, "5 decisions await you");
  });

  test("bloqué : rouge — base rouge et sa réparation, cuisine arrêtée ou retenue, runtime éteint, box injoignable", () => {
    const red = lineDeProject(PROJECT, lus(someFacts({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_RED });
    assert.deepEqual([red.ton, red.dit], ["rouge", "base red · #655 being repaired"]);
    assert.deepEqual(lineDeProject(PROJECT, lus(someFacts({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_RED_EN_FRANCAIS }), red);
    for (const [state, dit] of [["arrêtée", "kitchen stopped"], ["éteinte", "runtime stopped"], ["retenue", "kitchen held"]] as const) {
      const line = lineDeProject(PROJECT, lus(someFacts({ etat: state })), undefined);
      assert.deepEqual([line.ton, line.dit], ["rouge", dit], state);
    }
    const injoignable = lineDeProject(PROJECT, { a: A, injoignable: true }, undefined);
    assert.deepEqual([injoignable.ton, injoignable.dit], ["rouge", "station unreachable"]);
    // Les causes que `status` dit d'une cuisine retenue.
    assert.equal(lineDeProject(PROJECT, lus(someFacts({ etat: "retenue" })), { texte: "cuisine    retenue — disjoncteur OUVERT après 3 échecs\nconnexion  perdue sur box : se reconnecter" }).dit, "breaker open · Max connection down");
    assert.equal(lineDeProject(PROJECT, lus(someFacts({ etat: "retenue" })), { texte: "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)\nconnection Max EXPIRED for 1 h 00 on station/claude — no ticket is taken any more: `claude /login`" }).dit, "breaker open · Max connection down");
  });

  test("dans l'ordre : ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
    const line = lineDeProject(PROJECT, lus(someFacts({ etat: "retenue", cooks: [cook(655), cook(870)] }, { attend: 2 })), { texte: BASE_RED, attend: CINQ.replace("5 décisions", "2 décisions") });
    assert.deepEqual([line.ton, line.dit], ["rouge", "base red · #655 being repaired · 2 decisions await you, for 2 d · #870 cooking"]);
    // Toute la cuisine attend le chef : la décision le dit.
    const urgence = { decision: "#867", ticket: 867, cause: "merge", geste: "merger", url: null, depuis: A, retenus: [867], autres: [] };
    assert.equal(lineDeProject(PROJECT, lus(someFacts({ urgence }, { attend: 1 })), undefined).dit, "1 decision awaits you — nothing cooks until then");
  });

  test("rien de lu n'est dit sain : gris, sans station, pas encore lu, ou une lecture que l'app ne comprend pas", () => {
    assert.equal(lineDeProject({ ...PROJECT, servi: false }, undefined, undefined).ton, "gris");
    assert.deepEqual(lineDeProject(PROJECT, undefined, undefined).dit, "first read in progress…");
    assert.equal(lineDeProject(PROJECT, { a: A, illisible: true }, undefined).ton, "gris");
  });
});

const station = (champs: Partial<StationVue> = {}): StationVue => ({
  id: "g1",
  nom: "parade-box",
  machine: "Linux 6.1.0-47-amd64",
  etat: "en-ligne",
  ligne: "",
  pannes: [],
  dit: "online",
  version: "code 0123456789ab",
  projets: ["brigade", "espace", "calculus"],
  max: "connectee",
  ...champs,
});
const UPDATE: Outage = { cle: "mise-a-jour:x", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed — stayed on version 1.4.0", survol: "", bouton: { libelle: "dismiss", geste: "ecarter" } };
const MAX_PERDUE: Outage = { cle: "connexion-max:x", sujet: "connexion-max", ligne: "Max connection lost", survol: "", bouton: { libelle: "log in", geste: "login" } };

describe("la ligne d'une station : son état, ce qu'elle fait, ses projets — sa machine et sa version au survol seulement", () => {
  test("en ligne, ses cooks et ses projets", () => {
    const line = lineDeStation(station(), 2);
    assert.deepEqual(line, { id: "g1", nom: "parade-box", ton: "vert", dit: "online · 2 cooks · brigade, espace, calculus", phrase: "online · 2 cooks running", survol: "Linux 6.1.0-47-amd64 · version code 0123456789ab" });
    assert.doesNotMatch(line.dit, /Linux|6\.1\.0|code /);
    assert.equal(lineDeStation(station({ projets: [] }), 0).dit, "online · idle · runs no kitchen");
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
      const line = lineDeStation(state, 0);
      if (line.ton === "gris") assert.ok(line.raison !== undefined && line.raison.phrase !== "" && line.raison.bouton.libelle !== "", JSON.stringify(line));
    }
    const outside = lineDeStation(station({ etat: "hors-ligne", dit: "offline for 4 min" }), 0).raison;
    assert.deepEqual([outside?.cle, outside?.phrase, outside?.bouton], ["hors-ligne", "not reached", { libelle: "check again", geste: "relire" }]);
    assert.match(outside?.survol ?? "", /^start Brigade on parade-box's computer/);
    assert.deepEqual(lineDeStation(station({ etat: "illisible", dit: "unreadable" }), 0).raison?.bouton, { libelle: "open its page", geste: "ouvrir-la-page" });
    const sans = lineDeStation(station({ projets: [] }), 0).raison;
    assert.deepEqual([sans?.phrase, sans?.bouton], ["not added to any project", { libelle: "add a project", geste: "ajouter-un-projet" }]);
    // Une phrase tient sur une ligne : quelques mots, le reste au survol.
    for (const raison of [outside, sans]) assert.ok((raison?.phrase.length ?? 99) <= 30);
    assert.equal(lineDeStation(station(), 0).raison, undefined);
    assert.equal(lineDeStation(station({ projets: [] }), 0, [{ projet: "a", station: "box" }]).raison, undefined);
  });

  test("en ligne sans cuisine : elle le dit, nomme la station qui porte les cuisines de l'ordinateur, et sa page dit si c'est normal", () => {
    const ailleurs = [{ projet: "a", station: "parade-box" }, { projet: "b", station: "parade-box" }, { projet: "c", station: "parade-box" }];
    const line = lineDeStation(station({ projets: [] }), 0, ailleurs);
    assert.equal(line.dit, "online · idle · runs no kitchen");
    assert.match(line.survol, /your 3 projects cook on parade-box$/);
    assert.match(line.note ?? "", /^Normal: .*parade-box.*nothing requires it\.$/);
    assert.match(lineDeStation(station({ projets: [] }), 0).note ?? "", /^Normal: a station that runs no kitchen/);
    assert.equal(lineDeStation(station(), 0, ailleurs).note, undefined);
    assert.doesNotMatch(lineDeStation(station(), 0, ailleurs).survol, /cook on/);
  });

  test("un téléphone : « does not cook », sans cooks ni projets, et sa page dit qu'il n'est jamais proposé pour cuire ; hors ligne, la mention reste", () => {
    const line = lineDeStation(station({ projets: [], cuisine: false }), 0, [{ projet: "a", station: "parade-box" }]);
    assert.equal(line.dit, "online · does not cook");
    assert.equal(line.phrase, "online · does not cook");
    assert.equal(line.ton, "vert");
    assert.doesNotMatch(line.survol, /cook on/);
    assert.match(line.note ?? "", /^A phone: it runs no cook/);
    assert.equal(lineDeStation(station({ projets: [], cuisine: false, etat: "hors-ligne", dit: "offline for 12 min" }), 0).dit, "offline for 12 min · does not cook");
    assert.equal(lineDeStation(station({ projets: [] }), 0).dit, "online · idle · runs no kitchen");
  });

  test("hors ligne : depuis quand, en gris ; une mise à jour ratée, jaune ; sa connexion Max perdue, rouge", () => {
    assert.deepEqual(
      [lineDeStation(station({ etat: "hors-ligne", dit: "offline for 12 min", projets: [], max: null }), 0)].map(({ ton, dit }) => ({ ton, dit })),
      [{ ton: "gris", dit: "offline for 12 min · no project" }],
    );
    assert.deepEqual([lineDeStation(station({ pannes: [UPDATE] }), 0)].map(({ ton, dit }) => [ton, dit]), [["jaune", "online · update failed · brigade, espace, calculus"]]);
    assert.deepEqual([lineDeStation(station({ pannes: [MAX_PERDUE], max: "perdue" }), 0)].map(({ ton, dit }) => [ton, dit]), [["rouge", "online · Max connection lost · brigade, espace, calculus"]]);
  });

  test("l'état en une phrase, en tête de sa page : en ligne et ses cooks, hors ligne depuis quand — ni machine, ni version, ni projets", () => {
    assert.deepEqual(
      [
        lineDeStation(station(), 2),
        lineDeStation(station(), 1),
        lineDeStation(station(), 0),
        lineDeStation(station({ etat: "hors-ligne", dit: "offline for 12 min", max: null }), 0),
        lineDeStation(station(), 3),
        lineDeStation(station({ etat: "illisible", dit: "unreadable", machine: "", version: "", projets: [] }), 0),
      ].map(({ phrase }) => phrase),
      ["online · 2 cooks running", "online · 1 cook running", "online · no cook running", "offline for 12 min", "online · 3 cooks running", "unreadable"],
    );
    for (const cooks of [0, 2]) assert.doesNotMatch(lineDeStation(station(), cooks).phrase, /Linux|version|brigade|espace/);
  });
});

const LUES: VuDesStations = { a: A, stations: [station()] };

describe("la ligne de santé : Max et GitHub, verte et discrète quand tout va, une phrase quand l'un cloche", () => {
  test("tout va : vert, deux coches", () => {
    assert.deepEqual(sante(LUES, undefined, [], MAINTENANT).ton, "vert");
    assert.equal(sante(LUES, undefined, [], MAINTENANT).dit, "Max ✓  ·  GitHub ✓");
  });

  test("GitHub limite les appels : il le dit, et l'heure de la reprise quand GitHub l'a donnée", () => {
    const resumption = "2026-10-16T13:16:00.000Z";
    const limitee = sante({ ...LUES, sans: "your stations could not be read on GitHub — gh: API rate limit exceeded for user ID 1. (HTTP 403)", limite: { reprise: resumption } }, undefined, [], MAINTENANT);
    assert.equal(limitee.ton, "rouge");
    assert.equal(limitee.dit, `Max ✓  ·  GitHub limits calls, back around ${heureCourte(resumption)}`);
    sansRienDeBrut(limitee.dit);
    assert.equal(sante({ ...LUES, sans: "your stations could not be read on GitHub — error connecting to api.github.com" }, undefined, [], MAINTENANT).dit, "Max ✓  ·  GitHub cannot be reached");
    assert.equal(sante({ ...LUES, sans: "your stations could not be read on GitHub — something unheard of" }, undefined, [], MAINTENANT).dit, "Max ✓  ·  GitHub could not be read");
  });

  test("Max : une connexion perdue sur une station, ou le jeton qu'une box dit près de son échéance", () => {
    assert.equal(sante({ a: A, stations: [station({ max: "perdue" })] }, undefined, [], MAINTENANT).dit, "Max: connection lost on parade-box  ·  GitHub ✓");
    const bloc = "attend     1 décision attend le chef depuis 2 h 00\n  jeton  depuis 2 h 00  jeton de la connexion Max près de son échéance — il échoit le 2026-11-05, 365 jours après sa création (2025-11-05) — à faire avant : refaire le jeton — `claude setup-token` …\nfin attend\n";
    const jeton = sante(LUES, undefined, [bloc], MAINTENANT);
    assert.deepEqual([jeton.ton, jeton.dit], ["rouge", "Max: token to redo within 20 d  ·  GitHub ✓"]);
    // Le même bloc, en anglais (#927) : `token`, `for`, `it expires on`, `EXPIRED`.
    const token = "awaiting   1 decision awaits the chef — for 2 h 00\n  token  for 2 h 00  Max connection token close to its expiry — it expires on 2026-11-05, 365 days after its creation (2025-11-05) — to do before then: remake the token …\nend awaiting\n";
    assert.equal(sante(LUES, undefined, [token], MAINTENANT).dit, "Max: token to redo within 20 d  ·  GitHub ✓");
    const echu = "  token  for 2 h 00  Max connection token EXPIRED since 2026-10-01, 365 days after its creation (2025-10-01) — to do: remake the token …";
    assert.equal(sante(LUES, undefined, [echu], MAINTENANT).dit, "Max: token expired, to redo  ·  GitHub ✓");
    const session = "  session  for 2 h 00  Max session renewal failing (http: 401) — expiry unknown — to restore: …";
    assert.equal(sante(LUES, undefined, [session], MAINTENANT).dit, "Max: session renewal failed  ·  GitHub ✓");
    sansRienDeBrut(jeton.dit);
  });

  test("ce qui n'est pas su ne se dit pas bon : gris, avec un point d'interrogation", () => {
    const pasLues = sante(undefined, undefined, [], MAINTENANT);
    assert.deepEqual([pasLues.ton, pasLues.dit], ["gris", "Max ?  ·  GitHub ?"]);
    assert.match(pasLues.survol, /not checked/);
    assert.equal(sante({ a: A, stations: [station({ max: null })] }, undefined, [], MAINTENANT).dit, "Max ?  ·  GitHub ✓");
  });
});

describe("l'accueil tenu : chaque lecture rend l'accueil à redessiner, rien quand il ne change pas", () => {
  test("`faits`, `status` et les stations se combinent : les cooks de chaque projet comptent pour leur station", () => {
    const home = holdHome({ projets: () => [PROJECT, { nom: "espace", servi: true }], maintenant: () => MAINTENANT });
    const facts = (project: string, champs: Partial<Facts>, compteurs: Partial<Facts["compteurs"]> = {}) => ({ projet: project, demande: 1, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(someFacts(champs, compteurs)) }] });
    assert.ok(home.faits(facts("brigade", { cooks: [cook(867)] })));
    assert.equal(home.faits(facts("brigade", { cooks: [cook(867)] })), undefined, "rien n'a changé");
    home.faits(facts("espace", { cooks: [cook(12)] }, { attend: 5 }));
    const vu = home.stations(LUES);
    assert.deepEqual(vu?.stations?.map(({ dit }) => dit), ["online · 2 cooks · brigade, espace, calculus"]);
    assert.equal(home.status({ projet: "espace", demande: 1, a: A, attend: CINQ, sorties: [{ commande: "status", texte: "cuisine    ouverte" }] })?.projets[1]?.dit, "5 decisions await you, for 2 d · #12 cooking");
    // Le `status` que plus rien ne rafraîchit est lâché.
    assert.equal(home.veiller(["brigade"])?.projets[1]?.dit, "5 decisions await you · #12 cooking");
    // Hors ligne (#1818) : rien ne change, la ligne garde ce qui a été lu en dernier — sa station n'y est pour rien.
    const outsideLine = { projet: "espace", demande: 1, a: A, erreur: "GitHub could not be reached to read the Kitchen board of acme/espace: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true } as const;
    assert.equal(home.faits(outsideLine), undefined);
    assert.equal(home.status(outsideLine), undefined);
    // Une box qui n'est pas jointe se dit injoignable — rien du brut de l'erreur.
    const injoignable = home.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ brigade brigade facts\nconnect to host box port 22: Connection refused\n→ exit code 255", atteinte: false, cas: null });
    assert.deepEqual(injoignable?.projets[0], lineDeProject(PROJECT, { a: A, injoignable: true }, undefined));
    for (const line of [...(injoignable?.projets ?? []), ...(injoignable?.stations ?? []), injoignable?.sante]) sansRienDeBrut(`${line?.dit}\n${line?.survol}`);
  });
});

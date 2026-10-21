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
import { ligneDeProjet, ligneDeStation, sante, saturees, tenirAccueil, type FaitsLus, type ProjetDeLAccueil } from "../src/accueil.ts";
import type { Faits } from "../src/faits.ts";
import { heureCourte } from "../src/format.ts";
import type { Panne } from "../src/pannes/pannes.ts";
import type { StationVue, VuDesStations } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";
const MAINTENANT = Date.parse(A);
const PROJET: ProjetDeLAccueil = { nom: "brigade", box: true, desinstalle: false };

const desFaits = (champs: Partial<Faits> = {}, compteurs: Partial<Faits["compteurs"]> = {}): Faits => ({
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
const lus = (faits: Faits): FaitsLus => ({ a: A, faits });
const cook = (ticket: number, station = "parade-box") => ({ ticket, titre: `ticket ${ticket}`, station });
// Le bloc `attend` tel que `status` l'écrit (runtime/src/attend.ts, `decrireAttentes`).
const UNE = "attend     1 décision attend le chef depuis 2 j\n  #867  depuis 2 j  merge à faire  Titre\nfin attend\n";
const CINQ = "attend     5 décisions attendent le chef — la plus ancienne depuis 2 j\n  #1  depuis 2 j  merge\nfin attend\n";
const BASE_ROUGE = [
  "nothing cooks: base red since 3 h 05 ago, repair #655 in progress",
  "kitchen    held",
  "base       RED since 3 h 05 ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
  "",
  "rail       …",
].join("\n");
// La même, comme la box l'écrivait avant #928 : l'app la lit toujours.
const BASE_ROUGE_EN_FRANCAIS = [
  "rien ne cuit : base rouge depuis 3 h 05, réparation #655 en cours",
  "cuisine    retenue",
  "base       ROUGE depuis 3 h 05 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge",
  "",
  "rail       …",
].join("\n");

// Rien de ce qui se lit sur l'accueil n'est une commande, ni le texte brut d'une erreur.
const sansRienDeBrut = (texte: string) => {
  assert.doesNotMatch(texte, /\b(ssh|brigade|gh|git|sudo|systemctl|claude)\s+\S/, texte);
  assert.doesNotMatch(texte, /api\.github\.com|HTTP \d{3}|exit code|`/, texte);
};

describe("la ligne d'un projet : sa pastille, et ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
  test("rien n'attend le chef : vert, et ce qui cuit", () => {
    assert.deepEqual(ligneDeProjet(PROJET, lus(desFaits({ cooks: [cook(867)] }, { auTravail: 1 })), undefined), { nom: "brigade", ton: "vert", dit: "#867 cooking", survol: `read at ${new Date(A).toLocaleTimeString("en-US")} — open it to act` });
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({ cooks: [cook(1), cook(2), cook(3)] })), undefined).dit, "3 cooks at work");
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({ cooks: [cook(1), cook(2)] })), undefined).dit, "#1 and #2 cooking");
    assert.equal(ligneDeProjet(PROJET, lus(desFaits()), undefined).dit, "nothing cooking, nothing waits for you");
  });

  test("une décision l'attend : jaune, combien, depuis quand — puis ce qui cuit", () => {
    const une = ligneDeProjet(PROJET, lus(desFaits({ cooks: [cook(870)] }, { attend: 1 })), { texte: "cuisine    ouverte", attend: UNE });
    assert.equal(une.ton, "jaune");
    assert.equal(une.dit, "1 decision awaits you, for 2 d · #870 cooking");
    const cinq = ligneDeProjet(PROJET, lus(desFaits({}, { attend: 5 })), { texte: "", attend: CINQ });
    assert.equal(cinq.dit, "5 decisions await you, for 2 d");
    // Le bloc en anglais (#927) se lit de même.
    const enAnglais = (bloc: string) => ligneDeProjet(PROJET, lus(desFaits({}, { attend: 5 })), { texte: "", attend: bloc }).dit;
    assert.equal(enAnglais("awaiting   5 decisions await the chef — the oldest for 2 d\n  #1  for 2 d  merge\nend awaiting\n"), "5 decisions await you, for 2 d");
    assert.equal(enAnglais("awaiting   1 decision awaits the chef — for 3 h 00\n  #1  for 3 h 00  merge\nend awaiting\n"), "5 decisions await you, for 3 h 00");
    // Sans `status` lu, le nombre se dit, pas depuis quand.
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({}, { attend: 5 })), undefined).dit, "5 decisions await you");
  });

  test("bloqué : rouge — base rouge et sa réparation, cuisine arrêtée ou retenue, runtime éteint, box injoignable", () => {
    const rouge = ligneDeProjet(PROJET, lus(desFaits({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_ROUGE });
    assert.deepEqual([rouge.ton, rouge.dit], ["rouge", "base red · #655 being repaired"]);
    assert.deepEqual(ligneDeProjet(PROJET, lus(desFaits({ etat: "retenue", cooks: [cook(655)] }, { auTravail: 1 })), { texte: BASE_ROUGE_EN_FRANCAIS }), rouge);
    for (const [etat, dit] of [["arrêtée", "kitchen stopped"], ["éteinte", "runtime stopped"], ["retenue", "kitchen held"]] as const) {
      const ligne = ligneDeProjet(PROJET, lus(desFaits({ etat })), undefined);
      assert.deepEqual([ligne.ton, ligne.dit], ["rouge", dit], etat);
    }
    const injoignable = ligneDeProjet(PROJET, { a: A, injoignable: true }, undefined);
    assert.deepEqual([injoignable.ton, injoignable.dit], ["rouge", "station unreachable"]);
    // Les causes que `status` dit d'une cuisine retenue.
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({ etat: "retenue" })), { texte: "cuisine    retenue — disjoncteur OUVERT après 3 échecs\nconnexion  perdue sur box : se reconnecter" }).dit, "breaker open · Max connection down");
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({ etat: "retenue" })), { texte: "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)\nconnection Max EXPIRED for 1 h 00 on station/claude — no ticket is taken any more: `claude /login`" }).dit, "breaker open · Max connection down");
  });

  test("dans l'ordre : ce qui bloque, ce qui attend le chef, puis ce qui cuit", () => {
    const ligne = ligneDeProjet(PROJET, lus(desFaits({ etat: "retenue", cooks: [cook(655), cook(870)] }, { attend: 2 })), { texte: BASE_ROUGE, attend: CINQ.replace("5 décisions", "2 décisions") });
    assert.deepEqual([ligne.ton, ligne.dit], ["rouge", "base red · #655 being repaired · 2 decisions await you, for 2 d · #870 cooking"]);
    // Toute la cuisine attend le chef : la décision le dit.
    const urgence = { decision: "#867", ticket: 867, cause: "merge", geste: "merger", url: null, depuis: A, retenus: [867], autres: [] };
    assert.equal(ligneDeProjet(PROJET, lus(desFaits({ urgence }, { attend: 1 })), undefined).dit, "1 decision awaits you — nothing cooks until then");
  });

  test("rien de lu n'est dit sain : gris, sans box, désinstallé, pas encore lu, ou une box qui ne répond pas comme l'app l'attend", () => {
    assert.equal(ligneDeProjet({ ...PROJET, box: false }, undefined, undefined).ton, "gris");
    assert.equal(ligneDeProjet({ ...PROJET, desinstalle: true }, lus(desFaits()), undefined).ton, "gris");
    assert.deepEqual(ligneDeProjet(PROJET, undefined, undefined).dit, "first read in progress…");
    assert.equal(ligneDeProjet(PROJET, { a: A, illisible: true }, undefined).ton, "gris");
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
const MISE_A_JOUR: Panne = { cle: "mise-a-jour:x", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed — stayed on version 1.4.0", survol: "", bouton: { libelle: "dismiss", geste: "ecarter" } };
const MAX_PERDUE: Panne = { cle: "connexion-max:x", sujet: "connexion-max", ligne: "Max connection lost", survol: "", bouton: { libelle: "log in", geste: "login" } };

describe("la ligne d'une station : son état, ce qu'elle fait, ses projets — sa machine et sa version au survol seulement", () => {
  test("en ligne, ses cooks et ses projets", () => {
    const ligne = ligneDeStation(station(), 2, false);
    assert.deepEqual(ligne, { id: "g1", nom: "parade-box", ton: "vert", dit: "online · 2 cooks · brigade, espace, calculus", phrase: "online · 2 cooks running", survol: "Linux 6.1.0-47-amd64 · version code 0123456789ab" });
    assert.doesNotMatch(ligne.dit, /Linux|6\.1\.0|code /);
    assert.equal(ligneDeStation(station({ projets: [] }), 0, false).dit, "online · idle · runs no kitchen");
  });

  test("en ligne sans cuisine : elle le dit, nomme la station qui porte les cuisines de l'ordinateur, et sa page dit si c'est normal", () => {
    const ailleurs = [{ projet: "a", station: "parade-box" }, { projet: "b", station: "parade-box" }, { projet: "c", station: "parade-box" }];
    const ligne = ligneDeStation(station({ projets: [] }), 0, false, ailleurs);
    assert.equal(ligne.dit, "online · idle · runs no kitchen");
    assert.match(ligne.survol, /your 3 projects cook on parade-box$/);
    assert.match(ligne.note ?? "", /^Normal: .*parade-box.*nothing requires it\.$/);
    assert.match(ligneDeStation(station({ projets: [] }), 0, false).note ?? "", /^Normal: a station that runs no kitchen/);
    assert.equal(ligneDeStation(station(), 0, false, ailleurs).note, undefined);
    assert.doesNotMatch(ligneDeStation(station(), 0, false, ailleurs).survol, /cook on/);
  });

  test("un téléphone : « does not cook », sans cooks ni projets, et sa page dit qu'il n'est jamais proposé pour cuire ; hors ligne, la mention reste", () => {
    const ligne = ligneDeStation(station({ projets: [], cuisine: false }), 0, false, [{ projet: "a", station: "parade-box" }]);
    assert.equal(ligne.dit, "online · does not cook");
    assert.equal(ligne.phrase, "online · does not cook");
    assert.equal(ligne.ton, "vert");
    assert.doesNotMatch(ligne.survol, /cook on/);
    assert.match(ligne.note ?? "", /^A phone: it runs no cook/);
    assert.equal(ligneDeStation(station({ projets: [], cuisine: false, etat: "hors-ligne", dit: "offline for 12 min" }), 0, false).dit, "offline for 12 min · does not cook");
    assert.equal(ligneDeStation(station({ projets: [] }), 0, false).dit, "online · idle · runs no kitchen");
  });

  test("hors ligne : depuis quand, en gris ; saturée ou une mise à jour ratée, jaune ; sa connexion Max perdue, rouge", () => {
    assert.deepEqual(
      [ligneDeStation(station({ etat: "hors-ligne", dit: "offline for 12 min", projets: [], max: null }), 0, false)].map(({ ton, dit }) => ({ ton, dit })),
      [{ ton: "gris", dit: "offline for 12 min · no project" }],
    );
    assert.deepEqual([ligneDeStation(station(), 1, true)].map(({ ton, dit }) => [ton, dit]), [["jaune", "online · saturated · 1 cook · brigade, espace, calculus"]]);
    assert.deepEqual([ligneDeStation(station({ pannes: [MISE_A_JOUR] }), 0, false)].map(({ ton, dit }) => [ton, dit]), [["jaune", "online · update failed · brigade, espace, calculus"]]);
    assert.deepEqual([ligneDeStation(station({ pannes: [MAX_PERDUE], max: "perdue" }), 0, false)].map(({ ton, dit }) => [ton, dit]), [["rouge", "online · Max connection lost · brigade, espace, calculus"]]);
  });

  test("l'état en une phrase, en tête de sa page : en ligne et ses cooks, hors ligne depuis quand, saturée — ni machine, ni version, ni projets", () => {
    assert.deepEqual(
      [
        ligneDeStation(station(), 2, false),
        ligneDeStation(station(), 1, false),
        ligneDeStation(station(), 0, false),
        ligneDeStation(station({ etat: "hors-ligne", dit: "offline for 12 min", max: null }), 0, false),
        ligneDeStation(station(), 3, true),
        ligneDeStation(station({ etat: "illisible", dit: "unreadable", machine: "", version: "", projets: [] }), 0, false),
      ].map(({ phrase }) => phrase),
      ["online · 2 cooks running", "online · 1 cook running", "online · no cook running", "offline for 12 min", "saturated", "unreadable"],
    );
    for (const cooks of [0, 2]) assert.doesNotMatch(ligneDeStation(station(), cooks, false).phrase, /Linux|version|brigade|espace/);
  });

  test("une station saturée se lit dans le `status` d'un projet qu'elle sert", () => {
    assert.deepEqual(saturees("           MACHINE SATURÉE depuis 4 min — 812 Mo de mémoire disponible pour 1 024 au moins : parade-box ne prend plus de ticket tant que ça dure"), ["parade-box"]);
    assert.deepEqual(saturees("cuisine    ouverte"), []);
  });

  test("…telle que le runtime l'écrit, en anglais depuis #940 : `MACHINE SATURATED … : <station> takes no more tickets`", () => {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-accueil-"));
    const journal = ouvrirJournal(repertoire);
    try {
      const maintenant = new Date(A);
      const etat = lireEtat(journal, maintenant);
      const saturee = (nom: string, saturatedAt: string | null): EtatStation => ({
        station: nom, engine: "claude", provides: ["code"], maxCooks: 2, cores: null, cap: null, announcedAt: "2026-10-16T08:00:00.000Z",
        quotaUntil: null, quotaReason: null, disconnectedAt: null, disconnectedReason: null,
        saturatedAt, saturatedResource: saturatedAt === null ? null : "memory", saturatedObserved: saturatedAt === null ? null : 812, saturatedLimit: saturatedAt === null ? null : 1024,
        saturatedCauses: saturatedAt === null ? [] : [{ resource: "memory", observed: 812, limit: 1024 }],
        heldAt: null, heldReason: null, unarbitratedAt: null, unarbitratedReason: null,
        remote: false, seenAt: null, presentSince: null, ordinary: false, sandbox: null,
      });
      const status = decrireEtat({ ...etat, stations: [saturee("parade-box", "2026-10-16T11:56:00.000Z"), saturee("mac/claude", null)] }, maintenant).join("\n");
      assert.match(status, /MACHINE SATURATED/, "le runtime ne dit plus la saturation dans ces mots");
      assert.deepEqual(saturees(status), ["parade-box"]);
    } finally {
      journal.fermer();
      rmSync(repertoire, { recursive: true, force: true });
    }
  });
});

const LUES: VuDesStations = { a: A, stations: [station()] };

describe("la ligne de santé : Max et GitHub, verte et discrète quand tout va, une phrase quand l'un cloche", () => {
  test("tout va : vert, deux coches", () => {
    assert.deepEqual(sante(LUES, undefined, [], MAINTENANT).ton, "vert");
    assert.equal(sante(LUES, undefined, [], MAINTENANT).dit, "Max ✓  ·  GitHub ✓");
  });

  test("GitHub limite les appels : il le dit, et l'heure de la reprise quand GitHub l'a donnée", () => {
    const reprise = "2026-10-16T13:16:00.000Z";
    const limitee = sante({ ...LUES, sans: "your stations could not be read on GitHub — gh: API rate limit exceeded for user ID 1. (HTTP 403)", limite: { reprise } }, undefined, [], MAINTENANT);
    assert.equal(limitee.ton, "rouge");
    assert.equal(limitee.dit, `Max ✓  ·  GitHub limits calls, back around ${heureCourte(reprise)}`);
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
    const accueil = tenirAccueil({ projets: () => [PROJET, { nom: "espace", box: true, desinstalle: false }], maintenant: () => MAINTENANT });
    const faits = (projet: string, champs: Partial<Faits>, compteurs: Partial<Faits["compteurs"]> = {}) => ({ projet, demande: 1, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(desFaits(champs, compteurs)) }] });
    assert.ok(accueil.faits(faits("brigade", { cooks: [cook(867)] })));
    assert.equal(accueil.faits(faits("brigade", { cooks: [cook(867)] })), undefined, "rien n'a changé");
    accueil.faits(faits("espace", { cooks: [cook(12)] }, { attend: 5 }));
    const vu = accueil.stations(LUES);
    assert.deepEqual(vu?.stations?.map(({ dit }) => dit), ["online · 2 cooks · brigade, espace, calculus"]);
    assert.equal(accueil.status({ projet: "espace", demande: 1, a: A, attend: CINQ, sorties: [{ commande: "status", texte: "cuisine    ouverte" }] })?.projets[1]?.dit, "5 decisions await you, for 2 d · #12 cooking");
    // Le `status` que plus rien ne rafraîchit est lâché.
    assert.equal(accueil.veiller(["brigade"])?.projets[1]?.dit, "5 decisions await you · #12 cooking");
    // Une box qui n'est pas jointe se dit injoignable — rien de ce que `ssh` a écrit.
    const injoignable = accueil.faits({ projet: "brigade", demande: 1, a: A, erreur: "$ ssh -o BatchMode=yes box brigade brigade facts\nssh: connect to host box port 22: Connection refused\n→ exit code 255", atteinte: false, cas: "ssh-en-echec" });
    assert.deepEqual(injoignable?.projets[0], ligneDeProjet(PROJET, { a: A, injoignable: true }, undefined));
    for (const ligne of [...(injoignable?.projets ?? []), ...(injoignable?.stations ?? []), injoignable?.sante]) sansRienDeBrut(`${ligne?.dit}\n${ligne?.survol}`);
  });
});

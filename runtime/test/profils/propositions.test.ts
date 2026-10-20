// D'un domaine relevé, un profil proposé ; puis le « oui » ou le « non » du
// chef. Des tickets servis écrits au journal comme le runtime les écrit, un
// vrai carnet dans un dépôt de test, et ce que la file en montre.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { saveCarnet, type Lesson } from "../../src/carnet/carnet.ts";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { cartesDeProfil } from "../../src/profils/cartes.ts";
import { decider, NON, OUI } from "../../src/profils/decision.ts";
import { DefinitionIllisible, nomDuProfil, parseDefinition, PROFILS_DIR, writeDefinition } from "../../src/profils/definition.ts";
import { propositionsEnAttente, proposerLesProfils, type Proposee } from "../../src/profils/proposer.ts";
import { lireReglagesDesProfils } from "../../src/profils/reglages.ts";
import { appeler, horloge, repertoireTemporaire } from "../outils.ts";
import { journalDeTest, PROJET, servir, tickets, type Service } from "./servir.ts";

const REGLAGES = lireReglagesDesProfils({});
const VUE = ["app/src/vue"];
const RUNTIME = ["runtime/src"];
const DEPOT = "benomite/brigade";

// Vingt tickets servis et mergés, 16 du premier coup : 80 % pour le projet.
// `app/src/vue` en porte cinq, 3 du premier coup : 60 %, 20 points dessous.
const VINGT_POINTS = [...tickets(1, 5, 3, VUE), ...tickets(6, 15, 13, RUNTIME)];

const lecon = (id: string, retros: string[], reste: Partial<Lesson> = {}): Lesson => ({ id, text: `La leçon ${id}.`, state: "promoted", entered: "2026-10-01", retros, origin: { kind: "retro" }, ...reste });

// Le dépôt du projet, avec son carnet.
function depot(t: TestContext, lecons: Lesson[] = []): string {
  const repoDir = repertoireTemporaire(t);
  saveCarnet(repoDir, { lessons: lecons });
  return repoDir;
}

const definitions = (repoDir: string) => (existsSync(join(repoDir, PROFILS_DIR)) ? readdirSync(join(repoDir, PROFILS_DIR)) : []);

function cuisine(t: TestContext, services: Service[], lecons: Lesson[] = []) {
  const journal = journalDeTest(t);
  for (const service of services) servir(journal, service);
  const repoDir = depot(t, lecons);
  const options = { journal, projet: PROJET, reglages: REGLAGES, repoDir };
  return { journal, repoDir, options, proposer: () => proposerLesProfils(options) };
}

test("un domaine relevé devient un profil proposé : son nom, le domaine, les chiffres et les tickets qui le justifient, des skills, son périmètre, et un carnet qui part des leçons du domaine", (t) => {
  const lecons = [
    // D'un ticket du domaine : dans le carnet de départ.
    lecon("L-001", ["#2", "#40"]),
    // D'un ticket du domaine servi avant la fenêtre : aussi.
    lecon("L-005", ["#90"]),
    // D'un ticket d'une autre zone, ou d'aucun ticket : non.
    lecon("L-002", ["#7"]),
    lecon("L-004", ["retro-9"]),
    // Retirée : non.
    lecon("L-003", ["#3"], { state: "retired", exit: { date: "2026-10-05", reason: "manual" } }),
  ];
  const { journal, proposer } = cuisine(t, [{ ticket: 90, zone: VUE }, ...VINGT_POINTS], lecons);

  const [proposee, ...autres] = proposer();
  assert.deepEqual(autres, []);
  assert.ok(proposee);
  assert.deepEqual(proposee.payload, {
    name: "app-src-vue",
    zone: "app/src/vue",
    tickets: [1, 2, 3, 4, 5],
    window: 20,
    zoneFirstTry: { first: 3, merged: 5 },
    projectFirstTry: { first: 16, merged: 20 },
    gap: 20,
    settings: { window: 20, minTickets: 5, gapPoints: 20 },
    skills: [],
    perimeter: ["app/src/vue"],
    notebook: [lecon("L-001", ["#2", "#40"]), lecon("L-005", ["#90"])],
  });

  // La carte que la file dessine : les tickets s'ouvrent par leur adresse.
  assert.deepEqual(cartesDeProfil(journal, DEPOT), [
    {
      proposition: proposee.seq,
      nom: "app-src-vue",
      domaine: "app/src/vue",
      chiffres: {
        tickets: [1, 2, 3, 4, 5].map((ticket) => ({ ticket, url: `https://github.com/benomite/brigade/issues/${ticket}` })),
        fenetre: 20,
        domaine: { premiers: 3, retenus: 5, part: 0.6 },
        projet: { premiers: 16, retenus: 20, part: 0.8 },
        ecart: 20,
        seuils: { fenetre: 20, tickets: 5, ecart: 20 },
      },
      skills: [],
      perimetre: ["app/src/vue"],
      carnet: [
        { id: "L-001", texte: "La leçon L-001.", retros: ["#2", "#40"] },
        { id: "L-005", texte: "La leçon L-005.", retros: ["#90"] },
      ],
      proposee: proposee.at,
    },
  ]);
  // Sans dépôt connu, aucune adresse.
  assert.deepEqual(
    cartesDeProfil(journal)[0]?.chiffres.tickets.map(({ url }) => url),
    [null, null, null, null, null],
  );
});

test("un profil proposé attend le chef : le relevé refait n'en pose pas un second, et rien n'est écrit dans le dépôt", (t) => {
  const { journal, repoDir, proposer } = cuisine(t, VINGT_POINTS);
  assert.equal(proposer().length, 1);
  assert.deepEqual(proposer(), []);
  servir(journal, { ticket: 21, zone: VUE, essais: 2 });
  assert.deepEqual(proposer(), []);
  assert.equal(propositionsEnAttente(journal).length, 1);
  assert.deepEqual(definitions(repoDir), []);
});

test("« oui » écrit la définition du profil sous .claude/brigade/profils/ du dépôt — avant lui, aucun fichier —, et la proposition quitte la file", (t) => {
  const { journal, repoDir, options, proposer } = cuisine(t, VINGT_POINTS, [lecon("L-001", ["#2"])]);
  const [proposee] = proposer();
  assert.ok(proposee);
  assert.deepEqual(definitions(repoDir), []);

  const decision = decider(options, proposee.seq, OUI);
  assert.equal(decision.issue, "tranchee");
  assert.ok("fait" in decision && decision.fait.type === "profile.accepted");
  assert.deepEqual(decision.fait.payload, { proposal: proposee.seq, name: "app-src-vue", zone: "app/src/vue", file: ".claude/brigade/profils/app-src-vue.md" });

  assert.deepEqual(definitions(repoDir), ["app-src-vue.md"]);
  const texte = readFileSync(join(repoDir, ".claude/brigade/profils/app-src-vue.md"), "utf8");
  assert.deepEqual(parseDefinition(texte), {
    name: "app-src-vue",
    zone: "app/src/vue",
    perimeter: ["app/src/vue"],
    skills: [],
    accepted: decision.fait.at.slice(0, 10),
    tickets: [1, 2, 3, 4, 5],
    notebook: { lessons: [lecon("L-001", ["#2"])] },
  });

  assert.deepEqual(propositionsEnAttente(journal), []);
  assert.deepEqual(cartesDeProfil(journal, DEPOT), []);
  // Le profil existe : il n'est plus proposé, même sur des tickets neufs.
  servir(journal, { ticket: 21, zone: VUE, essais: 2 });
  assert.deepEqual(proposer(), []);
  // Un second geste n'écrit rien et rend le premier.
  const encore = decider(options, proposee.seq, NON);
  assert.equal(encore.issue, "deja");
  assert.ok("fait" in encore && encore.fait.seq === decision.fait.seq);
  assert.deepEqual(decider(options, 999_999, OUI), { issue: "inconnue" });
});

test("« oui » sur une proposition écrite avant l'origine des leçons écrit leur carnet en leçons nées d'une rétro", (t) => {
  const { journal, repoDir, options } = cuisine(t, VINGT_POINTS);
  const { origin: _origin, ...sansOrigine } = lecon("L-001", ["#2"]);
  const ancienne = journal.ajouter({
    project: PROJET,
    ticket: null,
    author: "runtime",
    type: "profile.proposed",
    payload: {
      name: "app-src-vue",
      zone: "app/src/vue",
      tickets: [1, 2, 3, 4, 5],
      window: 20,
      zoneFirstTry: { first: 3, merged: 5 },
      projectFirstTry: { first: 16, merged: 20 },
      gap: 20,
      settings: { window: REGLAGES.fenetre, minTickets: REGLAGES.tickets, gapPoints: REGLAGES.ecart },
      skills: [],
      perimeter: ["app/src/vue"],
      notebook: [sansOrigine],
    },
    dedupKey: "profile.proposed:app/src/vue",
  } as unknown as Parameters<Journal["ajouter"]>[0]);
  assert.ok(ancienne);

  assert.equal(decider(options, ancienne.seq, OUI).issue, "tranchee");
  const texte = readFileSync(join(repoDir, ".claude/brigade/profils/app-src-vue.md"), "utf8");
  assert.deepEqual(parseDefinition(texte).notebook, { lessons: [lecon("L-001", ["#2"])] });
});

test("« non » retire la proposition de la file, et le relevé refait sur les mêmes tickets ne la ramène pas", (t) => {
  const { journal, repoDir, options, proposer } = cuisine(t, [{ ticket: 90, zone: VUE }, ...VINGT_POINTS]);
  const [proposee] = proposer();
  assert.ok(proposee);

  const decision = decider(options, proposee.seq, NON);
  assert.equal(decision.issue, "tranchee");
  assert.ok("fait" in decision && decision.fait.type === "profile.refused");
  // Tous les tickets du domaine que le journal porte, d'avant la fenêtre compris.
  assert.deepEqual(decision.fait.payload, { proposal: proposee.seq, name: "app-src-vue", zone: "app/src/vue", tickets: [90, 1, 2, 3, 4, 5] });

  assert.deepEqual(propositionsEnAttente(journal), []);
  assert.deepEqual(cartesDeProfil(journal, DEPOT), []);
  assert.deepEqual(proposer(), []);
  assert.deepEqual(proposer(), []);
  assert.deepEqual(definitions(repoDir), []);
});

test("un domaine refusé est proposé de nouveau quand il franchit les seuils sur des tickets que le « non » ne nommait pas — pas avant", (t) => {
  const { journal, options, proposer } = cuisine(t, VINGT_POINTS);
  const [premiere] = proposer();
  assert.ok(premiere);
  decider(options, premiere.seq, NON);

  // Quatre tickets neufs du domaine, deux du premier coup. Avec l'ancien
  // (#5), la zone est à 40 % sur 5 tickets, 35 points sous le projet : elle
  // franchirait les seuils — mais sur 4 tickets neufs seulement.
  for (const service of tickets(21, 4, 2, VUE)) servir(journal, service);
  assert.deepEqual(proposer(), []);

  // Un cinquième : 5 tickets neufs sur 20, 40 % contre 75 % — de nouveau.
  servir(journal, { ticket: 25, zone: VUE, essais: 2 });
  const [seconde, ...autres] = proposer() as [Proposee?, ...Proposee[]];
  assert.deepEqual(autres, []);
  assert.ok(seconde);
  assert.equal(seconde.payload.zone, "app/src/vue");
  assert.deepEqual(seconde.payload.tickets, [21, 22, 23, 24, 25]);
  assert.deepEqual([seconde.payload.zoneFirstTry, seconde.payload.projectFirstTry, seconde.payload.gap], [{ first: 2, merged: 5 }, { first: 15, merged: 20 }, 35]);
  assert.deepEqual(
    propositionsEnAttente(journal).map(({ seq }) => seq),
    [seconde.seq],
  );
  // Elle attend à son tour : le relevé refait n'en pose pas une troisième.
  assert.deepEqual(proposer(), []);

  // Un second « non » nomme aussi les tickets neufs : il faut en servir d'autres.
  const refus = decider(options, seconde.seq, NON);
  assert.ok("fait" in refus && refus.fait.type === "profile.refused");
  assert.deepEqual(refus.fait.payload.tickets, [1, 2, 3, 4, 5, 21, 22, 23, 24, 25]);
  assert.deepEqual(proposer(), []);
});

test("un profil que le dépôt définit déjà n'est pas proposé, et un « oui » ne remplace jamais une définition", (t) => {
  const { journal, repoDir, options, proposer } = cuisine(t, VINGT_POINTS);
  const [proposee] = proposer();
  assert.ok(proposee);
  const fichier = join(repoDir, ".claude/brigade/profils/app-src-vue.md");
  mkdirSync(join(repoDir, PROFILS_DIR), { recursive: true });
  writeFileSync(fichier, "écrit à la main\n");

  assert.deepEqual(decider(options, proposee.seq, OUI), { issue: "existe", fichier: ".claude/brigade/profils/app-src-vue.md" });
  assert.equal(readFileSync(fichier, "utf8"), "écrit à la main\n");
  // Rien n'est tranché : elle attend toujours, et le chef peut dire « non ».
  assert.equal(propositionsEnAttente(journal).length, 1);
  assert.equal(decider(options, proposee.seq, NON).issue, "tranchee");

  // Défini à la main, le domaine n'est plus jamais proposé.
  const autre = cuisine(t, VINGT_POINTS);
  mkdirSync(join(autre.repoDir, PROFILS_DIR), { recursive: true });
  writeFileSync(join(autre.repoDir, ".claude/brigade/profils/app-src-vue.md"), "écrit à la main\n");
  assert.deepEqual(autre.proposer(), []);
});

test("sans domaine relevé, rien n'est proposé — et le carnet n'est pas lu", (t) => {
  const { proposer, repoDir } = cuisine(t, tickets(1, 20, 16, RUNTIME));
  writeFileSync(join(repoDir, ".claude/brigade/carnet.md"), "illisible\n");
  assert.deepEqual(proposer(), []);
});

test("la définition se relit telle qu'elle s'écrit ; son nom vient de la zone, sûr pour un nom de fichier ; illisible, elle le dit", () => {
  assert.deepEqual(["app/src/vue", "docs/runtime", "Runtime/Src Profils", "./x/"].map(nomDuProfil), ["app-src-vue", "docs-runtime", "runtime-src-profils", "x"]);
  const definition = {
    name: "docs-runtime",
    zone: "docs/runtime",
    perimeter: ["docs/runtime"],
    skills: ["copywriting", "relecture"],
    accepted: "2026-10-19",
    tickets: [3, 8],
    notebook: { lessons: [] },
  };
  const texte = writeDefinition(definition);
  assert.equal(
    texte,
    ["# Profil de cook docs-runtime", "", "- domaine: docs/runtime", "- périmètre: docs/runtime", "- skills: copywriting, relecture", "- accepté: 2026-10-19", "- tickets: #3, #8", "", "# Carnet des leçons", ""].join("\n"),
  );
  assert.deepEqual(parseDefinition(texte), definition);
  assert.throws(() => parseDefinition("# Autre chose\n"), DefinitionIllisible);
  assert.throws(() => parseDefinition(texte.replace("- skills:", "- skill:")), /ligne incomprise/);
  assert.throws(() => parseDefinition(texte.replace("- tickets: #3, #8\n", "")), /champ « tickets » manquant/);
});

test("`facts` porte les profils proposés qui attendent le chef sous `profils`, et ne l'a pas quand il n'y en a aucun", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal: Journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const lireFacts = async () => {
    const appel = appeler(facts, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT });
    assert.equal(await appel.fin, 0, appel.sortie());
    return JSON.parse(appel.sortie()) as Record<string, unknown>;
  };
  for (const service of VINGT_POINTS) servir(journal, service);
  const options = { journal, projet: PROJET, reglages: REGLAGES, repoDir: depot(t) };
  assert.equal("profils" in (await lireFacts()), false);

  const [proposee] = proposerLesProfils(options);
  assert.ok(proposee);
  assert.deepEqual((await lireFacts()).profils, cartesDeProfil(journal, DEPOT));

  decider(options, proposee.seq, NON);
  assert.equal("profils" in (await lireFacts()), false);
});

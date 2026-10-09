// Le rangement des transcripts que `claude` laisse dans le `~/.claude` d'un
// projet cloisonné, sur un vrai répertoire : ce qui part, ce qui reste, ce que
// le journal en dit. L'âge se compte sur l'horloge du test — la date de
// dernière écriture de chaque fichier est posée à la main.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { configTranscripts, ouvrirNettoyage } from "../src/nettoyage.ts";
import { rangementDesTranscripts } from "../src/projections/nettoyage.ts";
import { JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const DEPART = Date.parse(`${JOUR_HORLOGE}T10:00:00.000Z`);
const GARDE_MS = 7 * JOUR;

function cuisine(t: TestContext, options: { cloisonne?: boolean } = {}) {
  const repertoire = repertoireTemporaire(t);
  const claude = join(repertoire, "claude");
  // L'horloge du test : elle n'avance que quand il le dit.
  let instant = DEPART;
  const maintenant = () => new Date(instant);
  const journal = ouvrirJournal(repertoire, { maintenant });
  t.after(() => journal.fermer());
  const avertissements: string[] = [];
  const nettoyage = ouvrirNettoyage({
    journal,
    projet: "brigade",
    repertoireEtat: repertoire,
    depot: { ranger: async () => null, elaguer: async () => true },
    avertir: (message) => void avertissements.push(message),
    transcripts: options.cloisonne === false ? null : { claude, gardeMs: GARDE_MS },
    maintenant,
  });
  // Écrit `chemin` sous le `~/.claude` du projet, dernière écriture à `ecrit`.
  const poser = (chemin: string, ecrit: number, contenu = "{}\n") => {
    const fichier = join(claude, chemin);
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, contenu);
    dater(chemin, ecrit);
    return fichier;
  };
  const dater = (chemin: string, ecrit: number) => utimesSync(join(claude, chemin), new Date(ecrit), new Date(ecrit));
  const la = (chemin: string) => existsSync(join(claude, chemin));
  const lancer = (run: string) => journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl` } });
  const sortir = (run: string) =>
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  const rangements = () => journal.duType("transcripts.tidied", 100).map((e) => e.payload);
  return {
    repertoire,
    claude,
    journal,
    nettoyage,
    avertissements,
    poser,
    dater,
    la,
    lancer,
    sortir,
    rangements,
    avancer: (ms: number) => void (instant += ms),
  };
}

test("un transcript que rien n'a écrit depuis la durée de garde part, avec le répertoire de sa session ; un plus jeune reste, et le journal dit les deux", async (t) => {
  const { nettoyage, poser, dater, la, rangements, journal, avertissements } = cuisine(t);
  poser("projects/-etat-worktrees-17-aaa/vieux.jsonl", DEPART - 8 * JOUR, "x".repeat(100));
  poser("projects/-etat-worktrees-17-aaa/vieux/subagents/agent-1.jsonl", DEPART - 8 * JOUR, "x".repeat(50));
  // Un répertoire porte la date de sa dernière entrée : elle compte aussi.
  for (const repertoire of ["vieux/subagents", "vieux"]) dater(`projects/-etat-worktrees-17-aaa/${repertoire}`, DEPART - 8 * JOUR);
  poser("projects/-etat-worktrees-18-aaa/jeune.jsonl", DEPART - 6 * JOUR, "x".repeat(30));
  poser("projects/-tmp/jugement.jsonl", DEPART - 30 * JOUR, "x".repeat(20));

  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa/vieux.jsonl"), false);
  assert.equal(la("projects/-etat-worktrees-17-aaa/vieux"), false);
  assert.equal(la("projects/-tmp/jugement.jsonl"), false);
  assert.equal(la("projects/-etat-worktrees-18-aaa/jeune.jsonl"), true);
  const [rangement] = rangements();
  assert.equal(rangement?.removed, 2);
  assert.equal(rangement?.kept, 1);
  assert.equal(rangement?.keptBytes, 30);
  assert.equal(rangement?.keepMs, GARDE_MS);
  // Ce qui est libéré compte au moins ce que les fichiers portaient.
  assert.ok((rangement?.freedBytes ?? 0) >= 170);
  assert.equal(rangements().length, 1);
  assert.deepEqual(rangementDesTranscripts(journal.base), { at: new Date(DEPART).toISOString(), ...rangement });
  assert.deepEqual(avertissements, []);
});

test("le transcript d'un lancement en cours n'est jamais touché, si vieille que soit sa dernière écriture ; son lancement fini, il part au rangement suivant", async (t) => {
  const { nettoyage, poser, la, lancer, sortir, avancer, rangements } = cuisine(t);
  poser("projects/-etat-worktrees-17-aaa/avant.jsonl", DEPART - JOUR);
  lancer("17-aaa");
  lancer("juge-1");
  sortir("juge-1");
  // Écrits depuis le départ du cook : rien ne dit que ce n'est pas lui.
  poser("projects/-etat-worktrees-17-aaa/en-cours.jsonl", DEPART + HEURE);
  poser("projects/-tmp/juge-1.jsonl", DEPART + HEURE);

  avancer(30 * JOUR);
  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa/avant.jsonl"), false);
  assert.equal(la("projects/-etat-worktrees-17-aaa/en-cours.jsonl"), true);
  assert.equal(la("projects/-tmp/juge-1.jsonl"), true);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[1, 2]]);

  sortir("17-aaa");
  avancer(JOUR);
  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa/en-cours.jsonl"), false);
  assert.equal(la("projects/-tmp/juge-1.jsonl"), false);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[1, 2], [2, 0]]);
});

test("une session dont le répertoire a reçu une écriture récente reste entière, fichier compris", async (t) => {
  const { nettoyage, poser, la, rangements } = cuisine(t);
  poser("projects/-etat-worktrees-17-aaa/session.jsonl", DEPART - 30 * JOUR);
  poser("projects/-etat-worktrees-17-aaa/session/tool-results/sortie.txt", DEPART - JOUR);

  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa/session.jsonl"), true);
  assert.equal(la("projects/-etat-worktrees-17-aaa/session/tool-results/sortie.txt"), true);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[0, 1]]);
});

test("la durée de garde se règle en jours, sept par défaut ; illisible, c'est un refus", () => {
  assert.equal(configTranscripts({}).gardeMs, 7 * JOUR);
  assert.equal(configTranscripts({ BRIGADE_TRANSCRIPTS_KEEP_DAYS: "0.5" }).gardeMs, 12 * HEURE);
  for (const valeur of ["0", "-1", "toujours", "4000"]) {
    assert.throws(() => configTranscripts({ BRIGADE_TRANSCRIPTS_KEEP_DAYS: valeur }), /BRIGADE_TRANSCRIPTS_KEEP_DAYS invalide : « .* » — attendu un nombre de jours supérieur à zéro, 3650 au plus/);
  }
});

test("seuls les transcripts partent : la mémoire du projet, ses réglages et ce qui n'est pas une session restent", async (t) => {
  const { nettoyage, poser, la, rangements } = cuisine(t);
  const vieux = DEPART - 90 * JOUR;
  poser("projects/-etat-worktrees-17-aaa/session.jsonl", vieux);
  poser("projects/-etat-worktrees-17-aaa/memory/MEMORY.md", vieux);
  // Un répertoire qu'aucun transcript ne nomme.
  poser("projects/-etat-worktrees-17-aaa/autre/notes.jsonl", vieux);
  poser("projects/egare.jsonl", vieux);
  poser("settings.json", vieux);
  poser("todos/session.json", vieux);

  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa/session.jsonl"), false);
  for (const reste of ["projects/-etat-worktrees-17-aaa/memory/MEMORY.md", "projects/-etat-worktrees-17-aaa/autre/notes.jsonl", "projects/egare.jsonl", "settings.json", "todos/session.json"]) {
    assert.equal(la(reste), true, reste);
  }
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[1, 0]]);
});

test("un répertoire de projet vidé de ses transcripts part avec eux, s'il n'a rien reçu depuis la durée de garde", async (t) => {
  const { nettoyage, poser, dater, la } = cuisine(t);
  poser("projects/-etat-worktrees-17-aaa/vieux.jsonl", DEPART - 8 * JOUR);
  dater("projects/-etat-worktrees-17-aaa", DEPART - 8 * JOUR);
  poser("projects/-etat-worktrees-18-aaa/vieux.jsonl", DEPART - 8 * JOUR);
  // Une session y est née depuis : un lancement peut être en train d'y écrire.
  dater("projects/-etat-worktrees-18-aaa", DEPART - JOUR);
  poser("projects/-etat-worktrees-19-aaa/vieux.jsonl", DEPART - 8 * JOUR);
  poser("projects/-etat-worktrees-19-aaa/memory/MEMORY.md", DEPART - 8 * JOUR);
  dater("projects/-etat-worktrees-19-aaa", DEPART - 8 * JOUR);

  await nettoyage.rattraper();

  assert.equal(la("projects/-etat-worktrees-17-aaa"), false);
  assert.equal(la("projects/-etat-worktrees-18-aaa/vieux.jsonl"), false);
  assert.equal(la("projects/-etat-worktrees-18-aaa"), true);
  assert.equal(la("projects/-etat-worktrees-19-aaa/memory/MEMORY.md"), true);
});

test("un lien posé là par un cook n'est pas suivi : rien n'est retiré hors du `~/.claude` du projet", async (t) => {
  const { repertoire, claude, nettoyage, poser, rangements } = cuisine(t);
  const vieux = DEPART - 90 * JOUR;
  const dehors = join(repertoire, "dehors");
  mkdirSync(join(dehors, "session"), { recursive: true });
  for (const fichier of ["session.jsonl", "session/agent.jsonl"]) {
    writeFileSync(join(dehors, fichier), "{}\n");
    utimesSync(join(dehors, fichier), new Date(vieux), new Date(vieux));
  }
  poser("projects/-etat-worktrees-17-aaa/lie.jsonl", vieux);
  symlinkSync(dehors, join(claude, "projects/-lien"));
  symlinkSync(join(dehors, "session"), join(claude, "projects/-etat-worktrees-17-aaa/lie"));
  symlinkSync(join(dehors, "session.jsonl"), join(claude, "projects/-etat-worktrees-17-aaa/pointe.jsonl"));

  await nettoyage.rattraper();

  assert.equal(existsSync(join(dehors, "session.jsonl")), true);
  assert.equal(existsSync(join(dehors, "session/agent.jsonl")), true);
  assert.equal(existsSync(join(claude, "projects/-etat-worktrees-17-aaa/lie.jsonl")), false);
  assert.deepEqual(rangements().map(({ removed }) => removed), [1]);
});

test("`projects` remplacé par un lien : rien n'est lu ni retiré derrière", async (t) => {
  const { repertoire, claude, nettoyage, rangements } = cuisine(t);
  const dehors = join(repertoire, "dehors");
  mkdirSync(join(dehors, "-projet"), { recursive: true });
  writeFileSync(join(dehors, "-projet/session.jsonl"), "{}\n");
  utimesSync(join(dehors, "-projet/session.jsonl"), new Date(DEPART - 90 * JOUR), new Date(DEPART - 90 * JOUR));
  mkdirSync(claude, { recursive: true });
  symlinkSync(dehors, join(claude, "projects"));

  await nettoyage.rattraper();

  assert.equal(existsSync(join(dehors, "-projet/session.jsonl")), true);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[0, 0]]);
});

test("le rangement passe au démarrage puis une fois par jour, pas à chaque tick — et chaque passage est au journal, même s'il ne retire rien", async (t) => {
  const { nettoyage, poser, la, avancer, rangements } = cuisine(t);
  poser("projects/-tmp/a.jsonl", DEPART - 6 * JOUR - 12 * HEURE);

  await nettoyage.rattraper();
  avancer(HEURE);
  await nettoyage.rattraper();
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[0, 1]]);

  // Il a passé sept jours dans l'heure : il part au passage du lendemain.
  avancer(22 * HEURE);
  await nettoyage.rattraper();
  assert.equal(la("projects/-tmp/a.jsonl"), true);
  avancer(HEURE);
  await nettoyage.rattraper();
  assert.equal(la("projects/-tmp/a.jsonl"), false);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[0, 1], [1, 0]]);
});

test("sans cloison, rien n'est rangé ni écrit au journal : le `~/.claude` du compte n'est pas au runtime", async (t) => {
  const { nettoyage, poser, la, rangements, journal } = cuisine(t, { cloisonne: false });
  poser("projects/-tmp/vieux.jsonl", DEPART - 90 * JOUR);

  await nettoyage.rattraper();

  assert.equal(la("projects/-tmp/vieux.jsonl"), true);
  assert.deepEqual(rangements(), []);
  assert.equal(rangementDesTranscripts(journal.base), null);
});

test("un projet cloisonné qui n'a encore rien lancé n'a pas de `~/.claude` : le rangement le dit vide, sans rien créer", async (t) => {
  const { nettoyage, la, rangements } = cuisine(t);

  await nettoyage.rattraper();

  assert.equal(la("."), false);
  assert.deepEqual(rangements().map(({ removed, kept }) => [removed, kept]), [[0, 0]]);
});

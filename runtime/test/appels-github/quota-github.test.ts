// Le quota GitHub que la station publie dans son état (#3481), et la ligne
// du journal quand le quota horaire est épuisé. L'horloge est celle du test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { quotaGithub } from "../../src/appels-github/quota-github.ts";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { tenirPresence } from "../../src/appairage/presence.ts";
import { constaterLimite, ECRITURES_PAR_HEURE, journaliserLeQuotaEpuise, noterLesEntetes, ouvrirLimite, type Lecture } from "../../src/limite-github.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { fausseHorloge } from "./aides.ts";

const rienNeReste = temporaireDuFichier();

const MINUTE = 60_000;
const DEPART = Date.parse("2026-11-13T16:50:00Z");
const iso = (instant: number) => new Date(instant).toISOString();

function unCompteur() {
  let instant = DEPART;
  const maintenant = () => instant;
  const limite = ouvrirLimite({ maintenant, alerter: () => {} });
  const appeler = (projet: string, lecture: Lecture, fois: number, ecriture = false) => {
    for (let i = 0; i < fois; i += 1) limite.prendre("cuisine", undefined, { projet, lecture, ecriture });
  };
  return { limite, maintenant, appeler, avancer: (ms: number) => void (instant += ms) };
}

test("the core quota: what GitHub said of the machine's account, no pause, and the hour's calls by station, project and kind (#3481)", async (t) => {
  const c = unCompteur();
  t.after(() => c.limite.fermer());
  // Avant que GitHub n'ait rien dit : rien d'inventé.
  assert.deepEqual(quotaGithub(c.limite, "box"), { limite: "core", pauseJusqua: null, utilise: null, maximum: null, renouvellement: null, parStationEtProjet: [] });
  c.appeler("brigade", "issues", 3);
  c.appeler("espace", "pull-requests", 1);
  c.appeler("brigade", "pull-requests", 1);
  const reset = DEPART + 20 * MINUTE;
  noterLesEntetes(c.limite, "gh", new Map([["x-ratelimit-limit", "5000"], ["x-ratelimit-remaining", "1200"], ["x-ratelimit-reset", String(reset / 1000)]]));
  assert.deepEqual(quotaGithub(c.limite, "box"), {
    limite: "core",
    pauseJusqua: null,
    utilise: 3800,
    maximum: 5000,
    renouvellement: iso(reset),
    parStationEtProjet: [
      { station: "box", projet: "brigade", type: "issues", nombre: 3 },
      { station: "box", projet: "brigade", type: "pull-requests", nombre: 1 },
      { station: "box", projet: "espace", type: "pull-requests", nombre: 1 },
    ],
  });

  // Le quota horaire épuisé : GitHub dit la fin, la pause va jusqu'à elle.
  const epuise = new Map([["x-ratelimit-limit", "5000"], ["x-ratelimit-remaining", "0"], ["x-ratelimit-reset", String(reset / 1000)]]);
  noterLesEntetes(c.limite, "gh", epuise);
  await constaterLimite(c.limite, { statut: 403, entetes: epuise, corps: JSON.stringify({ message: "API rate limit exceeded for user ID 1." }) }, { gh: "gh-absent", maintenant: c.maintenant, lecture: "issues" });
  const quota = quotaGithub(c.limite, "box");
  assert.deepEqual([quota.limite, quota.pauseJusqua, quota.utilise, quota.maximum, quota.renouvellement], ["core", iso(reset), 5000, 5000, iso(reset)]);
});

test("GitHub's write limit: `ecriture`, the hour's writes on the box's write budget, renewed when the oldest leaves the hour — and no pause end when GitHub gives none (#3481)", async (t) => {
  const c = unCompteur();
  t.after(() => c.limite.fermer());
  c.appeler("station", "gist", 4, true);
  c.avancer(5 * MINUTE);
  c.appeler("brigade", "issue-comments", 2, true);
  c.appeler("brigade", "issues", 1);
  const secondaire = { statut: 403, entetes: new Map<string, string>(), corps: JSON.stringify({ message: "You have exceeded a secondary rate limit." }) };
  // GitHub ne dit pas de fin : la box en choisit une, que l'état ne fait pas passer pour celle de GitHub.
  await constaterLimite(c.limite, secondaire, { gh: "gh-absent", maintenant: c.maintenant, lecture: "gist" });
  assert.deepEqual(quotaGithub(c.limite, "box"), {
    limite: "ecriture",
    pauseJusqua: null,
    utilise: 6,
    maximum: ECRITURES_PAR_HEURE,
    renouvellement: iso(DEPART + 60 * MINUTE),
    parStationEtProjet: [
      { station: "box", projet: "station", type: "gist", nombre: 4 },
      { station: "box", projet: "brigade", type: "issue-comments", nombre: 2 },
      { station: "box", projet: "brigade", type: "issues", nombre: 1 },
    ],
  });
  // Une fois la pause passée, une autre que GitHub date : sa fin est publiée.
  c.avancer(20 * MINUTE);
  await constaterLimite(c.limite, { ...secondaire, entetes: new Map([["retry-after", "120"]]) }, { gh: "gh-absent", maintenant: c.maintenant, lecture: "issue-comments" });
  const quota = quotaGithub(c.limite, "box");
  assert.deepEqual([quota.limite, quota.pauseJusqua], ["ecriture", iso(c.maintenant() + 2 * MINUTE)]);
  // Pause finie : le quota horaire règle de nouveau.
  c.avancer(3 * MINUTE);
  assert.equal(quotaGithub(c.limite, "box").limite, "core");
});

test("the station publishes `quotaGithub` in its state with every write, and a quota that moves causes no write of its own (#3481)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const limite = ouvrirLimite({ maintenant: horloge.maintenant, alerter: () => {} });
  t.after(() => limite.fermer());
  const ecrits: Fichiers[] = [];
  const canal: Canal = {
    creer: async (_description, fichiers) => (ecrits.push(fichiers), "g1"),
    ecrire: async (_id, fichiers) => (ecrits.push(fichiers), "ecrit"),
    lire: async () => ({}),
  };
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal, identite: { nom: "box", machine: "Linux 6.1.0", version: "1" }, projets: () => ["brigade"], quotaGithub: () => quotaGithub(limite, "box"), dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  aArreter(t, () => presence.arreter());
  await horloge.avancer(0);
  const publie = () => JSON.parse(ecrits.at(-1)?.[FICHIER_STATION] ?? "{}") as { quotaGithub?: unknown };
  assert.deepEqual(publie().quotaGithub, { limite: "core", pauseJusqua: null, utilise: null, maximum: null, renouvellement: null, parStationEtProjet: [] });
  // Des appels partent : le quota bouge, rien ne s'écrit pour autant.
  const ecritures = ecrits.length;
  for (let i = 0; i < 3; i += 1) limite.prendre("cuisine", undefined, { projet: "brigade", lecture: "issues" });
  await horloge.avancer(3 * MINUTE);
  assert.equal(ecrits.length, ecritures, "the quota alone triggers no write");
  // Le battement suivant le publie à jour.
  await horloge.avancer(3 * MINUTE);
  assert.equal(ecrits.length, ecritures + 1);
  assert.deepEqual((publie().quotaGithub as { parStationEtProjet: unknown }).parStationEtProjet, [{ station: "box", projet: "brigade", type: "issues", nombre: 3 }]);
});

test("a quota that cannot be read is published null, and the state still goes out (#3481)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const ecrits: Fichiers[] = [];
  const canal: Canal = { creer: async (_d, fichiers) => (ecrits.push(fichiers), "g1"), ecrire: async (_id, fichiers) => (ecrits.push(fichiers), "ecrit"), lire: async () => ({}) };
  const presence = tenirPresence({
    racine: repertoireTemporaire(t),
    canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: "1" },
    projets: () => [],
    quotaGithub: () => {
      throw new Error("database is locked");
    },
    dire: () => {},
    apres: horloge.apres,
    maintenant: horloge.maintenant,
  });
  aArreter(t, () => presence.arreter());
  await horloge.avancer(0);
  assert.equal(ecrits.length, 1);
  assert.equal((JSON.parse(ecrits[0]?.[FICHIER_STATION] ?? "{}") as { quotaGithub?: unknown }).quotaGithub, null);
});

test("the hourly limit reached: exactly one log line names the station and the kind of call that used the most (#3481)", (t) => {
  const c = unCompteur();
  t.after(() => c.limite.fermer());
  const lignes: string[] = [];
  journaliserLeQuotaEpuise((ligne) => void lignes.push(ligne), "box");
  t.after(() => journaliserLeQuotaEpuise(() => {}, ""));
  c.appeler("station", "gist", 5, true);
  c.appeler("brigade", "issues", 2);
  const reset = DEPART + 10 * MINUTE;
  const entetes = (restant: number, fin = reset) => new Map([["x-ratelimit-limit", "5000"], ["x-ratelimit-remaining", String(restant)], ["x-ratelimit-reset", String(fin / 1000)]]);
  noterLesEntetes(c.limite, "gh", entetes(3));
  assert.deepEqual(lignes, [], "not before the quota is spent");
  // Le quota à zéro, dit par plusieurs réponses de la même fenêtre : une ligne.
  for (let i = 0; i < 3; i += 1) noterLesEntetes(c.limite, "gh", entetes(0));
  assert.deepEqual(lignes, ["brigade : GitHub hourly limit reached — station box made 7 calls in the last hour, most of them gist calls (5), project station the most (5)"]);
  // La fenêtre suivante, épuisée à son tour : une ligne de plus.
  c.avancer(11 * MINUTE);
  noterLesEntetes(c.limite, "gh", entetes(0, reset + 60 * MINUTE));
  assert.equal(lignes.length, 2);
});

test("quota-github.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

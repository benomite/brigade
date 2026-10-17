// Le bloc `awaiting` de `status` est en anglais (#927) : son bord, son décompte,
// chacune de ses lignes. Vérifié de deux façons : un état de la box écrit avant
// la traduction (test/fixtures/etat-d-avant-927/) nomme les mêmes décisions
// qu'avant, dans le même ordre ; et un état d'exemple qui porte chaque sorte
// d'attente ne laisse passer aucun mot de la colonne « français » du glossaire.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decrireAttentes, type Attente } from "../src/attend.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { motsFrancais, motsFrancaisDans, sansMotFrancais } from "./aides/glossaire.ts";
import { repertoireTemporaire } from "./outils.ts";

const ETAT_D_AVANT = join(import.meta.dirname, "fixtures/etat-d-avant-927");
// L'instant auquel `status-d-avant.txt` a été écrit.
const LU_LE = new Date("2026-10-12T10:04:00.000Z");

// Le journal de l'état d'avant, rejoué dans un répertoire neuf : chaque
// événement à son instant, dans son ordre. Rien n'y est édité.
function etatDAvant(t: Parameters<typeof repertoireTemporaire>[0]) {
  let instant = new Date(0);
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => instant });
  t.after(() => journal.fermer());
  for (const ligne of readFileSync(join(ETAT_D_AVANT, "evenements.ndjson"), "utf8").trim().split("\n")) {
    const { at, project, ticket, type, author, payload, dedupKey } = JSON.parse(ligne);
    instant = new Date(at);
    journal.ajouter({ project, ticket, type, author, payload, ...(dedupKey === undefined ? {} : { dedupKey }) });
  }
  return journal;
}

// Le bloc d'une sortie, d'une ligne de tête à une ligne de fin, bornes comprises.
function bloc(lignes: readonly string[], tete: (ligne: string) => boolean, fin: string): string[] {
  const debut = lignes.findIndex(tete);
  const bout = lignes.indexOf(fin, debut);
  assert.ok(debut !== -1 && bout !== -1, `pas de bloc dans :\n${lignes.join("\n")}`);
  return lignes.slice(debut, bout + 1);
}

// Ce que le bloc nomme : le nombre de décisions de sa tête, et la tête de
// chaque entrée — son ticket, ou ce qui la nomme —, dans l'ordre.
function decisions(lignes: readonly string[], combien: RegExp, entree: RegExp) {
  const [tete = "", ...corps] = lignes;
  const nombre = Number(combien.exec(tete)?.[1] ?? 0);
  return { nombre, nommees: corps.flatMap((ligne) => entree.exec(ligne)?.slice(1, 2) ?? []) };
}

test("sur l'état d'avant, le bloc `awaiting` nomme les mêmes décisions que le bloc `attend` d'avant, dans le même ordre", (t) => {
  const avant = readFileSync(join(ETAT_D_AVANT, "status-d-avant.txt"), "utf8").replace(/\n$/, "").split("\n");
  const apres = decrireEtat(lireEtat(etatDAvant(t), LU_LE), LU_LE);

  const d = decisions(bloc(avant, (ligne) => ligne.startsWith("attend"), "fin attend"), /^attend +(\d+) décisions? attend/, /^ {2}(\S+) {2}depuis /);
  const a = decisions(bloc(apres, (ligne) => ligne.startsWith("awaiting"), "end awaiting"), /^awaiting +(\d+) decisions? awaits? the chef/, /^ {2}(\S+) {2}for /);
  assert.deepEqual(d, { nombre: 4, nommees: ["#17", "#18", "#19", "#20"] });
  assert.deepEqual(a, d);

  // Le bord : une seule ligne qui commence par `awaiting`, une seule qui vaut
  // `end awaiting`, et plus rien de l'ancien.
  assert.deepEqual(apres.filter((ligne) => ligne.startsWith("awaiting")).length, 1);
  assert.deepEqual(apres.filter((ligne) => ligne === "end awaiting").length, 1);
  assert.ok(!apres.some((ligne) => ligne.startsWith("attend") || ligne === "fin attend"));
  sansMotFrancais(bloc(apres, (ligne) => ligne.startsWith("awaiting"), "end awaiting"));

  // Hors du bloc, rien n'a bougé : la traduction ne touche que lui.
  const hors = (lignes: string[], tete: string, fin: string) => [...lignes.slice(0, lignes.findIndex((l) => l.startsWith(tete))), ...lignes.slice(lignes.indexOf(fin) + 1)];
  assert.deepEqual(hors(apres, "awaiting", "end awaiting"), hors(avant, "attend", "fin attend"));
});

const DEPUIS = "2026-10-12T08:00:00.000Z";
const ticket = (n: number) => ({ ticket: n, title: `Ticket ${n}`, since: DEPUIS });
const horsTicket = { ticket: null, title: null, since: DEPUIS } as const;
const pr = (n: number) => `https://exemple.test/pull/${n}`;

// Chaque sorte d'attente, et chacun des motifs qu'elle dit autrement. Le
// `satisfies` en garde la liste complète : une sorte ajoutée sans exemple ne
// compile pas.
const EXEMPLES = {
  merge: [
    { ...ticket(1), quoi: "merge", reason: "no-grant", cause: null, pr: pr(1), expired: null },
    { ...ticket(2), quoi: "merge", reason: "no-grant", cause: null, pr: pr(2), expired: "2026-10-12T07:00:00.000Z" },
    { ...ticket(3), quoi: "merge", reason: "review-required", cause: null, pr: pr(3), expired: null },
    { ...ticket(4), quoi: "merge", reason: "review-required", cause: "declaration-modified: .claude/brigade/reseau", pr: pr(4), expired: null },
    { ...ticket(5), quoi: "merge", reason: "merge-refused", cause: "branch protection", pr: pr(5), expired: null },
    { ...ticket(6), quoi: "merge", reason: "unknown-reason", cause: null, pr: null, expired: null },
  ],
  remontee: [
    { ...ticket(7), quoi: "remontee", reason: "still-red", cause: "returns-exhausted", pr: pr(7) },
    { ...ticket(8), quoi: "remontee", reason: "still-red", cause: "manager-escalated", pr: null },
    { ...ticket(9), quoi: "remontee", reason: "unjudged", cause: "no-verdict", pr: pr(9) },
    { ...ticket(10), quoi: "remontee", reason: "unknown-reason", cause: null, pr: null },
  ],
  fermee: [{ ...ticket(11), quoi: "fermee", reason: "held", cause: null, pr: pr(11) }],
  "86": [
    { ...ticket(12), quoi: "86", reason: "no-calibration" },
    { ...ticket(13), quoi: "86", reason: "unreadable-card" },
    { ...ticket(14), quoi: "86", reason: "refused" },
  ],
  capacite: [
    { ...ticket(15), quoi: "capacite", manque: { capacites: ["gpu"], ensemble: false } },
    { ...ticket(16), quoi: "capacite", manque: { capacites: ["gpu", "macos"], ensemble: true } },
    { ...ticket(17), quoi: "capacite", manque: { capacites: ["gpu", "macos"], ensemble: false } },
  ],
  absente: [
    { ...ticket(18), quoi: "absente", stations: ["mac/claude"] },
    { ...ticket(19), quoi: "absente", stations: ["mac/claude", "pc/codex"] },
  ],
  bloque: [
    { ...ticket(20), quoi: "bloque", abandonnes: [{ ticket: 30, reason: "closed" }] },
    {
      ...ticket(21),
      quoi: "bloque",
      abandonnes: [
        { ticket: 31, reason: "unfired" },
        { ticket: 32, reason: "gone" },
        { ticket: 33, reason: "hors-cuisine" },
      ],
    },
  ],
  ecartee: [
    { ...ticket(22), quoi: "ecartee", reason: "question" },
    { ...ticket(23), quoi: "ecartee", reason: "decision" },
    { ...ticket(24), quoi: "ecartee", reason: "blocked-on-human" },
  ],
  illisible: [
    { ...ticket(25), quoi: "illisible", epique: true },
    { ...ticket(26), quoi: "illisible", epique: false },
  ],
  question: [{ ...ticket(27), quoi: "question" }],
  repris: [
    { ...ticket(28), quoi: "repris", attendait: { what: "the design review", who: "the designer" } },
    { ...ticket(29), quoi: "repris", attendait: null },
  ],
  connexion: [
    { ...horsTicket, quoi: "connexion", station: "box/claude", reason: "not-logged-in" },
    { ...horsTicket, quoi: "connexion", station: "mac/claude", reason: null },
  ],
  session: [
    { ...horsTicket, quoi: "session", expires: "2026-10-12T18:00:00.000Z", origin: { at: "2026-10-12T10:00:00.000Z", what: "renewed" }, lifetimeS: 28_800, failure: null },
    { ...horsTicket, quoi: "session", expires: null, origin: null, lifetimeS: 28_800, failure: { at: DEPUIS, nature: "http", detail: "401" } },
    { ...horsTicket, quoi: "session", expires: "2026-10-12T18:00:00.000Z", origin: { at: DEPUIS, what: "written" }, lifetimeS: 9_000, failure: null },
    { ...horsTicket, quoi: "session", expires: "2026-10-12T18:00:00.000Z", origin: { at: DEPUIS, what: "reconnected" }, lifetimeS: 9_000, failure: null },
  ],
  jeton: [
    { ...horsTicket, quoi: "jeton", state: "soon", token: "/etc/brigade/token", file: "/etc/brigade/token.created", created: "2025-11-01", expires: "2026-11-01", lifetimeDays: 365, reason: null },
    { ...horsTicket, quoi: "jeton", state: "expired", token: "/etc/brigade/token", file: "/etc/brigade/token.created", created: "2025-10-01", expires: "2026-10-01", lifetimeDays: 365, reason: null },
    { ...horsTicket, quoi: "jeton", state: "unknown", token: "/etc/brigade/token", file: "/etc/brigade/token.created", created: null, expires: null, lifetimeDays: 365, reason: "absent" },
    { ...horsTicket, quoi: "jeton", state: "unknown", token: "/etc/brigade/token", file: "/etc/brigade/token.created", created: null, expires: null, lifetimeDays: 365, reason: "unreadable" },
    { ...horsTicket, quoi: "jeton", state: "unknown", token: "/etc/brigade/token", file: "/etc/brigade/token.created", created: null, expires: null, lifetimeDays: 365, reason: "invalid" },
  ],
  fermeture: [
    { ...horsTicket, quoi: "fermeture", demande: { seq: 1, depuis: DEPUIS, sansIssue: null }, retenue: null },
    { ...horsTicket, quoi: "fermeture", demande: { seq: 1, depuis: DEPUIS, sansIssue: null }, retenue: { reason: "cooks", observed: 3, limit: 2, detail: "4" } },
    { ...horsTicket, quoi: "fermeture", demande: { seq: 1, depuis: DEPUIS, sansIssue: null }, retenue: { reason: "zoneless", observed: null, limit: null, detail: "#40" } },
    { ...horsTicket, quoi: "fermeture", demande: { seq: 1, depuis: DEPUIS, sansIssue: null }, retenue: { reason: "deploying", observed: null, limit: null, detail: null } },
    { ...horsTicket, quoi: "fermeture", demande: { seq: 1, depuis: DEPUIS, sansIssue: "2026-10-12T10:00:00.000Z" }, retenue: { reason: "cooks", observed: 1, limit: 1, detail: "1" } },
    ...(["unconfigured", "busy", "stopped", "breaker", "depot", "nothing", "restarted"] as const).map((reason) => ({
      ...horsTicket,
      quoi: "fermeture" as const,
      demande: { seq: 1, depuis: DEPUIS, sansIssue: null },
      retenue: { reason, observed: null, limit: null, detail: DEPUIS },
    })),
  ],
  base: [
    { ...horsTicket, quoi: "base", sha: "0123456789abcdef", echecs: ["runtime tests", "app typecheck"], reparation: 41, echec: "partie" },
    { ...horsTicket, quoi: "base", sha: "0123456789abcdef", echecs: ["runtime tests"], reparation: 41, echec: "remontee" },
    { ...horsTicket, quoi: "base", sha: "0123456789abcdef", echecs: ["runtime tests"], reparation: 41, echec: "rouge-apres-merge" },
  ],
  setup: [
    { ...horsTicket, quoi: "setup", setup: { why: "exit 1", hosts: ["registry.npmjs.org:443", "example.test:8080"], base: "0123456", ticket: 42, station: "box/claude" } },
    { ...horsTicket, quoi: "setup", setup: { why: "exit 1", hosts: [], base: "0123456", ticket: 42, station: "box/claude" } },
    { ...horsTicket, quoi: "setup", setup: { why: "exit 1", hosts: [], base: "0123456", ticket: null, station: null } },
  ],
  aside: [
    { ...horsTicket, quoi: "aside", aside: { reason: "worktree-failed", base: "0123456", ticket: 43, station: "box/claude" } },
    { ...horsTicket, quoi: "aside", aside: { reason: "ticket-unreadable", base: "0123456", ticket: null, station: null } },
    { ...horsTicket, quoi: "aside", aside: { reason: "secrets-unavailable", base: "0123456", ticket: 43, station: null } },
    { ...horsTicket, quoi: "aside", aside: { reason: "unknown-cause", base: "0123456", ticket: null, station: null } },
  ],
  disjoncteur: [
    {
      ...horsTicket,
      quoi: "disjoncteur",
      echecs: [
        { run: "44-aa", ticket: 44, at: DEPUIS, code: 1, turns: 4, tokens: 1000 },
        { run: "x-aa", ticket: null, at: DEPUIS, code: null, turns: null, tokens: null },
      ],
      seuil: 2,
    },
    { ...horsTicket, quoi: "disjoncteur", echecs: [{ run: "45-aa", ticket: 45, at: DEPUIS, code: 1, turns: 4, tokens: 1000 }], seuil: null },
    { ...horsTicket, quoi: "disjoncteur", echecs: [], seuil: 3 },
  ],
} satisfies { [Q in Attente["quoi"]]: Array<Extract<Attente, { quoi: Q }>> };

const TOUTES: Attente[] = Object.values(EXEMPLES).flat();
const SANS_GRANT = { arretees: 9, mergees: 2, parLaPass: 1, refusees: 3, ouvertes: 1 };
const PASSAGES = [
  { le: DEPUIS, ligne: "switched to version 1.2.0 at 10:00" },
  { le: DEPUIS, ligne: "update to version 1.3.0 failed at 10:00: unit did not start — back on version 1.2.0; 1.3.0 is not retried, the next one will be" },
];

test("sur un état qui porte chaque sorte d'attente, le bloc `awaiting` n'a aucun mot français du glossaire, ni dans ses bords, ni dans ses lignes", () => {
  for (const passage of PASSAGES) {
    const lignes = decrireAttentes(TOUTES, () => "3 d", SANS_GRANT, passage);
    assert.equal(lignes[0], `awaiting   ${TOUTES.length} decisions await the chef — the oldest for 3 d`);
    assert.equal(lignes.at(-2), "end awaiting");
    assert.equal(lignes.filter((ligne) => ligne.startsWith("awaiting")).length, 1);
    assert.equal(lignes.length, TOUTES.length + 5);
    sansMotFrancais(lignes);
  }
  // Une seule décision, puis aucune : les deux autres têtes.
  assert.equal(decrireAttentes(TOUTES.slice(0, 1), () => "3 d")[0], "awaiting   1 decision awaits the chef — for 3 d");
  const vide = decrireAttentes([], () => "3 d", { arretees: 1, mergees: 1, parLaPass: 0, refusees: 0, ouvertes: 0 });
  assert.deepEqual(vide, ["awaiting   nothing awaits the chef", "end awaiting", ""]);
  sansMotFrancais(vide);
  // Les entrées hors ticket se nomment en anglais.
  const noms = decrireAttentes(TOUTES, () => "3 d").flatMap((ligne) => /^ {2}(\S+) {2}for /.exec(ligne)?.slice(1) ?? []);
  assert.deepEqual([...new Set(noms.filter((nom) => !nom.startsWith("#")))], ["box/claude", "mac/claude", "session", "token", "closing", "base", "setup", "aside", "breaker"]);
});

test("le test de glossaire cite le mot français et sa ligne, et ne lit pas ce qui est entre backticks", () => {
  const mots = motsFrancais();
  // Des mots de chaque table, et ceux que le glossaire garde pour anglais.
  for (const mot of ["attend", "fin attend", "cuisine", "garde-fous", "disjoncteur", "BLOQUÉ", "rien n'attend le chef", "sans grant", "reprendre", "journal"]) assert.ok(mots.includes(mot), mot);
  for (const mot of ["grant", "rail", "base", "installation", "station", "stop", "cooks", "Pass"]) assert.ok(!mots.includes(mot), mot);

  assert.deepEqual(motsFrancaisDans(["  #3  for 1 min  la cuisine tourne"]), [{ mot: "cuisine", ligne: "  #3  for 1 min  la cuisine tourne" }]);
  assert.deepEqual(motsFrancaisDans(["remove it from the `attend` line of the card, label `hors-cuisine`"]), []);
  // Un mot entier, sans égard à la casse.
  assert.deepEqual(motsFrancaisDans(["Disjoncteur open", "cuisiner", "précuisine"]).map(({ mot }) => mot), ["disjoncteur", "cuisiner"]);
  assert.throws(() => sansMotFrancais(["awaiting   1 décision", "fin attend"]), /« fin attend » dans : fin attend/);
});

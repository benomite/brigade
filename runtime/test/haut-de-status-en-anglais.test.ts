// Le haut de `status` est en anglais (#928) : `runtime`, `kitchen`, `connection`, `stations`, `setup`,
// `aside`, `base`, `grant`, `backup`, la ligne d'urgence et celle qui dit que rien ne cuit. Vérifié
// de deux façons : un état de la box écrit avant la traduction (test/fixtures/etat-d-avant-927/)
// dit les mêmes états qu'avant, sans qu'on l'édite ; et un état d'exemple qui fait paraître chaque
// ligne ne laisse passer aucun mot de la colonne « français » du glossaire. `facts` n'a pas bougé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { depuis1826, depuis1834, depuis1862, depuis1893, depuis1877, ETAT_D_AVANT, etatDAvant, exemple, LU_LE, STATION } from "./aides/haut-de-status.ts";
import { repertoireTemporaire } from "./outils.ts";

// Les lignes qui précèdent le bloc `attend` / `awaiting`, d'une sortie de `status`.
const teteDe = (lignes: readonly string[]) => lignes.slice(0, lignes.findIndex((ligne) => ligne.startsWith("attend") || ligne.startsWith("awaiting")));

const lireTete = (journal: ReturnType<typeof etatDAvant>["journal"], lu = LU_LE) => teteDe(decrireEtat(lireEtat(journal, lu), lu));

test("sur l'état d'avant, `runtime`, `kitchen` et `backup` disent les mêmes états que `runtime`, `cuisine` et `sauvegarde` d'avant", (t) => {
  const avant = teteDe(readFileSync(join(ETAT_D_AVANT, "status-d-avant.txt"), "utf8").replace(/\n$/, "").split("\n"));
  const apres = lireTete(etatDAvant(t).journal);

  assert.deepEqual(avant, [
    "projet     brigade",
    "runtime    en marche d'après le journal — pid 4211 sur box, démarré il y a 3 j",
    "           dernier tick il y a 5 min (cadence : 1 min)",
    "cuisine    ouverte · disjoncteur fermé (0 échec d'affilée, ouverture à 3)",
    "sauvegarde JAMAIS FAITE — le timer brigade-sauvegarde@brigade tourne-t-il ?",
    "",
  ]);
  assert.deepEqual(apres, [
    "project    brigade",
    "runtime    running according to the log — pid 4211 on box, started 3 d ago",
    "           last tick 5 min ago (cadence: 1 min)",
    "kitchen    open · breaker closed (0 failures in a row, opens at 3)",
    "backup     NEVER DONE — is the timer `brigade-sauvegarde@brigade` running?",
    "",
  ]);
  sansMotFrancais(apres);
});

test("sur l'état d'avant, ce que le journal garde en français est toujours lu : une raison de déconnexion, une décision posée", (t) => {
  const { journal, noter } = etatDAvant(t);
  // Une décision posée avant la traduction (`decision.set`, au journal d'avant) : sa valeur est lue telle qu'elle est écrite.
  const decisions = journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'decision.set' ORDER BY seq").map(({ payload }) => JSON.parse(payload).value);
  assert.deepEqual(decisions.slice(0, 2), ["box/claude:2:code+raisonnement", "sonnet"]);
  assert.equal(lireEtat(journal, LU_LE).gardeFous.breakerThreshold, 3);

  // Une raison que le runtime d'avant écrivait en français : la connexion est dite absente, et la raison reprise telle quelle.
  noter("10:00", { type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter("10:01", { type: "station.disconnected", payload: { station: STATION, reason: "binaire introuvable : claude", run: null } }, null, `station:${STATION}`);
  const connexion = lireTete(journal).find((ligne) => ligne.startsWith("connection"));
  assert.ok(connexion?.startsWith("connection Max MISSING for 3 min on box/claude (binaire introuvable : claude) — no ticket is taken any more: "), connexion ?? "pas de ligne connection");
});

test("l'état d'exemple fait paraître chaque ligne du haut de `status`, et aucune ne porte un mot français du glossaire", (t) => {
  const tete = lireTete(exemple(t));
  assert.deepEqual(tete, [
    "nothing cooks: base red since 4 min ago, repair #30 in progress",
    "project    brigade",
    "runtime    running according to the log — pid 4211 on box, started 3 d ago",
    "           last tick 5 min ago (cadence: 1 min)",
    "kitchen    open · breaker OPEN for 4 min (0 failures in a row)",
    "connection Max EXPIRED for 4 min on box/claude (authentication_failed) — no ticket is taken any more: `claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”",
    "base       RED since 4 min ago on abc1234 — the station takes no more tickets, the pass neither judges nor merges",
    "           replay its gates without waiting for a commit: brigade <projet> base replay",
    "setup      BLOCKED for 4 min on ba5e000 — no setup is launched from here, for any ticket, as long as the integration branch does not move: the cause and the action are in the `awaiting` block",
    "aside      BLOCKED for 4 min (secrets-unavailable) — only one ticket is taken again at a time, to see whether the cause has changed: the cause and the action are in the `awaiting` block",
    "grant      merge ACTIVE, EXPIRING SOON: 26 min left (until 12 Oct 10:30 UTC) — a green pass is merged without you",
    "backup     2 min ago (2026-10-09T10-00-00Z, up to event 7)",
    "",
  ]);
  sansMotFrancais(tete);
});

test("l'état d'exemple, la cuisine arrêtée par le chef, sans station, le grant éteint seul, la sauvegarde trop vieille : les mêmes lignes, en anglais", (t) => {
  const { journal, noter } = etatDAvant(t);
  noter("10:00", { type: "kitchen.stopped", payload: {} }, null, "chef");
  noter("10:00", { type: "stations.undeclared", payload: {} });
  noter("10:00", { type: "grant.activated", payload: { action: "merge", until: "2026-10-12T10:01:00.000Z" } }, null, "chef");
  noter("10:02", { type: "grant.expired", payload: { action: "merge", cause: "until", since: "2026-10-12T10:01:00.000Z" } }, null, "pass");
  noter("10:03", { type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  const tete = lireTete(journal);
  assert.deepEqual(tete.slice(1), [
    "runtime    stopped 1 min ago",
    "kitchen    STOPPED by the chef 4 min ago · breaker closed (0 failures in a row, opens at 3)",
    "stations   NONE DECLARED for 4 min — no cook leaves, the tickets stay waiting: set them with `brigade <projet> station stations box/claude:30:code+raisonnement`, read at the next wake-up, no restart",
    "grant      merge LAPSED 3 min ago — its deadline has passed: the pass stops at the open PR, nothing is merged without you any more",
    "backup     NEVER DONE — is the timer `brigade-sauvegarde@brigade` running?",
    "",
  ]);
  sansMotFrancais(tete);

  noter("10:03", { type: "backup.completed", payload: { name: "2026-10-09T10-00-00Z", lastSeq: 7, events: 7, streams: 0 } }, null, "sauvegarde");
  const plusTard = new Date("2026-10-14T12:00:00.000Z");
  const vieille = teteDe(decrireEtat(lireEtat(journal, plusTard), plusTard));
  assert.ok(vieille.includes("backup     TOO OLD: 2 d ago (2026-10-09T10-00-00Z, up to event 7) — more than 2 d: `systemctl status brigade-sauvegarde@brigade`"), vieille.join("\n"));
  sansMotFrancais(vieille);
});

test("un grant sans échéance, un runtime jamais démarré : `ACTIVE, no deadline`, `never started`", (t) => {
  const { journal, noter } = etatDAvant(t);
  noter("10:00", { type: "grant.activated", payload: { action: "merge" } }, null, "chef");
  assert.ok(lireTete(journal).includes("grant      merge ACTIVE, no deadline, since 4 min ago — a green pass is merged without you"));

  const vide = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => vide.fermer());
  const tete = teteDe(decrireEtat(lireEtat(vide, LU_LE), LU_LE));
  assert.ok(tete.some((ligne) => ligne === "runtime    never started"), tete.join("\n"));
  sansMotFrancais(tete);
});

// Ce qu'une ligne nomme et chiffre : tickets, commits, durées, pid, nombres. Les mots changent, pas ceux-là.
const chiffres = (ligne: string) => (ligne.match(/#\d+|\b[0-9a-f]{7}\b(?!-)|\b\d+(?: h \d\d| min| [jd]|(?= échecs?| failures?| usages?| uses?))/g) ?? []).map((chiffre) => chiffre.replace(/ j$/, " d"));
const FIXTURE_928 = join(import.meta.dirname, "fixtures/haut-de-status-d-avant-928");

test("sur l'état d'exemple d'avant, chaque ligne du haut dit les mêmes tickets, commits et durées qu'avant — et la même ligne y répond, une à une", (t) => {
  const avant = teteDe(readFileSync(join(FIXTURE_928, "status-d-avant.txt"), "utf8").split("\n"));
  const apres = lireTete(exemple(t));
  assert.equal(apres.length, avant.length);
  const titres = { "rien ne cuit : ": "nothing cooks: ", projet: "project", runtime: "runtime", cuisine: "kitchen", connexion: "connection", base: "base", setup: "setup", "mis de côté": "aside", grant: "grant", sauvegarde: "backup" } as const;
  avant.forEach((ligne, rang) => {
    const titre = Object.keys(titres).find((candidat) => ligne.startsWith(candidat));
    // Une ligne de suite (retrait de onze espaces) répond à une ligne de suite.
    if (titre === undefined) return assert.equal(apres[rang]?.startsWith(" ".repeat(11)), ligne.startsWith(" ".repeat(11)), ligne);
    assert.ok(apres[rang]?.startsWith(titres[titre as keyof typeof titres]), `${ligne}\n→ ${apres[rang]}`);
    assert.deepEqual(chiffres(apres[rang] ?? ""), chiffres(ligne), `${ligne}\n→ ${apres[rang]}`);
  });
});

test("`facts` de l'état d'exemple est identique à ce qu'il était avant la traduction : mêmes clés, mêmes valeurs", (t) => {
  const avant = depuis1893(depuis1862(depuis1877(depuis1834(depuis1826(JSON.parse(readFileSync(join(FIXTURE_928, "facts.json"), "utf8")))))));
  assert.deepEqual(JSON.parse(JSON.stringify(faits(lireEtat(exemple(t), LU_LE), LU_LE))), avant);
});

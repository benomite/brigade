// Le bas de `status` est en anglais (#940) : `project`, `github`, `rail`, `cooks`, `consumed`, `servers`, `to launch`, `worktrees`,
// `drift`, les transcripts et `latest events`. Vérifié de trois façons : l'état de la box écrit avant la traduction
// (test/fixtures/etat-d-avant-927/) montre les mêmes tickets, dans les mêmes états et le même ordre, sans qu'on
// l'édite ; un état d'exemple qui fait paraître chaque ligne ne laisse passer aucun mot de la colonne « français » du
// glossaire, sur toute la sortie, et dit chaque nombre qu'il disait ; et `facts` n'a pas bougé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { direCommentLeVoirEn } from "../src/projections/service.ts";
import { commentLeVoir } from "../src/ecran.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { direJaugeEn } from "../src/mesures.ts";
import { SANS_SEUIL } from "../src/mesures.ts";
import { direSaturationEn } from "../src/machine.ts";
import { etatLu, etatLuEn, nomEtat, nomEtatEn } from "../src/rail.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { depuis1826, depuis1834, depuis1862, ETAT_D_AVANT, etatDAvant, LU_LE } from "./aides/haut-de-status.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { repertoireTemporaire } from "./outils.ts";

const FIXTURE_940 = join(import.meta.dirname, "fixtures/bas-de-status-d-avant-940");

// Les états, tels que `facts` les écrit (et que l'app les lit), et tels que `status` les écrit désormais.
const EN_ANGLAIS: Record<string, string> = { pris: "taken", "en pass": "in pass", "en attente": "queued", servi: "served", BLOQUÉ: "BLOCKED", "86": "86", WAITING: "WAITING" };

// Le bas d'une sortie de `status`, de la ligne `rail` à la fin.
const basDe = (lignes: readonly string[]) => lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("rail ")));
// Les lignes du rail : un ticket par ligne, avec son état et son titre.
const railDe = (lignes: readonly string[]) =>
  basDe(lignes)
    .slice(1)
    .filter((ligne) => /^ {2}#\d+ {2}/.test(ligne))
    .slice(0, basDe(lignes).findIndex((ligne) => ligne === "") - 1)
    .map((ligne) => ligne.trim().split("  "))
    .map((champs) => [champs[0], champs[1], champs.at(-1)]);

// Ce que #1834 change aux lignes d'avant : #19 attendait #21, fermé sans avoir été servi — il n'était plus
// BLOQUÉ, il est en attente, et sa ligne dit que la cuisine ne l'attend plus. Le compte du rail suit.
function lignesDepuis1834(lignes: readonly string[]): string[] {
  return lignes.map((ligne) =>
    ligne.startsWith("  #19  BLOQUÉ  ")
      ? ligne.replace("  #19  BLOQUÉ  ", "  #19  en attente  ")
      : ligne.startsWith("rail ")
        ? ligne.replace(/(\d+) en attente · (\d+) BLOQUÉ/, (_, attente: string, bloque: string) => `${Number(attente) + 1} en attente${bloque === "1" ? "" : ` · ${Number(bloque) - 1} BLOQUÉ`}`)
        : ligne,
  );
}

test("sur l'état d'avant, `status` montre les mêmes tickets, dans les mêmes états et le même ordre, et les mêmes comptes", (t) => {
  const avant = lignesDepuis1834(readFileSync(join(ETAT_D_AVANT, "status-d-avant.txt"), "utf8").replace(/\n$/, "").split("\n"));
  const apres = decrireEtat(lireEtat(etatDAvant(t).journal, LU_LE), LU_LE);

  assert.deepEqual(
    railDe(apres),
    railDe(avant).map(([ticket, etat, titre]) => [ticket, EN_ANGLAIS[etat ?? ""], titre]),
  );
  assert.deepEqual(railDe(apres).map(([ticket]) => ticket), ["#17", "#19", "#23", "#25", "#18", "#20", "#24", "#26"]);
  assert.equal(basDe(apres)[0], "rail       1 taken · 2 in pass · 3 queued · 2 86");
  assert.deepEqual(basDe(apres).slice(1, 9), [
    "  #17  in pass  prio:1  since 3 d, cooked by box/claude  Ticket 17",
    "  #19  queued  prio:1  #21 was closed without being served: no longer awaited — since 2 h 04  Ticket 19",
    "  #23  taken  prio:1  by box/claude since 5 min, STUCK: no progress since 5 min, lease 5 min left  Ticket 23",
    "  #25  86  prio:1  since 5 min (quota), back in 4 h 56  Ticket 25",
    // Remontée technique, elle est à la cuisine (#1826) : sa ligne le dit.
    "  #18  86  -  since 2 h 04 (pass:returns-exhausted) — the kitchen takes it up (returns-exhausted), not the chef  Ticket 18",
    "  #20  in pass  -  since 6 min, cooked by box/claude  Ticket 20",
    "  #24  queued  -  since 6 min  Ticket 24",
    "  #26  queued  -  since 6 min  Ticket 26",
  ]);
  assert.deepEqual(basDe(apres).slice(10, 17), [
    "cooks      none running",
    "",
    "consumed   in flight: nothing",
    "           5 h: 2 launches · 6 turns · 2,000 tokens",
    "           24 h: 2 launches · 6 turns · 2,000 tokens",
    "           what this project has launched, not the account's consumption: /usage gives it",
    "",
  ]);
  assert.equal(apres[apres.indexOf("latest events") + 1]?.startsWith("  27  "), true);
  // Toute la sortie, de la tête au dernier événement : aucun mot français du glossaire.
  sansMotFrancais(apres);
});

test("l'état d'exemple fait paraître chaque ligne du bas de `status`, et aucune ligne de toute la sortie ne porte un mot français du glossaire", (t) => {
  const sortie = decrireEtat(lireEtat(exempleDuBas(t), LU_LE), LU_LE);
  const bas = basDe(sortie);

  assert.deepEqual(bas.slice(0, bas.indexOf("latest events")), [
    "rail       3 taken · 2 in pass · 7 queued · 1 BLOCKED · 4 86 · 1 WAITING · 1 served",
    "  #30  queued  prio:0  machine saturated — withheld by box/claude (gradual ramp-up, cooks that have just left weigh in advance) — since 4 min  Réparer la base",
    "  #17  in pass  prio:1  since 3 d, cooked by box/claude  Ticket 17",
    "  #19  queued  prio:1  withheld by box/claude (gradual ramp-up, cooks that have just left weigh in advance) — #21 was closed without being served: no longer awaited — since 2 h 04  Ticket 19",
    "  #23  taken  prio:1  by box/claude since 5 min, STUCK: no progress since 5 min, lease 5 min left  Ticket 23",
    "  #25  86  prio:1  since 5 min (quota), back in 4 h 56  Ticket 25",
    // Remontée technique, elle est à la cuisine (#1826) : sa ligne le dit.
    "  #18  86  -  since 2 h 04 (pass:returns-exhausted) — the kitchen takes it up (returns-exhausted), not the chef  Ticket 18",
    "  #20  in pass  -  since 6 min, cooked by box/claude  Ticket 20",
    "  #24  queued  -  withheld by box/claude (gradual ramp-up, cooks that have just left weigh in advance) — since 6 min  Ticket 24",
    "  #26  queued  -  withheld by box/claude (gradual ramp-up, cooks that have just left weigh in advance) — since 6 min  Ticket 26",
    "  #31  taken  -  by box/claude since 2 min, no progress since 2 min, lease 26 min left  Holds the zone",
    "  #32  queued  -  zone held by #31 (runtime/src/etat.ts) — since 2 min  Same zone",
    "  #33  queued  -  awaiting #18 — since 2 min  Awaits a 86",
    "  #34  queued  -  awaiting #24 — since 2 min  Awaits another",
    "  #35  WAITING  -  awaiting the customer: “the customer's answer” — since 2 min, follow-up on 14 Oct 18:00 UTC — on arrival, it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn  At the customer",
    "  #36  86  -  since 2 min (pass:unjudged), no return time — back on its own once the kitchen takes it over: sent back to a cook, or after its `fix` ticket  Frozen",
    "  #37  BLOCKED  -  blocked by #36 (86 with no return time, not judged by the pass) — since 2 min  Awaits the frozen",
    "  #38  86  -  since 2 min (quota), back at the next tick  Return passed",
    "  #39  taken  -  by box/claude since 2 min, STUCK: no progress since 2 min, lease expired since 4 min  Expired lease",
    "  #41  served  -  since 2 min, cooked by box/claude  Served",
    "",
    "cooks      3 running — box/claude: 2 at most — declared — 1 STUCK: #23",
    "           MACHINE SATURATED for 2 min on CPU — load of 16.2 for at most 15: box/claude takes no more tickets as long as it lasts",
    "           box/claude WITHHOLDING for 2 min — gradual ramp-up, cooks that have just left weigh in advance: the servable tickets wait",
    "           ARBITER UNREACHABLE for 2 min — connection refused: box/claude launches only one cook at a time, with no arbitration, until it is back",
    "  #23  STUCK  23-bb  sonnet / medium  2 min of 1 h 00 · turns and tokens: no reading yet · no progress since 5 min",
    "  #31  31-aa  opus / high  cook/31-aa in worktrees/31-aa  2 min of 1 h 00 · 12 turns of 100 · 184,000 tokens of 2,000,000 (reading 2 min ago) · no progress since 2 min · right now: reading runtime/src/etat.ts, since 2 min",
    "  manager  juge-9-cc  haiku / low  2 min of 1 h 00 · turns and tokens: no reading yet",
    "",
    "servers    4 servers — an interface delivery, served from its worktree on the port of that worktree",
    "  #17  worktrees/17-s  port 20017  starting since 2 min  cook/17-s  http://127.0.0.1:20017/rail",
    "    screen: /rail (screen deduced from the touched files, not declared by the cook)",
    "  #18  worktrees/18-s  port 20018  starting since 2 min  cook/18-s  no page to open: the screen “dashboard” is not a route",
    "    screen: dashboard (declared by the cook)",
    "  #19  worktrees/19-s  port 20019  starting since 2 min  cook/19-s  no page to open: the delivery names no screen, and touches none that the project declares",
    "  #20  worktrees/20-s  port 20020  listening since 2 min  cook/20-s  http://127.0.0.1:20020/map",
    "    screen: /map (declared by the cook)",
    "    to look at: the button is blue",
    "to launch  2 — the worktree of a delivery of an app that does not open in a browser, held so that it can be launched there: no page",
    "  #24  worktrees/24-h  held since 2 min  cook/24-h  no page in a browser: launch the app on the delivery's worktree, `cd '/var/lib/brigade/etat/worktrees/24-h' && npm --prefix app start`, then open the screen “the map” there — to look at: the menu opens",
    "    screen: the map (declared by the cook)",
    "    to look at: the menu opens",
    "  #26  worktrees/26-h  held since 2 min  cook/26-h  nothing to look at: the delivery names no screen, and touches none that the project declares",
    "service    NOT DECLARED — the project does not say how it is served (delivery of ticket #50); no server is launched — since 2 min ago on box/claude",
    "",
    "worktrees  3 not cleaned up after their cook — nothing in them is touched, the runtime comes back to them at every tick",
    "  #21  worktrees/21-n  cook/21-n  cleanup failed since 2 min — git worktree: fatal: lock held",
    "  #22  worktrees/22-n  cook/22-n  PR still open since 2 min — cook/22-n",
    "  #22  worktrees/22-o  cook/22-o  work not pushed since 2 min — 2 commits",
    "",
    "consumed   in flight: 3 launches, of which 1 judgment · 12 turns · 184,000 tokens",
    "           5 h: 8 launches, of which 1 review and 2 judgments · 64 turns · 825,000 tokens",
    "           24 h: 8 launches, of which 1 review and 2 judgments · 64 turns · 825,000 tokens",
    "           what this project has launched, not the account's consumption: /usage gives it",
    "drift      tests 622 for a threshold of 500 — `brigade <projet> measures`",
    "claude     project transcripts: 1,027 kept (112 MB), 12 removed (48 MB) at the cleanup 2 min ago — a transcript goes 7 d after its last write",
    "",
  ]);
  assert.equal(bas.filter((ligne) => ligne === "latest events").length, 1);
  assert.equal(bas.length - bas.indexOf("latest events") - 1, 15);
  sansMotFrancais(sortie);
});

// Ce qu'une ligne nomme et chiffre : tickets, commits, ports, durées, nombres. Les mots changent, pas ceux-là. Un
// nombre s'écrit à la française (`184 000`, `16,2`) ou à l'anglaise (`184,000`, `16.2`) : il est lu sans ses séparateurs.
const sansSeparateurs = (ligne: string, francais: boolean) =>
  francais ? ligne.replace(/(\d)[\u202f\u00a0 ](?=\d{3}\b)/g, "$1").replace(/(\d),(\d)/g, "$1.$2") : ligne.replace(/(\d),(?=\d{3}\b)/g, "$1");
const chiffres = (ligne: string, francais = false) =>
  (sansSeparateurs(ligne, francais).match(/#\d+|\b[0-9a-f]{7}\b(?!-)|\bport \d+|\b\d+(?: h \d\d| min| [jd]\b| s\b)|\b\d+(?:\.\d+)?\b/g) ?? []).map((chiffre) => chiffre.replace(/ j$/, " d"));

test("sur l'état d'exemple d'avant, chaque ligne du bas dit les mêmes tickets, ports, durées et nombres qu'avant — et la même ligne y répond, une à une", (t) => {
  const avant = basDe(lignesDepuis1834(readFileSync(join(FIXTURE_940, "status-d-avant.txt"), "utf8").replace(/\n$/, "").split("\n")));
  const apres = basDe(decrireEtat(lireEtat(exempleDuBas(t), LU_LE), LU_LE));
  assert.equal(apres.length, avant.length);
  const titres: Array<[string, string]> = [
    ["rail", "rail"], ["cooks", "cooks"], ["consommé", "consumed"], ["serveurs", "servers"], ["à lancer", "to launch"], ["service", "service"],
    ["worktrees", "worktrees"], ["dérive", "drift"], ["claude", "claude"], ["derniers événements", "latest events"],
  ];
  avant.forEach((ligne, rang) => {
    const reponse = apres[rang] ?? "";
    const titre = titres.find(([francais]) => ligne.startsWith(francais));
    if (titre !== undefined) return assert.ok(reponse.startsWith(titre[1]), `${ligne}\n→ ${reponse}`);
    // Une ligne de suite répond à une ligne de suite, de même retrait.
    assert.equal(/^ */.exec(reponse)?.[0].length, /^ */.exec(ligne)?.[0].length, `${ligne}\n→ ${reponse}`);
    const ticket = /^ {2}#(\d+) {2}(\S+(?: \S+)?)/.exec(ligne);
    if (ticket !== null && EN_ANGLAIS[ticket[2] ?? ""] !== undefined) assert.ok(reponse.startsWith(`  #${ticket[1]}  ${EN_ANGLAIS[ticket[2] ?? ""]}  `), `${ligne}\n→ ${reponse}`);
  });
  // Les nombres, durées et tickets d'une ligne sont ceux de la ligne d'avant (hors événements, qui sont les mêmes mot pour mot).
  const finRail = avant.indexOf("derniers événements");
  avant.slice(0, finRail).forEach((ligne, rang) => assert.deepEqual(chiffres(apres[rang] ?? ""), chiffres(ligne, true), `${ligne}\n→ ${apres[rang]}`));
  assert.deepEqual(apres.slice(apres.indexOf("latest events") + 1), avant.slice(finRail + 1));
});

test("`facts` de l'état d'exemple est identique à ce qu'il était avant la traduction : mêmes clés, mêmes valeurs", (t) => {
  const avant = depuis1862(depuis1834(depuis1826(JSON.parse(readFileSync(join(FIXTURE_940, "facts.json"), "utf8")))));
  assert.deepEqual(JSON.parse(JSON.stringify(faits(lireEtat(exempleDuBas(t), LU_LE), LU_LE))), avant);
});

test("l'état lu en anglais est celui que `facts` dit en français, mot pour mot traduit", (t) => {
  const { rail } = lireEtat(exempleDuBas(t), LU_LE);
  assert.deepEqual(rail.map((ticket) => etatLuEn(ticket)), rail.map((ticket) => EN_ANGLAIS[etatLu(ticket)]));
  assert.deepEqual((["waiting", "taken", "pass", "served", "86"] as const).map((etat) => [nomEtat(etat), nomEtatEn(etat)]), [
    ["en attente", "queued"], ["pris", "taken"], ["en pass", "in pass"], ["servi", "served"], ["86", "86"],
  ]);
});

test("comment voir l'écran d'une app à lancer : la phrase du journal, en français, est dite en anglais depuis sa commande et son écran", () => {
  const ecran = { ecran: "/map", phrase: "the menu opens", source: "declare" as const };
  const commentLeVoirFr = commentLeVoir({ worktree: "/tmp/wt/1-h", lancement: "npm --prefix app start", ecran });
  assert.equal(
    direCommentLeVoirEn({ commentLeVoir: commentLeVoirFr, ecran }),
    "no page in a browser: launch the app on the delivery's worktree, `cd '/tmp/wt/1-h' && npm --prefix app start`, then open the screen “/map” there — to look at: the menu opens",
  );
  assert.equal(direCommentLeVoirEn({ commentLeVoir: null, ecran: null }), "nothing to look at: the delivery names no screen, and touches none that the project declares");
  // Une phrase qui n'a pas la forme du runtime reste telle qu'elle est.
  assert.equal(direCommentLeVoirEn({ commentLeVoir: "autre chose", ecran }), "autre chose");
});

test("une saturation et une dérive se disent en anglais, nombres compris", () => {
  assert.equal(direSaturationEn({ resource: "cpu", observed: 16.24, limit: 15 }), "load of 16.2 for at most 15");
  assert.equal(direSaturationEn({ resource: "memory", observed: 1234.5, limit: 2000 }), "1,234.5 MB of memory available for at least 2,000 MB");
  assert.equal(direSaturationEn({ resource: "disk", observed: 800, limit: 1000 }), "800 MB of disk free for at least 1,000 MB");
  assert.equal(direJaugeEn({ measure: "tests", observed: 622, limit: 500 }), "tests 622 for a threshold of 500");
  assert.equal(direJaugeEn({ measure: "merges", observed: 12, limit: 10 }), "12 merges since the last closing for a threshold of 10");
  assert.equal(direJaugeEn({ measure: "growth:depot_octets", observed: 25.4, limit: 20 }), "repo +25% over 10 merges for a threshold of 20%");
  assert.equal(direJaugeEn({ measure: "gates_s", observed: 31.25, limit: 30 }), "gates 31.3 s for a threshold of 30 s");
  assert.equal(SANS_SEUIL.tests, null);
});

// La ligne `projet` n'est pas entre backticks dans le glossaire (le test de glossaire ne l'y lit pas) : elle se
// vérifie ici, mot pour mot, comme la ligne `github`.
test("les lignes `project` et `github` sont en anglais : le projet, ou `unknown — empty log` ; la limite de GitHub et l'heure de reprise", (t) => {
  const reprise = LU_LE.getTime() + 20 * 60_000;
  const sortie = decrireEtat(lireEtat(exempleDuBas(t), LU_LE), LU_LE, undefined, reprise);
  const hhmm = `${String(new Date(reprise).getHours()).padStart(2, "0")}:${String(new Date(reprise).getMinutes()).padStart(2, "0")}`;
  assert.deepEqual(sortie.slice(1, 3), ["project    brigade", `github     GitHub is rate-limiting calls, back around ${hhmm}`]);
  assert.ok(!sortie.some((ligne) => /^projet\b/.test(ligne)), "aucune ligne `projet`");
  sansMotFrancais(sortie);

  const vide = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => vide.fermer());
  const lue = decrireEtat(lireEtat(vide, LU_LE), LU_LE);
  assert.equal(lue[0], "project    unknown — empty log");
  assert.deepEqual(lue.slice(lue.indexOf("latest events")), ["latest events", "  none"]);
  assert.ok(lue.includes("rail       empty"), lue.join("\n"));
  assert.ok(lue.includes("cooks      none running"), lue.join("\n"));
  sansMotFrancais(lue);
});

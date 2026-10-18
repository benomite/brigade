// La commande par laquelle le chef voit la cuisine : `npm run status`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Plafonds } from "../src/evenements/garde-fous.ts";
import { brancherGardeFous } from "../src/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { demarrer } from "../src/runtime.ts";
import { principal as status } from "../src/status.ts";
import { appeler, ENV_ENFANT, faitInconnu, FAUX_CLAUDE, lancer, photographier, repertoireTemporaire } from "./outils.ts";

const STATUS = join(import.meta.dirname, "../src/status.ts");
const PLAFONDS: Plafonds = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// Un runtime qui tourne, un ticket sur le rail et son cook en cours.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(
    { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 20 }),
  );
  t.after(() => runtime.arreter("test"));
  runtime.journal.ajouter({
    project: "brigade",
    ticket: 7,
    author: "github",
    type: "ticket.arrived",
    payload: { title: "Le ticket sept", priority: 1, createdAt: "2026-10-01T00:00:07Z", url: "https://exemple.test/7" },
  });
  const cook = runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet-apres-un-tour" } });
  return { repertoire, runtime, cook };
}

test("pendant qu'un cook tourne, la commande répond et montre le runtime, le rail, le cook et les derniers événements", async (t) => {
  const { repertoire, runtime, cook } = cuisine(t);
  while (!runtime.journal.duTicket(7).some((e) => e.type === "cook.progressed" && e.payload.turns === 1)) {
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }

  const commande = lancer(t, STATUS, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  const sortie = commande.sortie();
  assert.match(sortie, /^project    brigade$/m);
  assert.match(sortie, new RegExp(`^runtime    running according to the log — pid ${process.pid} on `, "m"));
  assert.match(sortie, /^           last tick \d+ s ago \(cadence: 0 s\)$/m);
  assert.match(sortie, /^rail       1 queued$/m);
  assert.match(sortie, /^  #7  queued  prio:1  since \d+ s  Le ticket sept$/m);
  assert.match(sortie, /^cooks      1 running$/m);
  assert.match(sortie, new RegExp(`^  #7  ${cook.run}  \\d+ s of 1 h 00 · 1 turn of 100 · 10 tokens of 2,000,000 \\(reading \\d+ s ago\\)$`, "m"));
  assert.match(sortie, /^  \d+  \S+  brigade  #7  cook\.launched  runtime  /m);
  assert.doesNotMatch(sortie, /runtime\.ticked|cook\.progressed/);
});

test("la commande ne modifie ni le journal ni ses projections", async (t) => {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");
  const lire = () => {
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return [journal.tout(), photographier(journal, PROJECTIONS)];
    } finally {
      journal.fermer();
    }
  };
  const avant = lire();

  const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /^runtime    stopped \d+ s ago$/m);
  assert.deepEqual(lire(), avant);
});

test("avec `--suivre`, le chef voit la photo puis chaque événement à mesure qu'il s'écrit, jusqu'à Ctrl-C", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const noter = (ticket: number, type: string) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...faitInconnu(type) });
  noter(7, "ticket.arrived");

  const commande = lancer(t, STATUS, ["--follow", "7"], { BRIGADE_STATE_DIR: repertoire });
  await commande.attendre("suivi en direct du ticket #7 — Ctrl-C pour arrêter");
  noter(8, "ticket.taken");
  noter(7, "ticket.taken");
  noter(7, "pass.verdict");
  await commande.attendre("pass.verdict");
  commande.process.kill("SIGINT");

  assert.equal(await commande.fin, 0);
  const suivi = commande.sortie().split("Ctrl-C pour arrêter\n")[1] ?? "";
  assert.deepEqual(suivi.trimEnd().split("\n").map((ligne) => ligne.split("  ").slice(3, 5)), [["#7", "ticket.taken"], ["#7", "pass.verdict"]]);
});

test("avec `--suivre`, deux signaux rapprochés arrêtent proprement la commande : code 0, aucune trace", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.arrived") });

  const commande = lancer(t, STATUS, ["--follow"], { BRIGADE_STATE_DIR: repertoire });
  await commande.attendre("Ctrl-C pour arrêter");
  // Les deux signaux sont remis à un process suspendu, qui les trouve ensemble
  // en reprenant : aucun ne peut le surprendre en train de sortir. Deux signaux
  // différents, parce que deux SIGINT en attente n'en font qu'un.
  commande.process.kill("SIGSTOP");
  commande.process.kill("SIGINT");
  commande.process.kill("SIGTERM");
  commande.process.kill("SIGCONT");

  assert.equal(await commande.fin, 0);
  assert.doesNotMatch(commande.sortie(), /ERR_INVALID_STATE|database is not open/);
});

test("sans répertoire d'état, sans journal, ou avec un argument inconnu, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, STATUS, []);
  const sansJournal = appeler(status, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const arguments_ = [["7"], ["--follow", "sept"], ["--follow", "7", "8"], ["--regarder"]].map((args) =>
    appeler(status, args, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }),
  );

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR n'est pas défini/);
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /aucun journal/);
  for (const commande of arguments_) {
    assert.equal(await commande.fin, 2);
    assert.match(commande.sortie(), /usage/);
  }
});

test("la commande montre la dernière sauvegarde, et la marque au-delà de l'âge déclaré", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.now() - 3 * 3_600_000) });
  journal.ajouter({ project: "brigade", ticket: null, author: "sauvegarde", type: "backup.completed", payload: { name: "s", lastSeq: 0, events: 0, streams: 0 } });
  journal.fermer();

  const parDefaut = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
  const serree = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_BACKUP_MAX_AGE_HOURS: "2" });

  assert.equal(await parDefaut.fin, 0);
  assert.match(parDefaut.sortie(), /^backup     3 h 00 ago \(s, up to event 0\)$/m);
  assert.equal(await serree.fin, 0);
  assert.match(serree.sortie(), /^backup     TOO OLD: 3 h 00 ago .* more than 2 h 00: `systemctl status brigade-sauvegarde@brigade`$/m);
});

test("un âge de sauvegarde mal déclaré est un refus, pas un défaut silencieux", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const commandes = ["0", "deux", "1.5", ""].map((valeur) => appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_BACKUP_MAX_AGE_HOURS: valeur }));

  for (const commande of commandes) {
    assert.equal(await commande.fin, 2);
    assert.match(commande.sortie(), /BRIGADE_BACKUP_MAX_AGE_HOURS invalide/);
  }
});

test("une cuisine retenue par une base rouge le dit sans qu'on le demande : depuis quand, sur quel commit, et le geste qui fait rejouer", async (t) => {
  const { repertoire, runtime } = cuisine(t);
  const statut = async () => {
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await commande.fin, 0);
    return commande.sortie();
  };
  const noter = (fait: Fait, author = "pass") => runtime.journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  assert.doesNotMatch(await statut(), /^base /m);

  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: { outcome: "red", code: 1, failures: [], tail: "" }, tickets: [] } });
  let sortie = await statut();
  assert.match(sortie, /^base       RED since \d+ s ago on ba5e000 — the station takes no more tickets, the pass neither judges nor merges$/m);
  assert.match(sortie, /^           replay its gates without waiting for a commit: brigade <projet> base replay$/m);

  noter({ type: "base.checked", payload: { sha: "c0ffee05ffff", outcome: "skipped", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, tickets: [] } });
  noter({ type: "base.recheck-requested", payload: {} }, "chef");
  sortie = await statut();
  assert.match(sortie, /^base       RED since \d+ s ago on ba5e000 — /m);
  assert.match(sortie, /^           gates not played on c0ffee0 for \d+ s: a check that was not played does not lift a red that was found$/m);
  assert.match(sortie, /^           replay asked by the chef for \d+ s: the pass plays it on its next round$/m);

  // Le rejeu demandé ne s'est pas fait : il n'est plus annoncé, et le motif se lit.
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "skipped", gates: { outcome: "skipped", code: null, failures: [], tail: "" }, tickets: [], red: "ba5e0004ffff", reason: "git worktree : fatal: disque plein" } });
  sortie = await statut();
  assert.match(sortie, /^           gates not played on ba5e000 for \d+ s, the attempt did not run \(git worktree : fatal: disque plein\): a check that was not played does not lift a red that was found$/m);
  assert.match(sortie, /^           replay its gates without waiting for a commit: brigade <projet> base replay$/m);
  assert.doesNotMatch(sortie, /prochain passage/);

  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
  assert.doesNotMatch(await statut(), /^base /m);
});

test("la commande dit au chef qu'on l'attend, sans qu'il le demande, et cesse de le dire une fois la décision prise sur GitHub", async (t) => {
  const { repertoire, runtime } = cuisine(t);
  const statut = async () => {
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await commande.fin, 0);
    return commande.sortie();
  };
  const noter = (fait: Fait) => runtime.journal.ajouter({ project: "brigade", ticket: 7, author: "pass", ...fait });
  noter({ type: "pass.started", payload: { run: "7-aa", pr: "https://exemple.test/pull/7", number: 7, sha: "sha-7" } });
  noter({ type: "pass.held", payload: { reason: "no-grant" } });

  const sortie = await statut();
  assert.match(sortie, /^awaiting   1 decision awaits the chef — for \d+ s$/m);
  assert.match(sortie, /^  #7  for \d+ s  green delivery, not merged for lack of a `merge` grant — merge by hand: https:\/\/exemple\.test\/pull\/7 — or enable the grant, for the next ones: `brigade <projet> grant enable merge`  Le ticket sept$/m);
  // Et le chiffre sur lequel accorder, dans le même bloc.
  // Le bilan ferme le bloc, dont la fin se reconnaît sans le lire.
  assert.match(sortie, /^  without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open\nend awaiting\n\nrail /m);

  // Le chef merge la PR à la main : la pass le constate.
  noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/7", sha: "sha-7", by: "outside", reconciled: false, unverified: true } });
  // La file vidée, le bloc reste là et le dit, entre les mêmes bords.
  assert.match(await statut(), /^awaiting   nothing awaits the chef\nend awaiting\n\nrail /m);
});

test("un contrôle de base que le rapatriement retient se lit sans qu'on le demande : retenu, pourquoi, depuis quand — et un rejeu demandé n'est pas annoncé comme imminent", async (t) => {
  const { repertoire, runtime } = cuisine(t);
  const statut = async () => {
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await commande.fin, 0);
    return commande.sortie();
  };
  const noter = (fait: Fait, author = "pass") => runtime.journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  const retenir = () => noter({ type: "base.check-held", payload: { reason: "git fetch : fatal: origine injoignable" } });
  const RETENU = String.raw`check held for \d+ s: the base cannot be fetched \(git fetch : fatal: origine injoignable\) — the pass comes back to it on its own, at every tick`;

  // Une base qui n'est pas rouge : des merges y attendent leur contrôle.
  retenir();
  assert.match(await statut(), new RegExp(`^base       ${RETENU}$`, "m"));
  noter({ type: "base.check-resumed", payload: {} });
  assert.doesNotMatch(await statut(), /^base /m);

  // Rouge, sans demande : la retenue se lit sous le rouge, avant le geste.
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: { outcome: "red", code: 1, failures: [], tail: "" }, tickets: [] } });
  retenir();
  let sortie = await statut();
  assert.match(sortie, new RegExp(`^base       RED since \\d+ s ago on ba5e000 — .*\\n           ${RETENU}\\n           replay its gates without waiting for a commit: `, "m"));

  // Le rejeu demandé retente aussitôt, et bute de nouveau.
  noter({ type: "base.recheck-requested", payload: {} }, "chef");
  retenir();
  sortie = await statut();
  assert.match(sortie, /^           replay asked by the chef for \d+ s: the base cannot be fetched for \d+ s \(git fetch : fatal: origine injoignable\), the pass comes back to it on its own$/m);
  assert.doesNotMatch(sortie, /prochain passage|contrôle retenu/);

  noter({ type: "base.check-resumed", payload: {} });
  assert.match(await statut(), /^           replay asked by the chef for \d+ s: the pass plays it on its next round$/m);
});

test("un journal d'avant ces projections le dit, au lieu d'une erreur de base", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire, { projections: [] }).fermer();

  const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /redémarrer le runtime/);
});

test("un journal dont le rail date d'avant la date de progrès le dit aussi", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.base.script("DROP TABLE rail; CREATE TABLE rail (ticket INTEGER PRIMARY KEY, title TEXT) STRICT;");
  journal.fermer();

  const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /redémarrer le runtime/);
});

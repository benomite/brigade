// La pause du renommage du code : la carte qui demande le « oui » du chef, et
// ce que ce « oui » arrête — tout autre merge, tout cook neuf — jusqu'à la fin
// de la pause. Les premiers tests lisent un journal que le test écrit ; les
// suivants font tourner une cuisine sous grant, avec sa pass et sa station.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { ACCEPTER_LA_PAUSE, attentesDuChef, REFUSER_LA_PAUSE } from "../src/attend.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { mergerLaLivraison } from "../src/geste-ticket.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { demanderPause, leverPause, mergeRetenu, pauseAccordee, pauseEnCours, repondre } from "../src/pause/pause.ts";
import { lireRail } from "../src/projections/rail.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { appeler, JOUR_HORLOGE, jourDecale, jusqua, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// Le bloc `awaiting` d'une sortie de `status`, bords compris.
const blocAttend = (lignes: string[]) => lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting") + 1);

// Un journal que le test écrit : #12 pris, #14 en pass, #16 en attente.
function journalEcrit(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [], problems: [] } } },
      ticket,
      "github",
    );
  const prendre = (ticket: number) => {
    arriver(ticket);
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
  };
  prendre(12);
  prendre(14);
  noter({ type: "cook.exited", payload: { run: "14-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 14);
  noter({ type: "ticket.passing", payload: { station: STATION } }, 14, `station:${STATION}`);
  arriver(16);
  const demander = (ticket: number | null = null, minutes = 45) => demanderPause(journal, "brigade", { ticket, minutes, rail: lireRail(journal.base), auteur: "runtime" });
  const statut = () => decrireEtat(lireEtat(journal, new Date(`${JOUR_HORLOGE}T10:05:00.000Z`)), new Date(`${JOUR_HORLOGE}T10:05:00.000Z`));
  return { repertoire, journal, demander, statut };
}

describe("la carte de la pause", () => {
  test("demander la pause pose une carte dans la file : la durée attendue, et les tickets en vol qu'elle retiendra — chacun avec ce qui lui arrivera", (t) => {
    const { journal, demander, statut } = journalEcrit(t);

    const demande = demander();

    assert.equal(demande.issue, "demandee");
    assert.deepEqual(demande.pause.inFlight, [
      { ticket: 12, state: "taken" },
      { ticket: 14, state: "pass" },
    ]);
    const [carte, ...autres] = attentesDuChef(journal.base, lireRail(journal.base));
    assert.deepEqual(autres, []);
    assert.equal(carte?.quoi, "pause");
    const bloc = blocAttend(statut());
    assert.equal(bloc[0], "awaiting   1 decision awaits the chef — for 5 min");
    assert.equal(
      bloc[1],
      `  pause  for 5 min  the code rename asks to pause the kitchen for about 45 min — no merge, no new cook until it ends — in flight, held: #12 (taken: its cook finishes its work, then its delivery waits), #14 (in pass: its merge waits) — to agree: \`${ACCEPTER_LA_PAUSE}\`; to decline: \`${REFUSER_LA_PAUSE}\``,
    );
    sansMotFrancais(bloc);
  });

  test("une seconde demande, pendant que la première attend ou tient, n'écrit rien et rend la première", (t) => {
    const { journal, demander } = journalEcrit(t);
    const premiere = demander(9, 45);

    assert.deepEqual(demander(null, 20), { issue: "deja", pause: premiere.pause });
    repondre(journal, "brigade", "yes");
    assert.equal(demander(null, 20).issue, "deja");
    assert.equal(journal.tout().filter((e) => e.type === "pause.requested").length, 1);
  });

  test("tant que le chef n'a pas dit « oui », rien n'est retenu ; son « non » retire la carte, et rien n'a changé", (t) => {
    const { journal, demander, statut } = journalEcrit(t);
    demander();

    assert.equal(pauseAccordee(journal.base), null);
    assert.equal(mergeRetenu(journal.base, 14), null);
    assert.deepEqual(repondre(journal, "brigade", "no").suite, "refusee");
    assert.equal(pauseEnCours(journal.base), null);
    assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base)), []);
    assert.deepEqual(blocAttend(statut()), ["awaiting   nothing awaits the chef", "end awaiting"]);
    assert.match(statut().join("\n"), /^kitchen +open · /m);
  });

  test("après le « oui », la carte sort de la file, et la file dit en une seule ligne « paused for the code rename » — qui finit son travail, qui est retenu", (t) => {
    const { journal, demander, statut } = journalEcrit(t);
    demander(9);

    assert.equal(repondre(journal, "brigade", "yes").suite, "acceptee");

    assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base)), []);
    const bloc = blocAttend(statut());
    assert.deepEqual(bloc, [
      "awaiting   nothing awaits the chef",
      `  paused for the code rename — for 5 min, expected about 45 min — finishing their work: #12 · held: #14 — to end it now: \`${REFUSER_LA_PAUSE}\``,
      "end awaiting",
    ]);
    assert.equal(statut().filter((ligne) => ligne.includes("paused for the code rename")).length, 1);
    assert.match(statut().join("\n"), /^kitchen +PAUSED for the code rename 5 min ago · /m);
    // Seul le ticket du renommage passe.
    assert.notEqual(mergeRetenu(journal.base, 14), null);
    assert.equal(mergeRetenu(journal.base, 9), null);
    sansMotFrancais(bloc);
  });

  test("la pause se lève par le renommage, ou par le « non » du chef sur une pause qui tient : la cuisine repart", (t) => {
    const { journal, demander, statut } = journalEcrit(t);
    demander();
    repondre(journal, "brigade", "yes");

    assert.equal(leverPause(journal, "brigade", "the rename is merged", "runtime"), true);
    assert.equal(pauseEnCours(journal.base), null);
    assert.equal(mergeRetenu(journal.base, 14), null);
    assert.equal(leverPause(journal, "brigade", "again", "runtime"), false);
    assert.doesNotMatch(statut().join("\n"), /paused for the code rename/);

    demander();
    repondre(journal, "brigade", "yes");
    assert.equal(repondre(journal, "brigade", "no").suite, "levee");
    assert.equal(pauseEnCours(journal.base), null);
    assert.deepEqual(
      journal
        .tout()
        .filter((e) => e.type.startsWith("pause."))
        .map((e) => [e.type, e.author]),
      [
        ["pause.requested", "runtime"],
        ["pause.agreed", "chef"],
        ["pause.released", "runtime"],
        ["pause.requested", "runtime"],
        ["pause.agreed", "chef"],
        ["pause.released", "chef"],
      ],
    );
  });

  test("le chef répond par `guardrails pause yes` ou `pause no`, en anglais ; sans pause demandée, rien n'est écrit", async (t) => {
    const { repertoire, journal, demander } = journalEcrit(t);
    const commande = async (...args: string[]) => {
      const cli = appeler(gardeFous, args, { BRIGADE_STATE_DIR: repertoire });
      return { code: await cli.fin, sortie: cli.sortie() };
    };

    const sansDemande = await commande("pause", "yes");
    assert.equal(sansDemande.code, 1);
    assert.match(sansDemande.sortie, /no code rename asks for a pause: nothing is written/);
    assert.equal((await commande("pause")).code, 2);
    assert.equal((await commande("pause", "maybe")).code, 2);

    demander();
    const vue = await commande();
    assert.match(vue.sortie, /^code rename +asks to pause the kitchen for about 45 min since .* — `pause yes` to agree, `pause no` to decline$/m);
    const oui = await commande("pause", "yes");
    assert.equal(oui.code, 0);
    assert.match(oui.sortie, /“yes”: paused for the code rename — no other merge, no new cook, for about 45 min; the cooks in flight finish their work, their deliveries wait/);
    assert.match((await commande("pause", "yes")).sortie, /already paused for the code rename since .*: nothing is written/);
    assert.match((await commande()).sortie, /^kitchen +PAUSED for the code rename since .* — no other merge, no new cook; `pause no` to end it now$/m);
    const non = await commande("pause", "no");
    assert.match(non.sortie, /“no”: the pause for the code rename is over — the kitchen goes on by itself/);
    assert.equal(pauseEnCours(journal.base), null);
    for (const sortie of [sansDemande.sortie, vue.sortie, oui.sortie, non.sortie]) sansMotFrancais(sortie.split("\n"));
  });
});

// Une cuisine sous grant : #17 est pris, son cook attend qu'on le laisse
// conclure. `ecrire` : une connexion à part, comme celle d'une commande.
async function enCuisine(t: TestContext, issues = [issue(17)]) {
  const lieu = cuisine(t, { pass: true, scenario: "commite-puis-attend", cooks: 2, issues });
  chef(lieu.repertoire, "grant.activated");
  const ecrire = <T>(faire: (journal: Journal) => T): T => {
    const journal = ouvrirJournal(lieu.repertoire);
    try {
      return faire(journal);
    } finally {
      journal.fermer();
    }
  };
  const demander = (ticket: number | null = null) => ecrire((journal) => demanderPause(journal, "brigade", { ticket, minutes: 45, rail: lireRail(journal.base), auteur: "runtime" }));
  const repondreOui = () => ecrire((journal) => repondre(journal, "brigade", "yes"));
  const lever = () => ecrire((journal) => leverPause(journal, "brigade", "the rename is merged", "runtime"));
  const compter = (type: string, ticket?: number) => (ticket === undefined ? lieu.journal.tout() : lieu.journal.duTicket(ticket)).filter((e) => e.type === type).length;
  const statut = () => decrireEtat(lireEtat(lieu.journal), new Date());
  const commentaires = (ticket: number) => lieu.gh.commentaires.filter(([numero]) => numero === ticket).map(([, corps]) => corps).join("\n---\n");
  return { ...lieu, demander, repondreOui, lever, compter, statut, commentaires, ecrire };
}

describe("le merge et la prise pendant la pause", { concurrency: 4 }, () => {
  test("une carte qui attend son « oui » ne change rien : la livraison verte est mergée sous grant, comme sans elle", async (t) => {
    const { etat, demander, conclure, compter, gh, journal } = await enCuisine(t);
    await jusqua(() => etat(17) === "taken" && compter("cook.launched", 17) === 1);

    demander();
    conclure();

    await jusqua(() => compter("merge.done", 17) === 1);
    assert.equal(gh.merges.length, 1);
    assert.equal(compter("pass.waiting", 17), 0);
    // La carte attend encore le chef.
    assert.equal(pauseEnCours(journal.base)?.agreedAt, null);
  });

  test("après le « oui », le cook en vol finit son travail, puis sa livraison verte attend au lieu d'être mergée ; aucun ticket neuf n'est pris ; à la fin de la pause, elle est mergée et la prise reprend", async (t) => {
    const lieu = await enCuisine(t);
    const { etat, demander, repondreOui, lever, conclure, compter, gh, statut, commentaires, journal, ecrire } = lieu;
    await jusqua(() => etat(17) === "taken" && compter("cook.launched", 17) === 1);

    demander();
    repondreOui();
    await jusqua(() => statut().some((ligne) => ligne.startsWith("  paused for the code rename") && ligne.includes("finishing their work: #17 · held: none")));
    // Un ticket arrivé pendant la pause n'est pas pris.
    gh.poser(issue(18));
    await jusqua(() => journal.tout().some((e) => e.type === "station.held" && e.payload.reason === "paused"));

    conclure();
    await jusqua(() => compter("pass.waiting", 17) === 1);
    assert.equal(journal.duTicket(17).findLast((e) => e.type === "pass.waiting")?.payload.reason, "paused");
    assert.deepEqual(gh.merges, []);
    assert.equal(compter("grant.used", 17), 0);
    assert.match(commentaires(17), /\*\*Pass — en attente \(`paused`\)\.\*\*[\s\S]*pause pour le renommage du code/);
    await jusqua(() => statut().some((ligne) => ligne.startsWith("  paused for the code rename") && ligne.includes("finishing their work: none · held: #17")));
    assert.equal(etat(18), "waiting");
    assert.equal(compter("cook.launched", 18), 0);
    // Le merge à la main de la file est refusé, lui aussi.
    const aLaMain = await ecrire((j) => mergerLaLivraison(j, gh.github, 17));
    assert.equal(aLaMain.done, false);
    assert.match(aLaMain.done ? "" : aLaMain.reason, /^paused for the code rename since .*: no other merge until it ends/);
    assert.deepEqual(gh.merges, []);

    lever();
    await jusqua(() => compter("merge.done", 17) === 1);
    await jusqua(() => compter("cook.launched", 18) === 1);
    assert.equal(gh.merges.length, 1);
    assert.doesNotMatch(statut().join("\n"), /paused for the code rename/);
  });

  test("pendant la pause, seul le ticket du renommage part en cuisine et se merge", async (t) => {
    const { etat, demander, repondreOui, compter, gh, conclure, journal } = await enCuisine(t, []);
    demander(18);
    repondreOui();

    gh.poser(issue(17));
    gh.poser(issue(18));
    await jusqua(() => compter("cook.launched", 18) === 1);
    conclure();
    await jusqua(() => compter("merge.done", 18) === 1);
    assert.equal(gh.merges.length, 1);
    assert.equal(etat(17), "waiting");
    assert.equal(compter("cook.launched", 17), 0);
    assert.notEqual(pauseAccordee(journal.base), null);
  });
});

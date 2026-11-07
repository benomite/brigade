// La pause du renommage du code : la carte qui demande le « oui » du chef, et
// ce que ce « oui » arrête — tout autre merge, tout cook neuf — jusqu'à la fin
// de la pause. Les tests lisent un journal que le test écrit.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { attentesDuChef } from "../src/attend.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demanderPause, leverPause, pauseAccordee, pauseEnCours, repondre } from "../src/pause/pause.ts";
import { lireRail } from "../src/projections/rail.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, JOUR_HORLOGE, jourDecale, repertoireTemporaire } from "./outils.ts";

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
      `  pause  for 5 min  the code rename asks to pause the kitchen for about 45 min — no merge, no new cook until it ends — in flight, held: #12 (taken: its cook finishes its work, then its delivery waits), #14 (in pass: its merge waits) — to agree or decline: no app button for it yet`,
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
      `  paused for the code rename — for 5 min, expected about 45 min — finishing their work: #12 · held: #14 — to end it now: no app button for it yet`,
      "end awaiting",
    ]);
    assert.equal(statut().filter((ligne) => ligne.includes("paused for the code rename")).length, 1);
    assert.match(statut().join("\n"), /^kitchen +PAUSED for the code rename 5 min ago · /m);
    sansMotFrancais(bloc);
  });

  test("la pause se lève par le renommage, ou par le « non » du chef sur une pause qui tient : la cuisine repart", (t) => {
    const { journal, demander, statut } = journalEcrit(t);
    demander();
    repondre(journal, "brigade", "yes");

    assert.equal(leverPause(journal, "brigade", "the rename is merged", "runtime"), true);
    assert.equal(pauseEnCours(journal.base), null);
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

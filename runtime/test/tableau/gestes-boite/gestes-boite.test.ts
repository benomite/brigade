// Les gestes de box du chef postés sous le tableau de la cuisine : plafond de
// cooks, arrêt et reprise, rejeu de la base, grant merge, cuisine d'une
// station. Écrits par le compte du chef, ils jouent la commande locale qui les
// porte et la box répond d'une ligne ; écrits par un autre, rien ne se joue et
// rien ne se répond. GitHub est ici un faux client, le journal un vrai.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../src/evenements.ts";
import { demarrer } from "../../../src/runtime.ts";
import { etatDesGardeFous } from "../../../src/projections/guardrails.ts";
import { etatDeLaBase } from "../../../src/projections/pass.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "../../../src/tableau/gestes/client.ts";
import { gestesDuTableau } from "../../../src/tableau/gestes/gestes.ts";
import { lireUnGesteDeBoite } from "../../../src/tableau/gestes-boite/grammaire.ts";
import { fauxGitHub, issue } from "../../aides/cuisine.ts";
import { DEPOT, horloge, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const TABLEAU = 1;
const CHEF = "benomite";
const ROUGES = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime"], tail: "" };

function atelier(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const { journal } = runtime;
  const noter = (fait: Fait, author = "pass") => journal.ajouter({ project: PROJET, ticket: null, author, ...fait });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } }, `station:${STATION}`);

  const commentaires: CommentaireDuTableau[] = [];
  const reponses: string[] = [];
  let id = 5000;
  const poster = (corps: string, auteur = CHEF) => {
    id += 1;
    const commentaire = { id, auteur, corps, le: `2026-10-08T10:${String(id - 5000).padStart(2, "0")}:00Z`, url: `https://github.com/${DEPOT}/issues/${TABLEAU}#issuecomment-${id}` };
    commentaires.push(commentaire);
    return commentaire;
  };
  const client: ClientDesGestes = {
    async commentaires(_numero, depuis) {
      return commentaires.filter((commentaire) => depuis === null || commentaire.le >= depuis).map((commentaire) => ({ ...commentaire }));
    },
    async repondre(_numero, corps) {
      reponses.push(corps);
      poster(corps, CHEF);
    },
    async compteDuChef() {
      return CHEF;
    },
  };
  const gestes = gestesDuTableau({ client, journal, projet: PROJET, github: fauxGitHub(issue(30)).github, repertoireEtat: repertoire, avertir: () => {} });
  // Poste le geste, le fait lire, et rend la réponse de la box.
  const jouer = async (corps: string, auteur = CHEF) => {
    const avant = reponses.length;
    const commentaire = poster(corps, auteur);
    await gestes.traiter(TABLEAU);
    assert.ok(reponses.length <= avant + 1);
    return { commentaire, reponse: reponses[avant] };
  };
  return { journal, noter, jouer, reponses };
}

const uneLigne = (reponse: string | undefined, debut: string) => {
  assert.ok(reponse !== undefined, "la box a répondu");
  assert.doesNotMatch(reponse, /\n/, "une ligne");
  assert.ok(reponse.startsWith(debut), reponse);
  return reponse;
};

describe("un geste de box posté sous le tableau", () => {
  test("`cooks <N>` règle le plafond de cooks de la station, comme `station -- cooks`", async (t) => {
    const a = atelier(t);
    const { commentaire, reponse } = await a.jouer("/brigade cooks 4");
    uneLigne(reponse, `**Done** — [cooks 4](${commentaire.url}): `);
    assert.match(reponse ?? "", /simultaneous cooks/);
    const plafonds = a.journal.duType("station.capped", 20).map((fait) => fait.payload.maxCooks);
    assert.deepEqual(plafonds, [4]);
  });

  test("`stop` arrête la cuisine et `resume` la rouvre, comme `guardrails`", async (t) => {
    const a = atelier(t);
    uneLigne((await a.jouer("/brigade stop")).reponse, "**Done** — [stop](");
    assert.notEqual(etatDesGardeFous(a.journal.base).stoppedAt, null);
    uneLigne((await a.jouer("/brigade resume")).reponse, "**Done** — [resume](");
    assert.equal(etatDesGardeFous(a.journal.base).stoppedAt, null);
  });

  test("`base replay` demande le rejeu des gates d'une base rouge, comme `base -- replay`", async (t) => {
    const a = atelier(t);
    a.noter({ type: "base.checked", payload: { sha: "ba5e0006ffff", outcome: "red", gates: ROUGES, tickets: [17] } });
    assert.equal(etatDeLaBase(a.journal.base)?.recheck, null);
    uneLigne((await a.jouer("/brigade base replay")).reponse, "**Done** — [base replay](");
    assert.notEqual(etatDeLaBase(a.journal.base)?.recheck, null);
  });

  test("`grant enable merge --for 4h` accorde le grant, comme `grant -- enable merge`, et `grant revoke merge` le retire", async (t) => {
    const a = atelier(t);
    const accorde = uneLigne((await a.jouer("/brigade grant enable merge --for 4h")).reponse, "**Done** — [grant enable merge](");
    assert.match(accorde, /grant/i);
    assert.equal(a.journal.duType("grant.activated", 20).length, 1);
    uneLigne((await a.jouer("/brigade grant revoke merge")).reponse, "**Done** — [grant revoke merge](");
    assert.equal(a.journal.duType("grant.revoked", 20).length, 1);
  });

  test("`station stop <station>` arrête la cuisine du projet sur une station, `station start` la relance", async (t) => {
    const a = atelier(t);
    uneLigne((await a.jouer(`/brigade station stop ${STATION}`)).reponse, "**Done** — [station stop ");
    assert.equal(a.journal.duType("station.stopped", 20).length, 1);
    uneLigne((await a.jouer(`/brigade station start ${STATION}`)).reponse, "**Done** — [station start ");
    assert.equal(a.journal.duType("station.started", 20).length, 1);
  });

  test("les mêmes gestes écrits par un autre compte ne font rien, et n'ont aucune réponse", async (t) => {
    const a = atelier(t);
    for (const corps of ["/brigade cooks 9", "/brigade stop", "/brigade resume", "/brigade base replay", "/brigade grant enable merge", `/brigade station stop ${STATION}`]) {
      assert.equal((await a.jouer(corps, "passant")).reponse, undefined, corps);
    }
    assert.deepEqual(a.reponses, []);
    assert.deepEqual(a.journal.duType("station.capped", 20), []);
    assert.equal(etatDesGardeFous(a.journal.base).stoppedAt, null);
    assert.deepEqual(a.journal.duType("grant.activated", 20), []);
    assert.deepEqual(a.journal.duType("station.stopped", 20), []);
    assert.deepEqual(a.journal.duType("board.gesture", 20), []);
  });

  test("un argument manquant ou invalide est refusé d'une ligne qui dit ce qui était attendu, et rien n'est écrit", async (t) => {
    const a = atelier(t);
    const attendus: Array<[string, RegExp]> = [
      ["/brigade cooks", /cooks needs one cap/],
      ["/brigade cooks many", /cooks needs one cap/],
      ["/brigade cooks 2 3", /cooks needs one cap/],
      ["/brigade stop now", /stop takes nothing/],
      ["/brigade base", /base needs `replay`/],
      ["/brigade grant", /grant needs `enable`/],
      ["/brigade grant enable deploy", /grant needs `enable`/],
      ["/brigade station stop", /station needs `stop` or `start`/],
    ];
    for (const [corps, attendu] of attendus) {
      const reponse = uneLigne((await a.jouer(corps)).reponse, "**Not understood** — [your gesture](");
      assert.match(reponse, attendu, corps);
    }
    // Une option que `grant` ne lit pas : elle refuse, en disant ce qu'elle attend.
    const grant = uneLigne((await a.jouer("/brigade grant enable merge --for soon")).reponse, "**Not done** — [grant enable merge](");
    assert.match(grant, /usage|deadline|duration/i);
    // Une station inconnue.
    uneLigne((await a.jouer("/brigade station stop ailleurs")).reponse, "**Not done** — [station stop ailleurs](");
    assert.deepEqual(a.journal.duType("station.capped", 20), []);
    assert.deepEqual(a.journal.duType("grant.activated", 20), []);
    assert.deepEqual(a.journal.duType("station.stopped", 20), []);
  });

  test("la grammaire ne prend que le premier mot de gestes qu'elle connaît : les autres restent aux gestes du tableau", () => {
    assert.equal(lireUnGesteDeBoite("/brigade merge #3"), null);
    assert.equal(lireUnGesteDeBoite("bonjour"), null);
    assert.equal(lireUnGesteDeBoite("/brigade"), null);
    assert.deepEqual(lireUnGesteDeBoite("/brigade cooks auto"), { nom: "cooks auto", commande: "station", args: ["cooks", "auto"] });
  });
});

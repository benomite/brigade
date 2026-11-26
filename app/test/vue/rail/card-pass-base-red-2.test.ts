// Ticket #3840 — la carte du Pass tenue par une base rouge. Le rail et les cooks d'un projet, lus de GitHub seul (#2220 ; seul chemin depuis #2061) : la vue du rail range ses
// issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING, mises de côté (#2075) —, et
// l'onglet Cooks montre les stations d'après leurs commentaires de prise et leurs signes de vie (#2358). Joué sur un faux
// GitHub, puis rendu par le rail de l'app. Son TODO est ce qui attend le chef lu de GitHub, la lecture même que le
// second relaie (#2460).
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, tableau as tableauDe, holdFacts, type Facts, type Tableau } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuRepository, type ReadDuTableauDuRepository } from "../../../src/tableau/read.ts";
import { avecCeQuiAwaitingLeChef } from "../../../src/tableau/wait-du-chef.ts";
import type { MemoireDesLectures } from "../../../src/tableau/rail-github.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";
import { type SignesDeVie } from "../../../src/vue/rail/github.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const taking = (id: number, station: string, le: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: le });

// Le projet : #1 en attente, #2 pris par box/claude, #3 en pass (PR #40) cuisiné par mac/claude, #4 en WAITING, #5 en pass
// sans PR — GitHub ne dit d'elle aucun des quatre —, et #6, sans `fire`, avant le rail. Sa base est verte, ou rouge.
type Monde = { fermees?: unknown[]; base?: string; issues?: () => unknown[]; commentaires?: Record<number, unknown[]>; appels?: string[] };
function github({ fermees, base = "success", issues, commentaires = {}, appels: calls = [] }: Monde = {}): CallGitHub {
  return async (chemin) => {
    calls.push(chemin);
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
      return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "parked", "taken"]), issue(5, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })]);
    }
    // Toutes les issues ouvertes : ce qui est avant le rail (tableau/read.ts).
    if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "taken"]), issue(6, [])]);
    if (chemin.includes("/pulls?state=closed")) return ok(fermees ?? []);
    if (chemin.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
    if (chemin === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined && commentaires[Number(commentees)] !== undefined) return ok(commentaires[Number(commentees)]);
    if (chemin.includes("/issues/2/comments")) return ok([taking(11, "box/claude", "2026-11-04T02:58:00Z")]);
    if (chemin.includes("/issues/3/comments")) return ok([taking(12, "mac/claude", "2026-11-04T01:00:00Z"), taking(13, "box/claude", "2026-11-04T01:00:05Z")]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
}

const LU = new Date("2026-11-04T03:02:03.076Z");
// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const lire = async (appeler: CallGitHub, memoire?: MemoireDesLectures, signes?: () => Promise<SignesDeVie>) =>
  avecCeQuiAwaitingLeChef(await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => LU, ...(memoire === undefined ? {} : { memoire }), ...(signes === undefined ? {} : { signes }) }), appeler);

// Ce que la vue dessine de la lecture : le tableau de `facts`, avec la ligne de chaque ticket que `status` écrit.
function dessine(lu: ReadDuTableauDuRepository): Tableau {
  assert.ok(lu.lu, "the rail is read");
  const facts = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return tableauDe(facts as Facts, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}
const colonnes = (vu: Tableau) => Object.fromEntries(vu.rail.colonnes.map(({ nom: name, cartes: cards }) => [name, cards.map(({ ticket, mot: word, etat: state }) => `#${ticket} ${word ?? state}`)]));

const cardsDuPass = (vu: Tableau) => vu.rail.colonnes.find(({ nom: name }) => name === "Pass")?.cartes ?? [];
const toutCeQueDitLaCard = (card: ReturnType<typeof cardsDuPass>[number]) => [card.ligne, ...card.dit.map(({ valeur }) => valeur), card.age?.dit ?? ""].join(" | ");

test("critère 2 — main redevenue verte, la carte revient à « in pass » avec son temps à la lecture suivante", async () => {
  const memoire: MemoireDesLectures = new Map();
  const [red] = cardsDuPass(dessine(await lire(github({ base: "failure" }), memoire)));
  assert.equal(red?.mot, "base red");
  assert.match(red?.ligne ?? "", /main.*green|green.*main/);
  const [verte] = cardsDuPass(dessine(await lire(github({ base: "success" }), memoire)));
  assert.equal(verte?.mot, "in pass");
  assert.equal(verte?.etat, "en pass");
  assert.doesNotMatch(verte?.ligne ?? "", /green/);
  assert.match(toutCeQueDitLaCard(verte as NonNullable<typeof verte>), /02:30|32 min/);
});

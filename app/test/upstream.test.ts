// Ce qui est avant le rail (#1836, #697) : un rail vide ne veut pas dire un projet fini. La lecture de GitHub ne le lit
// plus (#4507) : la cuisine n'a rien avant son rail, son Backlog est une colonne du kanban (board/kitchen-board.ts) — la
// sortie de `manager upstream` n'est pas publiée, et la vue n'en dit rien. Ce qui reste ici : la forme de cette sortie
// telle qu'une box la donne, ses états dans l'ordre du bandeau, et ce qu'une lecture ratée en dit.
import { docRuntime } from "./helpers/doc-runtime.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { DEPOT } from "../../runtime/test/outils.ts";
import { COMMAND, understand, GROUPS, group, holdUpstream, see, type Seen } from "../src/upstream.ts";
import type { Reading } from "../src/box.ts";
import type { CallGitHub } from "../src/board/client.ts";
import { readTheBoardOfRepository } from "../src/board/read.ts";
import { readOfBoard } from "../src/board/rail.ts";

const PARADE = "parade";
const A = "2026-10-15T09:12:04.000Z";

// Une issue ouverte, telle que l'API de GitHub la rend.
type Open = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string };
const openOne = (number: number, labels: string[] = []): Open => ({
  number,
  title: `Ticket ${number}`,
  labels: labels.map((name) => ({ name })),
  created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
});

// Un GitHub dont ce sont les issues ouvertes, sans PR.
const github = (issues: Open[]): CallGitHub => async (path) => {
  if (path.includes("/issues?")) return { status: 200, data: issues };
  if (path.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};

const reading = (text: string): Reading => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMAND, texte: text }] });

describe("ce qui est avant le rail, lu sur GitHub", () => {
  test("les cinq états viennent dans l'ordre du bandeau, puis les deux d'un besoin découpé ; un mot que l'app ne connaît pas se pose après eux, tel quel", () => {
    const one = (ticket: number, state: string) => ({ ticket, titre: `#${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat: state, dit: state });

    const groups = group([one(1, "mise-de-cote"), one(2, "inconnu"), one(3, "non-lue"), one(4, "prete"), one(5, "epique"), one(6, "non-lue"), one(7, "incomplete")]);

    assert.deepEqual(GROUPS.map(({ etat: state }) => state), ["non-lue", "incomplete", "epique", "prete", "mise-de-cote", "decoupee", "servie", "idee"]);
    assert.deepEqual(
      groups.map(({ etat: state, issues }) => [state, issues.map(({ ticket }) => ticket)]),
      [
        ["non-lue", [3, 6]],
        ["incomplete", [7]],
        ["epique", [5]],
        ["prete", [4]],
        ["mise-de-cote", [1]],
        ["inconnu", [2]],
      ],
    );
  });

  test("le rail lu de GitHub, ce qui est avant lui ne l'est pas (#4507) : ni nombre, ni « pas lu » — rien n'est dit (#1770)", async () => {
    const readOne = await readTheBoardOfRepository({ depot: DEPOT, appeler: github([openOne(10, ["fire"]), openOne(20)]), maintenant: () => new Date(A) });
    assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
    const seenOne = see(readOfBoard(readOne, PARADE, 3, [COMMAND]));
    assert.ok("nonPublie" in seenOne, JSON.stringify(seenOne));
    assert.ok(!("compte" in seenOne) && !("sans" in seenOne));
    assert.equal(seenOne.vide, "nothing on the rail");
  });

  test("une lecture ratée ne donne jamais de nombre, et dit pourquoi — ce n'est pas « rien avant le rail »", async () => {
    const failure = (error: string, reached: boolean, theCase: null = null): Reading => ({ projet: PARADE, demande: 3, a: A, erreur: error, atteinte: reached, cas: theCase });
    const without = (seenOne: Seen) => {
      assert.ok(!("compte" in seenOne), "un nombre a été donné");
      assert.ok("sans" in seenOne, "la lecture ratée doit dire pourquoi");
      assert.match(seenOne.sans, /This is not “nothing before the rail”$/);
      assert.equal(seenOne.vide, `nothing on the rail — ${seenOne.sans}`);
      return seenOne.sans;
    };

    // GitHub ne se lit pas : sa raison, en une phrase.
    assert.match(without(see({ ...failure("GitHub refused to read the rail of acme/brigade (HTTP 403).", true), duTableau: true })), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Le même refus, lu tel que l'app le lit.
    const refusal = await readTheBoardOfRepository({ depot: DEPOT, appeler: async () => ({ status: 403, data: {} }), maintenant: () => new Date(A) });
    assert.match(without(see(readOfBoard(refusal, PARADE, 3, [COMMAND]))), /^what is before the rail was not read: GitHub refused to read the rail of acme\/brigade \(HTTP 403\)\. This/);
    // Une sortie qui n'a pas la forme : ni complétée, ni comptée.
    assert.match(without(see(reading(""))), /in what GitHub gave: the command returned nothing/);
    assert.match(without(see(reading("12 issues"))), /it is not JSON/);
    assert.match(without(see(reading(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ticket: 3, titre: "t", url: "u", priorite: null, etat: "non-lue" }] })))), /“issues\[0\]\.dit” is not a string/);
  });

  test("la commande que la lecture de GitHub remplace est celle que docs/runtime/ documente, dans le dépôt et sur la box", () => {
    const doc = docRuntime(join(import.meta.dirname, "../.."));

    assert.equal(COMMAND, "manager upstream");
    assert.ok(doc.includes("npm --prefix runtime run manager -- upstream"), "docs/runtime/ ne cite pas `manager -- upstream`");
    assert.ok(doc.includes("`brigade <projet> manager [return <n°> \\| backlog \\| upstream]`"), "docs/runtime/ ne cite pas `manager upstream`");
  });
  test("un champ de plus est laissé de côté, un champ qui manque refuse la forme entière", () => {
    const issue = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "non-lue", dit: "d" };

    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, autre: true }], plus: 1 })), { lu: A, depot: DEPOT, issues: [issue] });
    assert.deepEqual(understand(JSON.stringify({ lu: A, issues: [] })), { informe: "“depot” is not a string" });
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, priorite: "2" }] })), { informe: "“issues[0].priorite” is not a non-negative integer" });
    // Ce qu'elle dit d'un besoin découpé (#3460) : ses tickets, ses servis, son contexte, sa fermeture — un champ qui n'a pas sa forme refuse tout.
    const split = { ...issue, etat: "decoupee", tickets: [4], servis: [], contexte: "c", servieLe: "s" };
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [split] })), { lu: A, depot: DEPOT, issues: [split] });
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, tickets: ["4"] }] })), { informe: "“issues[0].tickets[0]” is not a non-negative integer" });
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, servis: 4 }] })), { informe: "“issues[0].servis” is not a list" });
    assert.deepEqual(understand(JSON.stringify({ lu: A, depot: DEPOT, issues: [{ ...issue, contexte: 1 }] })), { informe: "“issues[0].contexte” is not a string" });
  });

  test("l'adresse d'une issue reste au process principal : celle que la lecture a donnée, en https seulement, du projet lu", () => {
    const upstreams = holdUpstream();
    const issue = (ticket: number, url: string) => ({ ticket, titre: "t", url, priorite: null, etat: "non-lue", dit: "d" });
    upstreams.recevoir(reading(JSON.stringify({ lu: A, depot: DEPOT, issues: [issue(3, "https://github.com/x/y/issues/3"), issue(4, "http://ailleurs/4")] })));

    assert.equal(upstreams.adresse(PARADE, 3), "https://github.com/x/y/issues/3");
    assert.equal(upstreams.adresse(PARADE, 4), undefined);
    assert.equal(upstreams.adresse("autre", 3), undefined);
    // Le projet n'est plus affiché : ce qui a été lu de lui est lâché.
    upstreams.veiller([]);
    assert.equal(upstreams.adresse(PARADE, 3), undefined);
  });
});

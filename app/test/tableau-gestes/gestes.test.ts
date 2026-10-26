// L'envoi des décisions du chef comme commentaires du tableau (app/src/tableau-gestes/) : le corps posté suit la grammaire
// du runtime, le suivi passe de pending à taken ou refused, un échec ne poste rien deux fois. Le client GitHub est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lireLeGeste } from "../../../runtime/src/tableau/gestes/grammaire.ts";
import type { GesteDuTableau } from "../../../runtime/src/tableau/rendu/bloc.ts";
import { corpsDuGeste, gestesDuTableau, type ClientDesGestes, type DecisionDuChef } from "../../src/tableau-gestes/gestes.ts";

function doublure(options: { echecs?: number } = {}) {
  const postes: string[] = [];
  let gestes: GesteDuTableau[] | null = [];
  let echecs = options.echecs ?? 0;
  const client: ClientDesGestes = {
    poster: async (_depot, _tableau, corps) => {
      if (echecs > 0) {
        echecs--;
        throw new Error("HTTP 502 Bad Gateway");
      }
      postes.push(corps);
      return { id: 1000 + postes.length, url: `https://github.com/chef/parade/issues/9#issuecomment-${1000 + postes.length}` };
    },
    gestesDuTableau: async () => gestes,
  };
  return { client, postes, pose: (g: GesteDuTableau[] | null) => (gestes = g) };
}
const geste = (commentaire: number, etat: "pris" | "refuse", reponse: string): GesteDuTableau => ({ commentaire, url: "", le: "", geste: "merge", ticket: 123, etat, traiteLe: "", reponse });

const CAS: Array<[DecisionDuChef, string]> = [
  [{ geste: "merge", ticket: 123 }, "/brigade merge #123"],
  [{ geste: "send-back", ticket: 123, raison: "the CSV export misses the header row" }, "/brigade send-back #123 the CSV export misses the header row"],
  [{ geste: "set-aside", ticket: 123 }, "/brigade set-aside #123"],
  [{ geste: "answer", ticket: 123, reponse: "Neither: an Excel export,\non top of the CSV." }, "/brigade answer #123 Neither: an Excel export,\non top of the CSV."],
  [{ geste: "choose", ticket: 123, choix: 2 }, "/brigade choose #123 2"],
  [{ geste: "arrived", ticket: 123 }, "/brigade arrived #123"],
];

for (const [decision, attendu] of CAS) {
  test(`« ${decision.geste} » poste le commentaire de la grammaire documentée`, async () => {
    const { client, postes } = doublure();
    const etat = await gestesDuTableau({ depot: "chef/parade", tableau: 9, client }).envoyer(decision);
    assert.deepEqual(postes, [attendu]);
    assert.equal(etat.etat, "pending");
    // La box lit ce corps comme le geste demandé.
    const lu = lireLeGeste(postes[0] ?? "");
    assert.ok(lu !== null && "verbe" in lu && lu.verbe === decision.geste && lu.ticket === 123);
  });
}

test("send-back sans raison ne porte que le ticket", () => {
  assert.equal(corpsDuGeste({ geste: "send-back", ticket: 7 }), "/brigade send-back #7");
});

test("un geste posté est pending, puis taken avec la réponse de la box", async () => {
  const { client, pose } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  const posteur = await gestes.envoyer({ geste: "merge", ticket: 123 });
  assert.equal(posteur.etat, "pending");
  if (posteur.etat !== "pending") return;
  assert.equal((await gestes.suivre(posteur.commentaire)).etat, "pending");
  pose([geste(999, "pris", "**Done** — merge #123")]);
  assert.equal((await gestes.suivre(posteur.commentaire)).etat, "pending");
  pose([geste(posteur.commentaire.id, "pris", "**Done** — merge #123 — cost: 0")]);
  assert.deepEqual(await gestes.suivre(posteur.commentaire), { etat: "taken", commentaire: posteur.commentaire, reponse: "**Done** — merge #123 — cost: 0" });
});

test("un geste que la box refuse est refused avec sa ligne", async () => {
  const { client, pose } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  const posteur = await gestes.envoyer({ geste: "merge", ticket: 123 });
  if (posteur.etat !== "pending") return assert.fail();
  pose([geste(posteur.commentaire.id, "refuse", "**Not done** — merge #123: no delivery waits")]);
  const suivi = await gestes.suivre(posteur.commentaire);
  assert.equal(suivi.etat, "refused");
  assert.equal(suivi.etat === "refused" && suivi.reponse, "**Not done** — merge #123: no delivery waits");
});

test("un tableau qui ne se lit pas laisse le geste pending", async () => {
  const { client, pose } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  const posteur = await gestes.envoyer({ geste: "merge", ticket: 123 });
  if (posteur.etat !== "pending") return assert.fail();
  pose(null);
  assert.equal((await gestes.suivre(posteur.commentaire)).etat, "pending");
});

test("un post qui échoue rend failed en une phrase, et le renvoi ne poste qu'une fois", async () => {
  const { client, postes } = doublure({ echecs: 1 });
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  const echec = await gestes.envoyer({ geste: "merge", ticket: 123 });
  assert.equal(echec.etat, "failed");
  assert.equal(echec.etat === "failed" && echec.raison, "The gesture could not be posted on the Kitchen board of chef/parade: HTTP 502 Bad Gateway.");
  assert.deepEqual(postes, []);
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => gestes.envoyer({ geste: "merge", ticket: 123 })));
  assert.equal(a?.etat, "pending");
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  await gestes.envoyer({ geste: "merge", ticket: 123 });
  assert.deepEqual(postes, ["/brigade merge #123"]);
});

test("une décision sans sens n'est pas postée", async () => {
  const { client, postes } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  assert.equal((await gestes.envoyer({ geste: "answer", ticket: 5, reponse: "  " })).etat, "failed");
  assert.equal((await gestes.envoyer({ geste: "choose", ticket: 5, choix: 0 })).etat, "failed");
  assert.deepEqual(postes, []);
});

test("le module ne lance aucun ssh ni aucun processus", () => {
  const code = readFileSync(new URL("../../src/tableau-gestes/gestes.ts", import.meta.url), "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /child_process|spawn|exec|ssh/i);
});

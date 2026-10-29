// L'envoi des décisions du chef comme commentaires du tableau (app/src/tableau-gestes/) : le corps posté suit la grammaire
// du runtime, le suivi passe de pending à taken ou refused, un échec ne poste rien deux fois. Le client GitHub est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lireUnGesteDeBoite } from "../../../runtime/src/tableau/gestes-boite/grammaire.ts";
import { lireLeGeste } from "../../../runtime/src/tableau/gestes/grammaire.ts";
import type { GesteDuTableau } from "../../../runtime/src/tableau/rendu/bloc.ts";
import { corpsDuGeste, ditParLaBox, gestesDuTableau, jusquALaBox, type ClientDesGestes, type DecisionDuChef } from "../../src/tableau-gestes/gestes.ts";

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
  [{ geste: "comment", ticket: 123, commentaire: "  The export misses the header row.\nSee the attached file. " }, "/brigade comment #123 The export misses the header row.\nSee the attached file."],
  [{ geste: "ask", ticket: 123, contexte: "the export is slow on big files" }, "/brigade ask #123 the export is slow on big files"],
  [{ geste: "ask", ticket: 123 }, "/brigade ask #123"],
];

for (const [decision, attendu] of CAS) {
  test(`« ${decision.geste} » poste le commentaire de la grammaire documentée`, async () => {
    const { client, postes } = doublure();
    const etat = await gestesDuTableau({ depot: "chef/parade", tableau: 9, client }).envoyer(decision);
    assert.deepEqual(postes, [attendu]);
    assert.equal(etat.etat, "pending");
    // La box lit ce corps comme le geste demandé.
    const lu = lireLeGeste(postes[0] ?? "");
    assert.ok(lu !== null && "verbe" in lu && lu.verbe === decision.geste && "ticket" in lu && lu.ticket === 123);
  });
}

// Ce qui partait par `ssh` sur la box (#1845) et ne porte pas de ticket : la box le lit avec sa grammaire des gestes de box.
const DE_BOITE: Array<[DecisionDuChef, string, string]> = [
  [{ geste: "cooks", plafond: "4" }, "/brigade cooks 4", "cooks 4"],
  [{ geste: "cooks", plafond: "0" }, "/brigade cooks 0", "cooks 0"],
  [{ geste: "cooks", plafond: "auto" }, "/brigade cooks auto", "cooks auto"],
  [{ geste: "station", action: "stop", station: "box/claude" }, "/brigade station stop box/claude", "station stop box/claude"],
  [{ geste: "station", action: "start", station: "mac/claude" }, "/brigade station start mac/claude", "station start mac/claude"],
];
for (const [decision, attendu, nom] of DE_BOITE) {
  test(`« ${attendu} » est le geste de box que la box lit`, () => {
    assert.equal(corpsDuGeste(decision), attendu);
    const lu = lireUnGesteDeBoite(attendu);
    assert.ok(lu !== null && "nom" in lu && lu.nom === nom, JSON.stringify(lu));
  });
}

test("un plafond, une station ou un commentaire sans sens ne sont pas postés", async () => {
  const { client, postes } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  for (const decision of [{ geste: "cooks", plafond: "05" }, { geste: "cooks", plafond: "many" }, { geste: "station", action: "stop", station: "box claude" }, { geste: "station", action: "pause", station: "box/claude" }, { geste: "comment", ticket: 5, commentaire: " \n " }] as DecisionDuChef[]) {
    assert.equal((await gestes.envoyer(decision)).etat, "failed", JSON.stringify(decision));
  }
  assert.deepEqual(postes, []);
});

test("ce que la box a répondu, en clair : ce qu'elle dit, et ce que ça coûte", () => {
  assert.deepEqual(ditParLaBox("**Done** — [cooks 4](https://github.com/chef/parade/issues/9#issuecomment-1): box/claude: 4 at most — set by you — cost: none: only the log is written"), { dit: "box/claude: 4 at most — set by you", prix: "none: only the log is written" });
  assert.deepEqual(ditParLaBox("**Done** — [comment #21](https://github.com/x) — cost: a comment is posted on issue #21"), { dit: "", prix: "a comment is posted on issue #21" });
  assert.deepEqual(ditParLaBox("**Not done** — [comment #99](https://github.com/x): #99 has no GitHub issue: it does not exist, or is gone"), { dit: "#99 has no GitHub issue: it does not exist, or is gone", prix: "" });
  assert.deepEqual(ditParLaBox("**Not done** — [station stop a\\_b](u): unknown station `a_b`, \\*none\\* \u2060"), { dit: "unknown station `a_b`, *none*", prix: "" });
});

test("un geste suivi jusqu'à la box : relu après chaque attente, rendu dès qu'elle l'a joué — ou encore pending à la fin", async () => {
  const { client, pose } = doublure();
  const gestes = gestesDuTableau({ depot: "chef/parade", tableau: 9, client });
  const envoye = await gestes.envoyer({ geste: "cooks", plafond: "4" });
  if (envoye.etat !== "pending") return assert.fail();
  let dormi = 0;
  const joue = await jusquALaBox(gestes, envoye, {
    essais: 5,
    dormir: async () => {
      dormi++;
      if (dormi === 2) pose([geste(envoye.commentaire.id, "pris", "**Done** — [cooks 4](…): 4 at most — cost: none")]);
    },
  });
  assert.equal(joue.etat, "taken");
  assert.equal(dormi, 2);
  pose([]);
  const encore = await jusquALaBox(gestes, envoye, { essais: 3, dormir: async () => void dormi++ });
  assert.equal(encore.etat, "pending");
  assert.equal(dormi, 5);
  const echoue = { etat: "failed" as const, raison: "x" };
  assert.equal(await jusquALaBox(gestes, echoue, { essais: 3, dormir: async () => assert.fail("rien à attendre") }), echoue);
});

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
  assert.deepEqual(await gestes.suivre(posteur.commentaire), { etat: "taken", commentaire: posteur.commentaire, reponse: "**Done** — merge #123 — cost: 0", lu: geste(posteur.commentaire.id, "pris", "**Done** — merge #123 — cost: 0") });
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

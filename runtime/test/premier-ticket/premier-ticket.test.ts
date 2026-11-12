// Le premier ticket écrit dans l'app (#3306) : le second rédige d'après la réponse du chef, réécrit sur ses
// changements, et l'issue n'est créée — avec `fire` — que sur son « oui ». `claude` et GitHub doublés en mémoire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL } from "../../src/github.ts";
import { brouillonLu, consigne, creer, QUESTION, rediger, type Lancer } from "../../src/premier-ticket/premier-ticket.ts";
import type { ClientGitHub, RequeteGitHub, ReponseGitHub } from "../../src/proteger-branche.ts";
import { LABELS_DU_PREMIER_TICKET } from "../../src/second-init/premier-ticket.ts";

const DEPOT = "chef/cantine";
const BROUILLON = { title: "Show the lunch menu on the home page", body: "## Context\n\nThe chef wants guests to see the menu first.\n\n## Acceptance criteria\n\n- When I open the home page, I see today's menu." };

// Un `claude` qui répond `sortie`, et note chaque lancement.
function second(sortie: string, code: number | null = 0, erreur = "") {
  const lancements: { commande: string; args: readonly string[]; entree: string; dossier: string }[] = [];
  const lancer: Lancer = async (commande, args, entree, dossier) => {
    lancements.push({ commande, args, entree, dossier });
    return { code, sortie, erreur };
  };
  return { lancer, lancements };
}

// Un GitHub où chaque requête est notée, et rendue par `repondre`.
function github(repondre: (requete: RequeteGitHub) => ReponseGitHub = () => ({ statut: 201, corps: { number: 7, html_url: `https://github.com/${DEPOT}/issues/7` }, scopes: null })) {
  const appels: RequeteGitHub[] = [];
  const client: ClientGitHub = async (requete) => {
    appels.push(requete);
    return repondre(requete);
  };
  return { client, appels };
}

test("la réponse du chef part au second, qui rend un brouillon — titre et corps aux deux sections —, sans rien créer", async () => {
  const { lancer, lancements } = second(`Here it is:\n${JSON.stringify(BROUILLON)}\n`);
  const rendu = await rediger({ depot: DEPOT, dossier: "/projets/cantine", demande: { answer: "  Show the menu first  " }, claude: "claude", lancer });
  assert.deepEqual(rendu, { draft: BROUILLON });
  assert.equal(lancements.length, 1);
  assert.deepEqual([lancements[0]?.commande, lancements[0]?.args, lancements[0]?.dossier], ["claude", ["-p"], "/projets/cantine"]);
  const entree = lancements[0]?.entree ?? "";
  assert.ok(entree.includes(QUESTION));
  assert.ok(entree.includes("Show the menu first"));
  assert.match(entree, /`## Context`.*`## Acceptance criteria`/s);
  assert.match(entree, /create nothing/);
  assert.doesNotMatch(entree, /already showed them this draft/);
});

test("un « non » du chef fait réécrire : le brouillon vu et ses changements partent avec la réponse", async () => {
  const revu = { ...BROUILLON, title: "Show the lunch menu and its prices on the home page" };
  const { lancer, lancements } = second(JSON.stringify(revu));
  const rendu = await rediger({ depot: DEPOT, dossier: "/p", demande: { answer: "Show the menu first", draft: BROUILLON, changes: "Add the prices" }, claude: "claude", lancer });
  assert.deepEqual(rendu, { draft: revu });
  const entree = lancements[0]?.entree ?? "";
  assert.ok(entree.includes(JSON.stringify(BROUILLON)), entree);
  assert.ok(entree.includes("Add the prices"));
  assert.ok(consigne(DEPOT, { answer: "x" }).length < entree.length);
});

test("une réponse du second qui ne se lit pas est dite, jamais remplacée par un brouillon inventé", async () => {
  for (const sortie of ["I could not do it.", '{"title": "No sections", "body": "just text"}', '{"title": "two\\nlines", "body": "## Context\\n## Acceptance criteria"}']) {
    const rendu = await rediger({ depot: DEPOT, dossier: "/p", demande: { answer: "x" }, claude: "claude", lancer: second(sortie).lancer });
    assert.ok("refus" in rendu, sortie);
    assert.equal(rendu.refus, "the second answered something the app cannot read as a ticket");
  }
  const tombe = await rediger({ depot: DEPOT, dossier: "/p", demande: { answer: "x" }, claude: "claude", lancer: second("", 1, "not logged in").lancer });
  assert.deepEqual(tombe, { refus: "the second did not write the ticket", detail: "not logged in" });
  const absent = await rediger({ depot: DEPOT, dossier: "/p", demande: { answer: "x" }, claude: "claude", lancer: async () => Promise.reject(new Error("spawn claude ENOENT")) });
  assert.deepEqual(absent, { refus: "the second could not be started to write the ticket", detail: "spawn claude ENOENT" });
});

test("une demande sans réponse, ou une réécriture sans changements, ne lance pas le second", async () => {
  for (const demande of [undefined, { answer: "  " }, { answer: "x", draft: BROUILLON }, { answer: "x", draft: BROUILLON, changes: " " }, { answer: "x", draft: { title: "t" }, changes: "c" }]) {
    const { lancer, lancements } = second(JSON.stringify(BROUILLON));
    const rendu = await rediger({ depot: DEPOT, dossier: "/p", demande, claude: "claude", lancer });
    assert.ok("refus" in rendu, JSON.stringify(demande));
    assert.equal(lancements.length, 0);
  }
});

test("le « oui » du chef crée une seule issue, avec le brouillon et les labels du premier ticket — `fire` compris : elle est sur le rail", async () => {
  const { client, appels } = github();
  assert.deepEqual(await creer(client, DEPOT, BROUILLON), { ticket: 7, url: `https://github.com/${DEPOT}/issues/7` });
  assert.equal(appels.length, 1);
  assert.deepEqual(appels[0], { methode: "POST", chemin: `repos/${DEPOT}/issues`, corps: { ...BROUILLON, labels: [...LABELS_DU_PREMIER_TICKET] } });
  assert.ok((appels[0]?.corps as { labels: string[] }).labels.includes(LABEL));
  assert.equal(LABEL, "fire");
});

test("un brouillon illisible n'est pas créé ; un refus ou un silence de GitHub se dit avec sa cause", async () => {
  const rien = github();
  const illisible = await creer(rien.client, DEPOT, { title: "t", body: "no sections" });
  assert.ok("refus" in illisible && illisible.refus.startsWith("nothing was created"));
  assert.equal(rien.appels.length, 0);

  const refuse = await creer(github(() => ({ statut: 410, corps: { message: "Issues are disabled for this repo" }, scopes: null })).client, DEPOT, BROUILLON);
  assert.deepEqual(refuse, { refus: `nothing was created: GitHub refused the issue on ${DEPOT}`, detail: "HTTP 410 — Issues are disabled for this repo" });

  const injoignable = await creer(async () => Promise.reject(new Error("`gh` est introuvable")), DEPOT, BROUILLON);
  assert.deepEqual(injoignable, { refus: "nothing was created: GitHub could not be reached", detail: "`gh` est introuvable" });

  const muet = await creer(github(() => ({ statut: 201, corps: null, scopes: null })).client, DEPOT, BROUILLON);
  assert.ok("refus" in muet && muet.refus.includes("did not say its number"));
});

test("un brouillon se lit tel quel, rogné, et seulement avec ses deux sections", () => {
  assert.deepEqual(brouillonLu({ title: `  ${BROUILLON.title} `, body: `\n${BROUILLON.body}\n` }), BROUILLON);
  assert.throws(() => brouillonLu({ title: "", body: BROUILLON.body }), /title is empty/);
  assert.throws(() => brouillonLu({ title: "x".repeat(121), body: BROUILLON.body }), /longer than 120/);
  assert.throws(() => brouillonLu({ title: "t", body: "## Context\nonly" }), /`## Acceptance criteria`/);
  assert.throws(() => brouillonLu("t"), /a title and a body/);
});

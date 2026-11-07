// L'aiguillage des cartes de TODO vers les humains du projet (#2760) : la carte
// va à l'humain dont le rôle répond à sa question, assignée et mentionnée sur
// son issue ; sans rôle qui réponde, au chef ; sans humains, comme avant.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { aiguiller, humainsDuProjet, roleDeLaQuestion } from "../../src/aiguillage-humains/aiguillage.ts";
import type { Captures } from "../../src/captures.ts";
import { entrerDansTodo, type Proposition } from "../../src/carte-todo.ts";
import type { Commentaire } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { mentionneurDuChef, type GitHubDeLaMention } from "../../src/mention-du-chef/mention-du-chef.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const CHEF = "benomite";
// La configuration du projet, telle que son lecteur la donnera : alice au produit, bob au design.
const CONFIG = { chef: CHEF, humans: [{ login: "alice", roles: ["product"] }, { login: "bob", roles: ["design"] }] };

const PRODUIT: Proposition = {
  type: "product",
  resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
  enonce: "One list per project, or one for all projects?",
  choix: [{ texte: "One list per project." }, { texte: "One list for all projects." }],
};
const DESIGN: Proposition = {
  type: "design",
  resume: "The empty rail now says what to do next.",
  enonce: "Is the empty rail screen right?",
  choix: [{ texte: "Yes, merge it.", suite: "merge" }, { texte: "No, the empty state says too little.", suite: "resume" }],
};
const CAPTURES: Captures = { sha: "c0ffee", screens: [{ screen: "rail-vide", before: "docs/captures/2/rail-vide-avant.png", after: "docs/captures/2/rail-vide-apres.png" }] };

test("le rôle d'une question : produit, design, relecture ; aucun pour les autres sortes", () => {
  assert.equal(roleDeLaQuestion("product"), "product");
  assert.equal(roleDeLaQuestion("product-question"), "product");
  assert.equal(roleDeLaQuestion("design"), "design");
  assert.equal(roleDeLaQuestion("merge"), "review");
  assert.equal(roleDeLaQuestion("merge-by-hand"), "review");
  for (const sorte of ["remontee", "abandon", "question", "blocked", ""]) assert.equal(roleDeLaQuestion(sorte), null);
});

test("un humain dont le rôle répond reçoit la carte", () => {
  const humains = humainsDuProjet({ humans: [...CONFIG.humans, { login: "carol", roles: ["review"] }] });
  assert.deepEqual(aiguiller(humains, "product"), { vers: "humain", login: "alice", role: "product" });
  assert.deepEqual(aiguiller(humains, "design"), { vers: "humain", login: "bob", role: "design" });
  assert.deepEqual(aiguiller(humains, "merge"), { vers: "humain", login: "carol", role: "review" });
});

test("aucun rôle qui réponde : la carte va au chef, assignée puisque le projet déclare des humains", () => {
  const humains = humainsDuProjet(CONFIG);
  assert.deepEqual(aiguiller(humains, "merge"), { vers: "chef", assigner: true });
  assert.deepEqual(aiguiller(humains, "remontee"), { vers: "chef", assigner: true });
  assert.deepEqual(aiguiller(humainsDuProjet({ humans: [{ login: "dan", roles: ["client-contact"] }] }), "product"), { vers: "chef", assigner: true });
});

test("plusieurs humains du rôle : le premier déclaré", () => {
  const humains = humainsDuProjet({ humans: [{ login: "erin", roles: ["client-contact", "product"] }, { login: "alice", roles: ["product", "design"] }, { login: "bob", roles: ["design"] }] });
  assert.deepEqual(aiguiller(humains, "product"), { vers: "humain", login: "erin", role: "product" });
  assert.deepEqual(aiguiller(humains, "design"), { vers: "humain", login: "alice", role: "design" });
});

test("sans humains déclarés, la carte va au chef et n'est assignée à personne", () => {
  for (const config of [undefined, null, {}, { chef: CHEF }, { humans: [] }, { humans: "alice" }]) {
    assert.deepEqual(humainsDuProjet(config), []);
    assert.deepEqual(aiguiller(humainsDuProjet(config), "product"), { vers: "chef", assigner: false });
  }
});

test("une entrée sans login ou sans rôle connu est écartée", () => {
  const humains = humainsDuProjet({ humans: [{ roles: ["product"] }, { login: "", roles: ["product"] }, { login: "x", roles: ["boss"] }, "alice", { login: "@frank", roles: ["product", "boss"] }] });
  assert.deepEqual(humains, [{ login: "frank", roles: ["product"] }]);
});

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  return journal;
}

// Les issues du dépôt : leurs commentaires et leurs assignés, et l'ordre des écritures.
function fauxGitHub() {
  const commentaires = new Map<number, Commentaire[]>();
  const assignes = new Map<number, string[]>();
  const ecritures: string[] = [];
  const github: GitHubDeLaMention = {
    commentaires: async (numero) => [...(commentaires.get(numero) ?? [])],
    async commenter(numero, corps) {
      ecritures.push(`commenter #${numero}`);
      commentaires.set(numero, [...(commentaires.get(numero) ?? []), { body: corps, author: "brigade-manager[bot]", association: "NONE", createdAt: "" }]);
    },
    async assigner(numero, logins) {
      ecritures.push(`assigner #${numero} ${logins.join(",")}`);
      assignes.set(numero, [...new Set([...(assignes.get(numero) ?? []), ...logins])]);
    },
  };
  const mention = (numero: number) => commentaires.get(numero)?.at(-1)?.body.split("\n")[1] ?? null;
  return { github, ecritures, assignes, mention };
}

test("avec alice au produit et bob au design, chaque carte est assignée sur GitHub à son humain et le mentionne", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  journal.ajouter({ project: PROJET, ticket: 13, author: "station:box/claude", type: "cook.reported", payload: { run: "cook-13", ending: "done", reason: null, summary: null, branch: "cook/13-x", pr: null, captures: CAPTURES } });
  entrerDansTodo(journal, PROJET, 13, DESIGN, "pass");
  const faux = fauxGitHub();
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => CHEF, projet: () => CONFIG, avertir: () => assert.fail("nothing to say") }).passer();
  assert.deepEqual(faux.assignes.get(12), ["alice"]);
  assert.equal(faux.mention(12), "@alice One list per project, or one for all projects?");
  assert.deepEqual(faux.assignes.get(13), ["bob"]);
  assert.equal(faux.mention(13), "@bob Is the empty rail screen right?");
  // L'assignation précède le commentaire, qui fait foi.
  assert.deepEqual(faux.ecritures, ["assigner #12 alice", "commenter #12", "assigner #13 bob", "commenter #13"]);
});

test("une carte dont la question ne répond à aucun rôle déclaré est assignée au chef, qu'elle mentionne", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const faux = fauxGitHub();
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => CHEF, projet: () => ({ humans: [{ login: "bob", roles: ["design"] }] }) }).passer();
  assert.deepEqual(faux.assignes.get(12), [CHEF]);
  assert.equal(faux.mention(12), `@${CHEF} One list per project, or one for all projects?`);
});

test("sans humains déclarés, rien ne change : le chef est mentionné, personne n'est assigné", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const faux = fauxGitHub();
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => CHEF, projet: () => ({ chef: CHEF }) }).passer();
  assert.deepEqual(faux.ecritures, ["commenter #12"]);
  assert.equal(faux.mention(12), `@${CHEF} One list per project, or one for all projects?`);
});

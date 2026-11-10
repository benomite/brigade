// La mention du chef sur GitHub (#2746) : chaque carte de TODO le mentionne
// une fois sur l'issue de son ticket, avec sa question sur une ligne ; le
// compte vient des réglages du projet ; rien d'autre ne le mentionne, et la
// même carte revue — au tour suivant, après un redémarrage — n'écrit rien.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { entrerDansTodo, sortirDeTodo, type Proposition } from "../src/carte-todo.ts";
import type { Commentaire } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { brancherMentionDuChef, cartesAMentionner, mentionneurDuChef, type GitHubDeLaMention } from "../src/mention-du-chef/mention-du-chef.ts";
import type { CauseReveil, Runtime } from "../src/runtime.ts";
import { aArreter, jusqua, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const PRODUIT: Proposition = {
  type: "product",
  raison: "product-choice",
  resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
  enonce: "One list per project, or one for all projects?",
  choix: [{ texte: "One list per project." }, { texte: "One list for all projects." }],
};

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  return journal;
}

// Les issues du dépôt, leurs commentaires, et chaque commentaire posté.
function fauxGitHub(depart: Record<number, Commentaire[]> = {}) {
  const issues = new Map<number, Commentaire[]>(Object.entries(depart).map(([numero, commentaires]) => [Number(numero), [...commentaires]]));
  const postes: Array<{ numero: number; corps: string }> = [];
  let lectures = 0;
  const github: GitHubDeLaMention = {
    async commentaires(numero) {
      lectures++;
      return [...(issues.get(numero) ?? [])];
    },
    async commenter(numero, corps) {
      postes.push({ numero, corps });
      issues.set(numero, [...(issues.get(numero) ?? []), { body: corps, author: "brigade-manager[bot]", association: "NONE", createdAt: "" }]);
    },
  };
  return { github, postes, lectures: () => lectures };
}

test("une carte de TODO mentionne le chef une fois, sur l'issue de son ticket, avec sa question sur une ligne", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const { github, postes } = fauxGitHub();
  const mentionneur = mentionneurDuChef(journal.base, { github, chef: () => "benomite", avertir: () => assert.fail("nothing to say") });
  await mentionneur.passer();
  assert.equal(postes.length, 1);
  const [poste] = postes;
  assert.equal(poste?.numero, 12);
  const lignes = poste?.corps.split("\n") ?? [];
  assert.match(lignes[0] ?? "", /^<!-- brigade:chef-mention card=[0-9a-f]{16} -->$/);
  assert.deepEqual(lignes.slice(1), ["@benomite One list per project, or one for all projects?"]);

  // Revue au tour suivant, la même carte n'écrit rien, et n'est pas relue.
  await mentionneur.passer();
  assert.equal(postes.length, 1);
});

test("la même carte, revue par un autre process — un redémarrage, une autre station —, trouve sa marque et n'écrit rien", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const faux = fauxGitHub();
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => "benomite" }).passer();
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => "benomite" }).passer();
  assert.equal(faux.postes.length, 1);
});

test("une marque posée par un inconnu ne fait pas foi : le chef est mentionné quand même", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const [carte] = cartesAMentionner(journal.base);
  const faux = fauxGitHub({ 12: [{ body: `<!-- brigade:chef-mention card=${carte?.cle} -->\nhello`, author: "passant", association: "NONE", createdAt: "" }] });
  await mentionneurDuChef(journal.base, { github: faux.github, chef: () => "benomite" }).passer();
  assert.equal(faux.postes.length, 1);
});

test("une autre carte sur le même ticket est une autre mention ; la carte sortie de TODO n'en appelle aucune", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const faux = fauxGitHub();
  const mentionneur = mentionneurDuChef(journal.base, { github: faux.github, chef: () => "benomite" });
  await mentionneur.passer();
  entrerDansTodo(journal, PROJET, 12, { ...PRODUIT, enonce: "Keep the list, or drop it?" }, "manager");
  await mentionneur.passer();
  assert.deepEqual(
    faux.postes.map(({ corps }) => corps.split("\n")[1]),
    ["@benomite One list per project, or one for all projects?", "@benomite Keep the list, or drop it?"],
  );
  sortirDeTodo(journal, PROJET, 12, "answered", "chef");
  const lues = faux.lectures();
  await mentionneur.passer();
  assert.equal(faux.postes.length, 2);
  assert.equal(faux.lectures(), lues, "nothing awaits the chef: GitHub is not read");
});

test("sans le compte du chef dans les réglages du projet, rien n'est mentionné, et la cuisine le dit une fois", async (t) => {
  const journal = cuisine(t);
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  const faux = fauxGitHub();
  const dits: string[] = [];
  let chef: string | null = null;
  const mentionneur = mentionneurDuChef(journal.base, { github: faux.github, chef: () => chef, avertir: (ligne) => dits.push(ligne) });
  await mentionneur.passer();
  await mentionneur.passer();
  assert.equal(faux.postes.length, 0);
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /`chef`.*projet\.json/);
  // Le compte posé dans les réglages, relus à chaque passe : la carte est mentionnée.
  chef = "benomite";
  await mentionneur.passer();
  assert.equal(faux.postes[0]?.corps.split("\n")[1], "@benomite One list per project, or one for all projects?");
});

test("branchée au runtime, la mention passe au tick, jamais à une écriture du journal", async (t) => {
  const journal = cuisine(t);
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: PROJET, journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const faux = fauxGitHub();
  brancherMentionDuChef(runtime, { github: faux.github, chef: () => "benomite" });
  entrerDansTodo(journal, PROJET, 12, PRODUIT, "manager");
  for (const ecouter of ecouteurs) ecouter("log");
  await Promise.resolve();
  assert.equal(faux.lectures(), 0);
  for (const ecouter of ecouteurs) ecouter("tick");
  await jusqua(() => faux.postes.length === 1);
});

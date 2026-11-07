// La guérison d'une épique finie : fermée quand tous ses sous-tickets listés le sont.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fermerEpiqueFinie, numerosNommes, type GitHubDeLEpique } from "../../src/guerison/epique-finie.ts";

type Fiche = { state: "open" | "closed"; body?: string; commentaires?: string[] };

function fauxGitHub(fiches: Record<number, Fiche>) {
  const commentaires: Array<{ numero: number; corps: string }> = [];
  const fermees: number[] = [];
  const github: GitHubDeLEpique = {
    issue: async (numero) => {
      const fiche = fiches[numero];
      return fiche ? { number: numero, title: `T${numero}`, labels: [], state: fiche.state, createdAt: "", updatedAt: "", url: "", body: fiche.body } : null;
    },
    commentaires: async (numero) => (fiches[numero]?.commentaires ?? []).map((body) => ({ body, author: "benomite", association: "OWNER", createdAt: "" })),
    commenter: async (numero, corps) => { commentaires.push({ numero, corps }); },
    fermerIssue: async (numero) => { fermees.push(numero); fiches[numero]!.state = "closed"; },
  };
  return { github, commentaires, fermees };
}

test("une épique dont tous les sous-tickets listés sont fermés est fermée, avec un commentaire qui les nomme", async () => {
  const { github, commentaires, fermees } = fauxGitHub({
    1: { state: "open", body: "- #2\n- #3", commentaires: ["Aussi #4."] },
    2: { state: "closed" }, 3: { state: "closed" }, 4: { state: "closed" },
  });
  assert.deepEqual(await fermerEpiqueFinie(github, 1), { fermee: true, sousTickets: [2, 3, 4] });
  assert.deepEqual(fermees, [1]);
  assert.equal(commentaires.length, 1);
  assert.equal(commentaires[0]!.numero, 1);
  for (const n of ["#2", "#3", "#4"]) assert.ok(commentaires[0]!.corps.includes(n));
});

test("une épique avec un sous-ticket listé encore ouvert reste ouverte", async () => {
  const { github, commentaires, fermees } = fauxGitHub({ 1: { state: "open", body: "#2 #3" }, 2: { state: "closed" }, 3: { state: "open" } });
  assert.deepEqual(await fermerEpiqueFinie(github, 1), { fermee: false, raison: "sous-ticket-ouvert" });
  assert.deepEqual(fermees, []);
  assert.deepEqual(commentaires, []);
});

test("une épique qui ne liste aucun sous-ticket reste ouverte, son propre numéro ne comptant pas", async () => {
  const { github, fermees } = fauxGitHub({ 1: { state: "open", body: "Voir #1, rien d'autre.", commentaires: ["Pas de numéro ici."] } });
  assert.deepEqual(await fermerEpiqueFinie(github, 1), { fermee: false, raison: "sans-sous-ticket" });
  assert.deepEqual(fermees, []);
});

test("une épique déjà fermée n'est pas touchée", async () => {
  const { github, commentaires, fermees } = fauxGitHub({ 1: { state: "closed", body: "#2" }, 2: { state: "closed" } });
  assert.deepEqual(await fermerEpiqueFinie(github, 1), { fermee: false, raison: "deja-fermee" });
  assert.deepEqual(fermees, []);
  assert.deepEqual(commentaires, []);
});

test("un sous-ticket introuvable n'est pas fermé", async () => {
  const { github, fermees } = fauxGitHub({ 1: { state: "open", body: "#2" } });
  assert.deepEqual(await fermerEpiqueFinie(github, 1), { fermee: false, raison: "sous-ticket-ouvert" });
  assert.deepEqual(fermees, []);
});

test("les numéros nommés : sans doublon, sans ancre ni mot collé", () => {
  assert.deepEqual(numerosNommes("#5, #7 et #5 ; a#8 ; http://x/y#9 ; #0"), [5, 7]);
});

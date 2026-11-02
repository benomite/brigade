// L'état d'un ticket lu sur GitHub seul : ses labels, sa PR, et le statut de la
// base. Deux stations qui lisent les mêmes données disent le même état ; ce
// qui ne correspond à aucun état n'en a pas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { etatDeLaBase, etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING, type IssueLue } from "../../src/github-etat/etats.ts";

const PR_OUVERTE = { state: "open", merged: false } as const;
const ouverte = (labels: string[], pr: IssueLue["pr"] = null): IssueLue => ({ state: "open", labels: ["fire", ...labels], pr });

test("taken : le label `taken`, sans PR", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_TAKEN])), "taken");
});

test("taken : le label `taken` et une PR ouverte que la station n'a pas encore dite en pass", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_TAKEN], PR_OUVERTE), "green"), "taken");
});

test("in pass : le label `in-pass` et sa PR ouverte, la base verte, en cours ou inconnue", () => {
  for (const base of ["green", "pending", null] as const) assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS], PR_OUVERTE), base), "pass", String(base));
});

test("WAITING : le label `waiting`, et il l'emporte sur `taken` comme sur `in-pass`", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_WAITING])), "waiting");
  assert.equal(etatDuTicket(ouverte([LABEL_TAKEN, LABEL_WAITING])), "waiting");
  assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS, LABEL_WAITING], PR_OUVERTE), "red"), "waiting");
});

test("base red : en pass, et le dernier commit de la base est rouge", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS], PR_OUVERTE), "red"), "base-red");
});

test("base red ne touche que ce qui est en pass : un ticket pris reste pris", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_TAKEN]), "red"), "taken");
});

test("le statut de la base se lit sur les checks de son dernier commit", () => {
  assert.equal(etatDeLaBase([{ outcome: "green" }, { outcome: "red" }, { outcome: "pending" }]), "red");
  assert.equal(etatDeLaBase([{ outcome: "green" }, { outcome: "pending" }]), "pending");
  assert.equal(etatDeLaBase([{ outcome: "green" }, { outcome: "green" }]), "green");
  assert.equal(etatDeLaBase([]), null);
});

// Ce qu'une station lit de GitHub pour un ticket : la même réponse, quelle que
// soit la station qui la demande.
type DonneesGitHub = { issue: { state: "open" | "closed"; labels: string[] }; pr: IssueLue["pr"]; checksDeLaBase: { outcome: "green" | "red" | "pending" }[] };

function station(github: { lire(): DonneesGitHub }) {
  return () => {
    // Chaque station a sa copie : rien de ce que l'une lit n'est partagé avec l'autre.
    const { issue, pr, checksDeLaBase } = structuredClone(github.lire());
    return etatDuTicket({ ...issue, pr }, etatDeLaBase(checksDeLaBase));
  };
}

test("deux stations qui lisent les mêmes données de GitHub disent le même état, quel que soit l'ordre des labels et des checks", () => {
  const cas: [DonneesGitHub, string | null][] = [
    [{ issue: { state: "open", labels: ["fire", LABEL_TAKEN] }, pr: null, checksDeLaBase: [{ outcome: "green" }] }, "taken"],
    [{ issue: { state: "open", labels: ["fire", LABEL_IN_PASS] }, pr: PR_OUVERTE, checksDeLaBase: [{ outcome: "green" }] }, "pass"],
    [{ issue: { state: "open", labels: ["fire", LABEL_WAITING] }, pr: null, checksDeLaBase: [] }, "waiting"],
    [{ issue: { state: "open", labels: ["fire", LABEL_IN_PASS] }, pr: PR_OUVERTE, checksDeLaBase: [{ outcome: "green" }, { outcome: "red" }] }, "base-red"],
  ];
  for (const [donnees, attendu] of cas) {
    const a = station({ lire: () => donnees });
    const b = station({ lire: () => ({ ...donnees, issue: { ...donnees.issue, labels: donnees.issue.labels.toReversed() }, checksDeLaBase: donnees.checksDeLaBase.toReversed() }) });
    assert.equal(a(), attendu);
    assert.equal(b(), a());
  }
});

test("sans label d'état ni PR, aucun état : rien n'est deviné", () => {
  assert.equal(etatDuTicket(ouverte([])), null);
  assert.equal(etatDuTicket({ state: "open", labels: [], pr: null }, "red"), null);
  assert.equal(etatDuTicket(ouverte(["prio:1", "model:opus"])), null);
});

test("une PR ouverte sans label d'état ne dit pas à elle seule que le ticket est en pass", () => {
  assert.equal(etatDuTicket(ouverte([], PR_OUVERTE), "red"), null);
});

test("`in-pass` sans PR ouverte à juger n'a pas d'état : ni pass, ni un autre deviné", () => {
  assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS])), null);
  assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS, LABEL_TAKEN], { state: "closed", merged: false })), null);
  assert.equal(etatDuTicket(ouverte([LABEL_IN_PASS], { state: "closed", merged: true })), null);
});

test("une issue fermée n'a aucun des quatre états, quels que soient ses labels", () => {
  assert.equal(etatDuTicket({ state: "closed", labels: [LABEL_TAKEN, LABEL_IN_PASS, LABEL_WAITING], pr: PR_OUVERTE }, "red"), null);
});

test("etats.ts n'importe rien de la boîte aux lettres, du relais ni du journal : que des types du client GitHub", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/github-etat/etats.ts"), "utf8");
  const imports = [...source.matchAll(/^import\b.*?from "([^"]+)";$/gms)].map(([ligne, module]) => ({ type: /^import type\b/.test(ligne), module }));
  assert.deepEqual(imports, [
    { type: true, module: "../events/pass.ts" },
    { type: true, module: "../github.ts" },
  ]);
});

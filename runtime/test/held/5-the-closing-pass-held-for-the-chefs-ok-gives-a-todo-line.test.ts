// #4271, critère 5 : la passe de clôture du closer, tenue pour l'OK du chef, donne une ligne TODO de la même façon.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { brancherCloserGithub, MERGES_PER_PASS, type GitHubDuCloser } from "../../src/closer-github-passe/closer-github-passe.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const MAINTENANT = new Date("2026-11-25T03:00:00.000Z");
const HEURE_MS = 3_600_000;

test("a closing pass held for the chef's OK shows as an awaiting line with its summary, its reason and its approve command", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: () => MAINTENANT, avertir: () => {} });
  const creerIssue = { appels: 0 };
  const github: GitHubDuCloser = {
    issuesDepuis: async () => [],
    creerIssue: async () => (creerIssue.appels++, 501),
    ecrireCorps: async () => {},
    fermerIssue: async () => {},
  };
  const lus = Array.from({ length: MERGES_PER_PASS }, (_, i) => ({ at: new Date(MAINTENANT.getTime() - (i + 1) * HEURE_MS).toISOString(), ticket: 100 + i }));
  const clone = {
    merges: async () => lus,
    observer: async () => ({ sha: "0123456789abcdef", merges: lus.map(({ at }, i) => ({ sha: `m${i}`, at, ajoute: 30, retire: 10 })), textes: [{ chemin: "src/a.ts", texte: "export function inutile() {\n  return 1;\n}\n" }] }),
  };
  const avertissements: string[] = [];
  let resoudre: (texte: string) => void = () => {};
  const tenue = new Promise<string>((ok) => (resoudre = ok));
  const avertir = (texte: string) => {
    avertissements.push(texte);
    if (/closing pass held/.test(texte)) resoudre(texte);
  };
  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const runtime = { projet: PROJET, journal: {}, surReveil: (ecouter: (cause: CauseReveil) => void) => (ecouteurs.add(ecouter), () => void ecouteurs.delete(ecouter)), arreter: () => {} } as unknown as Runtime;
  const branche = brancherCloserGithub(runtime, { porte, reglages: () => ({ calibration: { model: "sonnet", effort: "low" }, removedLines: 20 }), github, clone, base: "main", ecartMs: 0, maintenant: () => MAINTENANT, avertir });
  t.after(() => branche.arreter("test"));
  ecouteurs.forEach((ecouter) => ecouter("tick"));
  await tenue;
  assert.equal(creerIssue.appels, 0);

  const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
  await commande.fin;
  const lignes = commande.sortie().split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
  const fin = lignes.findIndex((ligne) => ligne === "end awaiting");
  assert.ok(debut !== -1 && fin > debut, lignes.join("\n"));
  const bloc = lignes.slice(debut, fin + 1).join("\n");
  assert.match(bloc, /closing pass/);
  assert.match(bloc, /20 merges since the last one, 1 candidate/);
  assert.match(bloc, /manager approve 1/);
});

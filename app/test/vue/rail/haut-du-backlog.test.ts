// Le rail, haut du backlog, sur la page du projet (#4223), joué dans la vue telle qu'elle est (aides/fausse-vue.ts) sur ce
// que l'app lit de GitHub (tableau/lecture.ts → faits.ts → vue.js) : sous le bandeau Backlog, au-dessus des colonnes, le
// bloc montre les issues des faits, dans leur ordre, et n'offre aucun geste ; une lecture qui ne le porte pas ne le pose pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { gestesDeCarte } from "../../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { AppelGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const DEPOT = "chef/parade";
const A = "2026-10-15T09:12:04.000Z";
const PRET = ["fire", "model:opus", "effort:medium"];
const ouverte = (number: number, labels: string[], created_at: string) => ({ number, title: `Ticket ${number}`, labels: labels.map((name) => ({ name })), created_at, html_url: `https://github.com/${DEPOT}/issues/${number}`, body: "" });
// #1 sans priorité, #2 en prio:1, #3 en prio:1 plus ancien ; #4 une idée, #5 pas calibré.
const ISSUES = [
  ouverte(1, PRET, "2026-09-01T00:00:00Z"),
  ouverte(2, [...PRET, "prio:1"], "2026-10-02T00:00:00Z"),
  ouverte(3, [...PRET, "prio:1"], "2026-10-01T00:00:00Z"),
  ouverte(4, [...PRET, "idea"], "2026-08-01T00:00:00Z"),
  ouverte(5, ["fire"], "2026-08-01T00:00:00Z"),
];
const github: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: ISSUES };
  if (chemin.includes("/issues?")) return { status: 200, data: [] };
  if (chemin.includes("/pulls?")) return { status: 200, data: [] };
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return { status: 200, data: [] };
  return { status: 404, data: {} };
};

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
function recevoirFaits(vue: Jouee, faits: unknown): void {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const enfants = (vue: Jouee): Faux[] => vue.element("rail").children;
const bloc = (vue: Jouee): Faux | undefined => enfants(vue).find(({ className }) => className === "rail-du-backlog");

test("the project page shows the rail as the top of the backlog: the issues of the read, in its order, above the columns, with no gesture (#4223)", async () => {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github, maintenant: () => new Date(A) });
  const haut = (lu.faits as { hautDuBacklog?: { issues: { number: number }[]; html: string } }).hautDuBacklog ?? assert.fail("pas de haut du backlog");
  assert.deepEqual(haut.issues.map(({ number }) => number), [3, 2, 1]);
  const vue = await ouvrir();
  recevoirFaits(vue, lu.faits);
  const pose = bloc(vue) ?? assert.fail("pas de rail du backlog sur la page");
  // Sous le bandeau, au-dessus des colonnes.
  const ordre = enfants(vue).map(({ className }) => className);
  assert.ok(ordre.indexOf("rail-du-backlog") < ordre.indexOf("colonnes"), JSON.stringify(ordre));
  const [titre, liste] = pose.children;
  assert.equal(titre?.textContent, "On the rail — the top of the backlog (3)");
  // L'écran que la lecture a composé, tel quel : les mêmes issues, dans le même ordre.
  const html = (liste as unknown as { innerHTML: string }).innerHTML;
  assert.equal(html, haut.html);
  assert.deepEqual([...html.matchAll(/#(\d+)<\/span>/g)].map((m) => Number(m[1])), [3, 2, 1]);
  // Rien à y faire : ni bouton, ni lien, ni champ.
  assert.deepEqual(pose.dessous("button"), []);
  assert.doesNotMatch(html, /<button|<a |<input|<form/i);
});

test("a read that no longer carries the top of the backlog, or carries it malformed, takes the rail block away (#4223)", async () => {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github, maintenant: () => new Date(A) });
  const { hautDuBacklog: _, ...sans } = lu.faits as Faits & { hautDuBacklog?: unknown };
  const vue = await ouvrir();
  recevoirFaits(vue, lu.faits);
  assert.ok(bloc(vue));
  recevoirFaits(vue, sans);
  assert.equal(bloc(vue), undefined);
  recevoirFaits(vue, { ...sans, hautDuBacklog: { issues: [{ number: "3" }], html: "<ol></ol>" } });
  assert.equal(bloc(vue), undefined);
});

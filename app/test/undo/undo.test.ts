// « undo » sur la carte d'un ticket servi (ticket 3274, épique 3267). On vérifie :
//   - la vue : le bouton est sur la carte d'un ticket servi dont la PR est mergée, et sur nulle autre — ni un ticket servi
//     sans PR, ni une carte du rail, de Taken, de Pass ; le clic part par le pont, le bouton dit qu'il est en route ; fait,
//     la carte dit en une ligne ce qui s'est passé — le revert en pass, ou le conflit et le ticket déposé pour la cuisine — ;
//     refusé, le bouton revient et la carte dit pourquoi ;
//   - le process principal : la commande `undo` du runtime, jouée telle qu'elle est (runtime/src/undo/commande.ts) sur un
//     faux GitHub — le revert propre ouvre sa PR, le revert en conflit n'en laisse aucune —, et un ticket que la dernière
//     lecture ne porte pas servi ne part pas.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Sortie } from "../../../runtime/src/appel.ts";
import type { IssueOuverte } from "../../../runtime/src/github.ts";
import { principal } from "../../../runtime/src/undo/commande.ts";
import type { GitHubDeLAnnulation } from "../../../runtime/src/undo/undo.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { jouerLAnnulation, PAS_SERVI } from "../../src/vue/undo/undo-github.ts";
import { ANNULER, EN_ANNULATION, PRIX } from "../../src/vue/undo/undo.js";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const DEPOT = "chef/parade";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const issue = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;

const CONFLIT = "#9 cannot be undone in one click: later work builds on it — ticket #44 asks the kitchen to undo it by hand";
const PROPRE = "#9 undone: PR #45 goes through the pass as ticket #44, and #9 is reopened";

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// « parade » : un ticket dans chaque colonne qui bouge, #9 servi par sa PR mergée, #7 servi sans PR.
const faits = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: "2026-11-13T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 2 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null, attente: null },
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: issue(14), activite: null, attente: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: issue(30), activite: null, attente: null },
  ],
  cooks: [],
  attend: [],
  livres: [
    { ticket: 9, titre: "Le relevé des mesures", url: issue(9), livre: "2026-11-13T10:03:58.000Z", station: "box/claude", pr: `https://github.com/${DEPOT}/pull/19`, relecture: null },
    { ticket: 7, titre: "Les accès sous plafond", url: issue(7), livre: "2026-11-13T07:12:40.000Z", station: "box/claude", pr: null, relecture: null },
  ],
  urgence: null,
} as unknown as Faits;
const dessinable = (): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...reponses } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(), demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

const carte = (vue: Jouee, ticket: number) => carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const boutons = (ou: Faux, libelle: string) => ou.dessous("button").filter(({ textContent }) => textContent === libelle);
const annuler = (ou: Faux) => boutons(ou, ANNULER)[0] ?? assert.fail("pas de bouton « undo »");

describe("le bouton « undo » sur la carte", () => {
  test("seule la carte d'un ticket servi, sa PR mergée, le porte — son prix au survol ; aucune autre carte", async () => {
    const vue = await ouvrir();
    const servi = annuler(carte(vue, 9));
    assert.ok(servi.className.includes("annuler-servi"));
    assert.ok(carte(vue, 9).dessous("button").some(({ className, ariaLabel }) => className === "aide" && String(ariaLabel).includes(PRIX(9))), "le prix est au survol");
    for (const ticket of [7, 21, 14, 30]) assert.deepEqual(boutons(carte(vue, ticket), ANNULER), [], `#${ticket} n'est pas servi par une PR mergée`);
  });

  test("le clic part par le pont ; en route, le bouton le dit et ne se clique plus", async () => {
    let rendre: (rendu: unknown) => void = () => {};
    const vue = await ouvrir({ annulerServi: () => new Promise((fini) => (rendre = fini)) as never });
    annuler(carte(vue, 9)).click();
    await repos();
    assert.deepEqual(vue.dernier("annulerServi"), ["parade", 9]);
    const enRoute = boutons(carte(vue, 9), EN_ANNULATION)[0] ?? assert.fail("le bouton ne dit pas qu'il est en route");
    assert.equal(enRoute.disabled, true);
    enRoute.click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "annulerServi").length, 1, "un seul geste part");
    rendre({ fait: PROPRE });
    await repos();
  });

  test("le revert propre : la carte dit en une ligne que la PR passe la pass et que le ticket est rouvert, et les faits sont relus", async () => {
    const vue = await ouvrir({ annulerServi: () => ({ fait: PROPRE }) });
    const avant = vue.appels.filter(({ geste }) => geste === "relireBox" || geste === "faits").length;
    annuler(carte(vue, 9)).click();
    await repos();
    assert.ok(carte(vue, 9).dessous("p").some(({ textContent }) => textContent === PROPRE));
    assert.deepEqual(boutons(carte(vue, 9), ANNULER), [], "fait, le bouton s'en va");
    assert.ok(vue.appels.filter(({ geste }) => geste === "relireBox" || geste === "faits").length > avant, "les faits sont relus");
  });

  test("le revert en conflit : la carte reste dans Served et le dit en une ligne, sans bouton", async () => {
    const vue = await ouvrir({ annulerServi: () => ({ fait: CONFLIT }) });
    annuler(carte(vue, 9)).click();
    await repos();
    const ligne = carte(vue, 9).dessous("p").find(({ textContent }) => textContent === CONFLIT) ?? assert.fail("pas de ligne du conflit");
    assert.equal(ligne.className, "annule");
    assert.equal(CONFLIT.includes("\n"), false);
    assert.deepEqual(boutons(carte(vue, 9), ANNULER), []);
    // Relue, la carte toujours servie garde sa ligne.
    const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
    vue.dire("surFaits", { ...dessinable(), demande: demandes.at(-1)?.args[0] as number });
    await repos();
    assert.ok(carte(vue, 9).dessous("p").some(({ textContent }) => textContent === CONFLIT));
  });

  test("refusé, le bouton revient et la carte dit pourquoi en une ligne", async () => {
    const vue = await ouvrir({ annulerServi: () => ({ refus: "nothing was done: #9 is not served: it is open", detail: "brigade : #9 is not served: it is open" }) });
    annuler(carte(vue, 9)).click();
    await repos();
    assert.equal(annuler(carte(vue, 9)).disabled, false);
    assert.ok(carte(vue, 9).dessous("span").some(({ textContent }) => textContent === "nothing was done: #9 is not served: it is open"));
  });
});

// ── Le process principal : la commande `undo` du runtime, telle qu'elle est ──

// Le dépôt de « parade » : #9 servi par la PR #19, son merge fils de la base d'avant. `conflit` : le revert ne se fusionne
// pas sur la base.
function depot({ conflit }: { conflit: boolean }) {
  const issues = new Map<number, { titre: string; corps: string; labels: string[]; state: "open" | "closed" }>([[9, { titre: "Le relevé des mesures", corps: "", labels: ["fire"], state: "closed" }]]);
  const prs: Array<{ numero: number; branche: string; corps: string }> = [];
  const commentaires: Array<{ numero: number; corps: string }> = [];
  const branches = new Set<string>();
  let suivant = 44;
  const github: GitHubDeLAnnulation & { fermer(): void } = {
    issue: async (numero) => {
      const lue = issues.get(numero);
      return lue === undefined ? null : { number: numero, title: lue.titre, labels: lue.labels, state: lue.state, createdAt: "", updatedAt: "", url: "", body: lue.corps };
    },
    ouvertes: async () => ({ inchange: false, issues: [...issues].filter(([, lue]) => lue.state === "open").map(([number, lue]): IssueOuverte => ({ number, title: lue.titre, labels: lue.labels, state: "open", createdAt: "", updatedAt: "", url: "", body: lue.corps, association: "OWNER" })), confirmer: () => {} }),
    prQuiFerme: async (numero) => (numero === 9 ? { number: 19, url: "", base: "main", sha: "tete", state: "closed", merged: true, enRetard: false, mergeePar: "box", commitDeMerge: "merge" } : null),
    commenter: async (numero, corps) => void commentaires.push({ numero, corps }),
    labelliser: async (numero, labels) => void (issues.get(numero) ?? assert.fail()).labels.push(...labels),
    delabelliser: async (numero, label) => {
      const lue = issues.get(numero) ?? assert.fail();
      lue.labels = lue.labels.filter((l) => l !== label);
    },
    creerIssue: async ({ titre, corps, labels }) => {
      const numero = suivant++;
      issues.set(numero, { titre, corps, labels: [...labels], state: "open" });
      return numero;
    },
    ouvrirPR: async ({ branche, corps }) => {
      const numero = suivant++;
      prs.push({ numero, branche, corps });
      return `https://github.com/${DEPOT}/pull/${numero}`;
    },
    fermerIssue: async (numero) => void ((issues.get(numero) ?? assert.fail()).state = "closed"),
    teteDeLaBase: async () => "base",
    rouvrirIssue: async (numero) => void ((issues.get(numero) ?? assert.fail()).state = "open"),
    commitGit: async (sha) => (sha === "merge" ? { arbre: "arbre-du-merge", parents: ["avant", "tete"] } : sha === "avant" ? { arbre: "arbre-d-avant", parents: [] } : null),
    creerCommit: async () => "revert",
    creerBranche: async (branche) => void branches.add(branche),
    fusionnerDansLaBranche: async () => (conflit ? { conflit: true } : { sha: "fusion" }),
    supprimerBranche: async (branche) => void branches.delete(branche),
    droits: async () => ({ login: "chef" }),
    fermer: () => {},
  };
  return { github, issues, prs, commentaires, branches };
}

const commande = (github: GitHubDeLAnnulation & { fermer(): void }) => async () => ({
  principal: (appel: Parameters<typeof principal>[0]) => principal(appel, () => github),
  estUneSortie: (erreur: unknown): erreur is Sortie => erreur instanceof Sortie,
});

describe("le process principal joue la commande `undo` du runtime", () => {
  test("le revert propre : sa PR est ouverte sur la branche du ticket qui le porte, en pass, et #9 est rouvert par le chef", async () => {
    const lu = depot({ conflit: false });
    const rendu = await jouerLAnnulation({ depot: DEPOT, ticket: 9, servi: true, commande: commande(lu.github), env: {} });
    assert.deepEqual(rendu, { fait: PROPRE });
    assert.deepEqual(lu.prs, [{ numero: 45, branche: "cook/44-github", corps: "Closes #44\n\nReverts the merge of #9 (PR #19), asked by @chef from its card." }]);
    assert.ok(lu.issues.get(44)?.labels.includes("in-pass"));
    assert.equal(lu.issues.get(9)?.state, "open");
    assert.match(lu.commentaires.find(({ numero }) => numero === 9)?.corps ?? "", /^Undone by @chef from its card/);
  });

  test("le revert en conflit : aucune PR, un ticket pour la cuisine qui nomme #9, et la ligne le dit", async () => {
    const lu = depot({ conflit: true });
    const rendu = await jouerLAnnulation({ depot: DEPOT, ticket: 9, servi: true, commande: commande(lu.github), env: {} });
    assert.deepEqual(rendu, { fait: CONFLIT });
    assert.deepEqual(lu.prs, []);
    assert.deepEqual([...lu.branches], []);
    assert.match(lu.issues.get(44)?.corps ?? "", /^<!-- brigade:undo ticket=9 pr=19 -->\nUndo #9 by hand/);
    assert.equal(lu.issues.get(9)?.state, "closed");
  });

  test("un ticket que la dernière lecture ne porte pas servi ne part pas : la commande n'est même pas chargée", async () => {
    let chargee = false;
    const rendu = await jouerLAnnulation({ depot: DEPOT, ticket: 9, servi: false, commande: async () => ((chargee = true), assert.fail("chargée")), env: {} });
    assert.deepEqual(rendu, { refus: PAS_SERVI, detail: "" });
    assert.equal(chargee, false);
    assert.deepEqual(await jouerLAnnulation({ depot: DEPOT, ticket: "9", servi: true, commande: async () => assert.fail("chargée"), env: {} }), { refus: PAS_SERVI, detail: "" });
  });

  test("un refus du runtime dit pourquoi, sans le préfixe de la commande", async () => {
    const lu = depot({ conflit: false });
    (lu.issues.get(9) ?? assert.fail()).state = "open";
    const rendu = await jouerLAnnulation({ depot: DEPOT, ticket: 9, servi: true, commande: commande(lu.github), env: {} });
    assert.deepEqual(rendu, { refus: "nothing was done: #9 is not served: it is open", detail: "brigade : #9 is not served: it is open" });
  });
});

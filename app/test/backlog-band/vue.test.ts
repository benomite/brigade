// Le bandeau Backlog dans la vue de l'app (#3460), jouée telle qu'elle est (aides/fausse-vue.ts), sur ce que l'app lit de
// GitHub (tableau/lecture.ts, tableau/rail.ts, amont.ts) : au-dessus des colonnes du rail, une ligne d'étiquettes ; un clic
// sur une étiquette choisit le besoin — son détail, ses tickets qui ressortent dans le rail —, un second ou un autre finit
// ce choix ; un clic sur le titre déplie tout le backlog, un second le replie. Ni la colonne Backlog ni le chiffre de la
// bande du rail ne sont plus là, et chaque compte qu'ils donnaient se lit dans le bandeau. Ce que dit un rail vide, et une
// lecture ratée, viennent avec lui (repris de test/amont.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { COMMANDE, tenirAmont, voir } from "../../src/amont.ts";
import type { Lecture } from "../../src/box.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { lectureDuTableau } from "../../src/tableau/rail.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const DEPOT = "chef/parade";
const A = "2026-10-15T09:12:04.000Z";
const url = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;

type Ouverte = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; body: string };
const ouverte = (number: number, labels: string[] = [], title = `Ticket ${number}`, body = ""): Ouverte => ({ number, title, labels: labels.map((name) => ({ name })), created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`, html_url: url(number), body });
const LISTE = (tickets: number[]) => ["<!-- brigade:tickets -->", ...tickets.map((t) => `| #${t} | t |`), "<!-- /brigade:tickets -->"].join("\n");

// Le dépôt de référence de test/amont.test.ts — huit issues avant le rail, dans quatre états —, plus #16, une épique
// découpée en #10 (au feu, sur le rail) et #30 (fermé, servi), et #17 qui t'attend (sa carte est dans Awaiting you).
const ISSUES = [
  ouverte(10, ["fire", "model:haiku", "effort:low"], "Sur le rail", "Epic: #16"),
  ouverte(11, ["model:opus", "effort:high", "prio:2"], "Prêt sans feu"),
  ouverte(12, ["blocked-on-human"]),
  ouverte(13, ["served-elsewhere"]),
  ouverte(14, ["model:opus"]),
  ouverte(16, ["epic", "prio:1"], "Une épique", `## Context\n\nGroups book in one gesture.\n\n${LISTE([10, 30])}`),
  ouverte(17, ["epic"], "Une question"),
  ouverte(20, [], "Pas encore lue"),
  ouverte(21),
  ouverte(22, ["fire", "model:opus", "effort:high"]),
];
const github = (issues: Ouverte[]): AppelGitHub => async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: issues.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
  if (chemin.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (chemin.includes("/issues?")) return { status: 200, data: issues };
  if (chemin.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};
async function amontDe(issues: Ouverte[]): Promise<Lecture> {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github(issues), maintenant: () => new Date(A) });
  return lectureDuTableau(lu, PARADE, 3, [COMMANDE]);
}
const lecture = (texte: string): Lecture => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMANDE, texte }] });

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

// Le rail : #10 et #22 en attente ; #17, l'épique qui attend le chef, nommée par la file.
const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 10, etat: "en attente", titre: "Sur le rail", url: url(10), activite: null },
    { ticket: 22, etat: "en attente", titre: "Ticket 22", url: url(22), activite: null },
  ],
  cooks: [],
  attend: [{ ticket: 17, titre: "Une question", url: url(17) }],
};
const RAIL_VIDE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, rail: 0, attend: 0 }, rail: [], attend: [] };
function recevoirFaits(vue: Jouee, faits: Faits): void {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}

const enfants = (vue: Jouee): Faux[] => vue.element("rail").children;
const bandeau = (vue: Jouee): Faux | undefined => enfants(vue).find(({ className }) => className === "backlog-band");
const leBandeau = (vue: Jouee): Faux => bandeau(vue) ?? assert.fail("pas de bandeau Backlog");
const grille = (vue: Jouee): Faux => enfants(vue).find(({ className }) => className === "colonnes") ?? assert.fail("pas de colonnes");
const titre = (vue: Jouee): Faux => leBandeau(vue).dessous("button").find(({ className }) => className === "backlog-band-titre") ?? assert.fail("pas de titre");
const tag = (vue: Jouee, ticket: number): Faux => leBandeau(vue).dessous("button").find(({ className, dataset }) => className === "backlog-tag" && dataset.ticket === String(ticket)) ?? assert.fail(`pas d'étiquette #${ticket}`);
const detail = (vue: Jouee): Faux | undefined => leBandeau(vue).dessous("section").find(({ className }) => className === "backlog-band-detail");
const bonsDuRail = (vue: Jouee): Faux[] => grille(vue).dessous("li").filter(({ dataset }) => dataset.ticket !== undefined);
const colonne = (vue: Jouee, nom: string): Faux => grille(vue).children.find((pose) => pose.dessous("h4")[0]?.children[0]?.textContent === nom) ?? assert.fail(`pas de colonne ${nom}`);
// Les comptes de chaque état, en mots, au survol du titre — ceux que le chiffre de la bande disait.
const SURVOL = "8 issues before the rail — 3 not read yet · 1 epic, not split yet · 1 ready, not fired · 2 set aside · 1 split into tickets";

describe("le bandeau Backlog, au-dessus des colonnes du rail", () => {
  test("une seule ligne entre la bande du rail et les colonnes ; ni chiffre Backlog dans la bande, ni colonne Backlog — chaque compte se lit au survol de son titre", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    // Avant la première lecture : pas de bandeau.
    assert.equal(bandeau(vue), undefined);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));

    const poses = enfants(vue).map(({ className }) => className);
    assert.equal(poses.indexOf("backlog-band"), poses.indexOf("colonnes") - 1, poses.join(", "));
    assert.ok(poses.indexOf("bande-rail") < poses.indexOf("backlog-band"));
    assert.doesNotMatch(enfants(vue).find(({ className }) => className === "bande-rail")?.textContent ?? "", /Backlog/);
    assert.equal(grille(vue).children.some(({ className }) => className.includes("backlog")), false);
    assert.deepEqual(grille(vue).children.map((pose) => pose.dessous("h4")[0]?.children[0]?.textContent), ["On the rail", "Taken", "Pass", "Waiting", "Served"]);

    // Replié : sa ligne seule — ni détail, ni liste.
    assert.equal("deplie" in leBandeau(vue).dataset, false);
    assert.equal(titre(vue).textContent, "Backlog" + "8" + "1 awaits you");
    assert.equal(titre(vue).title, `${SURVOL} — unfold the whole backlog`);
    // Une étiquette par besoin : #17 qui t'attend d'abord ; #10 et #30, tickets de #16, n'en sont pas.
    const tags = leBandeau(vue).dessous("button").filter(({ className }) => className === "backlog-tag");
    assert.deepEqual(tags.map(({ dataset }) => Number(dataset.ticket)), [17, 16, 11, 12, 13, 14, 20, 21]);
    assert.deepEqual(tag(vue, 16).children.map(({ textContent }) => textContent), ["prio:1", "Une épique", "1/2"]);
    assert.deepEqual(tag(vue, 17).children.map(({ textContent }) => textContent), ["no prio", "Une question", "awaits you"]);
  });

  test("un clic sur une étiquette déplie son détail et marque ses tickets dans le rail ; un clic sur une autre change le choix ; un second clic le finit", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));

    tag(vue, 16).click();
    assert.equal("deplie" in leBandeau(vue).dataset, true);
    assert.equal(tag(vue, 16).ariaPressed, "true");
    const choisi = detail(vue) ?? assert.fail("pas de détail");
    assert.match(choisi.textContent, /^#16Une épiqueprio:1open issue #16Groups book in one gesture\./);
    assert.deepEqual(choisi.dessous("li").map(({ textContent }) => textContent), ["on the rail1", "taken0", "pass0", "awaiting you0", "WAITING0", "served1"]);
    assert.equal(grille(vue).dataset.besoin, "16");
    assert.deepEqual(bonsDuRail(vue).map(({ dataset }) => [Number(dataset.ticket), dataset.besoin]), [[17, "autre"], [10, "sien"], [22, "autre"]]);
    // Le lien de son issue l'ouvre, par son projet et son numéro.
    (choisi.dessous("button").find(({ className }) => className === "backlog-band-issue") ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 16]);

    // Une lecture neuve garde le choix.
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    assert.equal(tag(vue, 16).ariaPressed, "true");

    // Un autre : les tickets du précédent redeviennent ordinaires, ceux du nouveau ressortent.
    tag(vue, 11).click();
    assert.equal(tag(vue, 16).ariaPressed, "false");
    assert.equal(grille(vue).dataset.besoin, "11");
    assert.deepEqual(bonsDuRail(vue).map(({ dataset }) => dataset.besoin), ["autre", "autre", "autre"]);

    // Le même, une seconde fois : plus de choix, le bandeau revient à sa ligne, le rail à l'ordinaire.
    tag(vue, 11).click();
    assert.equal(detail(vue), undefined);
    assert.equal("deplie" in leBandeau(vue).dataset, false);
    assert.equal(grille(vue).dataset.besoin, undefined);
    assert.deepEqual(bonsDuRail(vue).map(({ dataset }) => dataset.besoin), [undefined, undefined, undefined]);
  });

  test("le besoin qui t'attend : son détail pose sa carte de TODO — la question et le bouton qui y répond —, et sa carte rouge ressort en tête de la colonne de son étape", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));

    tag(vue, 17).click();
    const choisi = detail(vue) ?? assert.fail("pas de détail");
    assert.equal("rouge" in choisi.dataset, true);
    const carte = choisi.dessous("div").find(({ className }) => className === "backlog-band-question") ?? assert.fail("pas de carte de TODO");
    const todo = bonsDuRail(vue).find(({ dataset }) => dataset.ticket === "17") ?? assert.fail("pas de carte rouge dans le rail");
    // La même carte que le rail pose en rouge (ticket 3458) : ses mots et ses boutons.
    assert.equal(carte.dessous("li")[0]?.textContent, todo.textContent);
    assert.deepEqual(carte.dessous("button").map(({ textContent }) => textContent), todo.dessous("button").map(({ textContent }) => textContent));
    assert.ok(carte.dessous("button").length > 0, "aucun bouton n'y répond");
    assert.equal(todo.dataset.besoin, "sien");
  });

  test("un clic sur le titre déplie tout le backlog en liste, par état — ce qui t'attend d'abord —, chacun par priorité ; une ligne choisit son besoin ; un second clic replie sur la ligne", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));

    titre(vue).click();
    assert.equal(titre(vue).ariaExpanded, "true");
    const groupes = () => leBandeau(vue).dessous("section").filter(({ className }) => className === "backlog-band-groupe");
    assert.deepEqual(
      groupes().map((groupe) => [groupe.dataset.etat, groupe.dessous("h5")[0]?.textContent, groupe.dessous("button").map(({ dataset }) => Number(dataset.ticket))]),
      [
        ["attend", "awaits you1", [17]],
        ["non-lue", "not read yet3", [14, 20, 21]],
        ["prete", "ready, not fired1", [11]],
        ["mise-de-cote", "set aside2", [12, 13]],
        ["decoupee", "split into tickets1", [16]],
      ],
    );
    // Une lecture neuve ne la replie pas.
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    assert.equal(groupes().length, 5);
    // Une ligne : le détail de son besoin, comme son étiquette.
    groupes()[4]?.dessous("button")[0]?.click();
    assert.match(detail(vue)?.textContent ?? "", /^#16Une épique/);
    assert.equal(grille(vue).dataset.besoin, "16");
    // Le titre, une seconde fois : la ligne seule, sans liste ni choix.
    titre(vue).click();
    assert.equal(titre(vue).ariaExpanded, "false");
    assert.equal(groupes().length, 0);
    assert.equal(detail(vue), undefined);
    assert.equal("deplie" in leBandeau(vue).dataset, false);
    assert.equal(grille(vue).dataset.besoin, undefined);
  });

  test("rail vide : sa colonne On the rail le dit, et dit ce qui est avant lui — ou qu'il n'y a rien, ni sur le rail ni avant lui", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, RAIL_VIDE);
    const phrase = () => colonne(vue, "On the rail").children.find((pose) => pose.balise === "p")?.textContent;
    assert.equal(phrase(), "No ticket on the rail yet. What is before it is being read…");

    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    assert.match(phrase() ?? "", /^nothing on the rail — 8 issues before it \(3 not read yet · /);

    vue.dire("surAmont", voir(lecture(JSON.stringify({ lu: A, depot: DEPOT, issues: [] }))));
    assert.equal(phrase(), "nothing on the rail, nothing before it");
    // Rien avant le rail : le bandeau dit 0, sans étiquette, et son survol dit pourquoi.
    assert.equal(leBandeau(vue).textContent, "Backlog" + "0" + "nothing before the rail");
    assert.match(titre(vue).title, /^nothing before the rail: every open issue of the repository is on it/);
  });

  test("une lecture ratée : aucun nombre ni étiquette — « not read », sa raison au survol ; un choix d'avant est oublié", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", tenirAmont().recevoir(await amontDe(ISSUES)));
    tag(vue, 16).click();
    vue.dire("surAmont", voir({ projet: PARADE, demande: 3, a: A, erreur: "GitHub refused to read the rail of acme/brigade (HTTP 403).", atteinte: true, cas: null, duTableau: true }));

    assert.equal(leBandeau(vue).textContent, "Backlog" + "not read");
    assert.match(leBandeau(vue).dessous("span").find(({ className }) => className === "backlog-band-vide")?.title ?? "", /HTTP 403\)\. This is not “nothing before the rail”$/);
    assert.equal(grille(vue).dataset.besoin, undefined);
  });

  test("une lecture fraîche qui ne porte pas ce qui est avant le rail : pas de bandeau — rien n'est dit (#1770)", async () => {
    const vue = await ouvrir();
    recevoirFaits(vue, FAITS);
    vue.dire("surAmont", voir({ projet: PARADE, demande: 3, a: A, erreur: "`manager upstream` is not read from GitHub for acme/brigade: only the station's log carries it.", atteinte: true, cas: null, duTableau: true, pasPublie: true }));
    assert.equal(bandeau(vue), undefined);
  });
});

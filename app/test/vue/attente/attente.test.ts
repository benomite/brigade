// WAITING sur un projet GitHub (#3075), devenu le parking (#4129) : toute carte de TODO porte « waiting for… », sur la
// carte et sur sa fiche, à l'écran large comme à celui d'un téléphone ; le formulaire demande quoi, de qui, et la relance,
// proposée à sept jours ; validé, le geste s'écrit sur l'issue, sur tout projet — jamais par une commande de la box (#4262) —,
// comme la station et le second l'y écrivent (runtime/src/attente-github/marque.ts, `corpsDuParking`). La carte quitte TODO et se
// montre dans WAITING avec ce qu'elle attend, de qui, et sa relance — lus du commentaire de parking ; le commentaire
// `**WAITING: awaiting …**` d'avant #4129 se lit encore. Une carte de WAITING porte « resume » et « it arrived, back to
// the kitchen », qui retirent `parked`. Joué sur un faux GitHub qui tient ses issues, leurs labels et leurs commentaires,
// lus et écrits ; la vue est jouée telle qu'elle est (aides/fausse-vue.ts).
import { LABELS_D_AVANT_PARKED } from "../../../../runtime/src/github-etat/etats.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDuParking } from "../../../../runtime/src/attente-github/marque.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { GESTES_D_ATTENTE } from "../../../src/attente.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, comprendre, tableau, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { ClientDeLaPriorite } from "../../../src/priorite.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { avecCeQuiAttendLeChef } from "../../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../../src/tableau/lecture.ts";
import { A_L_ARRIVEE, attenteSurGithub, jouerLAttente, marqueDAttente, tiersDeLaMarque, tiersDesCommentaires } from "../../../src/vue/attente/attente-github.ts";
import { jourDe, relanceProposee } from "../../../src/vue/attente/saisie.ts";
import { FauxEcran, jouerLaVue, repos, type Faux, type Jouee } from "../../aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const PROJET = "parade";
const LU = "2026-11-09T10:00:00.000Z";
const issue = (ticket: number) => `https://github.com/${DEPOT}/issues/${ticket}`;
// Ce que `parked set` (ou le second) a posé sur #40.
const MARQUE_40 = corpsDuParking({ what: "the signed quote", who: "the client", followUp: "2026-11-16T00:00:00.000Z" });

// Le commentaire d'entrée en WAITING d'avant #4129, tel que la commande `waiting set` du runtime l'écrivait
// (`direMarque`, retiré) : un ticket mis en attente avant garde ce qu'il attend.
const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deux = (n: number) => String(n).padStart(2, "0");
const instantDAvant = (iso: string) => {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MOIS[date.getUTCMonth()]} ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())} UTC`;
};
const A_L_ARRIVEE_D_AVANT = "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn";
function marqueDAvant(ticket: number, { what, who, since, followUp }: { what: string; who: string; since: string; followUp: string }, miseAJour: boolean): string {
  return [
    `**WAITING${miseAJour ? " — updated" : ""}: awaiting ${who}.** ${what}`,
    "",
    `- **from whom**: ${who}`,
    `- **since**: ${instantDAvant(since)}`,
    `- **follow-up**: ${instantDAvant(followUp)}`,
    `- **on arrival**: ${A_L_ARRIVEE_D_AVANT}`,
    "",
    `As long as it has the \`waiting\` label, the kitchen does not take it, and its follow-up does not take it out. Removing this label sends it back to the kitchen; \`brigade waiting resume ${ticket}\` gives it back the state it had before waiting.`,
  ].join("\n");
}
const ANCIENNE_40 = marqueDAvant(40, { what: "the signed quote", who: "the client", since: "2026-11-02T09:30:00.000Z", followUp: "2026-11-16T00:00:00.000Z" }, false);

type Commentaire = { body: string; created_at: string; author_association?: string };
type Issue = { labels: Set<string>; commentaires: Commentaire[] };
// #20, une carte `chef-todo` hors du rail ; #21, sur le rail ; #40, sur le rail et parqué, son commentaire de parking
// posé par un auteur du dépôt. `panne` : ce que GitHub rend à la place, pour un chemin.
function github(panne: (chemin: string) => ReponseGitHub | undefined = () => undefined) {
  const issues = new Map<number, Issue>([
    [20, { labels: new Set(["chef-todo"]), commentaires: [{ body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old columns?", created_at: "2026-11-08T09:00:00Z" }] }],
    [21, { labels: new Set(["fire"]), commentaires: [] }],
    [40, { labels: new Set(["fire", "parked"]), commentaires: [{ body: MARQUE_40, created_at: "2026-11-02T09:31:00Z", author_association: "OWNER" }] }],
  ]);
  const ecrites: string[] = [];
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const appeler: AppelGitHub = async (chemin) => {
    const panneLue = panne(chemin);
    if (panneLue !== undefined) return panneLue;
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) {
      const page = Number(/[?&]page=(\d+)/.exec(chemin)?.[1] ?? "1");
      const portent = [...issues].filter(([, lue]) => lue.labels.has(label));
      return ok(page > 1 ? [] : portent.map(([numero, lue]) => ({ number: numero, title: `Ticket ${numero}`, html_url: issue(numero), created_at: "2026-11-01T00:00:00Z", labels: [...lue.labels].map((name) => ({ name })) })));
    }
    if (chemin.includes("/pulls?")) return ok([]);
    const [, numero, quoi] = /\/issues\/(\d+)\/(comments|events)/.exec(chemin) ?? [];
    if (numero !== undefined) return ok(quoi === "comments" && !/[?&]page=[2-9]/.test(chemin) ? (issues.get(Number(numero))?.commentaires ?? []) : []);
    return { status: 404, data: { message: "Not Found" } };
  };
  const client: ClientDeLaPriorite = {
    lire: appeler,
    ecrire: async (methode, chemin, corps) => {
      ecrites.push(`${methode} ${chemin}`);
      const panneLue = panne(`${methode} ${chemin}`);
      if (panneLue !== undefined) return panneLue;
      const [, numero, reste] = /\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
      const lue = issues.get(Number(numero));
      if (lue === undefined) return { status: 404, data: { message: "Not Found" } };
      if (methode === "POST" && reste === "/comments") {
        lue.commentaires.push({ body: (corps as { body: string }).body, created_at: new Date().toISOString(), author_association: "OWNER" });
        return { status: 201, data: { html_url: `${issue(Number(numero))}#issuecomment-9` } };
      }
      if (methode === "POST" && reste === "/labels") {
        for (const pose of (corps as { labels: string[] }).labels) lue.labels.add(pose);
        return ok([]);
      }
      const retire = /^\/labels\/(.+)$/.exec(reste ?? "")?.[1];
      if (methode === "DELETE" && retire !== undefined) return lue.labels.delete(decodeURIComponent(retire)) ? ok([]) : { status: 404, data: { message: "Label does not exist" } };
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  return { issues, ecrites, appeler, client };
}
type Monde = ReturnType<typeof github>;

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail lu de GitHub, puis ce qui attend le chef.
async function lueParLApp(monde: Monde): Promise<TableauLu> {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler: monde.appeler, maintenant: () => new Date(LU) }), monde.appeler);
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return lu;
}
const faitsDe = (lu: TableauLu): Faits => {
  const lus = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in lus), "informe" in lus ? lus.informe : "");
  return lus as Faits;
};
const colonneDe = (lu: TableauLu, nom: string) => tableau(faitsDe(lu)).rail.colonnes.find((colonne) => colonne.nom === nom)?.cartes ?? [];

describe("la marque d'attente : ce que le runtime écrit sur l'issue, l'app le lit", () => {
  test("le commentaire de `waiting set` d'avant #4129 (direMarque) se lit encore : quoi, de qui, depuis, la relance, ce que fera l'arrivée", () => {
    assert.deepEqual(tiersDeLaMarque(ANCIENNE_40, "2026-11-02T09:31:00Z"), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-02T09:30:00.000Z", relance: "2026-11-16T00:00:00.000Z", aLArrivee: A_L_ARRIVEE_D_AVANT });
    assert.deepEqual(tiersDesCommentaires([{ body: ANCIENNE_40, created_at: "2026-11-02T09:31:00Z" }])?.relance, "2026-11-16T00:00:00.000Z");
    // Mise à jour, et à cheval sur deux années : la relance sans année est celle qui suit la mise en attente.
    const maj = marqueDAvant(40, { what: "the PO", who: "Acme", since: "2026-12-30T08:00:00.000Z", followUp: "2027-01-06T00:00:00.000Z" }, true);
    assert.deepEqual(tiersDeLaMarque(maj, "2026-12-30T08:01:00Z"), { quoi: "the PO", qui: "Acme", depuis: "2026-12-30T08:00:00.000Z", relance: "2027-01-06T00:00:00.000Z", aLArrivee: A_L_ARRIVEE_D_AVANT });
  });

  test("la marque que l'app écrit est celle de `parked set`, mot pour mot — une relance lointaine se relit telle quelle", () => {
    const relance = new Date("2028-03-01T00:00:00.000Z");
    const corps = marqueDAttente({ quoi: "the signed quote", qui: "the client" }, relance);
    assert.equal(corps, corpsDuParking({ what: "the signed quote", who: "the client", followUp: relance.toISOString() }));
    // Ce que l'arrivée fera, l'app le dit dans les mots du commentaire.
    assert.ok(corps.includes(A_L_ARRIVEE), corps);
    assert.deepEqual(tiersDesCommentaires([{ body: corps, created_at: "2026-11-09T10:00:05Z", author_association: "OWNER" }]), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-09T10:00:05.000Z", relance: relance.toISOString(), aLArrivee: `until 2028-03-01 00:00 UTC, then ${A_L_ARRIVEE}` });
  });

  test("un autre commentaire, ou une marque dont un morceau manque, ne se lit pas : rien n'est inventé ; la dernière marque l'emporte", () => {
    assert.equal(tiersDeLaMarque("**WAITING lifted** — no longer awaiting the client", "2026-11-02T09:31:00Z"), null);
    assert.equal(tiersDeLaMarque(ANCIENNE_40.replace(/- \*\*follow-up\*\*.*\n/, ""), "2026-11-02T09:31:00Z"), null);
    assert.equal(tiersDeLaMarque(ANCIENNE_40.replace("16 Nov", "16 Foo"), "2026-11-02T09:31:00Z"), null);
    const autre = corpsDuParking({ what: "the PO", who: "Acme", followUp: "2026-11-20T00:00:00.000Z" });
    assert.equal(tiersDesCommentaires([{ body: ANCIENNE_40, created_at: "2026-11-02T09:31:00Z" }, { body: autre, created_at: "2026-11-05T08:01:00Z", author_association: "OWNER" }, { body: "thanks", created_at: "2026-11-06T08:00:00Z" }])?.qui, "Acme");
    // Une marque de parking d'un auteur hors du dépôt ne se lit pas.
    assert.equal(tiersDesCommentaires([{ body: autre, created_at: "2026-11-05T08:01:00Z", author_association: "NONE" }]), null);
    assert.equal(tiersDesCommentaires([{ body: "thanks", created_at: "2026-11-06T08:00:00Z" }]), null);
  });
});

describe("la lecture de GitHub : TODO et WAITING", () => {
  test("toute carte de TODO porte « waiting for… » ; #40, au label `parked`, est dans WAITING avec ce qu'il attend", async () => {
    const lu = await lueParLApp(github());
    assert.deepEqual(colonneDe(lu, "Awaiting you").map(({ ticket, gestes }) => [ticket, gestes]), [[20, ["attente-poser"]]]);
    const [waiting] = colonneDe(lu, "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.deepEqual(waiting?.gestes, ["attente-reprendre", "attente-arrivee"]);
    assert.deepEqual(waiting?.dit.slice(0, 2), [
      { libelle: "waiting for", valeur: "the signed quote" },
      { libelle: "from", valeur: "the client" },
    ]);
    assert.match(waiting?.dit.find(({ libelle }) => libelle === "follow-up")?.valeur ?? "", /^2026-11-16 00:00 UTC/);
  });

  test("une carte `chef-todo` mise en WAITING quitte TODO, et se montre dans WAITING, hors du rail", async () => {
    const monde = github();
    const vingt = monde.issues.get(20) ?? assert.fail();
    // Ce que « waiting for… » laisse sur l'issue (ticket 4129) : `chef-todo` reste, `parked` s'ajoute — elle attend un autre.
    vingt.labels.add("parked");
    vingt.commentaires.push({ body: corpsDuParking({ what: "the legal review", who: "legal", followUp: "2026-11-23T00:00:00.000Z" }), created_at: "2026-11-09T08:00:30Z", author_association: "OWNER" });
    const lu = await lueParLApp(monde);
    assert.deepEqual(colonneDe(lu, "Awaiting you"), []);
    assert.deepEqual(colonneDe(lu, "Waiting").map(({ ticket, dit }) => [ticket, dit[0]?.valeur]), [
      [40, "the signed quote"],
      [20, "the legal review"],
    ]);
    // Le second ne la relaie pas non plus : elle n'attend pas le chef.
    assert.ok(!lu.file.some(({ ticket }) => ticket === 20));
  });

  test("ce qu'attendent les issues en WAITING ne se lit pas : TODO reste lu, la carte de WAITING ne dit pas ce qu'elle attend, et le bloc dit pourquoi", async () => {
    const lu = await lueParLApp(github((chemin) => (chemin.includes("/issues/40/comments") ? { status: 502, data: { message: "Bad Gateway" } } : undefined)));
    assert.deepEqual(colonneDe(lu, "Awaiting you").map(({ ticket }) => ticket), [20]);
    const [waiting] = colonneDe(lu, "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.match(waiting?.sans ?? "", /^not given/);
    assert.deepEqual(lu.bilans, ["what the `parked` issues wait for was not read from GitHub: GitHub answered HTTP 502 on /repos/chef/parade/issues/40/comments — their WAITING cards do not say it until the next reading"]);
  });

  test("une issue au label `parked` sans marque lisible — posé à la main : sa carte est dans WAITING, sans rien inventer", async () => {
    const monde = github();
    (monde.issues.get(40) ?? assert.fail()).commentaires = [{ body: "waiting on the client", created_at: "2026-11-02T09:31:00Z" }];
    const [waiting] = colonneDe(await lueParLApp(monde), "Waiting");
    assert.equal(waiting?.ticket, 40);
    assert.deepEqual(waiting?.dit, []);
    assert.match(waiting?.sans ?? "", /^not given/);
  });
});

const dansDixJours = () => jourDe(new Date(Date.now() + 10 * 86_400_000));

describe("les gestes : toujours écrits sur l'issue", () => {
  test("« waiting for… » pose la marque puis `parked` ; « resume » et « it arrived » retirent `parked` — rien ne part dans le second (#4262)", async () => {
    const monde = github();
    const lu = await lueParLApp(monde);
    const jouer = (id: string, ticket: number, saisie?: unknown) => jouerLAttente({ id, ticket, saisie, aujourdhui: new Date(), lu: () => lu, client: monde.client });
    assert.ok("fait" in (await jouer("attente-poser", 20, { quoi: "x", qui: "y", relance: dansDixJours() })));
    assert.deepEqual(monde.ecrites, [`POST /repos/${DEPOT}/issues/20/comments`, `POST /repos/${DEPOT}/issues/20/labels`]);
    // Le commentaire porte en tête la marque que la station relit : le même que la commande de parking du second écrit.
    assert.match(monde.issues.get(20)?.commentaires.at(-1)?.body ?? "", /^<!-- brigade:parked \{"what":"x","who":"y","followUp":"[^"]+"\} -->\n\*\*PARKED: waits for y\.\*\* x\n/);
    // `parked` retiré d'abord, puis chaque label d'attente d'avant parked.
    const retraits = [`DELETE /repos/${DEPOT}/issues/40/labels/parked`, ...LABELS_D_AVANT_PARKED.map((label) => `DELETE /repos/${DEPOT}/issues/40/labels/${encodeURIComponent(label)}`)];
    assert.ok("fait" in (await jouer("attente-reprendre", 40)));
    assert.deepEqual(monde.ecrites.slice(-retraits.length), retraits);
    assert.ok("fait" in (await jouer("attente-arrivee", 40)));
    assert.deepEqual(monde.ecrites.slice(-retraits.length), retraits);
  });
  test("« waiting for… » pose la marque puis `parked` ; relue, la carte est dans WAITING avec quoi, de qui et sa relance", async () => {
    const monde = github();
    const lu = await lueParLApp(monde);
    const relance = dansDixJours();
    const dit = await jouerLAttente({ id: "attente-poser", ticket: 20, saisie: { quoi: " the legal review ", qui: "legal", relance }, aujourdhui: new Date(), lu: () => lu, client: monde.client });
    assert.deepEqual(dit, { fait: `in WAITING on GitHub: #20 awaits legal, follow-up on ${relance}`, detail: `${issue(20)}#issuecomment-9` });
    assert.deepEqual(monde.ecrites, [`POST /repos/${DEPOT}/issues/20/comments`, `POST /repos/${DEPOT}/issues/20/labels`]);
    assert.ok(monde.issues.get(20)?.commentaires.at(-1)?.body.startsWith("<!-- brigade:parked {\"what\":\"the legal review\",\"who\":\"legal\""), "la marque de la station n'est pas en tête du commentaire");
    const relu = await lueParLApp(monde);
    assert.deepEqual(colonneDe(relu, "Awaiting you"), []);
    const vingt = colonneDe(relu, "Waiting").find(({ ticket }) => ticket === 20) ?? assert.fail("#20 n'est pas dans WAITING");
    assert.deepEqual(vingt.dit.slice(0, 2), [
      { libelle: "waiting for", valeur: "the legal review" },
      { libelle: "from", valeur: "legal" },
    ]);
    const [an, mois, jour] = relance.split("-").map(Number);
    assert.equal(faitsDe(relu).rail.find(({ ticket }) => ticket === 20)?.tiers?.relance, new Date(an ?? 0, (mois ?? 1) - 1, jour).toISOString());
    // « resume » : `parked` retiré, la carte revient dans TODO.
    const repris = await attenteSurGithub({ id: "attente-reprendre", ticket: 20, saisie: undefined, aujourdhui: new Date(), lu: relu, client: monde.client });
    assert.ok("fait" in repris);
    assert.deepEqual(colonneDe(await lueParLApp(monde), "Awaiting you").map(({ ticket }) => ticket), [20]);
  });

  test("ce qui ne part pas se dit, et rien n'est montré fait : ce qu'il attend manquant, le commentaire refusé, le label refusé, un ticket pas lu", async () => {
    const sain = github();
    const lu = await lueParLApp(sain);
    assert.deepEqual(await jouerLAttente({ id: "attente-poser", ticket: 20, saisie: { quoi: "", qui: "the client", relance: dansDixJours() }, aujourdhui: new Date(), lu: () => lu, client: sain.client }), { refus: "nothing is written: say what it waits for, in your words", detail: "" });
    assert.deepEqual(await jouerLAttente({ id: "attente-poser", ticket: 99, saisie: { quoi: "x", qui: "y", relance: dansDixJours() }, aujourdhui: new Date(), lu: () => lu, client: sain.client }), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    assert.deepEqual(await jouerLAttente({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: dansDixJours() }, aujourdhui: new Date(), lu: () => undefined, client: sain.client }), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(sain.ecrites, []);

    const commentaireRefuse = github((chemin) => (chemin.startsWith("POST") && chemin.endsWith("/comments") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    const refus = await jouerLAttente({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: dansDixJours() }, aujourdhui: new Date(), lu: () => lu, client: commentaireRefuse.client });
    assert.deepEqual(refus, { refus: "nothing was changed: GitHub did not take the WAITING comment on #20", detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration" });
    assert.deepEqual(commentaireRefuse.ecrites, [`POST /repos/${DEPOT}/issues/20/comments`]);

    const labelRefuse = github((chemin) => (chemin.startsWith("POST") && chemin.endsWith("/labels") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    const aMoitie = await jouerLAttente({ id: "attente-poser", ticket: 20, saisie: { quoi: "x", qui: "y", relance: dansDixJours() }, aujourdhui: new Date(), lu: () => lu, client: labelRefuse.client });
    assert.deepEqual(aMoitie, { refus: "#20 is not parked: its comment is posted, but GitHub did not set `parked` — try again", detail: "GitHub refused `parked` (HTTP 403): Resource not accessible by integration" });
    assert.deepEqual(colonneDe(await lueParLApp(labelRefuse), "Awaiting you").map(({ ticket }) => ticket), [20], "sans le label, la carte reste dans TODO");
  });
});

// L'écran : la vue jouée devant le faux document, sur ce que la lecture de l'app range, et son geste `attente` porté par
// la chaîne du process principal (`jouerLAttente`), sur le faux GitHub.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PROJET, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(monde: Monde, etroit = false): Promise<{ vue: Jouee; relire: () => Promise<void> }> {
  let dernier = await lueParLApp(monde);
  const vue = await jouerLaVue(
    {
      demarrage,
      espace: () => [],
      machines: () => [],
      attente: (_projet, id, ticket, saisie) => jouerLAttente({ id, ticket, saisie, aujourdhui: new Date(), lu: () => dernier, client: monde.client }),
    },
    { ecran: new FauxEcran(etroit) },
  );
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  const relire = async () => {
    dernier = await lueParLApp(monde);
    const recue = tenirFaits(() => new Map()).recevoir({ projet: PROJET, demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(dernier.faits) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  };
  await relire();
  return { vue, relire };
}
const bonDe = (vue: Jouee, numero: number): Faux => vue.element("rail").dessous("li").find((bon) => bon.className.split(" ").includes("bon") && bon.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
const colonne = (vue: Jouee, nom: string): Faux => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === nom) ?? assert.fail(`pas de colonne ${nom}`);
const boutonDe = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const champ = (ou: Faux, nom: string): Faux => ou.dessous("input").find((pose) => pose.dataset.champ === nom) ?? assert.fail(`pas de champ ${nom}`);
const taper = (entree: Faux, texte: string) => {
  entree.value = texte;
  entree.declencher("input");
};
const fiche = (vue: Jouee) => vue.element("fiche");

describe("sur l'écran d'un projet GitHub", () => {
  for (const etroit of [false, true]) {
    test(`${etroit ? "écran d'un téléphone" : "écran large"} : la carte de TODO porte « waiting for… », celle de WAITING « resume » et « it arrived, back to the kitchen »`, async () => {
      const { vue } = await ouvrir(github(), etroit);
      // TODO n'est pas une colonne (#3458) : la carte qui attend le chef est rouge, dans le backlog (#4238).
      assert.ok(colonne(vue, "Backlog").contains(bonDe(vue, 20)));
      assert.equal(bonDe(vue, 20).dataset.carte, "attente");
      assert.equal(boutonDe(bonDe(vue, 20), "waiting for…").dataset.attente, "attente-poser");
      // Parked, elle reste dans la colonne où elle attend : aucune colonne Waiting (#4238).
      assert.ok(colonne(vue, "Backlog").contains(bonDe(vue, 40)));
      assert.deepEqual(bonDe(vue, 40).dessous("button").filter(({ dataset }) => "attente" in dataset).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen"]);
      assert.equal(bonDe(vue, 40).dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for the signed quote · from the client · follow-up ${jourDe(new Date("2026-11-16T00:00:00.000Z"))}`);
      // Plus rien ne dit que WAITING est une commande de la station.
      assert.ok(!vue.element("rail").textContent.includes("command of the station"));
    });
  }

  test("la fiche d'une carte de TODO porte « waiting for… » ; touché, le formulaire s'y ouvre — vide, la relance à sept jours", async () => {
    const { vue } = await ouvrir(github());
    bonDe(vue, 20).click();
    await repos();
    assert.equal(fiche(vue).hidden, false);
    const avant = relanceProposee(new Date());
    boutonDe(fiche(vue), "waiting for…").click();
    await repos();
    const formulaire = fiche(vue).dessous("form")[0] ?? assert.fail("pas de formulaire sur la fiche");
    assert.deepEqual(formulaire.dessous("label").map((etiquette) => etiquette.children[0]?.textContent), ["what it waits for, in your words", "from whom", "follow-up on"]);
    assert.deepEqual([champ(formulaire, "quoi").value, champ(formulaire, "qui").value], ["", ""]);
    assert.equal(champ(formulaire, "relance").type, "date");
    assert.ok([avant, relanceProposee(new Date())].includes(champ(formulaire, "relance").value), champ(formulaire, "relance").value);
  });

  test("validé sans ce qu'il attend : refusé, la phrase sous les champs, rien sur GitHub ; rempli, il part, et la carte passe dans WAITING avec quoi, de qui et sa relance", async () => {
    const monde = github();
    const { vue, relire } = await ouvrir(monde);
    boutonDe(bonDe(vue, 20), "waiting for…").click();
    await repos();
    const formulaire = () => bonDe(vue, 20).dessous("form")[0] ?? assert.fail("pas de formulaire");
    taper(champ(formulaire(), "qui"), "legal");
    formulaire().declencher("submit");
    await repos();
    assert.equal(formulaire().dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing is written: say what it waits for, in your words");
    assert.deepEqual(monde.ecrites, []);

    taper(champ(formulaire(), "quoi"), "the legal review");
    formulaire().declencher("submit");
    await repos();
    const [projet, id, ticket, saisie] = vue.dernier("attente");
    assert.deepEqual([projet, id, ticket], [PROJET, "attente-poser", 20]);
    assert.deepEqual({ ...(saisie as object), relance: undefined }, { quoi: "the legal review", qui: "legal", relance: undefined });
    assert.deepEqual(monde.ecrites, [`POST /repos/${DEPOT}/issues/20/comments`, `POST /repos/${DEPOT}/issues/20/labels`]);
    await relire();
    assert.ok(colonne(vue, "Backlog").contains(bonDe(vue, 20)));
    // Elle n'attend plus le chef : plus rouge, une seule carte, parked dans le backlog (#4238).
    assert.notEqual(bonDe(vue, 20).dataset.carte, "attente");
    assert.equal(vue.element("rail").dessous("li").filter((bon) => bon.className.split(" ").includes("bon") && bon.children[0]?.children[0]?.textContent === "#20").length, 1);
    // La carte dit les trois : quoi, de qui, et le jour de la relance choisi.
    assert.equal(bonDe(vue, 20).dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, `waiting for the legal review · from legal · follow-up ${(saisie as { relance: string }).relance}`);
    bonDe(vue, 20).click();
    await repos();
    const dits = fiche(vue).dessous("li").map((fait) => fait.children[0]?.textContent);
    assert.deepEqual(dits.slice(0, 4), ["waiting for", "from", "since", "follow-up"]);
  });

  // Déparquer : `parked` retiré, puis chaque label d'attente d'avant parked (runtime/src/github-etat/etats.ts) — un ticket que
  // l'un d'eux parque reprend aussi.
  const DEPARQUE = (ticket: number) => ["parked", ...LABELS_D_AVANT_PARKED].map((label) => `DELETE /repos/${DEPOT}/issues/${ticket}/labels/${encodeURIComponent(label)}`);

  test("sur une carte de WAITING, « resume » et « it arrived, back to the kitchen » jouent chacun leur geste — `parked` retiré de l'issue", async () => {
    const monde = github();
    const { vue } = await ouvrir(monde);
    boutonDe(bonDe(vue, 40), "resume").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), [PROJET, "attente-reprendre", 40, undefined]);
    assert.deepEqual(monde.ecrites, DEPARQUE(40));
    assert.equal(bonDe(vue, 40).dessous("p").find((pose) => pose.className === "arrivee")?.textContent, "resumed on GitHub: #40 no longer carries `parked` — it resumes exactly where it was");

    const autre = github();
    const { vue: deux } = await ouvrir(autre);
    boutonDe(bonDe(deux, 40), "it arrived, back to the kitchen").click();
    await repos();
    assert.deepEqual(deux.dernier("attente"), [PROJET, "attente-arrivee", 40]);
    assert.deepEqual(autre.ecrites, DEPARQUE(40));
  });
});

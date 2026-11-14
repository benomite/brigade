// « Resume », sur la ligne du disjoncteur, ligne d'état du rail (#2140, épique #2134) : la cuisine retenue par son disjoncteur reprend
// d'un clic, par GitHub. Le clic poste exactement un commentaire `/resume` sur l'issue ouverte qui porte le label
// `brigade:breaker-open` ; la ligne dit qu'il part, puis « Resume requested » — ou, GitHub refusant ou aucune issue
// n'étant ouverte, pourquoi rien n'est parti, et « Resume » est rendu pour réessayer. Ni commande à recopier, ni bouton
// pour la copier.
// Le module GitHub est joué sur un faux client, puis sur un faux `GET` et un faux `POST` ; la vue, telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts), la bande dite par le process principal (alertes.ts) d'après la ligne
// `kitchen` de `status` telle que le runtime l'écrit — et le pont qui joue le vrai module sur un faux GitHub.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tenirBandes, type Bande } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { clientDuDisjoncteurGitHub, CORPS_DE_LA_REPRISE, LABEL_DU_DISJONCTEUR, reprendreLeDisjoncteur, type ClientDuDisjoncteur, type IssueDuDisjoncteur, type RenduDeLaReprise } from "../src/github/breaker-resume.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";
import { DEMANDEE, EN_ROUTE, REPRENDRE } from "../src/vue/todo-breaker-line.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const PARADE = "parade";
const A = "2026-11-03T10:00:01.000Z";

// Un faux GitHub : les issues ouvertes qu'il porte, par label, et les commentaires qu'on y poste. `refuse` : ce qu'il
// répond à un commentaire, ou à la lecture des issues — rien, il les prend.
function fauxGitHub(issues: IssueDuDisjoncteur[], refuse: { lecture?: Error; commentaire?: Error } = {}) {
  const postes: { depot: string; issue: number; corps: string }[] = [];
  const lus: { depot: string; label: string }[] = [];
  const client: ClientDuDisjoncteur = {
    async issuesOuvertes(depot, label) {
      lus.push({ depot, label });
      if (refuse.lecture !== undefined) throw refuse.lecture;
      return label === LABEL_DU_DISJONCTEUR ? issues : [];
    },
    async commenter(depot, issue, corps) {
      if (refuse.commentaire !== undefined) throw refuse.commentaire;
      postes.push({ depot, issue, corps });
      return { url: `https://github.com/${depot}/issues/${issue}#issuecomment-${postes.length}` };
    },
  };
  return { client, postes, lus };
}
const ISSUE: IssueDuDisjoncteur = { numero: 2150, url: "https://github.com/chef/parade/issues/2150" };

describe("le geste : `/resume` sur l'issue du disjoncteur", () => {
  test("un seul commentaire, de corps exactement `/resume`, sur l'issue ouverte qui porte `brigade:breaker-open`", async () => {
    const github = fauxGitHub([ISSUE]);
    const rendu = await reprendreLeDisjoncteur(DEPOT, github.client);
    assert.deepEqual(github.lus, [{ depot: DEPOT, label: "brigade:breaker-open" }]);
    assert.deepEqual(github.postes, [{ depot: DEPOT, issue: 2150, corps: "/resume" }]);
    assert.deepEqual(rendu, { demandee: { issue: 2150, url: "https://github.com/chef/parade/issues/2150#issuecomment-1" } });
  });

  test("plusieurs issues ouvertes : la plus récente seule, celle que GitHub rend en premier", async () => {
    const github = fauxGitHub([ISSUE, { numero: 2001, url: null }]);
    await reprendreLeDisjoncteur(DEPOT, github.client);
    assert.deepEqual(github.postes.map(({ issue }) => issue), [2150]);
  });

  test("aucune issue ne porte le label : rien n'est posté, et le refus le dit", async () => {
    const github = fauxGitHub([]);
    const rendu = await reprendreLeDisjoncteur(DEPOT, github.client);
    assert.deepEqual(github.postes, []);
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "resume not requested: no breaker issue is open on GitHub");
    assert.match(rendu.detail, /brigade:breaker-open/);
  });

  test("GitHub refuse le commentaire, ou la lecture : le refus le dit en une ligne, ce que GitHub a dit en détail", async () => {
    const commentaire = await reprendreLeDisjoncteur(DEPOT, fauxGitHub([ISSUE], { commentaire: new Error("GitHub refused the comment (HTTP 403): Resource not accessible by integration") }).client);
    assert.deepEqual(commentaire, { refus: "resume not requested: GitHub did not take the comment", detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration" });
    const lecture = await reprendreLeDisjoncteur(DEPOT, fauxGitHub([ISSUE], { lecture: new Error("GitHub gave no answer within 30 s") }).client);
    assert.deepEqual(lecture, { refus: "resume not requested: GitHub could not be read", detail: "GitHub gave no answer within 30 s" });
  });
});

describe("le client GitHub du geste", () => {
  // Un faux `GET` et un faux `POST` : ce qu'ils ont reçu, et ce qu'ils rendent.
  function fauxReseau({ issues = { status: 200, data: [] as unknown }, commentaire = { status: 201, data: { id: 9, html_url: "https://github.com/chef/parade/issues/2150#issuecomment-9" } as unknown } } = {}) {
    const lus: string[] = [];
    const postes: { adresse: string; entetes: Record<string, string>; corps: unknown }[] = [];
    const client = clientDuDisjoncteurGitHub({
      jeton: async () => "gho_jeton",
      appeler: async (chemin): Promise<ReponseGitHub> => {
        lus.push(chemin);
        return issues;
      },
      poster: async (adresse, entetes, corps): Promise<ReponseGitHub> => {
        postes.push({ adresse, entetes, corps });
        return commentaire;
      },
    });
    return { client, lus, postes };
  }

  test("les issues ouvertes du label, sans les PR ; le commentaire en `POST`, avec le jeton de l'app", async () => {
    const reseau = fauxReseau({ issues: { status: 200, data: [{ number: 2150, html_url: ISSUE.url }, { number: 2149, html_url: "x", pull_request: {} }] } });
    const rendu = await reprendreLeDisjoncteur(DEPOT, reseau.client);
    assert.deepEqual(reseau.lus, ["/repos/chef/parade/issues?state=open&labels=brigade%3Abreaker-open&per_page=10"]);
    assert.equal(reseau.postes.length, 1);
    const [poste] = reseau.postes;
    assert.equal(poste?.adresse, "https://api.github.com/repos/chef/parade/issues/2150/comments");
    assert.deepEqual(poste?.corps, { body: CORPS_DE_LA_REPRISE });
    assert.equal(poste?.entetes.Authorization, "Bearer gho_jeton");
    assert.equal(poste?.entetes["Content-Type"], "application/json");
    assert.deepEqual(rendu, { demandee: { issue: 2150, url: "https://github.com/chef/parade/issues/2150#issuecomment-9" } });
  });

  test("seule une PR porte le label : aucune issue, rien n'est posté", async () => {
    const reseau = fauxReseau({ issues: { status: 200, data: [{ number: 2149, pull_request: {} }] } });
    const rendu = await reprendreLeDisjoncteur(DEPOT, reseau.client);
    assert.deepEqual(reseau.postes, []);
    assert.ok("refus" in rendu && /no breaker issue/.test(rendu.refus));
  });

  test("GitHub refuse : son code et sa phrase sont dans le détail", async () => {
    const commentaire = await reprendreLeDisjoncteur(DEPOT, fauxReseau({ issues: { status: 200, data: [{ number: 2150 }] }, commentaire: { status: 403, data: { message: "Resource not accessible by integration." } } }).client);
    assert.deepEqual(commentaire, { refus: "resume not requested: GitHub did not take the comment", detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration" });
    const lecture = await reprendreLeDisjoncteur(DEPOT, fauxReseau({ issues: { status: 404, data: { message: "Not Found" } } }).client);
    assert.ok("refus" in lecture);
    assert.equal(lecture.refus, "resume not requested: GitHub could not be read");
    assert.match(lecture.detail, /HTTP 404/);
  });
});

// --- La vue -----------------------------------------------------------------------------------------------------------

const FAITS: Faits = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};
// La ligne `kitchen` de `status`, telle que le runtime l'écrit (runtime/src/etat.ts) : le disjoncteur ouvert.
const OUVERT = ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const REFERME = ["project    parade", "kitchen    open", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const lecture = (commande: string, texte: string): Lecture => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande, texte }] });

// La bande que le process principal dirait, `facts` et `status` lus.
function bandeLue(status: string, etat: Faits["etat"] = "retenue"): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir([PARADE]);
  bandes.faits(lecture("facts", JSON.stringify({ ...FAITS, etat })));
  bandes.status(mettreAPart(lecture("status", status)));
  return bandes.manager(lecture("manager", "manager               ALLUMÉ depuis le 2026-11-03T09:25:21.838Z (par chef) — il juge les issues ouvertes\n"));
}

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", depot: DEPOT }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'espace de « parade » ouvert, son rail lu, sa bande dite. `reprendre` : ce que le pont fait de « Resume ».
async function ouvrir(reprendre: (projet: string) => Promise<RenduDeLaReprise | undefined>, status = OUVERT): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], geste: () => undefined, reprendreLeDisjoncteur: reprendre });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir(lecture("facts", JSON.stringify(FAITS)));
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  vue.dire("surAlertes", bandeLue(status));
  await repos();
  return vue;
}

// La ligne du disjoncteur est la ligne d'état du rail (#3523) : au-dessus des colonnes, seule avec le bandeau Backlog.
const ligneDe = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("div").find(({ className }) => className === "ligne-disjoncteur");
const ligne = (vue: Jouee): Faux => ligneDe(vue) ?? assert.fail("pas de ligne du disjoncteur sur le rail");
// Les boutons d'une ligne, hors survols.
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");
const reprendre = (ou: Faux): Faux => boutons(ou).find(({ textContent }) => textContent === REPRENDRE) ?? assert.fail("pas de bouton « Resume »");
const appelsDe = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "reprendreLeDisjoncteur").map(({ args }) => args);
// Une promesse que le test tient : le pont attend sa réponse.
function enAttente<T>() {
  let rendre: (valeur: T) => void = () => {};
  const promesse = new Promise<T>((fait) => (rendre = fait));
  return { promesse, rendre };
}

describe("la ligne du disjoncteur, ligne d'état du rail, au-dessus des colonnes (#3523)", () => {
  test("le disjoncteur ouvert : sa ligne d'état, un seul bouton « Resume », ni commande ni copie — et la bande ne la redit pas", async () => {
    const vue = await ouvrir(async () => undefined);
    const posee = ligne(vue);
    // Première du rail, avant les colonnes, et dans aucune : c'est la ligne d'état.
    const enfants = vue.element("rail").children;
    assert.ok(enfants.indexOf(posee) >= 0 && enfants.indexOf(posee) < enfants.findIndex(({ className }) => className === "colonnes"), "la ligne n'est pas au-dessus des colonnes");
    assert.ok(!vue.element("rail").dessous("section").some((colonne) => colonne.dessous("div").some(({ className }) => className === "ligne-disjoncteur")), "la ligne est dans une colonne");
    assert.match(posee.textContent, /breaker open: the latest launches failed in a row/);
    assert.deepEqual(boutons(posee).map(({ textContent }) => textContent), [REPRENDRE]);
    assert.equal(reprendre(posee).className, "recommande");
    assert.doesNotMatch(posee.textContent, /brigade |guardrails|ssh|copy|copier/i);
    assert.equal(posee.dessous("pre").length, 0);
    // Son prix, au survol du bouton ; ce que la station en écrit, au survol de la ligne.
    const survols = posee.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
    assert.ok(survols.includes("the breaker closes: queued tickets start again at once, on your quota"));
    assert.ok(survols.includes("breaker OPEN for 1 h 00 (3 failures in a row)"));
    assert.ok(!vue.element("alertes").textContent.includes("breaker open"), "la bande redit la ligne du disjoncteur");
    assert.ok(!vue.element("alertes").textContent.includes("resume the kitchen"), "la bande porte encore le geste qui écrit la commande");
  });

  test("un clic : le bouton attend, la ligne dit que la demande part ; postée, « Resume requested », sans bouton à recliquer", async () => {
    const reponse = enAttente<RenduDeLaReprise>();
    const vue = await ouvrir(() => reponse.promesse);
    reprendre(ligne(vue)).click();
    await repos();
    assert.deepEqual(appelsDe(vue), [[PARADE]]);
    assert.equal(reprendre(ligne(vue)).disabled, true);
    assert.ok(ligne(vue).dessous("span").some(({ textContent }) => textContent === EN_ROUTE));
    // Un second clic pendant l'envoi ne part pas.
    reprendre(ligne(vue)).click();
    await repos();
    assert.equal(appelsDe(vue).length, 1);

    reponse.rendre({ demandee: { issue: 2150, url: "https://github.com/chef/parade/issues/2150#issuecomment-1" } });
    await repos();
    const posee = ligne(vue);
    assert.ok(posee.dessous("span").some(({ textContent }) => textContent === DEMANDEE));
    assert.deepEqual(boutons(posee), []);
    assert.equal(appelsDe(vue).length, 1);
  });

  test("GitHub refuse, ou aucune issue n'est ouverte : la ligne le dit en une ligne, le détail au survol, et « Resume » est rendu — un clic réessaie", async () => {
    const rendus: RenduDeLaReprise[] = [
      { refus: "resume not requested: GitHub did not take the comment", detail: "GitHub refused the comment (HTTP 403): Resource not accessible by integration" },
      { refus: "resume not requested: no breaker issue is open on GitHub", detail: "no open issue of chef/parade carries the label `brigade:breaker-open`" },
      { demandee: { issue: 2150, url: null } },
    ];
    const vue = await ouvrir(async () => rendus.shift());
    for (const dit of ["resume not requested: GitHub did not take the comment", "resume not requested: no breaker issue is open on GitHub"]) {
      reprendre(ligne(vue)).click();
      await repos();
      const posee = ligne(vue);
      const refus = posee.dessous("span").find(({ className }) => className === "refus") ?? assert.fail("pas de refus");
      assert.equal(refus.children[0]?.textContent, dit);
      assert.ok((refus.dessous("button")[0]?.ariaLabel ?? "") !== "", "le détail n'est pas au survol");
      assert.equal(reprendre(posee).disabled, false);
    }
    reprendre(ligne(vue)).click();
    await repos();
    assert.ok(ligne(vue).dessous("span").some(({ textContent }) => textContent === DEMANDEE));
    assert.equal(appelsDe(vue).length, 3);
  });

  test("bout à bout : le pont joue le vrai geste sur un faux GitHub — un seul `/resume` posté, sur l'issue du disjoncteur du dépôt du projet", async () => {
    const github = fauxGitHub([ISSUE]);
    const vue = await ouvrir(() => reprendreLeDisjoncteur(DEPOT, github.client));
    reprendre(ligne(vue)).click();
    await repos();
    await repos();
    assert.deepEqual(github.postes, [{ depot: DEPOT, issue: 2150, corps: "/resume" }]);
    assert.ok(ligne(vue).dessous("span").some(({ textContent }) => textContent === DEMANDEE));
  });

  test("le disjoncteur refermé : la ligne d'état s'en va, et ce qui avait été demandé avec elle", async () => {
    const vue = await ouvrir(async () => ({ demandee: { issue: 2150, url: null } }));
    assert.ok(vue.element("rail").children.includes(ligne(vue)), "la ligne n'est pas posée sur le rail, au-dessus des colonnes");
    reprendre(ligne(vue)).click();
    await repos();
    vue.dire("surAlertes", bandeLue(REFERME, "ouverte"));
    await repos();
    assert.equal(ligneDe(vue), undefined);
    // Rouvert plus tard : « Resume » est de nouveau là.
    vue.dire("surAlertes", bandeLue(OUVERT));
    await repos();
    assert.deepEqual(boutons(ligne(vue)).map(({ textContent }) => textContent), [REPRENDRE]);
  });

  test("sur Stations, sans TODO : la bande porte la ligne, avec le même « Resume »", async () => {
    const vue = await ouvrir(async () => ({ demandee: { issue: 2150, url: null } }));
    await ouvrirOnglet(vue, "Stations");
    const bande = vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open")) ?? assert.fail("la bande ne dit pas le disjoncteur");
    const bouton = reprendre(bande);
    bouton.click();
    await repos();
    assert.deepEqual(appelsDe(vue), [[PARADE]]);
    assert.ok(vue.element("alertes").dessous("span").some(({ textContent }) => textContent === DEMANDEE));
  });
});

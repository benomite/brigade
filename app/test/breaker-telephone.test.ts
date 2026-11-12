// La ligne du disjoncteur sur le téléphone (#3371, audit #3228) : quand la station a ouvert l'issue `brigade:breaker-open`, la
// lecture de GitHub du téléphone dit la cuisine retenue — la bande du projet porte l'alerte du disjoncteur, avec pourquoi et
// son « Resume » —, et le geste `reprendreLeDisjoncteur` des gestes du téléphone poste `/resume` sur cette issue, par l'envoi
// natif, comme le desktop. Joué sur un faux GitHub derrière l'envoi même du téléphone, sans station.
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
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { REPRENDRE } from "../src/vue/todo-breaker-line.js";
import { FauxEcran, type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";
import { ecritureParCapacitor, ouvrirLesGestesGitHub, type DemandeNative } from "../src/gestes-github-telephone.ts";
import { cuisineRetenueParLeDisjoncteur, LABEL_DU_DISJONCTEUR, type RenduDeLaReprise } from "../src/github/breaker-resume.ts";
import { ouvrirLaLectureGitHub } from "../src/lecture-github-telephone.ts";
import { API_GITHUB, clientGitHub, type Envoi, type ReponseGitHub } from "../src/tableau/client.ts";

const DEPOT = "chef/parade";
const LU = "2026-11-06T09:00:00.000Z";
const CORPS = [
  "<!-- brigade:breaker-open project=parade -->",
  "The breaker of the `parade` kitchen opened after 3 failures in a row (threshold 3): no cook leaves until the chef resumes the kitchen.",
  "",
  "- **Failing ticket**: #21",
  "- **Exit code**: 1",
  "- **Opened at**: 2026-11-06T06:55:00.000Z",
].join("\n");

// Un faux GitHub : le dépôt de parade, sans ticket, et — si `ouvertes` — l'issue du disjoncteur. `refuse` : la lecture des issues
// du disjoncteur que GitHub refuse. Les commentaires postés sont notés.
function github({ ouvertes = true, refuse = false }: { ouvertes?: boolean; refuse?: boolean } = {}) {
  const postes: { adresse: string; corps: unknown }[] = [];
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const lire: Envoi = async (adresse) => {
    const chemin = adresse.slice(API_GITHUB.length);
    if (chemin.includes(`labels=${encodeURIComponent(LABEL_DU_DISJONCTEUR)}`)) {
      if (refuse) return { status: 403, data: { message: "Resource not accessible" } };
      return ok(ouvertes ? [{ number: 2150, html_url: `https://github.com/${DEPOT}/issues/2150`, body: CORPS }] : []);
    }
    if (chemin.startsWith(`/repos/${DEPOT}/issues?`) || chemin.startsWith(`/repos/${DEPOT}/pulls?`)) return ok([]);
    if (chemin === `/repos/${DEPOT}`) return ok({ owner: { login: "chef", type: "User" } });
    return { status: 404, data: { message: "Not Found" } };
  };
  const ecrire = ecritureParCapacitor(async ({ url, data }: DemandeNative) => {
    postes.push({ adresse: url, corps: data });
    return { status: 201, data: { html_url: `${url.replace(API_GITHUB, "https://github.com").replace("/repos", "")}#issuecomment-1` } };
  });
  return { lire, ecrire, postes };
}

function telephone(monde: ReturnType<typeof github>) {
  const bandes: Bande[] = [];
  const lecture = ouvrirLaLectureGitHub({
    jeton: async () => "gho_du_coffre",
    envoyer: monde.lire,
    ecrire: monde.ecrire,
    compte: "chef",
    connus: [{ nom: "parade", depot: DEPOT }],
    garder: () => undefined,
    maintenant: () => new Date(LU),
    planifier: () => () => undefined,
    dire: ((canal: string, ...args: unknown[]) => void (canal === "surAlertes" && bandes.push(args[0] as Bande))) as Parameters<typeof ouvrirLaLectureGitHub>[0]["dire"],
  });
  return { lecture, bandes, derniere: () => bandes.filter(({ projet }) => projet === "parade").at(-1) };
}

describe("la ligne du disjoncteur dit pourquoi, d'après l'issue de la station", () => {
  test("depuis quand, combien d'échecs, quel ticket, quel code de sortie", () => {
    assert.equal(cuisineRetenueParLeDisjoncteur({ numero: 2150, url: null, corps: CORPS }, LU), "open · breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #21, exit code 1)");
  });
  test("un corps qui ne dit rien de lisible : la ligne nomme l'issue, sans rien inventer", () => {
    assert.equal(cuisineRetenueParLeDisjoncteur({ numero: 2150, url: null, corps: null }, LU), "open · breaker OPEN (see issue #2150)");
  });
});

describe("le téléphone lit le disjoncteur ouvert sur GitHub, et la bande de son projet le dit", () => {
  test("l'issue ouverte : l'alerte du disjoncteur, rouge, avec pourquoi et « Resume »", async () => {
    const { lecture, derniere } = telephone(github());
    await lecture.faits(1);
    await lecture.tous(2);
    const alerte = derniere()?.alertes.find(({ appel }) => appel !== undefined && "reprise" in appel);
    assert.ok(alerte !== undefined, `the band carries the breaker line: ${JSON.stringify(derniere())}`);
    assert.equal(alerte.ton, "rouge");
    assert.equal(alerte.releve, "breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #21, exit code 1)");
  });

  test("aucune issue ouverte : pas de ligne du disjoncteur", async () => {
    const { lecture, derniere } = telephone(github({ ouvertes: false }));
    await lecture.faits(1);
    await lecture.tous(2);
    assert.deepEqual(derniere()?.alertes.filter(({ appel }) => appel !== undefined && "reprise" in appel), []);
  });

  test("GitHub refuse la lecture de l'issue : le rail reste lu, aucune ligne n'est inventée", async () => {
    const { lecture, derniere } = telephone(github({ refuse: true }));
    await lecture.faits(1);
    await lecture.tous(2);
    assert.ok(derniere() !== undefined, "the project's band is still said");
    assert.deepEqual(derniere()?.alertes.filter(({ appel }) => appel !== undefined && "reprise" in appel), []);
  });
});

describe("« Resume » sur le téléphone : `/resume` posté sur l'issue du disjoncteur", () => {
  function gestes(monde: ReturnType<typeof github>, depot: string | null = DEPOT) {
    return ouvrirLesGestesGitHub({
      jeton: async () => "gho_du_coffre",
      appeler: clientGitHub({ jeton: async () => "gho_du_coffre", envoyer: monde.lire }),
      envoyer: monde.ecrire,
      depot: () => depot ?? undefined,
      dernier: () => undefined,
      chef: () => undefined,
    });
  }

  test("un seul commentaire, de corps `/resume`, sur l'issue ouverte du dépôt", async () => {
    const monde = github();
    const rendu = await gestes(monde).reprendreLeDisjoncteur("parade");
    assert.deepEqual(monde.postes, [{ adresse: `${API_GITHUB}/repos/${DEPOT}/issues/2150/comments`, corps: { body: "/resume" } }]);
    assert.ok("demandee" in rendu && rendu.demandee.issue === 2150);
  });

  test("aucune issue ouverte : rien n'est posté, le refus le dit", async () => {
    const monde = github({ ouvertes: false });
    const rendu = await gestes(monde).reprendreLeDisjoncteur("parade");
    assert.deepEqual(monde.postes, []);
    assert.ok("refus" in rendu && /no breaker issue is open/.test(rendu.refus));
  });

  test("un projet dont le dépôt n'est pas lu : rien n'est posté, le refus le dit", async () => {
    const monde = github();
    const rendu = await gestes(monde, null).reprendreLeDisjoncteur("parade");
    assert.deepEqual(monde.postes, []);
    assert.ok("refus" in rendu && /has not read which repository/.test(rendu.refus));
  });
});

// --- La vue, à la largeur d'un téléphone ------------------------------------------------------------------------------

const A = "2026-11-06T09:00:00.000Z";
const FAITS = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
  stations: [],
} as unknown as Faits;
const OUVERT = ["kitchen    open · breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #21, exit code 1)", "", "rail       1 queued", ""].join("\n");
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande, texte }] });

function bandeLue(status: string): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  bandes.faits(lecture("facts", JSON.stringify(FAITS)));
  bandes.status(mettreAPart(lecture("status", status)));
  return bandes.manager(lecture("manager", "manager               ALLUMÉ depuis le 2026-11-03T09:25:21.838Z (par chef) — il juge les issues ouvertes\n"));
}

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: DEPOT }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { github: { compte: "chef" } },
});

async function ouvrir(reprendre: (projet: string) => Promise<RenduDeLaReprise | undefined>): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [], reprendreLeDisjoncteur: reprendre } as never, { ecran: new FauxEcran(true) });
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir(lecture("facts", JSON.stringify(FAITS))), demande: demandes.at(-1)?.args[0] as number });
  vue.dire("surAlertes", bandeLue(OUVERT));
  await repos();
  return vue;
}

const cartes = (vue: Jouee) => vue.element("cartes-du-chef");
const ligneDe = (vue: Jouee): Faux | undefined => cartes(vue).dessous("div").find(({ className }) => className === "ligne-disjoncteur");
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");

describe("« Awaiting you » sur le téléphone porte le disjoncteur en tête", () => {
  test("le disjoncteur ouvert : sa ligne en tête de la liste, pourquoi écrit à plat — le téléphone n'a pas de survol —, et « Resume »", async () => {
    const vue = await ouvrir(async () => undefined);
    const ligne = ligneDe(vue) ?? assert.fail("the breaker line is in the phone's list");
    assert.equal(cartes(vue).dessous("div").find(({ className }) => className === "corps-des-cartes")?.children[0], ligne, "la ligne n'est pas en tête de la liste");
    assert.match(ligne.textContent, /breaker open: the latest launches failed in a row/);
    assert.match(ligne.textContent, /breaker OPEN for 2 h 05 \(3 failures in a row, failing ticket #21, exit code 1\)/);
    assert.deepEqual(boutons(ligne).map(({ textContent }) => textContent), [REPRENDRE]);
    // Sans carte, la liste ne dit pas que rien ne t'attend.
    assert.doesNotMatch(cartes(vue).textContent, /Nothing awaits you/);
  });

  test("un clic sur « Resume » : le pont est appelé pour le projet, une seule fois, et la ligne dit la demande", async () => {
    const appels: string[] = [];
    const vue = await ouvrir(async (projet) => (appels.push(projet), { demandee: { issue: 2150, url: null } }));
    (boutons(ligneDe(vue) ?? assert.fail("no line")).find(({ textContent }) => textContent === REPRENDRE) ?? assert.fail("no Resume")).click();
    await repos();
    assert.deepEqual(appels, ["parade"]);
    assert.ok((ligneDe(vue) ?? assert.fail("no line")).dessous("span").some(({ textContent }) => textContent === "Resume requested"));
  });

  test("la station referme le disjoncteur : la lecture suivante ne le dit plus, et la ligne disparaît", async () => {
    const vue = await ouvrir(async () => undefined);
    assert.ok(ligneDe(vue) !== undefined);
    vue.dire("surAlertes", bandeLue(OUVERT.replace("open · breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #21, exit code 1)", "open · breaker closed (0 failures in a row, opens at 3)")));
    await repos();
    assert.equal(ligneDe(vue), undefined);
  });
});

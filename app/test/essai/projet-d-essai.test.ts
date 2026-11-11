// Le projet d'essai du premier lancement (#3227, essai/projet-d-essai.js). D'abord ses morceaux devant un faux document :
// le bouton, l'encart à chaque état, le contrôleur qui mène du bouton au rail et la suppression du seul dépôt noté. Puis
// la vue jouée entière (vue.js tel qu'il est, GitHub doublé derrière un faux pont) : un ordinateur neuf, « try on a sample
// project » cliqué, et le ticket jusqu'à sa PR mergée sans commande tapée ni fichier édité — puis la durée, et la
// suppression en un clic, après laquelle plus rien ne la propose.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjetDEssai, VuDeLEssai } from "../../../runtime/src/essai-projet/projet-d-essai.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationsDuChef } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import {
  boutonDuProjetDEssai,
  ESSAYER,
  ETAPES,
  nomDuProjet,
  OUVRIR_LE_TICKET,
  PERMISSION,
  poserLeProjetDEssai,
  SANS_STATION,
  SERVICE_ILLISIBLE,
  SUPPRIME,
  SUPPRIMER,
  SUR_LE_RAIL,
  tenirLeProjetDEssai,
  TITRE,
} from "../../src/vue/essai/projet-d-essai.js";
import { OUVRIR_CE_PROJET } from "../../src/vue/premier-lancement.js";
import { CLE_DE_LA_VISITE } from "../../src/vue/visite/visite.js";
import { Faux, FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/brigade-sample";
const CREE: ProjetDEssai = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: "2026-11-11T10:01:00.000Z", ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1` };
const SERVI: ProjetDEssai = { ...CREE, servedAt: "2026-11-11T10:08:00Z", pullRequest: `https://github.com/${DEPOT}/pull/2` };
const SUPPRIME_LE: ProjetDEssai = { ...SERVI, deletedAt: "2026-11-11T11:00:00.000Z" };
const PHRASE = "Your first ticket was served in 8 minutes.";
const PRET = { ready: true, missingBindings: false, missingLabels: [] };

const textes = (racine: Faux) => [...racine.descendants()].map(({ textContent }) => textContent);
const boutons = (racines: Faux[]) => racines.flatMap((racine) => racine.dessous("button"));
const libelles = (racines: Faux[]) => boutons(racines).map(({ textContent }) => textContent);
const gestesMorts = { essayer: () => {}, supprimer: () => {}, ouvrirLaPage: () => {} };

describe("les morceaux", () => {
  test("le bouton du premier lancement : « try on a sample project », son survol, éteint pendant une création", () => {
    const appuis: string[] = [];
    const groupe = boutonDuProjetDEssai(doc, {}, { essayer: () => appuis.push("essayer") });
    const [bouton] = groupe.dessous("button");
    assert.equal(bouton?.textContent, ESSAYER);
    assert.match(bouton?.title ?? "", /private repository on your GitHub account, with one ticket/);
    bouton?.click();
    assert.deepEqual(appuis, ["essayer"]);
    assert.equal(boutonDuProjetDEssai(doc, { etape: "creation" }, { essayer: () => {} }).dessous("button")[0]?.disabled, true);
  });

  test("l'encart : rien sans essai ; l'étape en route ; le dépôt et son ticket sur le rail ; la durée une fois servi ; supprimé, plus de suppression", () => {
    assert.deepEqual(poserLeProjetDEssai(doc, {}, gestesMorts), []);
    assert.deepEqual(poserLeProjetDEssai(doc, { vu: {} }, gestesMorts), []);
    const enRoute = poserLeProjetDEssai(doc, { etape: "preparation", vu: { sample: CREE } }, gestesMorts);
    assert.ok(textes(enRoute[0]).includes(ETAPES.preparation));
    assert.deepEqual(libelles(enRoute), [DEPOT], "rien à faire pendant la création, sinon ouvrir le dépôt");

    const surLeRail = poserLeProjetDEssai(doc, { vu: { sample: CREE } }, gestesMorts);
    assert.ok(textes(surLeRail[0]).includes(TITRE));
    assert.ok(textes(surLeRail[0]).includes(SUR_LE_RAIL(1)));
    // Le lien du dépôt créé, puis ses gestes.
    assert.deepEqual(libelles(surLeRail), [DEPOT, OUVRIR_LE_TICKET, SUPPRIMER]);
    const pages: string[] = [];
    boutons(poserLeProjetDEssai(doc, { vu: { sample: CREE } }, { ...gestesMorts, ouvrirLaPage: (url) => pages.push(url) }))[0]?.click();
    assert.deepEqual(pages, [CREE.url]);
    assert.equal(boutons(surLeRail).at(-1)?.title, `Deletes ${DEPOT} from GitHub. This cannot be undone.`);

    const servi = poserLeProjetDEssai(doc, { vu: { sample: SERVI, served: PHRASE } }, gestesMorts);
    assert.ok(textes(servi[0]).includes(PHRASE));
    assert.ok(!textes(servi[0]).includes(SUR_LE_RAIL(1)));
    assert.deepEqual(libelles(servi), [DEPOT, OUVRIR_LE_TICKET, SUPPRIMER]);

    const illisible = poserLeProjetDEssai(doc, { vu: { sample: CREE, lecture: "HTTP 502" } }, gestesMorts);
    assert.ok(textes(illisible[0]).includes(SERVICE_ILLISIBLE));

    const supprimeIci = poserLeProjetDEssai(doc, { vu: { sample: SUPPRIME_LE }, supprimeIci: true }, gestesMorts);
    assert.ok(textes(supprimeIci[0]).includes(SUPPRIME(DEPOT)));
    assert.deepEqual(libelles(supprimeIci), []);
    // Supprimé à un lancement précédent : l'encart ne revient pas.
    assert.deepEqual(poserLeProjetDEssai(doc, { vu: { sample: SUPPRIME_LE } }, gestesMorts), []);
  });

  test("le nom du projet dans l'app : celui du dépôt, comme « open this project » le nomme", () => {
    assert.equal(nomDuProjet("chef/Brigade-Sample-2"), "brigade-sample-2");
  });
});

// Un faux pont qui note chaque geste, et rend ce qu'on lui dicte.
function unPont(dicte: { cree?: unknown; constat?: unknown; servi?: unknown; vu?: () => VuDeLEssai; suppressions?: unknown[]; permission?: unknown } = {}) {
  const appels: Array<[string, ...unknown[]]> = [];
  const suppressions = [...(dicte.suppressions ?? [{ supprime: SUPPRIME_LE }])];
  const pont = {
    projetDEssai: async () => (appels.push(["projetDEssai"]), dicte.vu?.() ?? { sample: CREE }),
    creerLeProjetDEssai: async () => (appels.push(["creerLeProjetDEssai"]), (dicte.cree ?? { sample: CREE }) as never),
    runRepoSetup: async (depot: string) => (appels.push(["runRepoSetup", depot]), (dicte.constat ?? PRET) as never),
    servirUnProjet: async (depot: string, servi: boolean) => (appels.push(["servirUnProjet", depot, servi]), ("servi" in dicte ? dicte.servi : { depots: [depot] }) as never),
    supprimerLeProjetDEssai: async (depot: string) => (appels.push(["supprimerLeProjetDEssai", depot]), suppressions.shift() as never),
    demanderLaPermissionDeSuppression: async () => (appels.push(["demanderLaPermissionDeSuppression"]), (dicte.permission ?? { code: "ABCD-1234", page: "https://github.com/login/device" }) as never),
  };
  return { pont, appels };
}

describe("le contrôleur", () => {
  test("du bouton au rail : la création, la mise en place, la station de cet ordinateur, l'ouverture de l'espace — chaque étape dite", async () => {
    const { pont, appels } = unPont();
    const etapes: unknown[] = [];
    const ouverts: unknown[] = [];
    const essai = tenirLeProjetDEssai({ pont, rendre: () => etapes.push(essai.etat.etape), ouvrir: async (...args) => void ouverts.push(args) });
    await essai.essayer();
    assert.deepEqual(appels, [["creerLeProjetDEssai"], ["runRepoSetup", DEPOT], ["servirUnProjet", DEPOT, true], ["projetDEssai"]]);
    assert.deepEqual(ouverts, [["brigade-sample", DEPOT, "main"]]);
    assert.deepEqual([...new Set(etapes)], ["creation", "preparation", "service", "ouverture", undefined]);
    assert.equal(essai.etat.echec, undefined);
    assert.equal(essai.aSuivre(), true);
  });

  test("ce qui arrête la création se dit en une phrase, avec « Try again » ; rien ne part au-delà", async () => {
    for (const [dicte, raison, jusqua] of [
      [{ cree: { refus: "GitHub refused to create the sample repository (HTTP 403)." } }, "GitHub refused to create the sample repository (HTTP 403).", "creerLeProjetDEssai"],
      [{ constat: { ready: false, missingBindings: false, missingLabels: ["fire"] } }, `${DEPOT} is not set up for brigade: its labels are missing.`, "runRepoSetup"],
      [{ servi: undefined }, SANS_STATION, "servirUnProjet"],
      [{ servi: { refus: "the station's list cannot be written" } }, SANS_STATION, "servirUnProjet"],
    ] as const) {
      const { pont, appels } = unPont(dicte);
      const ouverts: unknown[] = [];
      const essai = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async (...args) => void ouverts.push(args) });
      await essai.essayer();
      assert.equal(essai.etat.echec?.raison, raison);
      assert.equal(essai.etat.etape, undefined);
      assert.equal(appels.at(-1)?.[0], jusqua);
      assert.deepEqual(ouverts, []);
      assert.ok(libelles(poserLeProjetDEssai(doc, essai.etat, gestesMorts)).includes("Try again"));
    }
  });

  test("supprimer vise le dépôt noté ; sans la permission, le code à taper, puis, accordée, la suppression repart d'elle-même", async () => {
    const { pont, appels } = unPont({ suppressions: [{ permission: "delete_repo" }, { supprime: SUPPRIME_LE }] });
    const essai = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {} });
    await essai.lire();
    await essai.supprimer();
    assert.deepEqual(appels.slice(1), [["supprimerLeProjetDEssai", DEPOT], ["demanderLaPermissionDeSuppression"]]);
    const enAttente = poserLeProjetDEssai(doc, essai.etat, gestesMorts);
    assert.ok(textes(enAttente[0]).includes(PERMISSION));
    assert.ok(textes(enAttente[0]).includes("Type the code ABCD-1234 on the GitHub page that opened in your browser."));
    assert.equal(boutons(enAttente).find(({ textContent }) => textContent === SUPPRIMER)?.disabled, true);
    await essai.apresLaPermission({ connecte: true });
    assert.deepEqual(appels.slice(3), [["supprimerLeProjetDEssai", DEPOT]]);
    assert.equal(essai.etat.vu?.sample?.deletedAt, SUPPRIME_LE.deletedAt);
    assert.deepEqual(libelles(poserLeProjetDEssai(doc, essai.etat, gestesMorts)), []);
    // Supprimé : plus rien à suivre, plus rien à supprimer.
    assert.equal(essai.aSuivre(), false);
    await essai.supprimer();
    assert.equal(appels.length, 4);
  });

  test("la permission refusée, ou la suppression refusée par le runtime : une ligne, le dépôt reste", async () => {
    const refusee = unPont({ suppressions: [{ permission: "delete_repo" }] });
    const essai = tenirLeProjetDEssai({ pont: refusee.pont, rendre: () => {}, ouvrir: async () => {} });
    await essai.lire();
    await essai.supprimer();
    await essai.apresLaPermission({ refus: "GitHub sign-in was cancelled." });
    assert.equal(essai.etat.suppression?.refus, "GitHub sign-in was cancelled.");
    assert.equal(essai.etat.vu?.sample?.deletedAt, undefined);
    const autre = unPont({ suppressions: [{ refus: `Brigade only deletes the sample repository it created, ${DEPOT}.` }] });
    const second = tenirLeProjetDEssai({ pont: autre.pont, rendre: () => {}, ouvrir: async () => {} });
    await second.lire();
    await second.supprimer();
    assert.ok(textes(poserLeProjetDEssai(doc, second.etat, gestesMorts)[0]).some((texte) => texte.includes("only deletes the sample repository")));
  });
});

// La vue jouée entière, sur un ordinateur neuf. La visite de benomite/brigade est déjà passée : seul le projet d'essai s'ouvre.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const AUCUNE: StationsDuChef = { state: "listed", unreadable: [], stations: [] };

describe("la vue jouée", () => {
  test("ordinateur neuf : « try on a sample project » à côté de « open this project », puis le ticket jusqu'à sa PR mergée sans rien taper, la durée dite, et la suppression en un clic", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DE_LA_VISITE, "passed");
    // GitHub, doublé : le dépôt créé, puis la PR du ticket mergée par la cuisine — rien de plus ne vient du chef.
    let github: VuDeLEssai = {};
    const vue = await jouerLaVue(
      {
        demarrage,
        stationsDuChef: () => AUCUNE,
        compteGitHub: () => ({ login: "chef" }),
        projetDEssai: () => github,
        creerLeProjetDEssai: () => ((github = { sample: CREE }), { sample: CREE }),
        runRepoSetup: () => PRET,
        servirUnProjet: (depot) => ({ depots: [depot] }),
        ouvrirDUneStation: (nom, depot) => ({ state: "open", project: nom, repository: depot, folder: "/home/chef/.local/share/brigade/projects/brigade-sample", cloned: true }),
        supprimerLeProjetDEssai: () => ((github = { sample: SUPPRIME_LE }), { supprime: SUPPRIME_LE }),
        espace: () => [],
      },
      { stockage },
    );
    await repos();
    const encart = vue.element("projet-d-essai");
    assert.equal(encart.hidden, true, "rien n'est encore essayé");
    const premier = vue.element("tous");
    const gestesDuFormulaire = premier.dessous("button").map(({ textContent }) => textContent);
    const ouvrir = gestesDuFormulaire.indexOf(OUVRIR_CE_PROJET);
    assert.ok(ouvrir >= 0 && gestesDuFormulaire[ouvrir + 1] === ESSAYER, gestesDuFormulaire.join(", "));

    (premier.dessous("button").find(({ textContent }) => textContent === ESSAYER) ?? assert.fail("pas de bouton d'essai")).click();
    for (let tour = 0; tour < 6; tour++) await repos();
    // Du bouton au rail, par les gestes de l'app seuls.
    assert.deepEqual(
      vue.appels.filter(({ geste }) => ["creerLeProjetDEssai", "runRepoSetup", "servirUnProjet", "ouvrirDUneStation"].includes(geste)).map(({ geste, args }) => [geste, ...args]),
      [["creerLeProjetDEssai"], ["runRepoSetup", DEPOT], ["servirUnProjet", DEPOT, true], ["ouvrirDUneStation", "brigade-sample", DEPOT, "main"]],
    );
    assert.equal(encart.hidden, false);
    assert.ok(encart.descendants().some(({ textContent }) => textContent === SUR_LE_RAIL(1)), textes(encart).join(" | "));
    assert.ok(encart.dessous("button").some(({ textContent, title }) => textContent === DEPOT && title === CREE.url), "le lien du dépôt");

    // La cuisine sert le ticket : sa PR est mergée sur GitHub ; la relecture de la minute le voit.
    github = { sample: SERVI, served: PHRASE };
    t.mock.timers.tick(60_000);
    for (let tour = 0; tour < 3; tour++) await repos();
    assert.ok(encart.descendants().some(({ textContent }) => textContent === PHRASE), textes(encart).join(" | "));

    const supprimer = encart.dessous("button").find(({ textContent }) => textContent === SUPPRIMER) ?? assert.fail("pas de suppression");
    supprimer.click();
    for (let tour = 0; tour < 3; tour++) await repos();
    assert.deepEqual(vue.dernier("supprimerLeProjetDEssai"), [DEPOT]);
    assert.ok(encart.descendants().some(({ textContent }) => textContent === SUPPRIME(DEPOT)));
    assert.equal(encart.dessous("button").some(({ textContent }) => textContent === SUPPRIMER), false, "plus de suppression proposée");
    // Supprimé : GitHub n'est plus relu.
    const lectures = vue.appels.filter(({ geste }) => geste === "projetDEssai").length;
    t.mock.timers.tick(60_000);
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "projetDEssai").length, lectures);
  });
});

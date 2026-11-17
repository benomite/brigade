// Le projet de démo du premier lancement (#3734, demo/demo.js ; né projet d'essai, #3227). D'abord ses morceaux devant un
// faux document : le bouton, l'encart à chaque état, le contrôleur qui mène du bouton au rail, la suppression confirmée du
// seul dépôt noté et le retrait du projet de l'app. Puis la vue jouée entière (vue.js tel qu'il est, GitHub doublé derrière
// un faux pont) : un ordinateur neuf, « try on a demo project » cliqué, et ses tickets jusqu'à une PR mergée sans commande
// tapée ni fichier édité — puis la durée, « add my own project », et « delete demo project », confirmé en nommant le dépôt,
// après quoi plus rien ne la propose.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjetDEssai, VuDeLEssai } from "../../runtime/src/demo/projet-de-demo.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { StationsDuChef } from "../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import {
  AJOUTER_LE_MIEN,
  ANNULER,
  boutonDuProjetDEssai,
  CONFIRMER,
  ESSAYER,
  ETAPES,
  nomDuProjet,
  OUI_SUPPRIMER,
  OUVRIR_LES_TICKETS,
  PERMISSION,
  poserLeProjetDEssai,
  RESTE_DANS_L_APP,
  SANS_STATION,
  SERVICE_ILLISIBLE,
  SUPPRIME,
  SUPPRIMER,
  SUR_LE_RAIL,
  tenirLeProjetDEssai,
  TITRE,
} from "../src/vue/demo/demo.js";
import { pagesDeLaDemo } from "../src/vue/demo/pages.ts";
import { ROUVRIR_LA_PAGE } from "../src/vue/parcours-projet/connexion.js";
import { OUVRIR_CE_PROJET } from "../src/vue/premier-lancement.js";
import { CLE_DE_LA_VISITE } from "../src/vue/visite/visite.js";
import { Faux, FauxStockage, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/brigade-demo";
const CREE: ProjetDEssai = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: "2026-11-11T10:01:00.000Z", ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1`, tickets: [1, 2, 3] };
const SERVI: ProjetDEssai = { ...CREE, servedAt: "2026-11-11T10:08:00Z", pullRequest: `https://github.com/${DEPOT}/pull/2` };
const SUPPRIME_LE: ProjetDEssai = { ...SERVI, deletedAt: "2026-11-11T11:00:00.000Z" };
const PHRASE = "Your first ticket was served in 8 minutes.";
const PRET = { ready: true, missingBindings: false, missingLabels: [] };

const textes = (racine: Faux) => [...racine.descendants()].map(({ textContent }) => textContent);
const boutons = (racines: Faux[]) => racines.flatMap((racine) => racine.dessous("button"));
const libelles = (racines: Faux[]) => boutons(racines).map(({ textContent }) => textContent);
const gestesMorts = { essayer: () => {}, demanderLaSuppression: () => {}, annulerLaSuppression: () => {}, supprimer: () => {}, ouvrirLaPage: () => {}, ajouterLeMien: () => {} };

describe("les morceaux", () => {
  test("le bouton du premier lancement : « try on a demo project », son survol, éteint pendant une création", () => {
    const appuis: string[] = [];
    const groupe = boutonDuProjetDEssai(doc, {}, { essayer: () => appuis.push("essayer") });
    const [bouton] = groupe.dessous("button");
    assert.equal(bouton?.textContent, ESSAYER);
    assert.match(bouton?.title ?? "", /private repository on your GitHub account, with three tickets ready to cook/);
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
    assert.ok(textes(surLeRail[0]).includes("Its tickets #1, #2 and #3 are on the rail: a cook takes one, then the pass merges it."));
    // Le lien du dépôt créé, puis ses gestes.
    assert.deepEqual(libelles(surLeRail), [DEPOT, OUVRIR_LES_TICKETS, AJOUTER_LE_MIEN, SUPPRIMER]);
    const pages: string[] = [];
    boutons(poserLeProjetDEssai(doc, { vu: { sample: CREE } }, { ...gestesMorts, ouvrirLaPage: (url) => pages.push(url) }))[0]?.click();
    assert.deepEqual(pages, [CREE.url]);
    assert.equal(boutons(surLeRail).at(-1)?.title, `Deletes ${DEPOT} from GitHub and removes the demo project from the app. This cannot be undone.`);

    const servi = poserLeProjetDEssai(doc, { vu: { sample: SERVI, served: PHRASE } }, gestesMorts);
    assert.ok(textes(servi[0]).includes(PHRASE));
    assert.ok(!textes(servi[0]).includes(SUR_LE_RAIL([1, 2, 3])));
    assert.deepEqual(libelles(servi), [DEPOT, OUVRIR_LES_TICKETS, AJOUTER_LE_MIEN, SUPPRIMER]);

    const illisible = poserLeProjetDEssai(doc, { vu: { sample: CREE, lecture: "HTTP 502" } }, gestesMorts);
    assert.ok(textes(illisible[0]).includes(SERVICE_ILLISIBLE));

    const supprimeIci = poserLeProjetDEssai(doc, { vu: { sample: SUPPRIME_LE }, supprimeIci: true }, gestesMorts);
    assert.ok(textes(supprimeIci[0]).includes(SUPPRIME(DEPOT)));
    assert.deepEqual(libelles(supprimeIci), [AJOUTER_LE_MIEN]);
    // Supprimé à un lancement précédent : l'encart ne revient pas.
    assert.deepEqual(poserLeProjetDEssai(doc, { vu: { sample: SUPPRIME_LE } }, gestesMorts), []);
  });

  test("le nom du projet dans l'app : celui du dépôt, comme « open this project » le nomme", () => {
    assert.equal(nomDuProjet("chef/Brigade-Demo-2"), "brigade-demo-2");
  });
});

// Un faux pont qui note chaque geste, et rend ce qu'on lui dicte.
function unPont(dicte: { cree?: unknown; constat?: unknown; servi?: unknown; vu?: () => VuDeLEssai; suppressions?: unknown[]; permission?: unknown; retrait?: unknown } = {}) {
  const appels: Array<[string, ...unknown[]]> = [];
  const suppressions = [...(dicte.suppressions ?? [{ supprime: SUPPRIME_LE }])];
  const pont = {
    projetDEssai: async () => (appels.push(["projetDEssai"]), dicte.vu?.() ?? { sample: CREE }),
    creerLeProjetDEssai: async () => (appels.push(["creerLeProjetDEssai"]), (dicte.cree ?? { sample: CREE }) as never),
    runRepoSetup: async (depot: string) => (appels.push(["runRepoSetup", depot]), (dicte.constat ?? PRET) as never),
    servirUnProjet: async (depot: string, servi: boolean) => (appels.push(["servirUnProjet", depot, servi]), ("servi" in dicte ? dicte.servi : { depots: [depot] }) as never),
    supprimerLeProjetDEssai: async (depot: string) => (appels.push(["supprimerLeProjetDEssai", depot]), suppressions.shift() as never),
    retirerDeLApp: async (projet: string) => (appels.push(["retirerDeLApp", projet]), (dicte.retrait ?? { avis: { titre: "removed", lignes: [] } }) as never),
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
    assert.deepEqual(ouverts, [["brigade-demo", DEPOT, "main"]]);
    assert.deepEqual([...new Set(etapes)], ["creation", "preparation", "service", "ouverture", undefined]);
    assert.equal(essai.etat.echec, undefined);
    assert.equal(essai.aSuivre(), true);
  });

  test("ce qui arrête la création se dit en une phrase, avec « Try again » ; rien ne part au-delà", async () => {
    for (const [dicte, raison, jusqua] of [
      [{ cree: { refus: "GitHub refused to create the demo repository (HTTP 403)." } }, "GitHub refused to create the demo repository (HTTP 403).", "creerLeProjetDEssai"],
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
    assert.deepEqual(appels.slice(3, 4), [["supprimerLeProjetDEssai", DEPOT]]);
    assert.equal(essai.etat.vu?.sample?.deletedAt, SUPPRIME_LE.deletedAt);
    assert.deepEqual(libelles(poserLeProjetDEssai(doc, essai.etat, gestesMorts)), [AJOUTER_LE_MIEN]);
    // Supprimé : plus rien à suivre, plus rien à supprimer.
    assert.equal(essai.aSuivre(), false);
    const faits = appels.length;
    await essai.supprimer();
    assert.equal(appels.length, faits);
  });

  test("la permission refusée, ou la suppression refusée par le runtime : une ligne, le dépôt reste", async () => {
    const refusee = unPont({ suppressions: [{ permission: "delete_repo" }] });
    const essai = tenirLeProjetDEssai({ pont: refusee.pont, rendre: () => {}, ouvrir: async () => {} });
    await essai.lire();
    await essai.supprimer();
    await essai.apresLaPermission({ refus: "GitHub sign-in was cancelled." });
    assert.equal(essai.etat.suppression?.refus, "GitHub sign-in was cancelled.");
    assert.equal(essai.etat.vu?.sample?.deletedAt, undefined);
    const autre = unPont({ suppressions: [{ refus: `Brigade only deletes the demo repository it created, ${DEPOT}.` }] });
    const second = tenirLeProjetDEssai({ pont: autre.pont, rendre: () => {}, ouvrir: async () => {} });
    await second.lire();
    await second.supprimer();
    assert.ok(textes(poserLeProjetDEssai(doc, second.etat, gestesMorts)[0]).some((texte) => texte.includes("only deletes the demo repository")));
  });
});

describe("supprimer la démo", () => {
  test("« delete demo project » ne supprime rien : il pose la question qui nomme le dépôt ; « Cancel » la retire", async () => {
    const { pont, appels } = unPont();
    const demo = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {} });
    await demo.lire();
    const appuis: string[] = [];
    const gestesNotes = { ...gestesMorts, demanderLaSuppression: () => appuis.push("demander") };
    boutons(poserLeProjetDEssai(doc, demo.etat, gestesNotes)).find(({ textContent }) => textContent === SUPPRIMER)?.click();
    assert.deepEqual(appuis, ["demander"]);
    demo.demanderLaSuppression();
    assert.deepEqual(appels.slice(1), [], "rien ne part avant la confirmation");
    const question = poserLeProjetDEssai(doc, demo.etat, gestesMorts);
    assert.ok(textes(question[0]).includes(CONFIRMER(DEPOT)));
    assert.match(CONFIRMER(DEPOT), new RegExp(`repository ${DEPOT} from GitHub`));
    assert.deepEqual(libelles(question), [DEPOT, OUI_SUPPRIMER(DEPOT), ANNULER]);
    assert.equal(OUI_SUPPRIMER(DEPOT), `Yes, delete ${DEPOT}`);
    demo.annulerLaSuppression();
    assert.deepEqual(libelles(poserLeProjetDEssai(doc, demo.etat, gestesMorts)), [DEPOT, OUVRIR_LES_TICKETS, AJOUTER_LE_MIEN, SUPPRIMER]);
    assert.deepEqual(appels.slice(1), []);
  });

  test("confirmé : le dépôt noté est supprimé, puis le projet quitte la station de cet ordinateur et l'app", async () => {
    const { pont, appels } = unPont();
    const demo = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {}, projetsDeLApp: () => [{ nom: "brigade" }, { nom: "brigade-demo" }] });
    await demo.lire();
    demo.demanderLaSuppression();
    await demo.supprimer();
    assert.deepEqual(appels.slice(1), [["supprimerLeProjetDEssai", DEPOT], ["servirUnProjet", DEPOT, false], ["retirerDeLApp", "brigade-demo"]]);
    assert.equal(demo.etat.confirmation, undefined);
    assert.equal(demo.etat.retrait, undefined);
    const fini = poserLeProjetDEssai(doc, demo.etat, gestesMorts);
    assert.ok(textes(fini[0]).includes(SUPPRIME(DEPOT)));
    assert.deepEqual(libelles(fini), [AJOUTER_LE_MIEN]);
  });

  test("le projet déjà hors de l'app : rien à retirer ; un retrait refusé se dit en une ligne, le dépôt reste dit supprimé", async () => {
    const absent = unPont();
    const sans = tenirLeProjetDEssai({ pont: absent.pont, rendre: () => {}, ouvrir: async () => {} });
    await sans.lire();
    await sans.supprimer();
    assert.deepEqual(absent.appels.slice(1), [["supprimerLeProjetDEssai", DEPOT], ["servirUnProjet", DEPOT, false]]);

    const refuse = unPont({ retrait: { refus: "Not removed — the projects file cannot be written" } });
    const demo = tenirLeProjetDEssai({ pont: refuse.pont, rendre: () => {}, ouvrir: async () => {}, projetsDeLApp: () => [{ nom: "brigade-demo" }] });
    await demo.lire();
    await demo.supprimer();
    assert.deepEqual(demo.etat.retrait, { refus: "Not removed — the projects file cannot be written" });
    const dit = poserLeProjetDEssai(doc, demo.etat, gestesMorts);
    assert.ok(textes(dit[0]).includes(SUPPRIME(DEPOT)));
    assert.ok(textes(dit[0]).some((texte) => texte.includes(RESTE_DANS_L_APP)), textes(dit[0]).join(" | "));

    const station = unPont({ servi: { refus: "the station's list cannot be written" } });
    const autre = tenirLeProjetDEssai({ pont: station.pont, rendre: () => {}, ouvrir: async () => {}, projetsDeLApp: () => [{ nom: "brigade-demo" }] });
    await autre.lire();
    await autre.supprimer();
    assert.deepEqual(autre.etat.retrait, { refus: "the station's list cannot be written" });
    assert.equal(station.appels.some(([geste]) => geste === "retirerDeLApp"), false, "l'app ne le retire pas tant que sa station le sert");
  });

  test("le runtime refuse la suppression : rien n'est retiré de l'app", async () => {
    const { pont, appels } = unPont({ suppressions: [{ refus: `Brigade only deletes the demo repository it created, ${DEPOT}.` }] });
    const demo = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {}, projetsDeLApp: () => [{ nom: "brigade-demo" }] });
    await demo.lire();
    await demo.supprimer();
    assert.deepEqual(appels.slice(1), [["supprimerLeProjetDEssai", DEPOT]]);
    assert.equal(demo.etat.vu?.sample?.deletedAt, undefined);
  });
});

// La vue jouée entière, sur un ordinateur neuf. La visite de benomite/brigade est déjà passée : seule la démo s'ouvre.
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
  test("ordinateur neuf : « try on a demo project » à côté de « open this project », puis ses tickets jusqu'à une PR mergée sans rien taper, la durée dite, et « delete demo project » confirmé en nommant le dépôt", async (t) => {
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
        ouvrirDUneStation: (nom, depot) => ({ state: "open", project: nom, repository: depot, folder: "/home/chef/.local/share/brigade/projects/brigade-demo", cloned: true }),
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
      [["creerLeProjetDEssai"], ["runRepoSetup", DEPOT], ["servirUnProjet", DEPOT, true], ["ouvrirDUneStation", "brigade-demo", DEPOT, "main"]],
    );
    assert.equal(encart.hidden, false);
    assert.ok(encart.descendants().some(({ textContent }) => textContent === SUR_LE_RAIL([1, 2, 3])), textes(encart).join(" | "));
    assert.ok(encart.dessous("button").some(({ textContent, title }) => textContent === DEPOT && title === CREE.url), "le lien du dépôt");

    // La cuisine sert le ticket : sa PR est mergée sur GitHub ; la relecture de la minute le voit.
    github = { sample: SERVI, served: PHRASE };
    t.mock.timers.tick(60_000);
    for (let tour = 0; tour < 3; tour++) await repos();
    assert.ok(encart.descendants().some(({ textContent }) => textContent === PHRASE), textes(encart).join(" | "));

    const supprimer = encart.dessous("button").find(({ textContent }) => textContent === SUPPRIMER) ?? assert.fail("pas de suppression");
    supprimer.click();
    await repos();
    // Un clic ne supprime rien : la question nomme le dépôt.
    assert.equal(vue.appels.some(({ geste }) => geste === "supprimerLeProjetDEssai"), false);
    assert.ok(encart.descendants().some(({ textContent }) => textContent === CONFIRMER(DEPOT)), textes(encart).join(" | "));
    (encart.dessous("button").find(({ textContent }) => textContent === OUI_SUPPRIMER(DEPOT)) ?? assert.fail("pas de confirmation")).click();
    for (let tour = 0; tour < 3; tour++) await repos();
    assert.deepEqual(vue.dernier("supprimerLeProjetDEssai"), [DEPOT]);
    // Supprimé : la station de cet ordinateur ne le sert plus.
    assert.deepEqual(vue.dernier("servirUnProjet"), [DEPOT, false]);
    assert.ok(encart.descendants().some(({ textContent }) => textContent === SUPPRIME(DEPOT)));
    assert.equal(encart.dessous("button").some(({ textContent }) => textContent === SUPPRIMER), false, "plus de suppression proposée");
    // Supprimé : GitHub n'est plus relu.
    const lectures = vue.appels.filter(({ geste }) => geste === "projetDEssai").length;
    t.mock.timers.tick(60_000);
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "projetDEssai").length, lectures);
  });

  test("« add my own project », sur l'encart de la démo, ouvre l'écran « Add a project » : le parcours qui existe", async () => {
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DE_LA_VISITE, "passed");
    const vue = await jouerLaVue(
      {
        demarrage,
        stationsDuChef: () => AUCUNE,
        compteGitHub: () => ({ login: "chef" }),
        projetDEssai: () => ({ sample: CREE }),
        depotsDuChef: () => ({ depots: [] }),
        espace: () => [],
      },
      { stockage },
    );
    await repos();
    const encart = vue.element("projet-d-essai");
    assert.equal(encart.hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    (encart.dessous("button").find(({ textContent }) => textContent === AJOUTER_LE_MIEN) ?? assert.fail("pas de « add my own project »")).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false, "l'écran « Add a project » est montré");
    assert.ok(vue.appels.some(({ geste }) => geste === "depotsDuChef"), "ses dépôts sont lus, comme depuis « + »");
  });
});

// Chaque état à la lettre : le geste recommandé de l'encart, le détail d'un refus quand il en a un — et aucun quand il n'en
// a pas —, la suppression qui ne part qu'une fois, le projet retiré de l'app à son nom seul, les pages qu'on peut ouvrir.
const recommandes = (racines: Faux[]) => boutons(racines).filter(({ className }) => className === "recommande").map(({ textContent }) => textContent);

describe("chaque état à la lettre", () => {
  test("le geste recommandé : les tickets tant que rien n'est servi, « add my own project » une fois servi ou supprimé, « Try again » après un échec", () => {
    assert.deepEqual(recommandes(poserLeProjetDEssai(doc, { vu: { sample: CREE } }, gestesMorts)), [OUVRIR_LES_TICKETS]);
    assert.deepEqual(recommandes(poserLeProjetDEssai(doc, { vu: { sample: SERVI, served: PHRASE } }, gestesMorts)), [AJOUTER_LE_MIEN]);
    assert.deepEqual(recommandes(poserLeProjetDEssai(doc, { vu: { sample: SUPPRIME_LE }, supprimeIci: true }, gestesMorts)), [AJOUTER_LE_MIEN]);
    assert.deepEqual(recommandes(poserLeProjetDEssai(doc, { echec: { raison: SANS_STATION } }, gestesMorts)), ["Try again"]);
  });

  test("les tickets dits sur le rail : la liste notée, sinon le seul ticket d'un projet d'essai d'avant la démo", () => {
    const { tickets: _, ...unSeul } = CREE;
    assert.ok(textes(poserLeProjetDEssai(doc, { vu: { sample: unSeul } }, gestesMorts)[0]).includes(SUR_LE_RAIL([1])));
    assert.notEqual(SUR_LE_RAIL([1]), SUR_LE_RAIL([]));
  });

  test("un arrêt dit son détail quand il en a un, et aucun quand il n'en a pas", async () => {
    const station = tenirLeProjetDEssai({ pont: unPont({ servi: { refus: "the station's list cannot be written" } }).pont, rendre: () => {}, ouvrir: async () => {} });
    await station.essayer();
    assert.deepEqual(station.etat.echec, { raison: SANS_STATION, detail: "the station's list cannot be written" });
    const github = tenirLeProjetDEssai({ pont: unPont({ cree: { refus: "GitHub refused." } }).pont, rendre: () => {}, ouvrir: async () => {} });
    await github.essayer();
    assert.deepEqual(github.etat.echec, { raison: "GitHub refused." });
  });

  test("la permission de supprimer : son refus garde son détail, ou n'en a aucun ; le code sans page n'offre pas de la rouvrir", async () => {
    for (const permission of [{ refus: "GitHub sign-in failed.", detail: "gh exited with 1" }, { refus: "GitHub sign-in failed." }]) {
      const demo = tenirLeProjetDEssai({ pont: unPont({ suppressions: [{ permission: "delete_repo" }], permission }).pont, rendre: () => {}, ouvrir: async () => {} });
      await demo.lire();
      await demo.supprimer();
      assert.deepEqual(demo.etat.suppression, permission);
    }
    for (const fin of [{ refus: "GitHub sign-in was cancelled.", detail: "closed" }, { refus: "GitHub sign-in was cancelled." }]) {
      const demo = tenirLeProjetDEssai({ pont: unPont({ suppressions: [{ permission: "delete_repo" }] }).pont, rendre: () => {}, ouvrir: async () => {} });
      await demo.lire();
      await demo.supprimer();
      assert.ok(libelles(poserLeProjetDEssai(doc, demo.etat, gestesMorts)).includes(ROUVRIR_LA_PAGE));
      await demo.apresLaPermission(fin);
      assert.deepEqual(demo.etat.suppression, fin);
    }
    const sansPage = tenirLeProjetDEssai({ pont: unPont({ suppressions: [{ permission: "delete_repo" }], permission: { code: "ABCD-1234" } }).pont, rendre: () => {}, ouvrir: async () => {} });
    await sansPage.lire();
    await sansPage.supprimer();
    assert.deepEqual(sansPage.etat.suppression, { code: "ABCD-1234", page: undefined });
    assert.ok(!libelles(poserLeProjetDEssai(doc, sansPage.etat, gestesMorts)).includes(ROUVRIR_LA_PAGE));
  });

  test("une suppression en route ne part qu'une fois : un second clic, ou une nouvelle question, n'y fait rien", async () => {
    // Chaque appel attend sa réponse ; toutes rendues à la fin, pour qu'un second appel ne reste jamais en suspens.
    const finirs: Array<(fait: unknown) => void> = [];
    const { pont, appels } = unPont();
    pont.supprimerLeProjetDEssai = (depot: string) => (appels.push(["supprimerLeProjetDEssai", depot]), new Promise((fin) => void finirs.push(fin)) as never);
    const eteints: unknown[] = [];
    const demo = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {} });
    await demo.lire();
    const enRoute = demo.supprimer();
    eteints.push(boutons(poserLeProjetDEssai(doc, demo.etat, gestesMorts)).find(({ textContent }) => textContent === SUPPRIMER)?.disabled);
    const second = demo.supprimer();
    demo.demanderLaSuppression();
    assert.equal(demo.etat.confirmation, undefined);
    for (const finir of finirs) finir({ supprime: SUPPRIME_LE });
    await Promise.all([enRoute, second]);
    assert.deepEqual(eteints, [true]);
    assert.equal(appels.filter(([geste]) => geste === "supprimerLeProjetDEssai").length, 1);
  });

  test("le projet ne quitte l'app qu'à son nom : un autre projet du visiteur n'est jamais retiré", async () => {
    const { pont, appels } = unPont();
    const demo = tenirLeProjetDEssai({ pont, rendre: () => {}, ouvrir: async () => {}, projetsDeLApp: () => [{ nom: "brigade" }] });
    await demo.lire();
    await demo.supprimer();
    assert.deepEqual(appels.slice(1), [["supprimerLeProjetDEssai", DEPOT], ["servirUnProjet", DEPOT, false]]);
  });

  test("les pages qu'on peut ouvrir depuis l'écran : le dépôt, ses tickets, le ticket et la PR qu'il a — aucune sans projet", () => {
    assert.deepEqual(pagesDeLaDemo(undefined), []);
    assert.deepEqual(pagesDeLaDemo({ url: CREE.url }), [CREE.url, `${CREE.url}/issues`]);
    assert.deepEqual(pagesDeLaDemo(SERVI), [CREE.url, `${CREE.url}/issues`, CREE.ticketUrl, SERVI.pullRequest]);
    assert.deepEqual(pagesDeLaDemo({ ...SERVI, pullRequest: "" }), [CREE.url, `${CREE.url}/issues`, CREE.ticketUrl]);
  });
});

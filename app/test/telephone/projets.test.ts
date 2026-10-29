// Les projets de la station appairée sur le téléphone, et la file de chacun (#1414). Le pont de l'app Android lit le
// guichet de la station — `GET /projects`, puis `GET /projects/<nom>/queue` de chacun (runtime/src/telephone/guichet.ts)
// — par sa lecture (app/android/web/lecture.ts), qui en fait ce que le process principal du desktop fait de ses
// veilles : les mêmes modules, les mêmes envois à la vue. Ici, cette lecture est jouée telle quelle derrière la vue,
// jouée telle quelle aussi (aides/fausse-vue.ts) ; seul le guichet est un faux, qui rend ce que le vrai rend. Trois
// états : la liste lue, une station sans projet, une station qui ne se joint pas — chacun dit en une phrase, jamais un
// écran vide. Que le pont charge cette lecture dans la WebView est éprouvé à part (packaging/android.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import { INTERVALLE_MS, ouvrirLaLecture, type ProjetDuGuichet, type Reponse } from "../../android/web/lecture.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import type { Lecture } from "../../src/box.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { FauxEcran, FauxStockage, type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T08:04:12.000Z";
const STATION = "atelier";
const ADRESSE = "http://192.168.1.20:7010";
const TAILNET = "https://box.tail1234.ts.net";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

type Station = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<Station> = {}): Station => ({ station: nom, distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [], ...plus });
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "atelier/claude" };
// `parade` : #12 attend la décision du chef, #21 est sur le rail, #14 cuit, #9 est servi. `cantine` : rien ne s'y passe.
const PARADE: Faits = {
  etat: "ouverte",
  lu: "2026-10-23T08:04:11.000Z",
  dernierTick: "2026-10-23T08:04:02.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: issue(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null },
    { ticket: 9, etat: "servi", titre: "Le relevé des mesures", url: issue(9), activite: null },
  ],
  cooks: [COOK_14],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  stations: [station("atelier/claude", { cooks: [COOK_14] })],
};
const CANTINE: Faits = { ...PARADE, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [], cooks: [], attend: [], stations: [station("atelier/claude")] };
// Ce que `status` écrit, son bloc `attend` compris.
const STATUS = "état : cuisine ouverte\nattend\n  #12 Validation SIRET — ta décision\nfin attend\n";
const PROJETS: ProjetDuGuichet[] = [
  { name: "parade", repository: "chef/parade", state: "served" },
  { name: "cantine", repository: "chef/cantine", state: "served" },
];
const FILES: Record<string, Faits> = { parade: PARADE, cantine: CANTINE };

// Le guichet de la station, faux : ce que le vrai rend à chaque chemin — ou, `muet`, rien du tout. Chaque chemin
// demandé est noté.
function guichet(rendre: (chemin: string) => Reponse | Error = (chemin) => vraie(chemin)) {
  const demandes: string[] = [];
  const requete = async (chemin: string) => {
    demandes.push(chemin);
    const rendu = rendre(chemin);
    if (rendu instanceof Error) throw rendu;
    return rendu;
  };
  return { requete, demandes };
}
function vraie(chemin: string, projets = PROJETS): Reponse {
  if (chemin === "/projects") return { status: 200, data: { projects: projets } };
  const [, nom = ""] = /^\/projects\/([^/]+)\/queue$/.exec(chemin) ?? [];
  const facts = FILES[decodeURIComponent(nom)];
  return facts === undefined ? { status: 404, data: { said: `${nom}: no such project on this station` } } : { status: 200, data: { project: nom, repository: `chef/${nom}`, facts, status: STATUS } };
}
const INJOIGNABLE = new Error("failed to connect to /192.168.1.20 (port 7010) after 10000ms");

const CONSTANTES = {
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
};

// Le téléphone appairé à `atelier`, relancé : sa lecture ouverte sur le guichet, les projets de sa dernière liste
// connus — et la vue, dont chaque lecture demandée part à cette lecture, et à qui chaque envoi de la lecture arrive.
async function telephone({ requete, connus = [], adresse = ADRESSE }: { requete: (chemin: string) => Promise<Reponse>; connus?: ProjetDuGuichet[]; adresse?: string }) {
  let vue: Jouee | undefined;
  const envois: { canal: string; args: unknown[] }[] = [];
  const enAttente: { canal: string; args: unknown[] }[] = [];
  const prochaines: (() => void)[] = [];
  const lecture = ouvrirLaLecture({
    requete,
    station: STATION,
    adresse,
    connus,
    maintenant: () => new Date(A),
    planifier: (faire) => (prochaines.push(faire), () => undefined),
    // Ce qui part pendant que la vue démarre lui arrive dès qu'elle est jouée — comme les envois du pont qu'elle reçoit
    // une fois ses abonnements posés.
    dire: ((canal: string, ...args: unknown[]) => {
      envois.push({ canal, args });
      if (vue !== undefined) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
      else enAttente.push({ canal, args });
    }) as Parameters<typeof ouvrirLaLecture>[0]["dire"],
  });
  vue = await jouerLaVue(
    {
      demarrage: () => ({ ...CONSTANTES, configuration: lecture.configuration(), telephone: lecture.telephone() }),
      faits: (demande) => void lecture.faits(demande),
      tous: (demande) => void lecture.tous(demande),
      regarder: (projet, demande) => void lecture.regarder(projet, demande),
      relireBox: () => void lecture.relire(),
      oublierLeTelephone: async () => undefined,
      espace: () => [],
      machines: () => [],
    },
    { ecran: new FauxEcran(true), stockage: new FauxStockage() },
  );
  for (const { canal, args } of enAttente.splice(0)) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
  await calme();
  return { vue, lecture, envois, prochaines };
}
// Le guichet faux répond sans attendre : quelques tours de la boucle suffisent à ce que tout soit lu et posé.
async function calme(): Promise<void> {
  for (let tour = 0; tour < 30; tour++) await repos();
}

// « All projects » tel que le chef le lit : la phrase de la section, s'il y en a une, et chaque ligne de projet.
const projets = (vue: Jouee) => vue.element("accueil-projets").children;
const lignes = (vue: Jouee) => projets(vue).filter((pose) => pose.className === "ligne").map((ligne) => ligne.textContent);
const phrase = (vue: Jouee): Faux | undefined => projets(vue).find((pose) => pose.className !== "ligne");

// Ce que le desktop envoie à la vue pour la même file, lue au même instant (app/src/main.ts) : `facts` par `tenirFaits`,
// puis `status`, son bloc `attend` mis à part, par `attendre`.
function auDesktop(nom: string, demandeFaits: number, demandeVue: number): Dessinable | undefined {
  const faits = tenirFaits();
  faits.recevoir({ projet: nom, demande: demandeFaits, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FILES[nom]) }] });
  const lecture: Lecture = { projet: nom, demande: demandeVue, a: A, sorties: [{ commande: "status", texte: STATUS }] };
  return faits.attendre(mettreAPart(lecture));
}

describe("les projets de la station sur le téléphone appairé", () => {
  test("la liste lue : tous les projets de la station, dans son ordre, chacun avec sa ligne — et la liste est gardée", async () => {
    const gardes: ProjetDuGuichet[][] = [];
    const { requete, demandes } = guichet();
    const lecture = ouvrirLaLecture({ requete, station: STATION, adresse: ADRESSE, dire: (() => undefined) as never, garder: (lus) => void gardes.push(lus), planifier: () => () => undefined });
    await lecture.faits(1);
    assert.deepEqual(demandes, ["/projects", "/projects/parade/queue", "/projects/cantine/queue"]);
    assert.deepEqual(gardes, [PROJETS]);
    assert.deepEqual(
      lecture.configuration().projets.map(({ nom, depot }) => ({ nom, depot })),
      [
        { nom: "parade", depot: "chef/parade" },
        { nom: "cantine", depot: "chef/cantine" },
      ],
    );

    const { vue } = await telephone({ requete });
    assert.equal(phrase(vue), undefined);
    assert.equal(lignes(vue).length, 2);
    assert.match(lignes(vue)[0] ?? "", /^parade.*decision awaits you/);
    assert.match(lignes(vue)[1] ?? "", /^cantine.*nothing cooking, nothing waits for you/);
    // La barre porte chaque projet, à côté de « T ».
    assert.deepEqual(
      vue.element("projets").children.slice(1, 3).map((cas) => cas.title.split(" — ")[0]),
      ["parade", "cantine"],
    );
  });

  test("la file d'un projet : les cartes que le desktop montre de la même file, au même instant", async () => {
    const { vue, envois } = await telephone({ requete: guichet().requete });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await calme();
    // Ce que la lecture a envoyé de `parade` en dernier est ce que le desktop envoie de la même file.
    const [demandeFaits] = vue.dernier("faits") as [number];
    const [, demandeVue] = vue.dernier("regarder") as [string, number];
    const dessines = envois.filter(({ canal, args }) => canal === "surFaits" && (args[0] as Dessinable).projet === "parade").map(({ args }) => args[0]);
    assert.deepEqual(dessines.at(-1), auDesktop("parade", demandeFaits, demandeVue));
    // Et la vue en pose les cartes : #12 dans TODO, #21 sur le rail, #9 servi.
    const cartes = vue.element("rail").dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.textContent);
    assert.ok(cartes.some((carte) => /#12.*Validation SIRET/.test(carte)), cartes.join("\n"));
    assert.ok(cartes.some((carte) => /#21.*L'export du journal/.test(carte)), cartes.join("\n"));
    assert.ok(cartes.some((carte) => /#9.*Le relevé des mesures/.test(carte)), cartes.join("\n"));
  });

  test("une station qui ne sert aucun projet le dit en une phrase", async () => {
    const { requete, demandes } = guichet((chemin) => vraie(chemin, []));
    const { vue } = await telephone({ requete });
    assert.equal(phrase(vue)?.textContent, "atelier serves no project yet: a project is added from a computer.");
    assert.deepEqual(lignes(vue), []);
    assert.ok(demandes.every((chemin) => chemin === "/projects"));
  });

  test("avant la première lecture, la section dit qu'elle est en cours — jamais « no project yet »", async () => {
    const { vue } = await telephone({ requete: () => new Promise<Reponse>(() => undefined) });
    assert.equal(phrase(vue)?.textContent, "atelier's projects: first read in progress…");
  });

  test("la station injoignable : une phrase le dit, les projets connus restent, chacun « station unreachable », et leur file aussi", async () => {
    const { requete, demandes } = guichet(() => INJOIGNABLE);
    const { vue } = await telephone({ requete, connus: PROJETS });
    const dite = phrase(vue) ?? assert.fail("aucune phrase");
    assert.equal(dite.dataset.etat, "injoignable");
    assert.equal(dite.children[0]?.textContent, "This phone cannot reach your station at 192.168.1.20:7010.");
    // Ce que le réseau en a dit, et ce qu'il faut vérifier, au survol.
    assert.match([...dite.descendants()].map((pose) => pose.ariaLabel ?? "").join("\n"), /failed to connect to \/192\.168\.1\.20.*tries again every 30 s/s);
    assert.equal(lignes(vue).length, 2);
    for (const ligne of lignes(vue)) assert.match(ligne, /station unreachable/);
    // Rien d'autre n'est demandé à une station qui ne répond pas.
    assert.ok(demandes.every((chemin) => chemin === "/projects"));
    // Ouverte, la file d'un projet le dit en une ligne, elle aussi.
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await calme();
    assert.match(vue.element("rail").textContent, /^the rail is not drawn — tried at .*the station did not answer\??$/);
    assert.doesNotMatch(vue.element("rail").textContent, /GitHub|panel/);
  });

  test("injoignable sans aucun projet connu, l'écran n'est pas vide : la phrase seule", async () => {
    const { vue } = await telephone({ requete: guichet(() => new Error('Unable to resolve host "box.tail1234.ts.net"')).requete, adresse: TAILNET });
    assert.equal(phrase(vue)?.children[0]?.textContent, "This phone cannot reach box.tail1234.ts.net on your tailnet.");
    assert.deepEqual(lignes(vue), []);
  });

  test("le guichet derrière `tailscale serve` qui ne répond pas, ou autre chose qui répond, le disent aussi", async () => {
    const sans = await telephone({ requete: guichet(() => ({ status: 502, data: "" })).requete, adresse: TAILNET });
    assert.equal(phrase(sans.vue)?.children[0]?.textContent, "box.tail1234.ts.net answers, but the station's phone desk behind it does not.");
    const autre = await telephone({ requete: guichet(() => ({ status: 404, data: "<html>not found</html>" })).requete });
    assert.equal(phrase(autre.vue)?.children[0]?.textContent, "What answers at 192.168.1.20:7010 is not a station's phone desk.");
  });

  test("une station qui ne connaît plus ce téléphone le dit, avec le geste qui le relie de nouveau", async () => {
    const { requete } = guichet(() => ({ status: 401, data: { said: "a paired phone's token is required: pair the phone first" } }));
    const { vue } = await telephone({ requete, connus: PROJETS });
    const dite = phrase(vue) ?? assert.fail("aucune phrase");
    assert.equal(dite.dataset.etat, "oublie");
    assert.equal(dite.children[0]?.textContent, "atelier no longer knows this phone: pair it again.");
    const bouton = dite.dessous("button").find((pose) => pose.textContent === "pair again") ?? assert.fail("pas de bouton « pair again »");
    assert.equal(bouton.className, "recommande");
  });

  test("la station relue : toutes les trente secondes, et revenue, la phrase s'en va et les files se lisent", async () => {
    let muette = true;
    const { requete, demandes } = guichet((chemin) => (muette ? INJOIGNABLE : vraie(chemin)));
    const { vue, prochaines } = await telephone({ requete, connus: PROJETS });
    assert.equal(phrase(vue)?.dataset.etat, "injoignable");
    assert.ok(prochaines.length > 0);
    const avant = demandes.length;
    muette = false;
    (prochaines.at(-1) ?? assert.fail("rien de planifié"))();
    await calme();
    assert.ok(demandes.slice(avant).includes("/projects/parade/queue"));
    assert.equal(phrase(vue), undefined);
    assert.match(lignes(vue)[0] ?? "", /^parade.*decision awaits you/);
    assert.equal(INTERVALLE_MS, 30_000);
  });
});

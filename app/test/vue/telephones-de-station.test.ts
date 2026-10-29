// L'écran « Pair a phone » d'une station (#1598) : un code neuf, son QR et le temps qu'il vaut encore, qui décompte ;
// expiré ou servi, il le dit, et « new code » en montre un neuf d'un clic ; les téléphones appairés, chacun avec
// « revoke » — révoqué, il quitte la liste ; une station injoignable dit pourquoi à la place du code. Nulle part, ni au
// survol, une commande ou `sudo`. L'écran est joué devant un faux document, son horloge tenue par le test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CodeTire, RenduDeLaListe, RenduDeLaRevocation, RenduDeLEtat, RenduDuCode } from "../../src/telephones-de-station.ts";
import { matriceDuQr } from "../../src/vue/qr.js";
import { AUCUN, EXPIRE, NOUVEAU, poserLesTelephones, REESSAYER, REVOQUE, SONDAGE_S, tenirLesTelephones, TITRE, UTILISE } from "../../src/vue/telephones-de-station.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "g1", nom: "box" };
const DEBUT = Date.parse("2026-10-24T12:00:00.000Z");
const QUART = 15 * 60_000;

const code = (texte: string, depuis = DEBUT): CodeTire => ({
  code: texte,
  expireLe: new Date(depuis + QUART).toISOString(),
  qr: `brigade://pair?code=${texte}&url=https%3A%2F%2Fbox.tail1234.ts.net`,
  adresse: "https://box.tail1234.ts.net",
});
const PIXEL = { nom: "pixel-8", machine: "Android 14 · Pixel 8", appaireLe: "2026-10-20T09:00:00.000Z" };
const GALAXY = { nom: "galaxy", machine: "Android 15 · Galaxy S24", appaireLe: "2026-10-21T09:00:00.000Z" };

// Un faux pont : chaque geste rend ce que le test lui a donné, et se retient.
function joue(options: {
  codes?: RenduDuCode[];
  etats?: RenduDeLEtat[];
  listes?: RenduDeLaListe[];
  revocation?: RenduDeLaRevocation;
}) {
  let maintenant = DEBUT;
  const appels: string[] = [];
  const codes = [...(options.codes ?? [{ tire: code("7KQ2-M9XD") }])];
  const etats = [...(options.etats ?? [])];
  const listes = [...(options.listes ?? [{ telephones: [PIXEL, GALAXY] }])];
  const pont = {
    tirerUnCodeDeTelephone: (id: string) => (appels.push(`code ${id}`), Promise.resolve(codes.length > 1 ? (codes.shift() as RenduDuCode) : (codes[0] as RenduDuCode))),
    etatDuCodeDeTelephone: (id: string, texte: string) => (appels.push(`status ${id} ${texte}`), Promise.resolve(etats.shift() ?? { etat: "valable" as const, telephone: null })),
    telephonesDeLaStation: (id: string) => (appels.push(`list ${id}`), Promise.resolve(listes.length > 1 ? (listes.shift() as RenduDeLaListe) : (listes[0] as RenduDeLaListe))),
    revoquerUnTelephone: (id: string, nom: string) => (appels.push(`revoke ${id} ${nom}`), Promise.resolve(options.revocation ?? { revoque: nom })),
  };
  let rendus = 0;
  const tenue = tenirLesTelephones({ pont, maintenant: () => maintenant, rendre: () => rendus++ });
  const ecran = (): Faux => {
    const etat = tenue.etat ?? assert.fail("l'écran est fermé");
    return poserLesTelephones(doc, etat, maintenant, tenue.gestes);
  };
  return {
    tenue,
    appels,
    ecran,
    rendus: () => rendus,
    // Le temps passe, une seconde à la fois, comme la vue bat la seconde.
    async attendre(secondes: number) {
      for (let i = 0; i < secondes; i++) {
        maintenant += 1000;
        tenue.battre();
        await repos();
      }
    },
  };
}

const textes = (racine: Faux) => [...racine.descendants()].map((element) => element.textContent);
const boutons = (racine: Faux) => racine.dessous("button").filter((bouton) => bouton.className !== "aide");
const bouton = (racine: Faux, texte: string) => boutons(racine).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const qr = (racine: Faux) => racine.dessous("img").find((image) => image.className === "qr");
const reste = (racine: Faux) => [...racine.descendants()].find((element) => element.className === "reste")?.textContent;
// Tout ce qu'un écran donne à lire — son texte, ses survols, ses noms accessibles, le texte de remplacement du QR.
function toutCeQuiSeLit(racine: Faux): string {
  const survols = racine.dessous("button").filter((element) => element.className === "aide");
  for (const declencheur of survols) declencheur.declencher("mouseenter");
  const lu = [racine, ...racine.descendants()].flatMap((element) => [element.textContent, element.title, element.ariaLabel, String((element as unknown as { alt?: string }).alt ?? "")]).join("\n");
  for (const declencheur of survols) declencheur.declencher("mouseleave");
  return lu;
}
const SANS_COMMANDE = /\bsudo\b|\$ |\bphones (code|status|list|revoke)\b|--/i;

describe("un code valable", () => {
  test("l'écran s'ouvre sur un code neuf, son QR, l'adresse de la station et le temps qui reste", async () => {
    const jeu = joue({});
    jeu.tenue.ouvrir(STATION);
    await repos();
    assert.deepEqual(jeu.appels, ["code g1", "list g1"]);
    const ecran = jeu.ecran();
    assert.equal(ecran.dessous("h2")[0]?.textContent.startsWith(TITRE("box")), true);
    assert.ok(textes(ecran).includes("7KQ2-M9XD"));
    assert.equal(reste(ecran), "valid for 15:00");
    assert.ok(textes(ecran).includes("box.tail1234.ts.net"), "l'adresse se tape sur le téléphone, sans https://");
    const image = qr(ecran) ?? assert.fail("pas de QR");
    assert.match(String((image as unknown as { src: string }).src), /^data:image\/svg\+xml;charset=utf-8,/);
    // Quatre pixels par module, autant pour chacun : 37 modules et la marge, 180 pixels de côté.
    assert.equal((image as unknown as { width: number }).width, 180);
    // Le QR est celui de ce que la station a rendu, dessiné ici : son SVG a autant de modules sombres que la matrice.
    const svg = decodeURIComponent(String((image as unknown as { src: string }).src).replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
    const sombres = matriceDuQr(code("7KQ2-M9XD").qr).flat().filter(Boolean).length;
    assert.equal(svg.match(/h1v1h-1z/g)?.length, sombres);
    // Rien d'autre à faire que scanner : aucun bouton de code tant qu'il vaut.
    assert.deepEqual(
      boutons(ecran).map(({ textContent }) => textContent),
      ["revoke", "revoke"],
    );
  });

  test("le temps qui reste décompte, seconde après seconde", async () => {
    const jeu = joue({});
    jeu.tenue.ouvrir(STATION);
    await repos();
    await jeu.attendre(1);
    assert.equal(reste(jeu.ecran()), "valid for 14:59");
    await jeu.attendre(91);
    assert.equal(reste(jeu.ecran()), "valid for 13:28");
  });

  test("pendant qu'un code est tiré, l'écran le dit — jamais un code vide", () => {
    const jeu = joue({});
    jeu.tenue.ouvrir(STATION);
    const ecran = jeu.ecran();
    assert.ok(textes(ecran).includes("issuing a code…"));
    assert.equal(qr(ecran), undefined);
  });
});

describe("un code expiré, ou qui a servi", () => {
  test("passé son quart d'heure, le code est expiré : l'écran le dit, et un seul clic sur « new code » montre un code et un QR neufs", async () => {
    const jeu = joue({ codes: [{ tire: code("7KQ2-M9XD") }, { tire: code("H3PW-4TZN", DEBUT + QUART) }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    await jeu.attendre(15 * 60);
    let ecran = jeu.ecran();
    assert.ok(textes(ecran).includes(EXPIRE));
    assert.equal(qr(ecran), undefined, "un code mort ne se scanne plus");
    assert.ok(!textes(ecran).includes("7KQ2-M9XD"));
    bouton(ecran, NOUVEAU).click();
    await repos();
    ecran = jeu.ecran();
    assert.ok(textes(ecran).includes("H3PW-4TZN"));
    assert.ok(qr(ecran) !== undefined);
    assert.equal(reste(ecran), "valid for 15:00");
    assert.equal(jeu.appels.filter((appel) => appel.startsWith("code ")).length, 2);
  });

  test("un code déjà échu à son arrivée — l'horloge de la station en avance — se dit expiré tout de suite", async () => {
    const jeu = joue({ codes: [{ tire: code("7KQ2-M9XD", DEBUT - QUART) }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    assert.ok(textes(jeu.ecran()).includes(EXPIRE));
    assert.equal(qr(jeu.ecran()), undefined);
  });

  test("la station dit le code expiré avant l'heure : l'écran la croit", async () => {
    const jeu = joue({ etats: [{ etat: "expire", telephone: null }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    await jeu.attendre(SONDAGE_S);
    assert.ok(jeu.appels.includes("status g1 7KQ2-M9XD"));
    assert.ok(textes(jeu.ecran()).includes(EXPIRE));
  });

  test("un téléphone s'en est servi : l'écran dit lequel, le relit dans la liste, et « new code » en tire un autre", async () => {
    const NEUF = { nom: "pixel-9", machine: "Android 15 · Pixel 9", appaireLe: "2026-10-24T12:00:05.000Z" };
    const jeu = joue({ etats: [{ etat: "valable", telephone: null }, { etat: "utilise", telephone: "pixel-9" }], listes: [{ telephones: [PIXEL] }, { telephones: [PIXEL, NEUF] }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    await jeu.attendre(2 * SONDAGE_S);
    const ecran = jeu.ecran();
    assert.ok(textes(ecran).includes(UTILISE("pixel-9")));
    assert.equal(qr(ecran), undefined);
    assert.ok(textes(ecran).includes("pixel-9"), "le téléphone appairé paraît dans la liste");
    assert.equal(jeu.appels.filter((appel) => appel === "list g1").length, 2);
    bouton(ecran, NOUVEAU).click();
    await repos();
    assert.ok(qr(jeu.ecran()) !== undefined);
  });

  test("la station n'est sondée que toutes les quelques secondes, et plus du tout une fois le code fini", async () => {
    const jeu = joue({ etats: [{ etat: "valable", telephone: null }, { etat: "utilise", telephone: null }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    await jeu.attendre(SONDAGE_S - 1);
    assert.equal(jeu.appels.filter((appel) => appel.startsWith("status")).length, 0);
    await jeu.attendre(SONDAGE_S * 4);
    assert.equal(jeu.appels.filter((appel) => appel.startsWith("status")).length, 2);
    assert.ok(textes(jeu.ecran()).includes(UTILISE(null)));
  });
});

describe("les téléphones appairés", () => {
  test("chacun a sa ligne — son nom, sa machine — et « revoke », confirmé avec son prix : révoqué, il quitte la liste", async () => {
    const jeu = joue({ listes: [{ telephones: [PIXEL, GALAXY] }, { telephones: [GALAXY] }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    let ecran = jeu.ecran();
    const lignes = () => jeu.ecran().dessous("li").filter(({ className }) => className === "telephone-appaire");
    assert.deepEqual(
      lignes().map((ligne) => ligne.children[0]?.textContent),
      ["pixel-8", "galaxy"],
    );
    assert.ok(textes(ecran).includes("Android 14 · Pixel 8"));
    bouton(lignes()[0] ?? assert.fail(), "revoke").click();
    ecran = jeu.ecran();
    const confirmation = [...ecran.descendants()].find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(confirmation.textContent, /Revoke pixel-8\?/);
    assert.match(confirmation.textContent, /pixel-8 can no longer reach box, from any network/);
    assert.ok(!jeu.appels.some((appel) => appel.startsWith("revoke")), "rien ne part avant le « oui »");
    bouton(confirmation, "revoke").click();
    await repos();
    assert.ok(jeu.appels.includes("revoke g1 pixel-8"));
    assert.deepEqual(
      lignes().map((ligne) => ligne.children[0]?.textContent),
      ["galaxy"],
    );
    assert.ok(textes(jeu.ecran()).includes(REVOQUE("pixel-8")));
  });

  test("« cancel » referme la confirmation, et le téléphone reste", async () => {
    const jeu = joue({});
    jeu.tenue.ouvrir(STATION);
    await repos();
    bouton(jeu.ecran(), "revoke").click();
    bouton(jeu.ecran(), "cancel").click();
    assert.ok(!jeu.appels.some((appel) => appel.startsWith("revoke")));
    assert.equal(jeu.ecran().dessous("li").length, 2);
  });

  test("une révocation refusée le dit en une ligne, et le téléphone reste", async () => {
    const jeu = joue({ revocation: { refus: "box did not answer: it may be off, or offline.", detail: "Check that its machine is on." } });
    jeu.tenue.ouvrir(STATION);
    await repos();
    bouton(jeu.ecran(), "revoke").click();
    bouton(jeu.ecran(), "revoke").click();
    await repos();
    assert.ok(textes(jeu.ecran()).includes("box did not answer: it may be off, or offline."));
    assert.equal(jeu.ecran().dessous("li").length, 2);
  });

  test("aucun téléphone : une ligne le dit", async () => {
    const jeu = joue({ listes: [{ telephones: [] }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    assert.ok(textes(jeu.ecran()).includes(AUCUN));
  });
});

describe("une station injoignable, ou qui refuse", () => {
  const INJOIGNABLE = { refus: "box did not answer: it may be off, or offline.", detail: "The app got no answer from box within 30 s. Check that its machine is on and connected to your network, then try again." };

  test("l'écran dit pourquoi à la place du code — jamais un code vide —, ce qu'il faut vérifier au survol, et « try again »", async () => {
    const jeu = joue({ codes: [INJOIGNABLE, { tire: code("7KQ2-M9XD") }], listes: [INJOIGNABLE, { telephones: [PIXEL] }] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    let ecran = jeu.ecran();
    assert.ok(textes(ecran).includes(INJOIGNABLE.refus));
    assert.equal(qr(ecran), undefined);
    assert.equal(reste(ecran), undefined);
    assert.match(toutCeQuiSeLit(ecran), /Check that its machine is on/);
    assert.ok(textes(ecran).includes("paired phones unavailable"));
    bouton(ecran, REESSAYER).click();
    await repos();
    ecran = jeu.ecran();
    assert.ok(textes(ecran).includes("7KQ2-M9XD"));
    assert.ok(textes(ecran).includes("pixel-8"), "la liste, qui ne s'était pas lue, est relue avec le code");
  });

  test("une station qui refuse cet ordinateur le dit, de même", async () => {
    const REFUS = { refus: "box refused: this computer is not allowed to manage its phones.", detail: "box only lets the computer it was set up with issue pairing codes and revoke phones." };
    const jeu = joue({ codes: [REFUS], listes: [REFUS] });
    jeu.tenue.ouvrir(STATION);
    await repos();
    assert.ok(textes(jeu.ecran()).includes(REFUS.refus));
    assert.equal(qr(jeu.ecran()), undefined);
  });

  test("un pont qui lève une exception ne laisse pas l'écran en attente", async () => {
    const tenue = tenirLesTelephones({
      pont: {
        tirerUnCodeDeTelephone: () => Promise.reject(new Error("ipc fermé")),
        etatDuCodeDeTelephone: () => Promise.reject(new Error("ipc fermé")),
        telephonesDeLaStation: () => Promise.reject(new Error("ipc fermé")),
        revoquerUnTelephone: () => Promise.reject(new Error("ipc fermé")),
      },
      maintenant: () => DEBUT,
      rendre: () => {},
    });
    tenue.ouvrir(STATION);
    await repos();
    const ecran = poserLesTelephones(doc, tenue.etat ?? assert.fail(), DEBUT, tenue.gestes);
    assert.ok(textes(ecran).includes("The app could not ask this station."));
    assert.ok(boutons(ecran).some(({ textContent }) => textContent === REESSAYER));
  });
});

test("nulle part sur l'écran, ni au survol, une commande ou sudo — dans aucun état", async () => {
  const INJOIGNABLE = { refus: "box did not answer: it may be off, or offline.", detail: "The app got no answer from box within 30 s." };
  const etats: Faux[] = [];
  const valable = joue({});
  valable.tenue.ouvrir(STATION);
  etats.push(valable.ecran());
  await repos();
  etats.push(valable.ecran());
  bouton(valable.ecran(), "revoke").click();
  etats.push(valable.ecran());
  const expire = joue({});
  expire.tenue.ouvrir(STATION);
  await repos();
  await expire.attendre(15 * 60);
  etats.push(expire.ecran());
  const utilise = joue({ etats: [{ etat: "utilise", telephone: "pixel-9" }] });
  utilise.tenue.ouvrir(STATION);
  await repos();
  await utilise.attendre(SONDAGE_S);
  etats.push(utilise.ecran());
  const injoignable = joue({ codes: [INJOIGNABLE], listes: [INJOIGNABLE] });
  injoignable.tenue.ouvrir(STATION);
  await repos();
  etats.push(injoignable.ecran());
  const sansAdresse = joue({ codes: [{ tire: { ...code("7KQ2-M9XD"), qr: "brigade://pair?code=7KQ2-M9XD", adresse: null } }] });
  sansAdresse.tenue.ouvrir(STATION);
  await repos();
  etats.push(sansAdresse.ecran());
  for (const ecran of etats) assert.doesNotMatch(toutCeQuiSeLit(ecran), SANS_COMMANDE);
});

test("une réponse qui arrive après la fermeture, ou pour une autre station, ne change rien", async () => {
  let rendre: ((rendu: RenduDuCode) => void) | undefined;
  const tenue = tenirLesTelephones({
    pont: {
      tirerUnCodeDeTelephone: () => new Promise<RenduDuCode>((resoudre) => (rendre = resoudre)),
      etatDuCodeDeTelephone: () => Promise.resolve({ etat: "valable", telephone: null }),
      telephonesDeLaStation: () => Promise.resolve({ telephones: [] }),
      revoquerUnTelephone: (_id: string, nom: string) => Promise.resolve({ revoque: nom }),
    },
    maintenant: () => DEBUT,
    rendre: () => {},
  });
  tenue.ouvrir(STATION);
  const premier = rendre;
  tenue.ouvrir({ id: "g2", nom: "atelier" });
  premier?.({ tire: code("7KQ2-M9XD") });
  await repos();
  assert.equal(tenue.etat?.station.nom, "atelier");
  assert.equal(tenue.etat?.code, undefined);
  tenue.fermer();
  rendre?.({ tire: code("H3PW-4TZN") });
  await repos();
  assert.equal(tenue.etat, undefined);
});

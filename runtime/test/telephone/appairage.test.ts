// L'appairage d'un téléphone, côté station : un code à usage unique, pour un
// quart d'heure. Le bon code fait entrer le téléphone au registre comme une
// station qui ne cuisine pas, et lui rend son jeton ; un code faux, expiré ou
// déjà servi est refusé, et rien n'entre au registre.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { DUREE_DU_CODE_MS } from "../../src/appairage/document.ts";
import { cheminTelephones, CodeRefuse, contenuDuQr, lireContenuDuQr, ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { ouvrirRegistre, PresentationInvalide } from "../../src/stations-globales/registre.ts";
import { repertoireTemporaire } from "../outils.ts";

const PIXEL = { nom: "pixel-8", machine: "Android 16" };

const horloge = (depart = "2026-10-21T09:00:00.000Z") => {
  let instant = new Date(depart);
  return { maintenant: () => instant, aller: (iso: string) => void (instant = new Date(iso)) };
};

const ouvrir = (t: TestContext, heure = horloge()) => {
  const repertoire = repertoireTemporaire(t);
  const telephones = ouvrirTelephones(repertoire, { maintenant: heure.maintenant });
  const registre = ouvrirRegistre(repertoire, { maintenant: heure.maintenant });
  t.after(() => {
    telephones.fermer();
    registre.fermer();
  });
  return { telephones, registre, repertoire, heure };
};

const refuse = (motif: string) => (erreur: unknown) => erreur instanceof CodeRefuse && erreur.motif === motif;

test("émettre rend un code court pour un quart d'heure, et le QR qui le porte avec l'adresse du guichet", (t) => {
  const { telephones } = ouvrir(t);
  const { code, expireLe, qr } = telephones.emettre({ adresse: "http://box.tail.ts.net:8787" });

  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(expireLe, new Date(Date.parse("2026-10-21T09:00:00.000Z") + DUREE_DU_CODE_MS).toISOString());
  const lu = new URL(qr);
  assert.equal(`${lu.protocol}//${lu.host}${lu.pathname}`, "brigade://pair");
  assert.equal(lu.searchParams.get("code"), code);
  assert.equal(lu.searchParams.get("url"), "http://box.tail.ts.net:8787");
  // Sans adresse, le QR ne porte que le code.
  assert.equal(contenuDuQr("ABCD-EFGH"), "brigade://pair?code=ABCD-EFGH");
  // Deux émissions, deux codes.
  assert.notEqual(telephones.emettre().code, code);
});

test("le bon code fait entrer le téléphone au registre, accepté, comme une station qui ne cuisine pas — et jamais candidate pour cuire", (t) => {
  const { telephones, registre } = ouvrir(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  const box = registre.accepter("box");

  const { station, jeton } = telephones.appairer(telephones.emettre().code, PIXEL);

  assert.equal(station.nom, "pixel-8");
  assert.equal(station.machine, "Android 16");
  assert.equal(station.sorte, "telephone");
  assert.equal(station.cuisine, false);
  assert.equal(station.statut, "acceptee");
  assert.deepEqual(station.capacites, []);
  assert.match(jeton, /^brgt_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(
    registre.liste().map(({ nom, cuisine }) => ({ nom, cuisine })),
    [
      { nom: "box", cuisine: true },
      { nom: "pixel-8", cuisine: false },
    ],
  );
  assert.deepEqual(registre.utilisables(), [box]);
  // Son jeton le désigne.
  assert.deepEqual(telephones.authentifier(jeton), registre.lire("pixel-8"));
});

test("le code se tape comme on le lit : minuscules, sans tiret, O pour 0, I ou L pour 1", (t) => {
  const { telephones, registre } = ouvrir(t);
  const { code } = telephones.emettre();
  const tape = code.replace("-", " ").toLowerCase().replaceAll("0", "o").replaceAll("1", "l");

  telephones.appairer(tape, PIXEL);
  assert.equal(registre.lire("pixel-8")?.sorte, "telephone");
});

test("un code expiré est refusé, et rien n'entre au registre", (t) => {
  const { telephones, registre, heure } = ouvrir(t);
  const { code, expireLe } = telephones.emettre();

  heure.aller(expireLe);
  assert.throws(() => telephones.appairer(code, PIXEL), refuse("expire"));
  assert.deepEqual(registre.liste(), []);
  // Encore valable une milliseconde plus tôt.
  heure.aller(new Date(Date.parse(expireLe) - 1).toISOString());
  telephones.appairer(code, PIXEL);
  assert.equal(registre.liste().length, 1);
});

test("un code déjà servi est refusé, et rien n'entre au registre — pas même sous un autre nom", (t) => {
  const { telephones, registre } = ouvrir(t);
  const { code } = telephones.emettre();
  const premier = telephones.appairer(code, PIXEL);

  assert.throws(() => telephones.appairer(code, { nom: "autre-telephone", machine: "Android 15" }), refuse("utilise"));
  assert.throws(() => telephones.appairer(code, PIXEL), refuse("utilise"));
  assert.deepEqual(
    registre.liste().map(({ nom }) => nom),
    ["pixel-8"],
  );
  // Le premier jeton vaut toujours.
  assert.equal(telephones.authentifier(premier.jeton)?.nom, "pixel-8");
});

test("un code inconnu, ou qui n'en a pas la forme, est refusé sans rien écrire", (t) => {
  const { telephones, registre } = ouvrir(t);
  telephones.emettre();

  assert.throws(() => telephones.appairer("ZZZZ-ZZZZ", PIXEL), refuse("inconnu"));
  assert.throws(() => telephones.appairer("pas un code", PIXEL), refuse("inconnu"));
  assert.throws(() => telephones.appairer(undefined as unknown as string, PIXEL), refuse("inconnu"));
  assert.deepEqual(registre.liste(), []);
});

test("une demande mal formée est refusée et le code reste valable", (t) => {
  const { telephones, registre } = ouvrir(t);
  const { code } = telephones.emettre();

  assert.throws(() => telephones.appairer(code, { nom: "Pixel 8", machine: "Android 16" }), PresentationInvalide);
  assert.throws(() => telephones.appairer(code, { nom: "pixel-8", machine: " " }), PresentationInvalide);
  assert.deepEqual(registre.liste(), []);
  telephones.appairer(code, PIXEL);
  assert.equal(registre.liste().length, 1);
});

test("un téléphone ne prend pas le nom d'un ordinateur, accepté ou en attente — le code reste valable", (t) => {
  const { telephones, registre } = ouvrir(t);
  registre.presenter({ nom: "mac", machine: "macOS 26", capacites: ["macos"], cloisonnee: false });
  const avant = registre.lire("mac");
  const { code } = telephones.emettre();

  assert.throws(() => telephones.appairer(code, { nom: "mac", machine: "Android 16" }), refuse("nom-pris"));
  assert.deepEqual(registre.lire("mac"), avant);
  registre.accepter("mac");
  assert.throws(() => telephones.appairer(code, { nom: "mac", machine: "Android 16" }), refuse("nom-pris"));
  assert.equal(registre.lire("mac")?.sorte, "ordinateur");
  telephones.appairer(code, PIXEL);
});

test("le même téléphone appairé de nouveau garde sa place, et son jeton d'avant ne vaut plus", (t) => {
  const { telephones, registre } = ouvrir(t);
  const avant = telephones.appairer(telephones.emettre().code, PIXEL);
  const apres = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 17" });

  assert.equal(telephones.authentifier(avant.jeton), null);
  assert.equal(telephones.authentifier(apres.jeton)?.machine, "Android 17");
  assert.deepEqual(
    registre.liste().map(({ nom, statut, cuisine }) => ({ nom, statut, cuisine })),
    [{ nom: "pixel-8", statut: "acceptee", cuisine: false }],
  );
});

test("un jeton ne vaut que pour un téléphone toujours au registre : retiré, il n'ouvre plus rien", (t) => {
  const { telephones, registre } = ouvrir(t);
  const { jeton } = telephones.appairer(telephones.emettre().code, PIXEL);

  assert.equal(telephones.authentifier(`${jeton}x`), null);
  assert.equal(telephones.authentifier(""), null);
  assert.equal(telephones.authentifier(undefined), null);
  // Un code n'est pas un jeton.
  assert.equal(telephones.authentifier(telephones.emettre().code), null);

  registre.retirer("pixel-8");
  assert.equal(telephones.authentifier(jeton), null);
  // Revenu sous ce nom comme ordinateur, il n'hérite pas du jeton.
  registre.presenter({ nom: "pixel-8", machine: "Debian", capacites: [], cloisonnee: false });
  assert.equal(telephones.authentifier(jeton), null);
});

test("la base ne garde ni le code ni le jeton en clair", (t) => {
  const { telephones, repertoire } = ouvrir(t);
  const { code } = telephones.emettre();
  const { jeton } = telephones.appairer(code, PIXEL);
  const brut = readFileSync(cheminTelephones(repertoire)).toString("latin1");
  assert.equal(brut.includes(code.replace("-", "")), false);
  assert.equal(brut.includes(code), false);
  assert.equal(brut.includes(jeton), false);
  assert.equal(brut.includes(jeton.slice(5, 25)), false);
});

test("le QR se relit comme il s'écrit : son code et l'adresse du guichet, ou le code seul — et rien d'autre n'en est un", () => {
  const adresse = "https://box.tail1234.ts.net";
  assert.deepEqual(lireContenuDuQr(contenuDuQr("7KQ2-M9XD", adresse)), { code: "7KQ2-M9XD", adresse });
  assert.deepEqual(lireContenuDuQr(contenuDuQr("7KQ2-M9XD", "http://192.168.1.20:7010")), { code: "7KQ2-M9XD", adresse: "http://192.168.1.20:7010" });
  assert.deepEqual(lireContenuDuQr(` ${contenuDuQr("7KQ2-M9XD")} `), { code: "7KQ2-M9XD", adresse: null });
  // Un paramètre inconnu — d'un format à venir — ne le rend pas illisible.
  assert.deepEqual(lireContenuDuQr(`${contenuDuQr("7KQ2-M9XD", adresse)}&v=2`), { code: "7KQ2-M9XD", adresse });
  for (const autre of ["https://example.com/?code=7KQ2-M9XD", "brigade://pair", "brigade://pair?url=https%3A%2F%2Fbox", "brigade://other?code=X", "7KQ2-M9XD", ""]) assert.equal(lireContenuDuQr(autre), null, autre);
});

test("l'état d'un code tiré : valable avant son heure, expiré après, servi dès qu'il a appairé un téléphone — même échu ensuite", (t) => {
  const { telephones, heure } = ouvrir(t);
  const { code, expireLe } = telephones.emettre();

  assert.deepEqual(telephones.etat(code), { code, etat: "valable", expireLe, utiliseLe: null, station: null });
  // Tapé comme on le lit, c'est le même.
  assert.equal(telephones.etat(code.toLowerCase().replace("-", " "))?.etat, "valable");

  const servi = telephones.emettre();
  heure.aller("2026-10-21T09:05:00.000Z");
  telephones.appairer(servi.code, PIXEL);
  assert.deepEqual(telephones.etat(servi.code), { code: servi.code, etat: "utilise", expireLe: servi.expireLe, utiliseLe: "2026-10-21T09:05:00.000Z", station: "pixel-8" });

  heure.aller(expireLe);
  assert.equal(telephones.etat(code)?.etat, "expire");
  assert.equal(telephones.etat(servi.code)?.etat, "utilise");
});

test("un code jamais tiré ici, ou qui n'en a pas la forme, n'a pas d'état", (t) => {
  const { telephones } = ouvrir(t);
  telephones.emettre();

  for (const code of ["ABCD-EFGH", "pas un code", ""]) assert.equal(telephones.etat(code), null, code);
});

test("les téléphones appairés sont ceux du registre qui sont des téléphones, dans l'ordre de leur nom ; révoqué, l'un d'eux n'y est plus", (t) => {
  const { telephones, registre } = ouvrir(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  registre.accepter("box");
  telephones.appairer(telephones.emettre().code, PIXEL);
  telephones.appairer(telephones.emettre().code, { nom: "galaxy", machine: "Android 15" });

  assert.deepEqual(
    telephones.appaires().map(({ nom, machine, cuisine }) => ({ nom, machine, cuisine })),
    [
      { nom: "galaxy", machine: "Android 15", cuisine: false },
      { nom: "pixel-8", machine: "Android 16", cuisine: false },
    ],
  );

  telephones.revoquer("galaxy");
  assert.deepEqual(
    telephones.appaires().map(({ nom }) => nom),
    ["pixel-8"],
  );
});

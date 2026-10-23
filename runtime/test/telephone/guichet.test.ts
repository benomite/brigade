// Le guichet des téléphones, joint par HTTP comme le téléphone le joint : le
// code que la commande de la station a tiré l'appaire, une fois, dans son
// quart d'heure ; le jeton qu'il reçoit lui ouvre la liste des stations, où il
// paraît sans cuisine. Sans jeton, la liste est refusée.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { ouvrirRegistre } from "../../src/stations-globales/registre.ts";
import { principal } from "../../src/telephone/appairage-cli.ts";
import { ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { configGuichet, ESSAIS_MAX, ouvrirGuichet, VARIABLE_GUICHET } from "../../src/telephone/guichet.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const horloge = (depart = "2026-10-21T09:00:00.000Z") => {
  let instant = new Date(depart);
  return { maintenant: () => instant, aller: (iso: string) => void (instant = new Date(iso)) };
};

async function ouvrir(t: TestContext) {
  const heure = horloge();
  const repertoire = repertoireTemporaire(t);
  const telephones = ouvrirTelephones(repertoire, { maintenant: heure.maintenant });
  const registre = ouvrirRegistre(repertoire, { maintenant: heure.maintenant });
  const guichet = await ouvrirGuichet({ telephones, hote: "127.0.0.1", port: 0, maintenant: () => heure.maintenant().getTime() });
  t.after(async () => {
    await guichet.fermer();
    telephones.fermer();
    registre.fermer();
  });
  const adresse = `http://127.0.0.1:${guichet.port}`;
  // Le code tel que l'app le reçoit de la commande de la station.
  const tirer = async (args: string[] = []) => {
    const dites: string[] = [];
    await principal({ args: ["code", "--registry", repertoire, ...args], env: {}, dire: (ligne) => dites.push(ligne), redire: () => {} }, { maintenant: heure.maintenant, lirePublication: async () => null });
    return JSON.parse(dites.join("\n")) as { code: string; expiresAt: string; qr: string };
  };
  const appairer = async (corps: unknown) => {
    const reponse = await fetch(`${adresse}/pairing`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof corps === "string" ? corps : JSON.stringify(corps) });
    return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
  };
  const stations = async (entetes: Record<string, string> = {}) => {
    const reponse = await fetch(`${adresse}/stations`, { headers: entetes });
    return { statut: reponse.status, entetes: reponse.headers, corps: (await reponse.json()) as { stations?: Array<Record<string, unknown>>; said?: string } };
  };
  return { heure, registre, adresse, tirer, appairer, stations };
}

test("un code valable appaire le téléphone : il paraît dans la liste des stations, sans cuisine, et n'est jamais candidat pour cuire", async (t) => {
  const { registre, tirer, appairer, stations } = await ouvrir(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  registre.accepter("box");
  const { code } = await tirer();

  const appaire = await appairer({ code, name: "pixel-8", machine: "Android 16" });

  assert.equal(appaire.statut, 201);
  assert.equal(appaire.corps.paired, true);
  assert.equal(typeof appaire.corps.token, "string");
  assert.deepEqual(
    (await stations({ authorization: `Bearer ${String(appaire.corps.token)}` })).corps.stations?.map(({ nom, sorte, cuisine }) => ({ nom, sorte, cuisine })),
    [
      { nom: "box", sorte: "ordinateur", cuisine: true },
      { nom: "pixel-8", sorte: "telephone", cuisine: false },
    ],
  );
  assert.deepEqual(
    registre.utilisables().map(({ nom }) => nom),
    ["box"],
  );
});

test("un code expiré et un code déjà servi sont refusés, et n'appairent rien", async (t) => {
  const { heure, registre, tirer, appairer } = await ouvrir(t);

  const expire = await tirer();
  heure.aller(expire.expiresAt);
  const refusExpire = await appairer({ code: expire.code, name: "pixel-8", machine: "Android 16" });
  assert.equal(refusExpire.statut, 403);
  assert.equal(refusExpire.corps.paired, false);
  assert.equal(refusExpire.corps.reason, "expire");
  assert.equal(refusExpire.corps.token, undefined);
  assert.deepEqual(registre.liste(), []);

  const servi = await tirer();
  assert.equal((await appairer({ code: servi.code, name: "pixel-8", machine: "Android 16" })).statut, 201);
  const avant = registre.liste();
  const refusServi = await appairer({ code: servi.code, name: "autre-telephone", machine: "Android 15" });
  assert.equal(refusServi.statut, 403);
  assert.equal(refusServi.corps.reason, "utilise");
  assert.equal(refusServi.corps.token, undefined);
  assert.deepEqual(registre.liste(), avant);
  assert.equal(registre.lire("autre-telephone"), null);
});

test("le jeton de l'appairage ouvre la liste des stations ; sans lui, ou avec un faux, elle est refusée", async (t) => {
  const { tirer, appairer, stations } = await ouvrir(t);
  const { corps } = await appairer({ code: (await tirer()).code, name: "pixel-8", machine: "Android 16" });
  const jeton = String(corps.token);

  const ouverte = await stations({ authorization: `Bearer ${jeton}` });
  assert.equal(ouverte.statut, 200);
  assert.equal(ouverte.corps.stations?.length, 1);

  for (const entetes of [{} as Record<string, string>, { authorization: "Bearer" }, { authorization: `Bearer ${jeton}x` }, { authorization: `Basic ${jeton}` }, { authorization: jeton }]) {
    const refusee = await stations(entetes);
    assert.equal(refusee.statut, 401, JSON.stringify(entetes));
    assert.equal(refusee.corps.stations, undefined);
    assert.match(refusee.entetes.get("www-authenticate") ?? "", /^Bearer/);
  }
});

test("le QR de la commande porte le code et l'adresse du guichet ; une adresse qui n'est pas http(s) est mal écrite", async (t) => {
  const { adresse, tirer, appairer } = await ouvrir(t);
  const { code, qr } = await tirer(["--url", adresse]);
  const lu = new URL(qr);
  assert.equal(lu.searchParams.get("code"), code);
  assert.equal(lu.searchParams.get("url"), adresse);
  // Ce que le téléphone lit du QR suffit à s'appairer.
  const appaire = await fetch(`${lu.searchParams.get("url")}/pairing`, { method: "POST", body: JSON.stringify({ code: lu.searchParams.get("code"), name: "pixel-8", machine: "Android 16" }) });
  assert.equal(appaire.status, 201);
  assert.equal((await appairer({ code, name: "pixel-8", machine: "Android 16" })).corps.reason, "utilise");

  for (const args of [["--url", "javascript:alert(1)"], ["--url"], ["autre"], ["--registry"]]) {
    await assert.rejects(
      principal({ args: args[0] === "autre" ? args : ["code", ...args], env: {}, dire: () => {}, redire: () => {} }),
      (erreur) => erreur instanceof Sortie && erreur.code === 2,
      args.join(" "),
    );
  }
});

test("une demande mal formée est refusée sans consommer le code, un nom pris aussi", async (t) => {
  const { registre, tirer, appairer } = await ouvrir(t);
  registre.presenter({ nom: "mac", machine: "macOS 26", capacites: ["macos"], cloisonnee: false });
  const { code } = await tirer();

  assert.equal((await appairer("pas du json")).statut, 400);
  assert.equal((await appairer({ code })).corps.reason, "invalide");
  assert.equal((await appairer({ code, name: "Pixel 8", machine: "Android 16" })).statut, 400);
  const pris = await appairer({ code, name: "mac", machine: "Android 16" });
  assert.equal(pris.statut, 409);
  assert.equal(pris.corps.reason, "nom-pris");
  assert.equal(registre.lire("mac")?.sorte, "ordinateur");
  assert.equal((await appairer({ code, name: "pixel-8", machine: "Android 16" })).statut, 201);
});

test("au-delà de vingt essais ratés en dix minutes, le guichet n'en reçoit plus — même le bon code — jusqu'à ce que la fenêtre passe", async (t) => {
  const { heure, registre, tirer, appairer } = await ouvrir(t);
  const { code } = await tirer();
  for (let i = 0; i < ESSAIS_MAX; i++) assert.equal((await appairer({ code: "ZZZZ-ZZZZ", name: "pixel-8", machine: "Android 16" })).statut, 403);

  const retenu = await appairer({ code, name: "pixel-8", machine: "Android 16" });
  assert.equal(retenu.statut, 429);
  assert.equal(retenu.corps.reason, "essais");
  assert.deepEqual(registre.liste(), []);

  heure.aller("2026-10-21T09:10:00.000Z");
  assert.equal((await appairer({ code, name: "pixel-8", machine: "Android 16" })).statut, 201);
});

test("ce qui n'est pas une route du guichet est refusé", async (t) => {
  const { adresse } = await ouvrir(t);
  assert.equal((await fetch(`${adresse}/pairing`)).status, 405);
  assert.equal((await fetch(`${adresse}/stations`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${adresse}/`)).status, 404);
  assert.equal((await fetch(`${adresse}/pairing/codes`, { method: "POST" })).status, 404);
});

test("la station n'ouvre le guichet que si son environnement en donne l'adresse", () => {
  assert.equal(configGuichet({}), null);
  assert.equal(configGuichet({ [VARIABLE_GUICHET]: "" }), null);
  assert.deepEqual(configGuichet({ [VARIABLE_GUICHET]: "0.0.0.0:8787" }), { hote: "0.0.0.0", port: 8787 });
  assert.deepEqual(configGuichet({ [VARIABLE_GUICHET]: "[::]:8787" }), { hote: "::", port: 8787 });
  assert.deepEqual(configGuichet({ [VARIABLE_GUICHET]: "box.tail.ts.net:443" }), { hote: "box.tail.ts.net", port: 443 });
  for (const ecrite of ["8787", "box:", "box:0", "box:70000", "box 1:80"]) assert.throws(() => configGuichet({ [VARIABLE_GUICHET]: ecrite }), ConfigInvalide, ecrite);
});

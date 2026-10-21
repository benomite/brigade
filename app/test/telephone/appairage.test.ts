// L'écran d'appairage de l'app Android (#1161) : sur une installation neuve, le premier écran demande de relier
// le téléphone aux projets — l'adresse de la station et son code, ou son QR ; un code valable mène aux projets ;
// un code faux, expiré ou déjà servi se dit, et le chef retape ; la station injoignable se dit aussi. Sur le
// desktop, rien de tout cela n'est posé. La vue est jouée telle qu'elle est (aides/fausse-vue.ts) ; ce que le
// pont de l'app Android fait du code est éprouvé à part (packaging/android.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { DemandeDuTelephone, LectureDuQr, ReponseDuGuichet, Telephone } from "../../src/vue/pont.d.ts";
import { adresseDuGuichet, ATTENDU, issueDe, lireLeQr, presentationDuTelephone, TITRE } from "../../src/vue/telephone/appairage.js";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36";
const ADRESSE = "http://192.168.1.20:7010";
const QR = `brigade://pair?code=7KQ2-M9XD&url=${encodeURIComponent(ADRESSE)}`;

// Ce que les refus du guichet disent, mot pour mot (runtime/src/telephone/appairage.ts).
const REFUS: Record<string, ReponseDuGuichet> = {
  inconnu: { paired: false, reason: "inconnu", said: "code refused: no pairing code was issued under it — ask your station for a new one" },
  expire: { paired: false, reason: "expire", said: "code refused: it expired at 2026-10-21T09:58:00.000Z — ask your station for a new one" },
  utilise: { paired: false, reason: "utilise", said: "code refused: it was already used, at 2026-10-21T09:50:00.000Z — a code pairs one phone, once" },
  nomPris: { paired: false, reason: "nom-pris", said: "pairing refused: `pixel-8` is already a station that cooks — pair the phone under another name" },
};

describe("ce que l'écran lit et dit", () => {
  test("le QR d'une station : son code, et l'adresse de son guichet quand il la porte", () => {
    assert.deepEqual(lireLeQr(QR), { code: "7KQ2-M9XD", adresse: ADRESSE });
    assert.deepEqual(lireLeQr("  brigade://pair?code=7KQ2-M9XD "), { code: "7KQ2-M9XD", adresse: null });
    assert.deepEqual(lireLeQr("BRIGADE://pair/?code=7KQ2-M9XD&url=192.168.1.20%3A7010#x"), { code: "7KQ2-M9XD", adresse: ADRESSE });
    for (const autre of ["https://example.com/?code=7KQ2-M9XD", "brigade://pair", "brigade://other?code=X", "7KQ2-M9XD", ""]) assert.equal(lireLeQr(autre), null, autre);
  });

  test("l'adresse tapée, avec ou sans http : celle que le pont joint", () => {
    assert.equal(adresseDuGuichet("192.168.1.20:7010"), ADRESSE);
    assert.equal(adresseDuGuichet(" http://192.168.1.20:7010/ "), ADRESSE);
    assert.equal(adresseDuGuichet("https://atelier.local:7010/pairing"), "https://atelier.local:7010");
    assert.equal(adresseDuGuichet("[fe80::1]:7010"), "http://[fe80::1]:7010");
    for (const fausse of ["", "   ", "ftp://192.168.1.20", "http://", "a b"]) assert.equal(adresseDuGuichet(fausse), null, fausse);
  });

  test("le téléphone se présente sous le nom de son modèle, et sa machine telle que la liste des stations la montre", () => {
    assert.deepEqual(presentationDuTelephone(PIXEL), { nom: "pixel-8", machine: "Android 14 · Pixel 8" });
    assert.deepEqual(presentationDuTelephone("Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36"), { nom: "sm-s921b", machine: "Android 15 · SM-S921B" });
    // Un user agent réduit (`K`), ou sans Android : un nom quand même, que le registre accepte.
    assert.deepEqual(presentationDuTelephone("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"), { nom: "android", machine: "Android 10" });
    assert.deepEqual(presentationDuTelephone("Node.js/26"), { nom: "android", machine: "Android" });
    for (const ua of [PIXEL, "Mozilla/5.0 (Linux; Android 14; Galaxy Ñ Ü)", "x"]) assert.match(presentationDuTelephone(ua).nom, /^[a-z0-9][a-z0-9-]*$/, ua);
  });

  test("chaque réponse du guichet se dit en une ligne, son détail à part", () => {
    assert.deepEqual(issueDe({ paired: true, station: "atelier" }, ADRESSE), { etat: "appaire", station: "atelier" });
    assert.deepEqual(issueDe(REFUS.inconnu!, ADRESSE), { etat: "code", ligne: "Wrong code: check it on your station, then type it again.", detail: REFUS.inconnu!.paired ? "" : REFUS.inconnu!.said });
    assert.equal((issueDe(REFUS.expire!, ADRESSE) as { ligne: string }).ligne, "This code has expired: ask your station for a new one.");
    assert.equal((issueDe(REFUS.utilise!, ADRESSE) as { ligne: string }).ligne, "This code was already used: ask your station for a new one.");
    assert.equal((issueDe({ paired: false, reason: "essais", said: "too many" }, ADRESSE) as { ligne: string }).ligne, "Too many wrong codes: wait a few minutes, then try again.");
    assert.deepEqual(issueDe({ paired: false, reason: "injoignable", said: "failed to connect" }, ADRESSE), {
      etat: "injoignable",
      ligne: "Your station does not answer at 192.168.1.20:7010.",
      detail: "failed to connect — check that the station is running, and that this phone is on its network.",
    });
    assert.deepEqual(issueDe({ paired: false, reason: "inattendu", said: "answered 404" }, ADRESSE), { etat: "refuse", ligne: "The station refused to pair this phone.", detail: "answered 404" });
  });
});

// Le démarrage que le pont de l'app Android rend : les constantes de l'app, aucun projet, et l'appairage.
const demarrage = (telephone: Telephone | null) => () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: [], hotes: [] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(telephone === null ? {} : { telephone }),
});

type Gestes = { appairerLeTelephone?: (demande: DemandeDuTelephone) => Promise<ReponseDuGuichet> | ReponseDuGuichet; scannerLeQr?: () => LectureDuQr };

// L'app Android lancée sur un téléphone Pixel 8 : `navigator.userAgent` est celui de sa WebView. `null` : le
// desktop, dont le démarrage ne dit aucun appairage.
async function auLancement(gestes: Gestes = {}, telephone: Telephone | null = { appaire: false }) {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: PIXEL }, configurable: true });
  try {
    const vue = await jouerLaVue({
      demarrage: demarrage(telephone),
      espace: () => [],
      // Une réponse qui tarde est une promesse : le faux pont l'attend comme une autre.
      appairerLeTelephone: (demande) => (gestes.appairerLeTelephone?.(demande) ?? REFUS.inconnu!) as ReponseDuGuichet,
      scannerLeQr: () => gestes.scannerLeQr?.() ?? { annule: true },
    });
    const ecran = () => vue.element("appairage");
    const champ = (id: string) => ecran().dessous("input").find((saisie) => saisie.id === id) as Faux;
    const bouton = (texte: string) => ecran().dessous("button").find((pose) => pose.textContent === texte) as Faux;
    const issue = () => ecran().dessous("div").find((pose) => pose.className === "issue-appairage") as Faux;
    const ligne = () => issue().dessous("span").find((pose) => pose.parentElement?.className === "indisponible")?.textContent ?? issue().textContent;
    const detail = () => issue().dessous("button").find((pose) => pose.className === "aide")?.ariaLabel ?? "";
    const taper = (adresse: string, code: string) => {
      champ("adresse-guichet").value = adresse;
      champ("code-telephone").value = code;
    };
    const appairer = async () => {
      bouton("pair").click();
      await repos();
    };
    const envois = () => vue.appels.filter(({ geste }) => geste === "appairerLeTelephone").map(({ args }) => args[0]);
    return { vue, ecran, champ, bouton, issue, ligne, detail, taper, appairer, envois };
  } finally {
    if (avant === undefined) delete (globalThis as { navigator?: unknown }).navigator;
    else Object.defineProperty(globalThis, "navigator", avant);
  }
}

describe("sur une installation neuve, le premier écran relie le téléphone aux projets", () => {
  test("il demande l'adresse et le code, ou le QR — le reste de l'app est caché derrière", async () => {
    const { vue, ecran, champ, bouton, issue } = await auLancement();
    assert.equal(ecran().hidden, false);
    assert.equal(vue.element("cadre").hidden, true);
    assert.equal(ecran().dessous("h2")[0]?.firstChild, TITRE);
    assert.equal(ecran().dessous("p").find((pose) => pose.className === "attendu")?.textContent, ATTENDU);
    assert.equal(champ("adresse-guichet").placeholder, "like 192.168.1.20:7010");
    assert.equal(champ("code-telephone").placeholder, "like 7KQ2-M9XD");
    assert.deepEqual(
      ecran()
        .dessous("button")
        .filter((pose) => pose.parentElement?.className === "action")
        .map((pose) => [pose.textContent, pose.className]),
      [
        ["pair", "recommande"],
        ["scan the QR", ""],
      ],
    );
    assert.equal(bouton("pair").disabled, false);
    assert.equal(issue().textContent, "");
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "appairerLeTelephone"), []);
  });

  test("un code valable : le pont l'envoie au guichet avec le nom du téléphone, et l'app passe aux projets", async () => {
    const { vue, ecran, taper, appairer, envois } = await auLancement({ appairerLeTelephone: () => ({ paired: true, station: "atelier" }) });
    taper(" 192.168.1.20:7010 ", " 7kq2 m9xd ");
    await appairer();
    assert.deepEqual(envois(), [{ adresse: ADRESSE, code: "7kq2 m9xd", nom: "pixel-8", machine: "Android 14 · Pixel 8" }]);
    // Les projets : l'app est là, sur « Tous les projets », et l'écran d'appairage n'est plus qu'une ligne en tête.
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(ecran().className, "fait");
    assert.equal(ecran().dessous("input").length, 0);
    const appaire = ecran().dessous("p").find((pose) => pose.className === "appaire");
    assert.equal(appaire?.textContent.replace(/\?$/, ""), "This phone is paired with atelier.");
    assert.equal(appaire?.dessous("code")[0]?.textContent, "atelier");
  });

  test("un code faux : la ligne le dit, la réponse de la station au survol, et un second code, bon, passe", async () => {
    let reponse: ReponseDuGuichet = REFUS.inconnu!;
    const { vue, champ, bouton, ligne, detail, taper, appairer, envois } = await auLancement({ appairerLeTelephone: () => reponse });
    taper("192.168.1.20:7010", "7KQ2-M9XE");
    await appairer();
    assert.equal(ligne(), "Wrong code: check it on your station, then type it again.");
    assert.equal(detail(), REFUS.inconnu!.paired ? "" : REFUS.inconnu!.said);
    // Rien n'est perdu de ce qui a été tapé, et le chef peut retaper : les gestes sont rendus.
    assert.equal(champ("code-telephone").value, "7KQ2-M9XE");
    assert.equal(champ("adresse-guichet").value, "192.168.1.20:7010");
    assert.equal(bouton("pair").disabled, false);
    assert.ok(champ("code-telephone").focalise > 0);
    assert.equal(vue.element("cadre").hidden, true);
    reponse = { paired: true, station: "atelier" };
    champ("code-telephone").value = "7KQ2-M9XD";
    await appairer();
    assert.equal(envois().length, 2);
    assert.equal(vue.element("cadre").hidden, false);
  });

  for (const [motif, dit] of [
    ["expire", "This code has expired: ask your station for a new one."],
    ["utilise", "This code was already used: ask your station for a new one."],
  ] as const) {
    test(`un code ${motif === "expire" ? "expiré" : "déjà servi"} : la ligne dit d'en demander un neuf, et rien n'est appairé`, async () => {
      const { vue, ligne, bouton, taper, appairer } = await auLancement({ appairerLeTelephone: () => REFUS[motif]! });
      taper("192.168.1.20:7010", "7KQ2-M9XD");
      await appairer();
      assert.equal(ligne(), dit);
      assert.equal(bouton("pair").disabled, false);
      assert.equal(vue.element("cadre").hidden, true);
    });
  }

  test("la station injoignable : l'écran le dit en une ligne, ce que le réseau en a dit au survol — même quand le pont lève", async () => {
    for (const repondre of [() => ({ paired: false, reason: "injoignable", said: "failed to connect to /192.168.1.20 (port 7010)" }) as ReponseDuGuichet, (): never => {
      throw new Error("failed to connect to /192.168.1.20 (port 7010)");
    }]) {
      const { ligne, detail, bouton, taper, appairer } = await auLancement({ appairerLeTelephone: repondre });
      taper("192.168.1.20:7010", "7KQ2-M9XD");
      await appairer();
      assert.equal(ligne(), "Your station does not answer at 192.168.1.20:7010.");
      assert.equal(detail(), "failed to connect to /192.168.1.20 (port 7010) — check that the station is running, and that this phone is on its network.");
      assert.equal(bouton("pair").disabled, false);
    }
  });

  test("pendant l'envoi, la ligne dit qu'on attend la station, et les deux gestes sont inactifs", async () => {
    let repondre: (reponse: ReponseDuGuichet) => void = () => undefined;
    const { vue, issue, bouton, taper, appairer, envois } = await auLancement({ appairerLeTelephone: () => new Promise((rendre) => (repondre = rendre)) });
    taper("192.168.1.20:7010", "7KQ2-M9XD");
    await appairer();
    assert.equal(issue().textContent, "Waiting for your station at 192.168.1.20:7010…");
    assert.equal(bouton("pair").disabled, true);
    assert.equal(bouton("scan the QR").disabled, true);
    // Un second « pair » (Entrée, au clavier) n'envoie rien de plus.
    vue.element("appairage").dessous("form")[0]?.declencher("submit");
    await repos();
    assert.equal(envois().length, 1);
    repondre({ paired: true, station: "atelier" });
    await repos();
    assert.equal(vue.element("cadre").hidden, false);
  });

  test("un champ vide ou une adresse qui n'en est pas une : la ligne sous les champs le dit, et rien ne part", async () => {
    const { ecran, champ, taper, appairer, envois } = await auLancement();
    const manque = () => ecran().dessous("p").find((pose) => pose.className === "refus-champ")?.textContent;
    await appairer();
    assert.equal(manque(), "Type your station's address, like 192.168.1.20:7010.");
    assert.equal(champ("adresse-guichet").ariaInvalid, "true");
    taper("ftp://192.168.1.20", "");
    await appairer();
    assert.equal(manque(), "This is not an address: type it like 192.168.1.20:7010.");
    taper("192.168.1.20:7010", "  ");
    await appairer();
    assert.equal(manque(), "Type the code your station shows.");
    assert.equal(champ("code-telephone").ariaInvalid, "true");
    assert.equal(champ("adresse-guichet").ariaInvalid, "false");
    assert.deepEqual(envois(), []);
  });

  test("Entrée dans un champ envoie, comme « pair »", async () => {
    const { ecran, taper, envois } = await auLancement();
    taper("192.168.1.20:7010", "7KQ2-M9XD");
    ecran().dessous("form")[0]?.declencher("submit");
    await repos();
    assert.equal(envois().length, 1);
  });

  test("un nom de modèle déjà pris par une station qui cuit : le téléphone réessaie une fois sous `-phone`", async () => {
    const { vue, taper, appairer, envois } = await auLancement({ appairerLeTelephone: ({ nom }) => (nom === "pixel-8" ? REFUS.nomPris! : { paired: true, station: nom }) });
    taper("192.168.1.20:7010", "7KQ2-M9XD");
    await appairer();
    assert.deepEqual(
      envois().map((envoi) => (envoi as DemandeDuTelephone).nom),
      ["pixel-8", "pixel-8-phone"],
    );
    assert.equal(vue.element("appairage").textContent.replace(/\?$/, ""), "This phone is paired with pixel-8-phone.");
  });
});

describe("le QR de la station", () => {
  test("scanné, il remplit l'adresse et le code, et part aussitôt", async () => {
    const { vue, champ, bouton, envois } = await auLancement({ scannerLeQr: () => ({ lu: QR }), appairerLeTelephone: () => ({ paired: true, station: "atelier" }) });
    // Appairé, l'écran ne garde plus ses champs : on les tient d'avant.
    const [adresse, code] = [champ("adresse-guichet"), champ("code-telephone")];
    bouton("scan the QR").click();
    await repos();
    assert.equal(code.value, "7KQ2-M9XD");
    assert.equal(adresse.value, "192.168.1.20:7010");
    assert.deepEqual(envois(), [{ adresse: ADRESSE, code: "7KQ2-M9XD", nom: "pixel-8", machine: "Android 14 · Pixel 8" }]);
    assert.equal(vue.element("cadre").hidden, false);
  });

  test("un QR sans adresse garde celle qui est tapée", async () => {
    const { champ, bouton, taper, envois } = await auLancement({ scannerLeQr: () => ({ lu: "brigade://pair?code=7KQ2-M9XD" }) });
    taper("192.168.1.20:7010", "");
    bouton("scan the QR").click();
    await repos();
    assert.equal(champ("code-telephone").value, "7KQ2-M9XD");
    assert.equal((envois()[0] as DemandeDuTelephone).adresse, ADRESSE);
  });

  test("renoncé, rien ne change ; illisible, ou qui n'est pas d'une station, une ligne le dit, et rien ne part", async () => {
    let lecture: LectureDuQr = { annule: true };
    const { bouton, ligne, detail, issue, envois } = await auLancement({ scannerLeQr: () => lecture });
    bouton("scan the QR").click();
    await repos();
    assert.equal(issue().textContent, "");
    lecture = { refus: "camera unavailable" };
    bouton("scan the QR").click();
    await repos();
    assert.equal(ligne(), "The QR could not be read: type the code instead.");
    assert.equal(detail(), "camera unavailable");
    lecture = { lu: "https://example.com" };
    bouton("scan the QR").click();
    await repos();
    assert.equal(ligne(), "This QR is not a pairing code from a station.");
    assert.deepEqual(envois(), []);
  });
});

describe("hors d'une installation neuve", () => {
  test("le téléphone déjà appairé : l'app s'ouvre sur « Tous les projets », sans écran d'appairage", async () => {
    const { vue, ecran } = await auLancement({}, { appaire: true, station: "atelier", adresse: ADRESSE });
    assert.equal(ecran().hidden, true);
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
  });

  test("le desktop, qui ne rend aucun `telephone` : rien n'est posé, et sans projet l'app s'ouvre sur l'ajout, comme avant", async () => {
    const { vue, ecran } = await auLancement({}, null);
    assert.equal(ecran().hidden, true);
    assert.equal(ecran().children.length, 0);
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("ajout").hidden, false);
  });
});

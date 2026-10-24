// Les gestes de l'appairage, tels que l'app de l'ordinateur les lance chez la
// station (`appairage-cli.ts`, et `brigade <projet> phones` qui le joue) : un
// code neuf avec son heure et son QR, l'état d'un code — valable, expiré ou
// servi —, la liste des téléphones appairés, et la révocation de l'un d'eux,
// après laquelle il n'est plus dans la liste et le guichet ne l'écoute plus.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { DUREE_DU_CODE_MS } from "../../src/appairage/document.ts";
import { Sortie } from "../../src/appel.ts";
import { ouvrirRegistre } from "../../src/stations-globales/registre.ts";
import { principal, usage } from "../../src/telephone/appairage-cli.ts";
import { lireContenuDuQr, ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { ouvrirGuichet } from "../../src/telephone/guichet.ts";
import { LANCE } from "../../src/telephones.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const DEPART = "2026-10-24T09:00:00.000Z";

async function station(t: TestContext) {
  let instant = new Date(DEPART);
  const maintenant = () => instant;
  const repertoire = repertoireTemporaire(t);
  const telephones = ouvrirTelephones(repertoire, { maintenant });
  const registre = ouvrirRegistre(repertoire, { maintenant });
  const guichet = await ouvrirGuichet({ telephones, hote: "127.0.0.1", port: 0, maintenant: () => instant.getTime() });
  // Fermés avant que le répertoire ne disparaisse : sous Windows, une base
  // ouverte ne se supprime pas.
  aArreter(t, async () => {
    await guichet.fermer();
    telephones.fermer();
    registre.fermer();
  });
  const adresse = `http://127.0.0.1:${guichet.port}`;
  // Un geste, lancé comme l'app le lance : sa réponse JSON, ce qu'il a dit au chef.
  const commande = async (args: string[]) => {
    const [dites, redites]: [string[], string[]] = [[], []];
    await principal({ args: [...args, "--registry", repertoire], env: {}, dire: (ligne) => dites.push(ligne), redire: (ligne) => redites.push(ligne) }, { maintenant, lirePublication: async () => null });
    assert.equal(dites.length, 1, dites.join("\n"));
    return { rendu: JSON.parse(dites[0] ?? "") as Record<string, unknown>, redites };
  };
  const refus = (args: string[], code: number) =>
    assert.rejects(
      principal({ args: [...args, "--registry", repertoire], env: {}, dire: () => assert.fail("rien ne se dit sur la sortie standard d'un refus"), redire: () => {} }, { maintenant }),
      (erreur) => erreur instanceof Sortie && erreur.code === code,
      args.join(" "),
    );
  const appairer = async (code: string, name: string) => {
    const reponse = await fetch(`${adresse}/pairing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name, machine: "Android 16" }) });
    return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
  };
  const stations = async (jeton: string) => (await fetch(`${adresse}/stations`, { headers: { authorization: `Bearer ${jeton}` } })).status;
  return { registre, adresse, commande, refus, appairer, stations, aller: (iso: string) => void (instant = new Date(iso)) };
}

test("`code` rend un code neuf, son heure d'expiration et le QR qui porte l'adresse de la station avec le code", async (t) => {
  const { commande } = await station(t);

  const { rendu } = await commande(["code", "--url", "https://box.tail1234.ts.net"]);

  assert.match(String(rendu.code), /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(rendu.expiresAt, new Date(Date.parse(DEPART) + DUREE_DU_CODE_MS).toISOString());
  assert.equal(rendu.url, "https://box.tail1234.ts.net");
  assert.deepEqual(lireContenuDuQr(String(rendu.qr)), { code: rendu.code, adresse: "https://box.tail1234.ts.net" });
});

test("`status` dit d'un code exactement un de valid, expired ou used — chacun des trois", async (t) => {
  const { commande, appairer, aller } = await station(t);
  const tire = (await commande(["code"])).rendu;
  const servi = (await commande(["code"])).rendu;

  // Valable : tiré, ni servi ni échu.
  assert.deepEqual((await commande(["status", String(tire.code)])).rendu, { code: tire.code, status: "valid", expiresAt: tire.expiresAt, usedAt: null, phone: null });

  // Servi : il a appairé un téléphone.
  aller("2026-10-24T09:03:00.000Z");
  assert.equal((await appairer(String(servi.code), "pixel-8")).statut, 201);
  assert.deepEqual((await commande(["status", String(servi.code)])).rendu, { code: servi.code, status: "used", expiresAt: servi.expiresAt, usedAt: "2026-10-24T09:03:00.000Z", phone: "pixel-8" });

  // Expiré : son heure est passée sans qu'il serve — et le guichet le refuse aussi.
  aller(String(tire.expiresAt));
  assert.deepEqual((await commande(["status", String(tire.code)])).rendu, { code: tire.code, status: "expired", expiresAt: tire.expiresAt, usedAt: null, phone: null });
  assert.equal((await appairer(String(tire.code), "galaxy")).corps.reason, "expire");
  // Servi, il le reste une fois échu.
  assert.equal((await commande(["status", String(servi.code)])).rendu.status, "used");
});

test("`status` refuse un code que la station n'a jamais tiré, et dit mal écrit ce qui n'est pas un code", async (t) => {
  const { refus } = await station(t);

  await refus(["status", "ABCD-EFGH"], 1);
  for (const args of [["status"], ["status", "pas-un-code"], ["status", "--registry"]]) await refus(args, 2);
});

test("`list` rend les téléphones appairés à la station, pas ses ordinateurs ; `revoke` en retire un, qui n'est plus dans la liste et que le guichet n'écoute plus", async (t) => {
  const { registre, commande, refus, appairer, stations } = await station(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  registre.accepter("box");
  assert.deepEqual((await commande(["list"])).rendu, { phones: [] });

  const pixel = await appairer(String((await commande(["code"])).rendu.code), "pixel-8");
  const galaxy = await appairer(String((await commande(["code"])).rendu.code), "galaxy");
  const [jetonPixel, jetonGalaxy] = [String(pixel.corps.token), String(galaxy.corps.token)];
  assert.deepEqual((await commande(["list"])).rendu, {
    phones: [
      { name: "galaxy", machine: "Android 16", pairedAt: DEPART },
      { name: "pixel-8", machine: "Android 16", pairedAt: DEPART },
    ],
  });
  assert.equal(await stations(jetonPixel), 200);

  assert.deepEqual((await commande(["revoke", "pixel-8"])).rendu, { revoked: true, station: "pixel-8" });

  assert.deepEqual(
    ((await commande(["list"])).rendu.phones as Array<{ name: string }>).map(({ name }) => name),
    ["galaxy"],
  );
  assert.equal(await stations(jetonPixel), 401);
  assert.equal(await stations(jetonGalaxy), 200);
  // Révoqué une seconde fois, ou un ordinateur : refusé, rien ne change.
  await refus(["revoke", "pixel-8"], 1);
  await refus(["revoke", "box"], 1);
  assert.equal(registre.lire("box")?.nom, "box");
  await refus(["list", "pixel-8"], 2);
});

test("l'usage nomme chaque geste sous la forme où il se lance : la commande de la station, ou celle de la box", () => {
  assert.equal(
    usage(),
    [
      "usage: node runtime/src/telephone/appairage-cli.ts code [--url <phone desk address>] [--registry <directory>]",
      "       node runtime/src/telephone/appairage-cli.ts status <code> [--registry <directory>]",
      "       node runtime/src/telephone/appairage-cli.ts list [--registry <directory>]",
      "       node runtime/src/telephone/appairage-cli.ts revoke <phone> [--registry <directory>]",
    ].join("\n"),
  );
  assert.match(usage(LANCE), /^usage: brigade <project> phones code /);
});

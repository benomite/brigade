// Le téléphone joint la station d'un autre réseau par le tailnet du chef
// (#1408) : le guichet écoute sur la boucle locale, `tailscale serve` le publie
// sur le tailnet, et le QR porte l'adresse publiée.
//
// Le tailnet lui-même ne se monte pas dans un test : un relais HTTP en tient
// lieu, comme tailscaled — il reçoit le téléphone à l'adresse publiée et passe
// la demande au guichet sur la boucle —, et la publication est ce que
// `tailscale serve status --json` en rendrait. Le téléphone du test ne connaît
// que l'adresse du QR : jamais celle où le guichet écoute.
import assert from "node:assert/strict";
import { request, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { ouvrirRegistre } from "../../src/stations-globales/registre.ts";
import { principal } from "../../src/telephone/appairage-cli.ts";
import { ouvrirTelephones } from "../../src/telephone/appairage.ts";
import { ouvrirGuichet } from "../../src/telephone/guichet.ts";
import { lirePublication, publicationDuGuichet, VARIABLE_TAILSCALE } from "../../src/telephone/tailnet.ts";
import { repertoireTemporaire } from "../outils.ts";

const maintenant = () => new Date("2026-10-23T09:00:00.000Z");

// Ce que `tailscale serve --bg <port>` publie : la racine de
// `https://box.tail1234.ts.net`, passée au guichet sur la boucle locale.
const serveDuGuichet = (port: number, { hote = "box.tail1234.ts.net:443", https = true } = {}) => ({
  TCP: { [hote.split(":").at(-1) ?? ""]: https ? { HTTPS: true } : { HTTP: true } },
  Web: { [hote]: { Handlers: { "/": { Proxy: `http://127.0.0.1:${port}` } } } },
});

// Le relais qui tient lieu de tailscaled : chaque demande reçue passe au
// guichet, telle quelle, et compte.
async function relaisDuTailnet(t: TestContext, guichet: number) {
  const relais = { passees: 0, port: 0 };
  const serveur = createServer((entree, sortie) => {
    relais.passees += 1;
    const vers = request({ host: "127.0.0.1", port: guichet, method: entree.method, path: entree.url, headers: entree.headers }, (reponse) => {
      sortie.writeHead(reponse.statusCode ?? 502, reponse.headers);
      reponse.pipe(sortie);
    });
    vers.on("error", () => sortie.writeHead(502).end());
    entree.pipe(vers);
  });
  await new Promise<void>((pret) => serveur.listen(0, "127.0.0.1", pret));
  relais.port = (serveur.address() as AddressInfo).port;
  t.after(
    () =>
      new Promise<void>((ferme) => {
        serveur.close(() => ferme());
        serveur.closeAllConnections();
      }),
  );
  return relais;
}

async function ouvrir(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const telephones = ouvrirTelephones(repertoire, { maintenant });
  const registre = ouvrirRegistre(repertoire, { maintenant });
  // Le guichet n'écoute que sur la boucle locale : d'ailleurs, rien ne le joint en direct.
  const guichet = await ouvrirGuichet({ telephones, hote: "127.0.0.1", port: 0 });
  t.after(async () => {
    await guichet.fermer();
    telephones.fermer();
    registre.fermer();
  });
  const relais = await relaisDuTailnet(t, guichet.port);
  // Le relais publié comme serve le dirait du tailnet : en HTTP, à son adresse.
  const publication = serveDuGuichet(guichet.port, { hote: `127.0.0.1:${relais.port}`, https: false });
  const commande = async (args: string[], options: { publication?: unknown } = {}) => {
    const dites: string[] = [];
    const redites: string[] = [];
    await principal(
      { args: [...args, "--registry", repertoire], env: {}, dire: (ligne) => dites.push(ligne), redire: (ligne) => redites.push(ligne) },
      { maintenant, lirePublication: async () => ("publication" in options ? options.publication : publication) },
    );
    return { rendu: JSON.parse(dites.join("\n")) as Record<string, unknown>, redites };
  };
  const tirer = async (options: { publication?: unknown } = {}) => {
    const { rendu, redites } = await commande(["code"], options);
    return { code: String(rendu.code), qr: new URL(String(rendu.qr)), url: rendu.url as string | null, redites };
  };
  // Le téléphone : il ne connaît que l'adresse que le QR lui a donnée.
  const telephone = (qr: URL) => {
    const url = qr.searchParams.get("url");
    assert.ok(url !== null, "le QR porte l'adresse du guichet");
    return {
      appairer: async (corps: unknown) => {
        const reponse = await fetch(`${url}/pairing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
        return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
      },
      stations: async (jeton?: string) => {
        const reponse = await fetch(`${url}/stations`, { headers: jeton === undefined ? {} : { authorization: `Bearer ${jeton}` } });
        return { statut: reponse.status, corps: (await reponse.json()) as { stations?: Array<{ nom: string }> } };
      },
    };
  };
  return { repertoire, telephones, registre, guichet, relais, commande, tirer, telephone };
}

test("un téléphone qui ne connaît que l'adresse du tailnet — celle du QR — s'y appaire et lit les stations, sans jamais joindre le guichet en direct", async (t) => {
  const { telephones, registre, guichet, relais, tirer, telephone } = await ouvrir(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  registre.accepter("box");

  // Le guichet a dit où il écoute : la boucle locale, que seul le relais du tailnet joint.
  assert.deepEqual(telephones.guichet(), { hote: "127.0.0.1", port: guichet.port });
  const { code, qr, url, redites } = await tirer();
  assert.equal(url, `http://127.0.0.1:${relais.port}`);
  assert.equal(qr.searchParams.get("url"), url);
  assert.equal(qr.searchParams.get("code"), code);
  assert.notEqual(relais.port, guichet.port);
  assert.match(redites.join("\n"), /from any network, through your tailnet/);

  const mobile = telephone(qr);
  const appaire = await mobile.appairer({ code, name: "pixel-8", machine: "Android 16" });
  assert.equal(appaire.statut, 201);
  assert.equal(appaire.corps.paired, true);
  const lues = await mobile.stations(String(appaire.corps.token));
  assert.equal(lues.statut, 200);
  assert.deepEqual(
    lues.corps.stations?.map(({ nom }) => nom),
    ["box", "pixel-8"],
  );
  // Les deux demandes sont passées par le tailnet, aucune à côté.
  assert.equal(relais.passees, 2);
});

test("par le tailnet, un client qui n'est pas appairé, ou dont le téléphone a été révoqué, est refusé", async (t) => {
  const { registre, relais, commande, tirer, telephone } = await ouvrir(t);
  const premier = await tirer();
  const mobile = telephone(premier.qr);

  // Sans jeton, ou avec un jeton qui n'a jamais été donné.
  assert.equal((await mobile.stations()).statut, 401);
  assert.equal((await mobile.stations("brgt_inventé")).statut, 401);

  const { corps } = await mobile.appairer({ code: premier.code, name: "pixel-8", machine: "Android 16" });
  const jeton = String(corps.token);
  assert.equal((await mobile.stations(jeton)).statut, 200);

  // Le chef révoque le téléphone : son jeton n'ouvre plus rien, il a quitté le registre.
  const { rendu, redites } = await commande(["revoke", "pixel-8"]);
  assert.deepEqual(rendu, { revoked: true, station: "pixel-8" });
  assert.match(redites.join("\n"), /no longer paired/);
  const refusee = await mobile.stations(jeton);
  assert.equal(refusee.statut, 401);
  assert.equal(refusee.corps.stations, undefined);
  assert.equal(registre.lire("pixel-8"), null);
  // Le code d'avant est servi : il ne le ramène pas.
  assert.equal((await mobile.appairer({ code: premier.code, name: "pixel-8", machine: "Android 16" })).statut, 403);

  // Appairé de nouveau, d'un code neuf : le nouveau jeton ouvre, l'ancien toujours pas.
  const second = await tirer();
  const rappaire = await telephone(second.qr).appairer({ code: second.code, name: "pixel-8", machine: "Android 16" });
  assert.equal((await mobile.stations(String(rappaire.corps.token))).statut, 200);
  assert.equal((await mobile.stations(jeton)).statut, 401);
  assert.ok(relais.passees >= 9);
});

test("la révocation ne retire qu'un téléphone appairé : un nom inconnu, ou celui d'une station qui cuit, est refusé sans rien changer", async (t) => {
  const { registre, commande } = await ouvrir(t);
  registre.presenter({ nom: "box", machine: "Debian GNU/Linux 13 (trixie)", capacites: ["linux"], cloisonnee: true });
  registre.accepter("box");

  for (const nom of ["pixel-8", "box"]) {
    await assert.rejects(
      commande(["revoke", nom]),
      (erreur) => erreur instanceof Sortie && erreur.code === 1,
      nom,
    );
  }
  assert.equal(registre.lire("box")?.nom, "box");
  for (const args of [["revoke"], ["revoke", "--registry"], ["revoke", "pixel-8", "--url", "http://x"]]) {
    await assert.rejects(
      principal({ args, env: {}, dire: () => {}, redire: () => {} }),
      (erreur) => erreur instanceof Sortie && erreur.code === 2,
      args.join(" "),
    );
  }
});

test("sans publication sur le tailnet, le QR porte l'adresse où le guichet écoute — jamais la boucle locale, que le téléphone ne joint pas", async (t) => {
  const { telephones, guichet, tirer } = await ouvrir(t);

  const surLaBoucle = await tirer({ publication: null });
  assert.equal(surLaBoucle.url, null);
  assert.equal(surLaBoucle.qr.searchParams.get("url"), null);
  assert.match(surLaBoucle.redites.join("\n"), new RegExp(`tailscale serve --bg ${guichet.port}`));

  telephones.annoncer({ hote: "192.168.1.20", port: 7010 });
  const surLeReseau = await tirer({ publication: null });
  assert.equal(surLeReseau.url, "http://192.168.1.20:7010");
  assert.equal(surLeReseau.qr.searchParams.get("url"), "http://192.168.1.20:7010");
  assert.match(surLeReseau.redites.join("\n"), /from this network only/);

  telephones.annoncer({ hote: "fd7a:115c:a1e0::1", port: 7010 });
  assert.equal((await tirer({ publication: null })).url, "http://[fd7a:115c:a1e0::1]:7010");

  telephones.annoncer({ hote: "0.0.0.0", port: 7010 });
  assert.equal((await tirer({ publication: null })).url, null);
  // Publié par serve, le guichet qui écoute partout se joint par le tailnet.
  assert.equal((await tirer({ publication: serveDuGuichet(7010) })).url, "https://box.tail1234.ts.net");
});

test("aucun guichet ouvert sur ce registre : le QR ne porte que le code", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const dites: string[] = [];
  const redites: string[] = [];
  await principal({ args: ["code", "--registry", repertoire], env: {}, dire: (ligne) => dites.push(ligne), redire: (ligne) => redites.push(ligne) }, { maintenant, lirePublication: async () => serveDuGuichet(7010) });
  const rendu = JSON.parse(dites.join("\n")) as { qr: string; url: unknown };
  assert.equal(rendu.url, null);
  assert.equal(new URL(rendu.qr).searchParams.get("url"), null);
  assert.match(redites.join("\n"), /no station has opened its phone desk/);
});

test("ce que serve publie donne l'adresse du guichet : la racine qui passe à son port, HTTPS avant HTTP, le tailnet avant Funnel", () => {
  const boucle = { hote: "127.0.0.1", port: 7010 };
  assert.deepEqual(publicationDuGuichet(serveDuGuichet(7010), boucle), { url: "https://box.tail1234.ts.net", funnel: false });
  assert.deepEqual(publicationDuGuichet(serveDuGuichet(7010, { hote: "box.tail1234.ts.net:8443" }), boucle), { url: "https://box.tail1234.ts.net:8443", funnel: false });
  assert.deepEqual(publicationDuGuichet(serveDuGuichet(7010, { hote: "box.tail1234.ts.net:80", https: false }), boucle), { url: "http://box.tail1234.ts.net", funnel: false });
  // `localhost`, ou un port seul, se lisent sur la boucle.
  for (const proxy of ["http://localhost:7010", "http://[::1]:7010", "7010", "http://127.0.0.1:7010/"]) {
    assert.equal(publicationDuGuichet({ TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Proxy: proxy } } } } }, boucle)?.url, "https://box.tail1234.ts.net", proxy);
  }

  // Ouvert à Internet par Funnel : dit, et rangé après ce que seul le tailnet joint.
  const funnel = { TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:7010" } } } }, AllowFunnel: { "box.tail1234.ts.net:443": true } };
  assert.deepEqual(publicationDuGuichet(funnel, boucle), { url: "https://box.tail1234.ts.net", funnel: true });
  const lesDeux = { ...funnel, TCP: { ...funnel.TCP, 8443: { HTTPS: true } }, Web: { ...funnel.Web, "box.tail1234.ts.net:8443": { Handlers: { "/": { Proxy: "http://127.0.0.1:7010" } } } } };
  assert.deepEqual(publicationDuGuichet(lesDeux, boucle), { url: "https://box.tail1234.ts.net:8443", funnel: false });

  // Un `tailscale serve` lancé au premier plan publie aussi.
  assert.equal(publicationDuGuichet({ Foreground: { session: serveDuGuichet(7010) } }, boucle)?.url, "https://box.tail1234.ts.net");

  // Ce qui ne passe pas au guichet n'est pas son adresse.
  const autres: unknown[] = [
    serveDuGuichet(7011),
    { TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/brigade": { Proxy: "http://127.0.0.1:7010" } } } } },
    { TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:7010/autre" } } } } },
    { TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "https+insecure://127.0.0.1:7010" } } } } },
    { TCP: { 443: { HTTPS: true } }, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Text: "bonjour" } } } } },
    { TCP: {}, Web: { "box.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:7010" } } } } },
    null,
    "pas du JSON",
    [],
    { Web: 3 },
    { Web: { "box.tail1234.ts.net:443": null } },
  ];
  for (const statut of autres) assert.equal(publicationDuGuichet(statut, boucle), null, JSON.stringify(statut));
  // Un guichet qui n'écoute que sur une adresse du réseau n'est pas joint par la boucle.
  assert.equal(publicationDuGuichet(serveDuGuichet(7010), { hote: "192.168.1.20", port: 7010 }), null);
  assert.equal(publicationDuGuichet(serveDuGuichet(7010), { hote: "::", port: 7010 })?.url, "https://box.tail1234.ts.net");
});

test("sans `tailscale` sur la machine, il n'y a rien à lire : pas d'adresse du tailnet", async (t) => {
  assert.equal(await lirePublication({ [VARIABLE_TAILSCALE]: join(repertoireTemporaire(t), "tailscale-absent") }), null);
});

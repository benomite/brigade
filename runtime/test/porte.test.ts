// La porte : le relais par lequel un projet sort, et son refus. Tout se joue
// sur la boucle locale — l'« extérieur » est un serveur du test.
import assert from "node:assert/strict";
import { createServer as serveurHttp, request } from "node:http";
import { connect, createServer, type AddressInfo, type Server } from "node:net";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { AUTRES_HOTES, compterLesRefus, ENTETE_DE_REFUS, garderLaListe, ouvrirPorte } from "../src/porte.ts";
import { autorise, reglesDuProjet } from "../src/reseau.ts";
import { demarrer } from "../src/runtime.ts";
import { horloge, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const TENIR = join(import.meta.dirname, "../src/tenir-porte.ts");

const ecouter = (serveur: Server) => new Promise<number>((resoudre) => serveur.listen(0, "127.0.0.1", () => resoudre((serveur.address() as AddressInfo).port)));

// Un « extérieur » qui répète ce qu'il reçoit, précédé de `echo:`.
async function exterieur(t: TestContext) {
  const serveur = createServer((prise) => prise.on("data", (morceau) => prise.write(`echo:${morceau}`)).on("error", () => {}));
  const port = await ecouter(serveur);
  t.after(() => void serveur.close());
  return port;
}

async function porte(t: TestContext, hotes: string[], vers: number) {
  const refus: string[] = [];
  const joints: string[] = [];
  const ouverte = await ouvrirPorte({
    port: 0,
    projet: "brigade",
    regles: () => reglesDuProjet(hotes),
    surRefus: (hote, port) => void refus.push(`${hote}:${port}`),
    // Quel que soit le nom, l'extérieur est le serveur du test.
    joindre: (hote, port) => {
      joints.push(`${hote}:${port}`);
      return connect({ host: "127.0.0.1", port: vers });
    },
  });
  t.after(() => ouverte.fermer());
  return { port: ouverte.port, refus, joints };
}

// Ouvre un tunnel par la porte, et rend ce qu'elle a répondu — puis, si le
// tunnel est ouvert, ce que l'extérieur a renvoyé à `envoi`.
function tunnel(port: number, cible: string, envoi = "bonjour"): Promise<{ reponse: string; echo: string }> {
  return new Promise((resoudre, rejeter) => {
    const prise = connect({ host: "127.0.0.1", port });
    let recu = "";
    let envoye = false;
    prise.on("error", rejeter);
    prise.on("connect", () => prise.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n\r\n`));
    const rendre = () => {
      const [tete = "", ...suite] = recu.split("\r\n\r\n");
      prise.destroy();
      resoudre({ reponse: tete, echo: suite.join("\r\n\r\n") });
    };
    prise.on("data", (morceau) => {
      recu += morceau.toString();
      if (!recu.includes("\r\n\r\n")) return;
      if (!recu.startsWith("HTTP/1.1 200")) return;
      if (!envoye) {
        envoye = true;
        prise.write(envoi);
      } else if (recu.endsWith(`echo:${envoi}`)) rendre();
    });
    prise.on("end", rendre);
  });
}

describe("la porte", { concurrency: 8 }, () => {
  test("un hôte de la liste blanche est joint : le tunnel s'ouvre et les octets passent", async (t) => {
    const { port, refus, joints } = await porte(t, ["registry.npmjs.org"], await exterieur(t));
    const { reponse, echo } = await tunnel(port, "registry.npmjs.org:443");
    assert.equal(reponse, "HTTP/1.1 200 Connection Established");
    assert.equal(echo, "echo:bonjour");
    assert.deepEqual(joints, ["registry.npmjs.org:443"]);
    assert.deepEqual(refus, []);
  });

  test("un hôte hors liste est refusé sur-le-champ, et le refus dit l'hôte et le geste qui l'ouvre", async (t) => {
    const { port, refus, joints } = await porte(t, [], await exterieur(t));
    const { reponse, echo } = await tunnel(port, "registry.npmjs.org:443");
    assert.match(reponse, /^HTTP\/1\.1 403 Forbidden\r\n/);
    assert.match(reponse, new RegExp(`${ENTETE_DE_REFUS}: registry\\.npmjs\\.org`));
    assert.match(echo, /« registry\.npmjs\.org:443 » est refusé — hors de la liste blanche du réseau du projet « brigade »/);
    assert.match(echo, /une ligne « registry\.npmjs\.org » dans \.claude\/brigade\/reseau, mergée sur la branche d'intégration/);
    // Rien n'est sorti.
    assert.deepEqual(joints, []);
    assert.deepEqual(refus, ["registry.npmjs.org:443"]);
  });

  test("un port que la liste n'ouvre pas est refusé, même sur un hôte permis", async (t) => {
    const { port, refus } = await porte(t, [], await exterieur(t));
    assert.match((await tunnel(port, "github.com:22")).reponse, /^HTTP\/1\.1 403/);
    assert.deepEqual(refus, ["github.com:22"]);
  });

  test("une requête en clair passe ou se fait refuser de la même façon, et le refus se lit dans la réponse", async (t) => {
    const amont = serveurHttp((demande, rendu) => rendu.end(`servi ${demande.url} à ${demande.headers.host}`));
    await new Promise<void>((pret) => amont.listen(0, "127.0.0.1", pret));
    t.after(() => void amont.close());
    const { port, refus } = await porte(t, ["deb.exemple.test"], (amont.address() as AddressInfo).port);
    const demander = (url: string) =>
      new Promise<{ statut: number; corps: string; refus: string | undefined }>((resoudre, rejeter) => {
        request({ host: "127.0.0.1", port, path: url, headers: { host: new URL(url).host }, agent: false }, (recu) => {
          let corps = "";
          recu.on("data", (morceau) => (corps += morceau));
          recu.on("end", () => resoudre({ statut: recu.statusCode ?? 0, corps, refus: recu.headers[ENTETE_DE_REFUS] as string | undefined }));
        })
          .on("error", rejeter)
          .end();
      });

    assert.deepEqual(await demander("http://deb.exemple.test/paquets?x=1"), { statut: 200, corps: "servi /paquets?x=1 à deb.exemple.test", refus: undefined });
    const refuse = await demander("http://ailleurs.exemple.test/");
    assert.equal(refuse.statut, 403);
    assert.equal(refuse.refus, "ailleurs.exemple.test");
    assert.match(refuse.corps, /« ailleurs\.exemple\.test:80 » est refusé/);
    assert.deepEqual(refus, ["ailleurs.exemple.test:80"]);
  });

  test("en clair, un amont qui meurt au milieu du corps coupe la réponse du client au lieu de la suspendre", async (t) => {
    // Il annonce cent octets, en envoie dix, et meurt.
    const amont = createServer((prise) => {
      prise.on("error", () => {});
      prise.once("data", () => {
        prise.write("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n0123456789", () => prise.destroy());
      });
    });
    const vers = await ecouter(amont);
    t.after(() => void amont.close());
    const { port } = await porte(t, ["deb.exemple.test"], vers);

    const fin = await new Promise<string>((resoudre) => {
      const demande = request({ host: "127.0.0.1", port, path: "http://deb.exemple.test/gros", agent: false }, (recu) => {
        recu.on("data", () => {});
        recu.on("end", () => resoudre("complète"));
        recu.on("error", () => resoudre("coupée"));
        recu.on("aborted", () => resoudre("coupée"));
      });
      demande.on("error", () => resoudre("coupée"));
      demande.end();
    });
    assert.equal(fin, "coupée");
  });

  test("en clair, un client qui abandonne ne laisse pas la requête ouverte chez l'amont", async (t) => {
    // Il répond l'en-tête, puis plus rien : seul le départ du client le libère.
    let lache = false;
    let joint = false;
    const amont = createServer((prise) => {
      prise.on("error", () => {});
      prise.on("close", () => void (lache = true));
      prise.once("data", () => {
        joint = true;
        prise.write("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n0123456789");
      });
    });
    const vers = await ecouter(amont);
    t.after(() => void amont.close());
    const { port } = await porte(t, ["deb.exemple.test"], vers);

    const demande = request({ host: "127.0.0.1", port, path: "http://deb.exemple.test/gros", agent: false }, (recu) => {
      recu.on("error", () => {});
      recu.once("data", () => demande.destroy());
    });
    demande.on("error", () => {});
    demande.end();

    await jusqua(() => joint && lache);
  });

  test("un hôte permis qui ne répond pas n'est pas un refus : la porte dit qu'il est en liste blanche", async (t) => {
    // Un port que plus personne n'écoute.
    const ferme = createServer();
    const mort = await ecouter(ferme);
    await new Promise((fini) => ferme.close(fini));
    const { port, refus } = await porte(t, [], mort);
    const { reponse, echo } = await tunnel(port, "github.com:443");
    assert.match(reponse, /^HTTP\/1\.1 502/);
    assert.match(echo, /est en liste blanche mais ne répond pas/);
    assert.deepEqual(refus, []);
  });

  test("la porte se ferme même quand un tunnel est encore ouvert", async (t) => {
    const ouverte = await ouvrirPorte({ port: 0, projet: "brigade", regles: () => reglesDuProjet(["registry.npmjs.org"]), joindre: await (async () => { const vers = await exterieur(t); return () => connect({ host: "127.0.0.1", port: vers }); })() });
    // Un tunnel établi, que son client garde ouvert.
    const client = connect({ host: "127.0.0.1", port: ouverte.port });
    let recu = "";
    let ferme = false;
    client.on("error", () => {});
    client.on("data", (morceau) => (recu += morceau));
    client.on("close", () => void (ferme = true));
    client.write("CONNECT registry.npmjs.org:443 HTTP/1.1\r\nHost: registry.npmjs.org:443\r\n\r\n");
    await jusqua(() => recu.startsWith("HTTP/1.1 200"));

    await ouverte.fermer();

    await jusqua(() => ferme);
  });

  test("un cook qui boucle sur des noms toujours neufs ne remplit ni le journal ni la porte : cent hôtes par dix minutes, le reste compté", () => {
    const notes: Array<{ host: string; port: number; count: number }> = [];
    let instant = 0;
    const refuser = compterLesRefus((refus) => void notes.push(refus), () => instant);

    for (let i = 0; i < 5000; i++) refuser(`h${i}.pirate.test`, 443);
    assert.equal(notes.length, 100);
    assert.deepEqual(notes.at(-1), { host: "h99.pirate.test", port: 443, count: 1 });

    // La fenêtre suivante dit d'une ligne ce qui a été tu, et repart pour cent.
    instant = 600_000;
    for (let i = 5000; i < 5300; i++) refuser(`h${i}.pirate.test`, 443);
    assert.equal(notes.length, 201);
    assert.deepEqual(notes[100], { host: AUTRES_HOTES, port: 0, count: 4900 });
    instant = 1_200_000;
    refuser("h0.pirate.test", 443);
    assert.deepEqual(notes.slice(201), [{ host: AUTRES_HOTES, port: 0, count: 200 }, { host: "h0.pirate.test", port: 443, count: 1 }]);
  });

  test("un cook qui insiste ne remplit pas le journal : un refus par hôte et par dix minutes, les autres comptés", () => {
    const notes: Array<{ host: string; port: number; count: number }> = [];
    let instant = 0;
    const refuser = compterLesRefus((refus) => void notes.push(refus), () => instant);

    refuser("a.test", 443);
    refuser("a.test", 443);
    refuser("a.test", 443);
    refuser("b.test", 443);
    instant = 599_999;
    refuser("a.test", 443);
    assert.deepEqual(notes, [{ host: "a.test", port: 443, count: 1 }, { host: "b.test", port: 443, count: 1 }]);

    instant = 600_000;
    refuser("a.test", 443);
    assert.deepEqual(notes.at(-1), { host: "a.test", port: 443, count: 4 });
  });

  test("avant de refuser, la porte relit sa liste : un hôte publié à l'instant passe sans attendre", async (t) => {
    const vers = await exterieur(t);
    const demandes: boolean[] = [];
    const ouverte = await ouvrirPorte({
      port: 0,
      projet: "brigade",
      // La liste gardée ne connaît pas encore le registre ; la liste fraîche, si.
      regles: (fraiches = false) => (demandes.push(fraiches), reglesDuProjet(fraiches ? ["registry.npmjs.org"] : [])),
      joindre: () => connect({ host: "127.0.0.1", port: vers }),
    });
    t.after(() => ouverte.fermer());

    assert.equal((await tunnel(ouverte.port, "registry.npmjs.org:443")).echo, "echo:bonjour");
    assert.deepEqual(demandes, [false, true]);
    // Ce qui passe déjà ne coûte pas de relecture.
    demandes.length = 0;
    await tunnel(ouverte.port, "api.github.com:443");
    assert.deepEqual(demandes, [false]);
    // Et ce que la liste fraîche n'ouvre pas reste refusé.
    assert.match((await tunnel(ouverte.port, "pirate.exemple.test:443")).reponse, /^HTTP\/1\.1 403/);
  });

  test("la liste se garde quelques secondes, sauf quand on la demande fraîche ; illisible, la dernière lue tient", () => {
    let instant = 0;
    let hotes: string[] = [];
    let panne = false;
    const avertissements: string[] = [];
    const regles = garderLaListe(
      () => {
        if (panne) throw new Error("journal verrouillé");
        return reglesDuProjet(hotes);
      },
      { delaiMs: 5000, maintenant: () => instant, avertir: (message) => void avertissements.push(message) },
    );
    const ouvert = (fraiches?: boolean) => autorise(regles(fraiches), "registry.npmjs.org", 443);

    assert.equal(ouvert(), false);
    hotes = ["registry.npmjs.org"];
    instant = 4999;
    assert.equal(ouvert(), false);
    assert.equal(ouvert(true), true);
    // La liste fraîche devient la liste gardée.
    hotes = [];
    assert.equal(ouvert(), true);
    instant = 9999;
    assert.equal(ouvert(), false);

    hotes = ["registry.npmjs.org"];
    assert.equal(ouvert(true), true);
    panne = true;
    instant = 60_000;
    assert.equal(ouvert(), true);
    assert.equal(ouvert(true), true);
    assert.match(avertissements[0] ?? "", /liste blanche illisible.*journal verrouillé/);
  });

  test("une rafale de refus ne lit le journal qu'une fois : les lectures fraîches ont un plancher", () => {
    let instant = 10_000;
    let lectures = 0;
    const regles = garderLaListe(() => ((lectures += 1), reglesDuProjet([])), { delaiMs: 5000, plancherFraisMs: 1000, maintenant: () => instant });
    // La lecture ordinaire d'une connexion qui passe — le rapatriement, par exemple.
    regles();
    assert.equal(lectures, 1);

    // Un cook boucle sur un hôte hors liste : chaque refus demande la liste fraîche.
    for (let refus = 0; refus < 200; refus += 1) {
      regles();
      regles(true);
      instant += 4;
    }
    // La première est relue quand même — la lecture ordinaire ne compte pas au plancher.
    assert.equal(lectures, 2);

    instant += 1000;
    regles(true);
    assert.equal(lectures, 3);
  });

  test("une liste jamais lue et illisible s'en tient au socle", () => {
    const regles = garderLaListe(() => { throw new Error("journal verrouillé"); }, { delaiMs: 5000, avertir: () => {} });

    assert.equal(autorise(regles(), "api.github.com", 443), true);
    assert.equal(autorise(regles(true), "registry.npmjs.org", 443), false);
  });

  test("la porte du projet lit sa liste au journal et y écrit ses refus, depuis son propre process", async (t) => {
    const repertoireEtat = repertoireTemporaire(t);
    const runtime = demarrer({ repertoireEtat, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
    t.after(() => runtime.arreter("test"));
    runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "network.declared", payload: { base: "v2", hosts: ["registry.npmjs.org"], problems: [] } });

    // Un port libre à l'instant : la porte n'en choisit pas, c'est le chef qui le pose.
    const libre = createServer();
    const port = await ecouter(libre);
    await new Promise((fini) => libre.close(fini));
    const tenue = lancer(t, TENIR, [], { BRIGADE_STATE_DIR: repertoireEtat, BRIGADE_PROJECT: "brigade", BRIGADE_PROXY_PORT: String(port) });
    await tenue.attendre(`porte du projet « brigade » ouverte — 127.0.0.1:${port}`);

    assert.match((await tunnel(port, "pirate.exemple.test:443")).reponse, /^HTTP\/1\.1 403/);
    const refus = () => runtime.journal.duType("network.refused", 10);
    await jusqua(() => refus().length === 1);
    assert.deepEqual(refus()[0]?.payload, { host: "pirate.exemple.test", port: 443, count: 1 });
    assert.equal(refus()[0]?.author, "porte");
    assert.match(tenue.sortie(), /sortie refusée — pirate\.exemple\.test:443/);

    tenue.process.kill("SIGTERM");
    assert.equal(await tenue.fin, 0);
  });

  test("sans port, sans projet ou sans état, la porte refuse de démarrer et dit ce qui manque", async (t) => {
    const sans = async (env: Record<string, string>) => {
      const tenue = lancer(t, TENIR, [], env);
      return { code: await tenue.fin, sortie: tenue.sortie() };
    };
    assert.deepEqual(await sans({}), { code: 2, sortie: "brigade : la porte refuse de démarrer — BRIGADE_STATE_DIR n'est pas défini\n" });
    assert.match((await sans({ BRIGADE_STATE_DIR: "/x", BRIGADE_PROJECT: "brigade" })).sortie, /BRIGADE_PROXY_PORT n'est pas défini/);
    assert.match((await sans({ BRIGADE_STATE_DIR: "/x", BRIGADE_PROJECT: "brigade", BRIGADE_PROXY_PORT: "porte" })).sortie, /BRIGADE_PROXY_PORT invalide/);
  });
});

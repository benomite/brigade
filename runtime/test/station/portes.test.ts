// Les portes de la station : une par projet de sa configuration, chacune avec
// la liste blanche de son projet, et celle de la station. Tout se joue sur la
// boucle locale — l'« extérieur » est un serveur du test.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect, createServer, type AddressInfo, type Server } from "node:net";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirPorte } from "../../src/porte.ts";
import { ecrirePortes, lirePortes, tenirPortes } from "../../src/station/portes.ts";
import { jusqua, lancer, repertoireTemporaire } from "../outils.ts";

const TENIR = join(import.meta.dirname, "../../src/station/tenir-portes.ts");

const ecouter = (serveur: Server) => new Promise<number>((resoudre) => serveur.listen(0, "127.0.0.1", () => resoudre((serveur.address() as AddressInfo).port)));

// Un « extérieur » qui accepte tout et ne dit rien.
async function exterieur(t: TestContext) {
  const serveur = createServer((prise) => prise.on("error", () => {}));
  const port = await ecouter(serveur);
  t.after(() => void serveur.close());
  return port;
}

// Demande un tunnel à la porte, et rend la première ligne de sa réponse.
function demander(port: number, cible: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const prise = connect({ host: "127.0.0.1", port });
    let recu = "";
    prise.on("error", rejeter);
    prise.on("connect", () => prise.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n\r\n`));
    prise.on("data", (morceau) => {
      recu += morceau.toString();
      if (!recu.includes("\r\n")) return;
      prise.destroy();
      resoudre(recu.split("\r\n")[0] ?? "");
    });
  });
}

// Une station d'essai : sa configuration, et pour chaque projet son journal où
// le runtime a publié ce que son dépôt déclare.
function uneStation(t: TestContext, projets: Record<string, string[]>) {
  const racine = repertoireTemporaire(t);
  const fichier = join(racine, "portes.json");
  const configurer = (noms: string[]) => writeFileSync(join(racine, "projets"), noms.map((nom) => `${nom} acme/${nom} main\n`).join(""));
  configurer(Object.keys(projets));
  for (const [nom, hosts] of Object.entries(projets)) {
    mkdirSync(join(racine, "etat", nom), { recursive: true });
    const journal = ouvrirJournal(join(racine, "etat", nom));
    journal.ajouter({ project: nom, ticket: null, author: "runtime", type: "network.declared", payload: { base: "main", hosts, problems: [] } });
    journal.fermer();
  }
  const refus = (nom: string) => {
    const journal = ouvrirJournal(join(racine, "etat", nom), { lectureSeule: true });
    try {
      return journal.duType("network.refused", 10).map((e) => ({ author: e.author, ...(e.payload as { host: string; port: number }) }));
    } finally {
      journal.fermer();
    }
  };
  return { racine, fichier, configurer, refus };
}

async function tenir(t: TestContext, racine: string, fichier: string, vers: number) {
  const lignes: string[] = [];
  const tenues = await tenirPortes({
    racine,
    fichier,
    dire: (ligne) => void lignes.push(ligne),
    // Aucune relecture ne vient d'une minuterie : le test relit quand il veut.
    relectureMs: 3_600_000,
    // Quel que soit le nom, l'extérieur est le serveur du test.
    ouvrir: (options) => ouvrirPorte({ ...options, joindre: () => connect({ host: "127.0.0.1", port: vers }) }),
  });
  t.after(() => tenues.arreter());
  return { tenues, lignes };
}

describe("les portes de la station", { concurrency: 4 }, () => {
  test("deux projets, deux listes : chacun ne joint que ce que son dépôt déclare — ce qu'un projet ouvre ne l'est pas pour l'autre —, et chaque refus va au journal de son projet", async (t) => {
    const { racine, fichier, refus } = uneStation(t, { calcul: ["registry.npmjs.org"], espace: ["pypi.org"] });
    const { tenues } = await tenir(t, racine, fichier, await exterieur(t));

    const ports = lirePortes(fichier);
    assert.deepEqual(ports, tenues.ports());
    assert.deepEqual(Object.keys(ports.projets), ["calcul", "espace"]);
    const { calcul = 0, espace = 0 } = ports.projets;
    assert.equal(new Set([ports.station, calcul, espace]).size, 3);

    assert.equal(await demander(calcul, "registry.npmjs.org:443"), "HTTP/1.1 200 Connection Established");
    assert.match(await demander(calcul, "pypi.org:443"), /^HTTP\/1\.1 403/);
    assert.equal(await demander(espace, "pypi.org:443"), "HTTP/1.1 200 Connection Established");
    assert.match(await demander(espace, "registry.npmjs.org:443"), /^HTTP\/1\.1 403/);
    // Le socle, à chacun : Anthropic et GitHub.
    for (const port of [calcul, espace]) assert.equal(await demander(port, "api.github.com:443"), "HTTP/1.1 200 Connection Established");

    await jusqua(() => refus("calcul").length === 1 && refus("espace").length === 1);
    assert.deepEqual(refus("calcul"), [{ author: "porte", host: "pypi.org", port: 443, count: 1 }]);
    assert.deepEqual(refus("espace"), [{ author: "porte", host: "registry.npmjs.org", port: 443, count: 1 }]);
  });

  test("la porte de la station ne laisse passer qu'Anthropic et GitHub — rien de ce qu'un projet déclare", async (t) => {
    const { racine, fichier } = uneStation(t, { calcul: ["registry.npmjs.org"] });
    const { tenues, lignes } = await tenir(t, racine, fichier, await exterieur(t));
    const station = tenues.ports().station ?? 0;
    assert.equal(await demander(station, "api.github.com:443"), "HTTP/1.1 200 Connection Established");
    assert.equal(await demander(station, "api.anthropic.com:443"), "HTTP/1.1 200 Connection Established");
    assert.match(await demander(station, "registry.npmjs.org:443"), /^HTTP\/1\.1 403/);
    await jusqua(() => lignes.some((ligne) => ligne.includes("sortie de la station refusée — registry.npmjs.org:443")));
  });

  test("un projet ajouté à la configuration a sa porte ; retiré, il la perd — et le fichier des ports suit", async (t) => {
    const { racine, fichier, configurer } = uneStation(t, { calcul: [], espace: [] });
    configurer(["calcul"]);
    const { tenues, lignes } = await tenir(t, racine, fichier, await exterieur(t));
    assert.deepEqual(Object.keys(lirePortes(fichier).projets), ["calcul"]);

    configurer(["calcul", "espace"]);
    await tenues.relire();
    const { espace = 0 } = lirePortes(fichier).projets;
    assert.ok(espace > 0);
    assert.equal(await demander(espace, "api.github.com:443"), "HTTP/1.1 200 Connection Established");
    assert.ok(lignes.includes(`brigade [espace] : porte ouverte — 127.0.0.1:${espace}, liste blanche lue dans ${join(racine, "etat/espace")}`), lignes.join("\n"));

    configurer(["espace"]);
    await tenues.relire();
    assert.deepEqual(Object.keys(lirePortes(fichier).projets), ["espace"]);
    assert.ok(lignes.includes("brigade [calcul] : retiré de la configuration : sa porte est fermée"), lignes.join("\n"));
  });

  test("relancées, les portes reprennent leurs ports — ceux que la bascule a repris compris ; un port pris, la porte en prend un autre et le dit", async (t) => {
    const { racine, fichier } = uneStation(t, { calcul: [], espace: [] });
    const vers = await exterieur(t);
    const premieres = await tenir(t, racine, fichier, vers);
    const avant = lirePortes(fichier);
    await premieres.tenues.arreter();
    const secondes = await tenir(t, racine, fichier, vers);
    assert.deepEqual(lirePortes(fichier), avant);
    await secondes.tenues.arreter();

    // Le port d'espace est pris par un autre.
    const autre = createServer();
    const pris = await ecouter(autre);
    t.after(() => void autre.close());
    ecrirePortes(fichier, { ...avant, projets: { ...avant.projets, espace: pris } });
    const troisiemes = await tenir(t, racine, fichier, vers);
    const apres = lirePortes(fichier);
    assert.deepEqual([apres.station, apres.projets.calcul], [avant.station, avant.projets.calcul]);
    assert.notEqual(apres.projets.espace, pris);
    assert.ok(troisiemes.lignes.includes(`brigade [espace] : le port ${pris} de sa porte est pris (EADDRINUSE) : elle en prend un autre`), troisiemes.lignes.join("\n"));
  });

  test("le process des portes, tel que son unité le lance : il écrit ses ports, relit sa configuration, et se ferme sur SIGTERM ; sans fichier des ports, il refuse de démarrer", async (t) => {
    const { racine, fichier, configurer } = uneStation(t, { calcul: [], espace: [] });
    configurer(["calcul"]);
    const tenues = lancer(t, TENIR, [], { BRIGADE_STATION_DIR: racine, BRIGADE_STATION_PORTES: fichier });
    await tenues.attendre("portes de la station ouvertes");
    assert.match(tenues.sortie(), new RegExp(`portes de la station ouvertes — pid ${tenues.process.pid}, ports écrits dans ${fichier} ; 1 projet : calcul`));
    assert.deepEqual(Object.keys(lirePortes(fichier).projets), ["calcul"]);
    configurer(["calcul", "espace"]);
    tenues.process.kill("SIGHUP");
    await jusqua(() => "espace" in lirePortes(fichier).projets);
    tenues.process.kill("SIGTERM");
    assert.equal(await tenues.fin, 0);
    assert.match(tenues.sortie(), /portes de la station fermées \(SIGTERM\)/);
    // Les ports restent écrits : relancées, les portes les reprennent.
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(fichier, "utf8")).projets), ["calcul", "espace"]);

    const sans = lancer(t, TENIR, [], { BRIGADE_STATION_DIR: racine });
    assert.equal(await sans.fin, 2);
    assert.match(sans.sortie(), /les portes de la station refusent de démarrer — BRIGADE_STATION_PORTES n'est pas défini/);
  });
});

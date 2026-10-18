// La page d'un worktree servi : ce que l'app lit des serveurs que `status` montre, le
// geste qu'elle pose — ou pourquoi elle n'en pose pas —, et ce que ce geste lance : un
// transfert de port, par un faux `ssh` qui relaie vraiment, puis la commande d'ouverture
// du poste, avec l'adresse locale. Ni réseau, ni box, ni navigateur ; aucun test n'attend
// une durée — il attend une prise ouverte, une page rendue, un process mort.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, get } from "node:http";
import { createServer as ouvrirPort, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Montree } from "../src/attend.ts";
import type { Reglages } from "../src/box.ts";
import type { Projet } from "../src/config.ts";
import { ouvrirTransfert, serveursDe, tenirPages, type Pages } from "../src/page.ts";

const AIDE = join(import.meta.dirname, "aides/faux-transfert.ts");
const SOURCES = join(import.meta.dirname, "../src");
const CALCULUS: Projet = { nom: "calculus", dossier: "/projets/calculus", box: { hote: "box" } };
const A = "2026-10-13T09:00:00.000Z";

// La sortie de `status`, telle que le runtime l'écrit (runtime/src/etat.ts) : ce qui
// se glisse entre les cooks et les derniers événements est ce que le test y met.
const status = (...serveurs: string[]) =>
  [
    "projet     calculus",
    "runtime    en marche depuis 2 h 10 (pid 4242)",
    "",
    "rail       1 en pass · 1 pris",
    "  #412  en pass  prio:1  à la pass depuis 3 min  Le bouton d'export",
    "  #415  pris  prio:2  pris depuis 12 min  Servir sur le  port 8080  écoute depuis toujours",
    "",
    "cooks      1 en cours",
    "",
    ...serveurs,
    "derniers événements",
    "  09:00:00  service.listening  #412",
    "",
  ].join("\n");
const SERVEURS = (nombre: number) => `serveurs   ${nombre} serveur${nombre > 1 ? "s" : ""} — une livraison d'interface, servie depuis son worktree sur le port de ce worktree`;
// La ligne d'un serveur, et la page qu'elle écrit au bout : par défaut, celle de l'écran `/rail`.
const serveur = (ticket: number, port: number, etat = "écoute", page = `http://127.0.0.1:${port}/rail`) =>
  `  #${ticket}  worktrees/${ticket}-ab12cd34  port ${port}  ${etat} depuis 3 min  cook/${ticket}-ab12cd34${page === "" ? "" : `  ${page}`}`;
// Ce que `status` écrit dessous (runtime/src/projections/service.ts, `direEcran`).
const DECLARE = "    écran : /rail (déclaré par le cook)";
const DEDUIT = "    écran : /rail (écran déduit des fichiers touchés, pas déclaré par le cook)";
const PHRASE = "    à regarder : #591 : le rail a maintenant deux colonnes, TODO et WAITING";
const SANS_ECRAN = "aucune page à ouvrir : la livraison ne dit aucun écran, et n'en touche aucun que le projet déclare";
const A_LANCER = "à lancer   1 — le worktree d'une livraison d'une app qui ne s'ouvre pas dans un navigateur, tenu pour qu'on l'y lance : aucune page";
const COMMENT = "pas de page dans un navigateur : lancer l'app sur le worktree de la livraison, `cd '/etat/worktrees/631-ab12cd34' && npm --prefix app start`, puis y ouvrir l'écran « la carte » — à regarder : la carte dit comment voir l'écran";
const tenu = (ticket: number, comment = COMMENT) => `  #${ticket}  worktrees/${ticket}-ab12cd34  tenu depuis 3 min  cook/${ticket}-ab12cd34  ${comment}`;
const NON_DECLARE =
  "service    NOT DECLARED — this project does not declare how it is served: its repository has no `.claude/brigade/service` (delivery of ticket #412); no server is launched — since 3 min ago on box";

// Ce que la veille rend d'une lecture de `status`, son bloc `attend` mis à part.
const lue = (texte: string, projet = "calculus"): Montree => ({ projet, demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte }] });
const ratee = (projet = "calculus"): Montree => ({ projet, demande: 1, a: A, erreur: "$ ssh box brigade calculus status\n→ exit code 255", atteinte: false, cas: "ssh-en-echec" });

// Le serveur d'un worktree, sur un port que le poste donne : il rend sa page.
async function servir(t: TestContext, page: string): Promise<number> {
  const http = createServer((_, reponse) => reponse.end(page));
  await new Promise<void>((resoudre) => http.listen(0, "127.0.0.1", resoudre));
  t.after(() => {
    http.closeAllConnections();
    http.close();
  });
  return (http.address() as AddressInfo).port;
}

// Ce qu'un navigateur obtiendrait à cette adresse.
const lire = (url: string) =>
  new Promise<string>((resoudre, rejeter) => {
    get(url, { agent: false }, (reponse) => {
      let corps = "";
      reponse.on("data", (morceau: Buffer) => (corps += morceau.toString()));
      reponse.on("end", () => resoudre(corps));
    }).on("error", rejeter);
  });

// Rend la main quand ce fait est vrai.
async function jusqua(vrai: () => boolean): Promise<void> {
  while (!vrai()) await new Promise((resoudre) => setTimeout(resoudre, 10));
}
const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Un essai : un faux `ssh` — il lance `aides/faux-transfert.ts` dans le mode dit —, la
// commande d'ouverture du poste remplacée par une liste, et les pages branchées dessus
// comme dans le process principal (main.ts).
function essai(t: TestContext, mode: "relaie" | "ouvre" | "refuse" | "muet" = "relaie", reglages: Partial<Reglages> = {}, ouvrir?: (url: string) => Promise<void>) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-page-"));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nexec '${process.execPath}' '${AIDE}' '${racine}' ${mode} "$@"\n`);
  chmodSync(ssh, 0o755);

  const ouvertes: string[] = [];
  const pages = tenirPages({
    transferer: (servi, port, signal) => ouvrirTransfert({ ssh, delaiMs: 60_000, connexionS: 10, ...reglages }, servi, port, signal),
    ouvrir: ouvrir ?? (async (url) => void ouvertes.push(url)),
  });
  t.after(() => {
    pages.fermer();
    rmSync(racine, { recursive: true, force: true });
  });

  const ecrit = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8").split("\n").filter(Boolean) : []);
  return { pages, ouvertes, ssh, appels: () => ecrit("appels"), pids: () => ecrit("pids").map(Number) };
}

const WORKTREE = "worktrees/412-ab12cd34";
// Le port de ce poste où la page a été ouverte, et la prise du transfert que `ssh` a reçue.
const portDe = (url: string | undefined) => Number(/^http:\/\/127\.0\.0\.1:(\d+)\/rail$/.exec(url ?? "")?.[1]);
const TRANSFERT = /^-o BatchMode=yes -o ConnectTimeout=10 -o ControlPath=none -o ExitOnForwardFailure=yes -N -L (\S+):127\.0\.0\.1:(\d+) -- box$/;
// La seule page d'un projet qui n'en a qu'une.
const seule = (rendues: Pages | undefined) => {
  assert.equal(rendues?.pages.length, 1);
  return rendues.pages[0] as Pages["pages"][number];
};

describe("ce que `status` montre des serveurs", () => {
  test("chaque serveur se lit sous la ligne `serveurs` : son ticket, son worktree, son port, son état", () => {
    const lus = serveursDe(status(SERVEURS(2), serveur(412, 20412), serveur(415, 20415, "démarre"), ""));

    assert.deepEqual(lus, {
      entete: "2 serveurs — une livraison d'interface, servie depuis son worktree sur le port de ce worktree",
      serveurs: [
        { ticket: 412, worktree: "worktrees/412-ab12cd34", port: 20412, etat: "listening", route: "/rail", ecran: null },
        { ticket: 415, worktree: "worktrees/415-ab12cd34", port: 20415, etat: "starting", route: "/rail", ecran: null },
      ],
      aLancer: [],
      illisibles: [],
      empeche: [],
    });
  });

  test("sans ligne `serveurs`, aucun serveur — une ligne du rail qui leur ressemble n'en est pas un", () => {
    assert.deepEqual(serveursDe(status()), { serveurs: [], aLancer: [], illisibles: [], empeche: [] });
  });

  test("une ligne `service` est gardée mot pour mot : c'est elle qui dit ce qui empêche le projet d'être servi", () => {
    const lus = serveursDe(status(NON_DECLARE, ""));

    assert.deepEqual(lus.serveurs, []);
    assert.deepEqual(lus.empeche, [NON_DECLARE.replace(/^service\s+/, "")]);
  });

  test("sous `serveurs`, une ligne qui n'a pas la forme n'est pas un serveur — elle reste à lire, telle quelle", () => {
    const sansPort = "  #416  worktrees/416-ab12cd34  écoute depuis 3 min";
    const lus = serveursDe(status(SERVEURS(4), serveur(412, 20412), serveur(413, 70000), sansPort, serveur(412, 20499), ""));

    assert.deepEqual(lus.serveurs, [{ ticket: 412, worktree: "worktrees/412-ab12cd34", port: 20412, etat: "listening", route: "/rail", ecran: null }]);
    // Un port qui n'en est pas un, une ligne sans port, un worktree déjà lu.
    assert.deepEqual(lus.illisibles, [serveur(413, 70000), sansPort, serveur(412, 20499)]);
  });

  test("sous la ligne d'un serveur, l'écran que le cook déclare et sa phrase ; un écran déduit le dit, mot pour mot", () => {
    const lus = serveursDe(status(SERVEURS(2), serveur(412, 20412), DECLARE, PHRASE, serveur(415, 20415), DEDUIT, ""));

    assert.deepEqual(
      lus.serveurs.map(({ ticket, route, ecran }) => ({ ticket, route, ecran })),
      [
        { ticket: 412, route: "/rail", ecran: { nom: "/rail", phrase: "#591 : le rail a maintenant deux colonnes, TODO et WAITING", deduit: null } },
        { ticket: 415, route: "/rail", ecran: { nom: "/rail", phrase: null, deduit: "screen deduced from the touched files, not declared by the cook" } },
      ],
    );
    assert.deepEqual(lus.illisibles, []);
  });

  test("une ligne qui n'écrit pas la page d'un écran n'a pas de route : ce qu'elle écrit à la place, la racine, une autre adresse, ou rien", () => {
    const lus = serveursDe(
      status(SERVEURS(5), serveur(412, 20412, "écoute", SANS_ECRAN), serveur(413, 20413, "écoute", "http://127.0.0.1:20413/"), serveur(414, 20414, "écoute", "http://127.0.0.1:20999/rail"), serveur(415, 20415, "écoute", ""), serveur(416, 20416, "écoute", "http://127.0.0.1:20416//ailleurs"), ""),
    );

    assert.deepEqual(
      lus.serveurs.map(({ ticket, route, sansPage }) => ({ ticket, route, sansPage })),
      [
        { ticket: 412, route: null, sansPage: SANS_ECRAN },
        { ticket: 413, route: null, sansPage: undefined },
        { ticket: 414, route: null, sansPage: undefined },
        { ticket: 415, route: null, sansPage: undefined },
        { ticket: 416, route: null, sansPage: undefined },
      ],
    );
  });

  test("sous la ligne `à lancer`, la livraison d'une app : comment la voir, son écran et sa phrase — aucun serveur", () => {
    const lus = serveursDe(status(A_LANCER, tenu(631), "    écran : la carte (déclaré par le cook)", "    à regarder : la carte dit comment voir l'écran", ""));

    assert.deepEqual(lus.serveurs, []);
    assert.deepEqual(lus.aLancer, [
      { ticket: 631, worktree: "worktrees/631-ab12cd34", commentLeVoir: COMMENT, ecran: { nom: "la carte", phrase: "la carte dit comment voir l'écran", deduit: null } },
    ]);
    assert.deepEqual(lus.illisibles, []);
  });

  test("un retrait qui n'est ni un écran ni sa phrase, ou qui ne suit aucune entrée lisible, reste à lire tel quel", () => {
    const autre = "    autre chose : rien";
    const lus = serveursDe(status(SERVEURS(2), serveur(412, 20412), autre, PHRASE, serveur(413, 70000), DECLARE, ""));

    assert.equal(lus.serveurs[0]?.ecran, null);
    assert.deepEqual(lus.illisibles, [autre, PHRASE, serveur(413, 70000), DECLARE]);
  });
});

describe("le geste posé", () => {
  test("un serveur qui écoute a son geste ; celui qui démarre ne l'a pas, et dit pourquoi", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status(SERVEURS(2), serveur(412, 20412), serveur(415, 20415, "démarre"), "")));

    assert.equal(rendues.projet, "calculus");
    assert.deepEqual(rendues.pages[0], { ticket: 412, worktree: "worktrees/412-ab12cd34", port: 20412, etat: "listening", route: "/rail", ecran: null, enCours: false });
    assert.deepEqual(
      { ...rendues.pages[1], raison: undefined },
      { ticket: 415, worktree: "worktrees/415-ab12cd34", port: 20415, etat: "starting", route: "/rail", ecran: null, enCours: false, raison: undefined },
    );
    assert.match(rendues.pages[1]?.raison ?? "", /says “starting”, not “listening”/);
    assert.equal(rendues.vide, undefined);
    // Le verdict ne se dit pas dans l'app : elle le rappelle, et rien de plus.
    assert.match(rendues.rappel ?? "", /Your yes or no is given on the ticket's issue/);
  });

  test("des serveurs sans fin au journal n'ont pas de geste : leur runtime s'est arrêté sans les éteindre", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status("serveurs   1 serveur sans fin au journal — leur runtime s'est arrêté sans les éteindre", serveur(412, 20412), "")));

    assert.match(seule(rendues).raison ?? "", /with no end in the log/);
  });

  test("sans serveur, aucun geste — et la raison : `status` n'en montre aucun", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status()));

    assert.deepEqual(rendues.pages, []);
    assert.match(rendues.vide ?? "", /^no page to open: `ssh <hote> brigade <nom> status` shows no server for this project/);
    assert.deepEqual(rendues.empeche, []);
    assert.equal(rendues.rappel, undefined);
  });

  test("un projet qui ne déclare pas son service n'a aucun geste — et ce que `status` en dit se lit, mot pour mot", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status(NON_DECLARE, "")));

    assert.deepEqual(rendues.pages, []);
    assert.match(rendues.vide ?? "", /what keeps this project from being served/);
    assert.equal(rendues.empeche.length, 1);
    assert.match(rendues.empeche[0] ?? "", /^NOT DECLARED — this project does not declare how it is served/);
  });

  test("une lecture ratée ne dit pas « aucun serveur » : elle dit que `status` n'a pas été lu", (t) => {
    const { pages } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, 20412), "")));

    const rendues = pages.recevoir(ratee());

    assert.deepEqual(rendues.pages, []);
    assert.match(rendues.vide ?? "", /has not been read/);
    assert.doesNotMatch(rendues.vide ?? "", /shows no server/);
  });

  test("un serveur sans page d'écran n'a pas de geste — pas même inactif : ce que `status` écrit à la place se lit, et le rappel n'a rien à rappeler", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status(SERVEURS(2), serveur(412, 20412, "écoute", SANS_ECRAN), serveur(413, 20413, "écoute", "http://127.0.0.1:20413/"), "")));

    assert.deepEqual(
      rendues.pages.map(({ ticket, route, sansPage, raison }) => ({ ticket, route, sansPage, raison })),
      [
        { ticket: 412, route: null, sansPage: SANS_ECRAN, raison: undefined },
        { ticket: 413, route: null, sansPage: "no page to open: `ssh <hote> brigade <nom> status` writes no screen page for this server — the app never opens the root of a worktree, which a file server shows as a folder listing", raison: undefined },
      ],
    );
    assert.equal(rendues.vide, undefined);
    assert.equal(rendues.rappel, undefined);
  });

  test("une app qui ne s'ouvre pas dans un navigateur n'a aucun geste : sa livraison dit comment la voir", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status(A_LANCER, tenu(631), "")));

    assert.deepEqual(rendues.pages, []);
    assert.deepEqual(rendues.aLancer, [{ ticket: 631, worktree: "worktrees/631-ab12cd34", commentLeVoir: COMMENT, ecran: null }]);
    assert.equal(rendues.vide, undefined);
    assert.equal(rendues.rappel, undefined);
  });

  test("une ligne que l'app n'a pas su lire est montrée, sans geste", (t) => {
    const { pages } = essai(t);

    const rendues = pages.recevoir(lue(status(SERVEURS(1), serveur(413, 70000), "")));

    assert.deepEqual(rendues.pages, []);
    assert.deepEqual(rendues.illisibles, [serveur(413, 70000)]);
    assert.match(rendues.vide ?? "", /could not read/);
  });
});

describe("le geste : la page du worktree, dans le navigateur du poste", () => {
  test("il amène le port du worktree sur ce poste par `ssh`, sans rien lancer sur la box, et ouvre l'adresse locale — elle rend la page du worktree", async (t) => {
    const port = await servir(t, "la page du worktree 412");
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const rendues = await pages.ouvrir(CALCULUS, WORKTREE);

    // La commande d'ouverture du poste, appelée une fois, avec l'adresse de ce poste.
    assert.equal(ouvertes.length, 1);
    const local = portDe(ouvertes[0]);
    // La page de l'écran : la route que `status` écrit, jamais la racine.
    assert.deepEqual(ouvertes, [`http://127.0.0.1:${local}/rail`]);
    // La « box » est ce poste : le port du worktree y est pris, la page arrive sur un autre.
    assert.notEqual(local, port);
    assert.equal(await lire(ouvertes[0] as string), "la page du worktree 412");
    // Les options de la veille, le transfert vers le port du worktree, l'hôte — et rien après lui :
    // aucune commande ne part vers la box.
    assert.equal(appels().length, 1);
    assert.equal(TRANSFERT.exec(appels()[0] as string)?.[2], String(port));
    const page = seule(rendues);
    assert.equal(page.enCours, false);
    assert.equal(page.dit?.ouverte, true);
    assert.ok(page.dit?.texte.startsWith(`opened in your browser: http://127.0.0.1:${local}/rail — `));
    assert.ok(page.dit?.texte.includes(`to port ${local} on this workstation (port ${port} is taken there)`));
  });

  test("le port de ce poste est celui du worktree quand il y est libre : l'adresse est celle que `station` écrit", async (t) => {
    // Un port que le poste vient de donner, et de reprendre : rien n'y écoute.
    const donne = ouvrirPort();
    await new Promise<void>((resoudre) => donne.listen(0, "127.0.0.1", resoudre));
    const { port } = donne.address() as AddressInfo;
    await new Promise((resoudre) => donne.close(resoudre));
    const { pages, ouvertes } = essai(t, "ouvre");
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const page = seule(await pages.ouvrir(CALCULUS, WORKTREE));

    assert.deepEqual(ouvertes, [`http://127.0.0.1:${port}/rail`]);
    assert.ok(page.dit?.texte.includes("to the same port on this workstation"));
  });

  test("un second geste ne rouvre rien : le transfert est tenu, et la même adresse s'ouvre", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    await pages.ouvrir(CALCULUS, WORKTREE);
    // Une lecture de plus, qui le montre toujours : rien n'est fermé.
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));
    await pages.ouvrir(CALCULUS, WORKTREE);

    assert.equal(appels().length, 1);
    assert.equal(ouvertes.length, 2);
    assert.equal(ouvertes[0], ouvertes[1]);
    assert.equal(await lire(ouvertes[1] as string), "la page");
  });

  test("deux gestes de front n'ouvrent qu'un transfert, et qu'une fois la page", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const premier = pages.ouvrir(CALCULUS, WORKTREE);
    // Tant qu'il n'a pas abouti, le geste se dit en cours.
    assert.equal(seule(pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")))).enCours, true);
    await Promise.all([premier, pages.ouvrir(CALCULUS, WORKTREE)]);

    assert.equal(appels().length, 1);
    assert.equal(ouvertes.length, 1);
  });

  test("quand `status` ne montre plus le serveur, son transfert est fermé — et le geste ne lance plus rien", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, appels, pids } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));
    await pages.ouvrir(CALCULUS, WORKTREE);

    pages.recevoir(lue(status()));

    await jusqua(() => pids().every((pid) => !vivant(pid)));
    // Rien ne reste du transfert sur ce poste : ni son port, ni sa prise.
    await assert.rejects(lire(ouvertes[0] as string));
    assert.equal(existsSync(dirname(TRANSFERT.exec(appels()[0] as string)?.[1] as string)), false);
    const rendues = await pages.ouvrir(CALCULUS, WORKTREE);
    assert.deepEqual(rendues?.pages, []);
    assert.match(rendues?.refus ?? "", /^nothing opened: .* no longer shows this server/);
    assert.equal(appels().length, 1);
    assert.equal(ouvertes.length, 1);
  });

  test("une lecture ratée ne ferme rien : rien ne prouve que le serveur n'est plus là — mais aucun geste ne part", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));
    await pages.ouvrir(CALCULUS, WORKTREE);

    pages.recevoir(ratee());
    const rendues = await pages.ouvrir(CALCULUS, WORKTREE);

    assert.match(rendues?.refus ?? "", /has not been read/);
    assert.equal(appels().length, 1);
    assert.equal(ouvertes.length, 1);
    assert.equal(await lire(ouvertes[0] as string), "la page");
  });

  test("un `ssh` qui ne joint pas la box : rien n'est ouvert, et ce qu'il a dit est rendu tel quel", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, ssh } = essai(t, "refuse");
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const page = seule(await pages.ouvrir(CALCULUS, WORKTREE));

    assert.deepEqual(ouvertes, []);
    assert.equal(page.dit?.ouverte, false);
    assert.match(page.dit?.texte ?? "", /^nothing opened: /);
    assert.ok(page.dit?.texte.includes(`$ ${ssh} -o BatchMode=yes -o ConnectTimeout=10 -o ControlPath=none -o ExitOnForwardFailure=yes -N -L `));
    assert.ok(page.dit?.texte.includes("ssh: connect to host box port 22: Connection refused\n→ exit code 255"));
    // Le geste reste posé : il se retente.
    assert.equal(page.raison, undefined);
    assert.equal(page.enCours, false);
  });

  test("un `ssh` qui n'ouvre pas le transfert est arrêté au délai, et l'app le dit", async (t) => {
    // Court, et vrai quel que soit le temps que tout met : ce `ssh`-là n'ouvre jamais rien.
    const port = await servir(t, "la page");
    const { pages, ouvertes, pids } = essai(t, "muet", { delaiMs: 300 });
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const page = seule(await pages.ouvrir(CALCULUS, WORKTREE));

    assert.deepEqual(ouvertes, []);
    assert.match(page.dit?.texte ?? "", /^nothing opened: `ssh` did not open the forward in 0.3 s — it is stopped/);
    await jusqua(() => pids().every((pid) => !vivant(pid)));
  });

  test("là où aucun geste n'est posé, rien ne part : serveur qui démarre, worktree que `status` ne montre pas, projet sans box", async (t) => {
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, 20412, "démarre"), "")));

    const demarre = await pages.ouvrir(CALCULUS, WORKTREE);
    const inconnu = await pages.ouvrir(CALCULUS, "worktrees/999-ab12cd34");
    const sansBox = await pages.ouvrir({ nom: "calculus", dossier: "/projets/calculus" }, WORKTREE);
    const sansNom = await pages.ouvrir(CALCULUS, 412);

    assert.match(demarre?.refus ?? "", /^nothing opened: /);
    assert.match(inconnu?.refus ?? "", /no longer shows this server/);
    assert.equal(sansBox, undefined);
    assert.match(sansNom?.refus ?? "", /no longer shows this server/);
    assert.deepEqual(appels(), []);
    assert.deepEqual(ouvertes, []);
  });

  test("sur un serveur sans page d'écran, le geste ne part pas — rien n'est transféré ni ouvert, la racine moins que tout", async (t) => {
    const { pages, ouvertes, appels } = essai(t);
    pages.recevoir(lue(status(SERVEURS(3), serveur(412, 20412, "écoute", SANS_ECRAN), serveur(413, 20413, "écoute", "http://127.0.0.1:20413/"), serveur(414, 20414, "écoute", ""), "")));

    const sansEcran = await pages.ouvrir(CALCULUS, WORKTREE);
    const racine = await pages.ouvrir(CALCULUS, "worktrees/413-ab12cd34");
    const muette = await pages.ouvrir(CALCULUS, "worktrees/414-ab12cd34");

    assert.equal(sansEcran?.refus, `nothing opened: ${SANS_ECRAN}`);
    assert.match(racine?.refus ?? "", /^nothing opened: .* never opens the root of a worktree/);
    assert.match(muette?.refus ?? "", /^nothing opened: .* never opens the root of a worktree/);
    assert.deepEqual(appels(), []);
    assert.deepEqual(ouvertes, []);
  });

  test("l'écran déclaré ouvre sa route, quelle qu'elle soit — sa requête et son ancre comprises", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port, "écoute", `http://127.0.0.1:${port}/projets/12?onglet=notes#haut`), "")));

    await pages.ouvrir(CALCULUS, WORKTREE);

    assert.equal(ouvertes.length, 1);
    assert.match(ouvertes[0] ?? "", /^http:\/\/127\.0\.0\.1:\d+\/projets\/12\?onglet=notes#haut$/);
  });

  test("le poste n'a pas pu ouvrir l'adresse : le transfert reste, et l'adresse est dite pour être ouverte à la main", async (t) => {
    const port = await servir(t, "la page");
    const { pages } = essai(t, "relaie", {}, () => Promise.reject(new Error("aucun navigateur")));
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const page = seule(await pages.ouvrir(CALCULUS, WORKTREE));

    assert.equal(page.dit?.ouverte, false);
    assert.ok(page.dit?.texte.includes("aucun navigateur"));
    const [url] = /http:\/\/127\.0\.0\.1:\d+\/rail/.exec(page.dit?.texte ?? "") ?? [];
    assert.equal(await lire(url as string), "la page");
  });

  test("un transfert qui tombe de lui-même se dit : la page ouverte ne répond plus", async (t) => {
    const port = await servir(t, "la page");
    const { pages, pids } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));
    await pages.ouvrir(CALCULUS, WORKTREE);

    // Par son pid, et lui seul : c'est le `ssh` de ce test.
    for (const pid of pids()) process.kill(pid);

    let page = seule(pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), ""))));
    while (page.dit?.ouverte !== false) {
      await new Promise((resoudre) => setTimeout(resoudre, 10));
      page = seule(pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), ""))));
    }
    assert.match(page.dit.texte, /^the port forward closed/);
  });

  test("un projet qui quitte l'app, et l'app qui ferme : leurs transferts sont fermés, par leur pid", async (t) => {
    const port = await servir(t, "la page");
    const { pages, pids } = essai(t);
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), ""), "parade"));
    await pages.ouvrir(CALCULUS, WORKTREE);
    await pages.ouvrir({ ...CALCULUS, nom: "parade" }, WORKTREE);
    const [premier, second] = pids() as [number, number];

    pages.oublier("calculus");
    await jusqua(() => !vivant(premier));
    assert.equal(vivant(second), true);

    pages.fermer();
    await jusqua(() => !vivant(second));
  });

  test("un geste encore en route quand l'app ferme est abandonné : son `ssh` est arrêté", async (t) => {
    const port = await servir(t, "la page");
    const { pages, ouvertes, pids } = essai(t, "muet");
    pages.recevoir(lue(status(SERVEURS(1), serveur(412, port), "")));

    const enRoute = pages.ouvrir(CALCULUS, WORKTREE);
    await jusqua(() => pids().length === 1);
    pages.fermer();
    await enRoute;

    await jusqua(() => pids().every((pid) => !vivant(pid)));
    assert.deepEqual(ouvertes, []);
  });
});

describe("ce que l'app n'est pas", () => {
  // Tout ce que l'app charge : le process principal, le pont, la vue.
  const sources = (readdirSync(SOURCES, { recursive: true }) as string[]).filter((nom) => /\.(ts|cjs|js|html)$/.test(nom)).map((nom) => ({ nom, texte: readFileSync(join(SOURCES, nom), "utf8") }));

  test("elle n'embarque aucun rendu et ne capture rien : la page ne s'ouvre que dans le navigateur du poste", () => {
    for (const { nom, texte } of sources) {
      assert.doesNotMatch(texte, /<iframe|<webview|<embed|<object|webviewTag|BrowserView|WebContentsView|capturePage|desktopCapturer/i, nom);
    }
    // Une seule fenêtre : celle de l'app. Elle ne charge que sa propre vue.
    const fenetres = sources.flatMap(({ texte }) => texte.match(/new BrowserWindow\(/g) ?? []);
    assert.equal(fenetres.length, 1);
  });

  test("elle ne recueille aucun verdict : le geste de page n'a qu'un bouton, celui qui ouvre", () => {
    const vue = sources.find(({ nom }) => nom === join("vue", "vue.js"))?.texte ?? "";
    // La page se pose sur la carte de son ticket (`poserServie`) ; sous l'état, ce qui l'empêche (`poserPages`).
    const fonction = (nom: string) => {
      const debut = vue.indexOf(`function ${nom}(`);
      assert.notEqual(debut, -1, nom);
      return vue.slice(debut, vue.indexOf("\n}\n", debut));
    };
    const servie = fonction("poserServie");
    const sous = fonction("poserPages");

    assert.equal((servie.match(/bouton\(/g) ?? []).length, 1);
    assert.equal((sous.match(/bouton\(/g) ?? []).length, 0);
    for (const poser of [servie, sous]) assert.doesNotMatch(poser, /valider|refuser|approuver|rejeter|<input|createElement\("(input|select|textarea|form)"\)/i);
  });
});

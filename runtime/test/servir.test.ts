// Les serveurs des worktrees : une livraison qui touche l'interface est servie
// depuis le worktree de son cook, sur le port de ce worktree, et ça se voit.
// D'abord le module seul, sur des commandes qui n'ouvrent aucun port ; puis la
// station entière, sur de vrais dépôts git, un setup qui attribue le port et
// une doublure de service qui y répond.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { configCloison } from "../src/cloison.ts";
import type { Fait } from "../src/evenements.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "../src/gates.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirNettoyage } from "../src/nettoyage.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { DECLARATION_ECRANS } from "../src/ecran.ts";
import { direCommentLeVoir, direEcran, direPage, serveursEnCours, servicesIndisponibles, worktreesTenus, type Serveur } from "../src/projections/service.ts";
import { DECLARATION_SERVICE, VARIABLE_DU_PORT } from "../src/service.ts";
import { ouvrirServeurs, type Livraison } from "../src/servir.ts";
import { principal as status } from "../src/status.ts";
import { cuisine, fauxGitHub, issue, montre, STATION, type Lieux, type Options } from "./helpers/kitchen.ts";
import { aArreter, appeler, BASE, depotGit, ENV_ENFANT, FAUX_BWRAP, git, jusqua, lancementsDuFauxBwrap, mort, portsFermesALInstant, repertoireTemporaire, vivant } from "./outils.ts";

const FAUX_SERVICE = join(import.meta.dirname, "helpers/fake-service.ts");
const FAUSSES_GATES = join(import.meta.dirname, "helpers/fake-gates.sh");
// La commande de service d'un projet de test : la doublure, par le Node de la suite.
const SERT = `exec "${process.execPath}" "${FAUX_SERVICE}"`;
// Une commande qui tourne sans ouvrir de port : rien à tirer, rien à se disputer.
const TOURNE = "exec sleep 30";
const declarer = (commande: string, ...chemins: string[]) => [`commande : ${commande}`, ...chemins.map((chemin) => `interface : ${chemin}`), ""].join("\n");
// Une app Electron : elle ne se sert pas, elle se lance.
const LANCEMENT = "npm --prefix app start";
const declarerUneApp = (...chemins: string[]) => [`lancement : ${LANCEMENT}`, ...chemins.map((chemin) => `interface : ${chemin}`), ""].join("\n");
const echapper = (texte: unknown) => String(texte).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

type Reponse = { cwd: string; port: number; fichiers: string[] };

// Ce qui répond sur ce port, si c'est la doublure de service ; null sinon.
async function interroger(port: number): Promise<Reponse | null> {
  try {
    return (await (await fetch(`http://127.0.0.1:${port}/`)).json()) as Reponse;
  } catch {
    return null;
  }
}

// Un port tiré peut être repris par un voisin avant que le serveur ne l'ouvre :
// la doublure sort alors en le disant, et le scénario se rejoue sur d'autres
// ports. La reprise se compte en essais, pas en temps.
class PortPris extends Error {}
async function surPortsLibres(combien: number, scenario: (ports: number[]) => Promise<void>, essais = 5): Promise<void> {
  for (let essai = 1; ; essai++) {
    try {
      return await scenario(await portsFermesALInstant(combien));
    } catch (erreur) {
      if (!(erreur instanceof PortPris) || essai === essais) throw erreur;
    }
  }
}

// --- Le module seul.

function atelier(t: TestContext, options: { cloison?: boolean; graceMs?: number } = {}) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  const avertissements: string[] = [];
  const ranges: number[] = [];
  const temoin = join(repertoire, "temoin-cloison");
  mkdirSync(temoin);
  const cloison = options.cloison
    ? configCloison({ BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: repertoire, HOME: join(repertoireTemporaire(t), "compte") }, { repertoireEtat: repertoire, clone: join(repertoire, "depot") })
    : null;
  const serveurs = ouvrirServeurs({
    journal,
    projet: "brigade",
    station: STATION,
    auteur: `station:${STATION}`,
    cloison,
    avertir: (message) => void avertissements.push(message),
    ranger: async ({ ticket }) => void ranges.push(ticket),
    graceMs: options.graceMs,
    sondeMs: 5,
  });
  // Les serveurs meurent avant que le journal ne se ferme et que le répertoire ne parte.
  aArreter(t, () => {
    serveurs.fermer();
    journal.fermer();
  });
  // Une livraison dans son worktree : ce que son dépôt déclare, le port que son
  // setup lui a attribué, les fichiers qu'elle change, et ce que son cook a livré.
  const livraison = (ticket: number, declaration: string | null, changes: string[], port: number | null = 20000 + ticket, corps: string | null = null): Livraison => {
    const relatif = `worktrees/${ticket}-a`;
    const worktree = join(repertoire, relatif);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    if (declaration !== null) writeFileSync(join(worktree, DECLARATION_SERVICE), declaration);
    const env = { ...ENV_ENFANT, FAUX_BWRAP_TEMOIN: temoin, ...(port === null ? {} : { [VARIABLE_DU_PORT]: String(port) }) };
    return { ticket, run: `${ticket}-a`, worktree, relatif, branche: `cook/${ticket}-a`, changes, corps, env };
  };
  const faits = (type: Fait["type"]) =>
    journal.tout().flatMap(({ ticket, author, type: sien, payload }) => (sien === type ? [{ ticket, author, payload: payload as Record<string, unknown> }] : []));
  return { repertoire, journal, serveurs, avertissements, ranges, temoin, livraison, faits };
}

describe("les serveurs des worktrees", { concurrency: 8 }, () => {
  test("une livraison qui touche l'interface lance la commande déclarée, depuis son worktree et sur son port ; une autre ne lance rien", async (t) => {
    const { journal, serveurs, livraison, faits } = atelier(t);

    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app/src/vue"), ["docs/runtime.md", "app/src/vue.ts"])), false);
    assert.deepEqual([serveurs.tenus(), journal.tout().length], [[], 0]);

    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app/src/vue"), ["docs/runtime.md", "app/src/vue/vue.css"])), true);

    const [lance] = faits("service.started");
    assert.deepEqual([lance?.ticket, lance?.author], [8, `station:${STATION}`]);
    const { pid, ...reste } = lance?.payload as { pid: number };
    assert.deepEqual(reste, { station: STATION, run: "8-a", worktree: "worktrees/8-a", branch: "cook/8-a", port: 20008, screen: null });
    assert.equal(vivant(pid), true);
    assert.deepEqual(serveurs.tenus(), [8]);
    // Rien ne répond sur son port : il démarre, et c'est ce qui se lit.
    assert.deepEqual(
      serveursEnCours(journal.base).map(({ ticket, worktree, port, state }) => ({ ticket, worktree, port, state })),
      [{ ticket: 8, worktree: "worktrees/8-a", port: 20008, state: "starting" }],
    );
  });

  test("pour un projet web, la page à ouvrir est le serveur du worktree suivi de la route de l'écran que le cook déclare — sans écran, aucune page", (t) => {
    const { journal, serveurs, livraison, faits } = atelier(t);
    const declaree = ["J'ai ajouté la page d'exemple.", "", "Écran : /exemple", "À regarder : la page dit bonjour"].join("\n");

    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app"), ["app/exemple.html"], 20007, declaree)), true);
    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/autre.html"], 20008, "J'ai changé une page.")), true);

    assert.deepEqual(
      faits("service.started").map(({ ticket, payload }) => [ticket, payload.screen]),
      [
        [7, { name: "/exemple", sentence: "la page dit bonjour", source: "declare" }],
        [8, null],
      ],
    );
    const [avec, sans] = serveursEnCours(journal.base);
    assert.deepEqual(avec?.ecran, { ecran: "/exemple", phrase: "la page dit bonjour", source: "declare" });
    // Le port du worktree, puis la route de l'écran : jamais la racine.
    assert.equal(direPage(avec as Serveur), "http://127.0.0.1:20007/exemple");
    assert.equal(sans?.ecran, null);
    assert.equal(direPage(sans as Serveur), "aucune page à ouvrir : la livraison ne dit aucun écran, et n'en touche aucun que le projet déclare");
    // La phrase du cook se dit sous l'écran ; sans écran, rien.
    assert.deepEqual(direEcran(avec?.ecran ?? null), ["écran : /exemple (déclaré par le cook)", "à regarder : la page dit bonjour"]);
    assert.deepEqual(direEcran(null), []);
  });

  test("un écran déduit des fichiers changés donne sa page ; un écran qui n'est pas une route n'en donne aucune, et le dit ; une déclaration d'écrans mal écrite se dit", (t) => {
    const { journal, serveurs, livraison, avertissements } = atelier(t);
    const deduite = livraison(7, declarer(TOURNE, "app"), ["app/rail/vue.ts"]);
    writeFileSync(join(deduite.worktree, DECLARATION_ECRANS), ["app/rail : /rail", "app/carte : la carte", "../ailleurs : /ailleurs", ""].join("\n"));
    const nommee = livraison(8, declarer(TOURNE, "app"), ["app/x"], 20008, "Écran : la carte");

    assert.equal(serveurs.servir(deduite), true);
    assert.equal(serveurs.servir(nommee), true);

    const [rail, carte] = serveursEnCours(journal.base);
    assert.deepEqual([rail?.ecran?.source, direPage(rail as Serveur)], ["deduit", "http://127.0.0.1:20007/rail"]);
    assert.deepEqual([carte?.ecran?.source, direPage(carte as Serveur)], ["declare", "aucune page à ouvrir : l'écran « la carte » n'est pas une route"]);
    // Sous la ligne du serveur, `status` dit l'écran et qui l'a dit : déduit, il le dit en toutes lettres.
    assert.deepEqual(direEcran(rail?.ecran ?? null), ["écran : /rail (écran déduit des fichiers touchés, pas déclaré par le cook)"]);
    assert.deepEqual(direEcran(carte?.ecran ?? null), ["écran : la carte (déclaré par le cook)"]);
    assert.equal(avertissements.length, 1);
    assert.match(avertissements[0] ?? "", /^brigade: screen of the delivery of ticket #7 read without the badly written lines — line 3 of `\.claude\/brigade\/ecrans` /);
  });

  test("un projet sans déclaration ne lance rien et le dit une fois, quelle que soit la livraison ; déclaré, ce n'est plus dit", (t) => {
    const { journal, serveurs, avertissements, livraison, faits } = atelier(t);

    assert.equal(serveurs.servir(livraison(7, null, ["app/src/vue/vue.css"])), false);
    assert.equal(serveurs.servir(livraison(8, null, ["docs/runtime.md"])), false);

    const dits = faits("service.unavailable");
    assert.equal(dits.length, 1);
    assert.deepEqual([dits[0]?.ticket, dits[0]?.payload.station, dits[0]?.payload.declared, dits[0]?.payload.delivery], [null, STATION, false, 7]);
    assert.match(String(dits[0]?.payload.why), /^this project does not declare how it is served: its repository has no `\.claude\/brigade\/service`/);
    assert.deepEqual(servicesIndisponibles(journal.base).map(({ declared, ticket }) => ({ declared, ticket })), [{ declared: false, ticket: 7 }]);
    // Ne rien déclarer n'est pas une panne : rien pour journald, rien de lancé.
    assert.deepEqual([avertissements, serveurs.tenus(), faits("service.started")], [[], [], []]);

    // La livraison suivante porte une déclaration : même hors interface, le projet se sert.
    assert.equal(serveurs.servir(livraison(9, declarer(TOURNE, "app"), ["docs/runtime.md"])), false);
    assert.deepEqual([faits("service.available").length, servicesIndisponibles(journal.base)], [1, []]);
  });

  test("une déclaration qui ne sert pas — mal écrite, ou sans port attribué au worktree — ne lance rien, et dit pourquoi", (t) => {
    const { journal, serveurs, avertissements, livraison, faits } = atelier(t);

    assert.equal(serveurs.servir(livraison(7, "commande : npm run dev\n", ["app/x"])), false);
    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/x"], null)), false);

    const pourquoi = faits("service.unavailable").map((dit) => [dit.payload.declared, String(dit.payload.why)]);
    assert.equal(pourquoi.length, 2);
    assert.deepEqual([pourquoi[0]?.[0], pourquoi[1]?.[0]], [true, true]);
    assert.match(String(pourquoi[0]?.[1]), /^this project declares badly how it is served — no interface path/);
    assert.match(String(pourquoi[1]?.[1]), /^no port is assigned to this worktree: its setup \(`\.claude\/brigade\/worktree-setup\.sh`\) does not export `BRIGADE_PORT`, and no port is chosen in its place$/);
    assert.equal(servicesIndisponibles(journal.base)[0]?.ticket, 8);
    assert.equal(avertissements.length, 2);
    assert.match(avertissements[1] ?? "", /^brigade: delivery of ticket #8 not served, no server is launched — no port is assigned/);
    assert.deepEqual([serveurs.tenus(), faits("service.started")], [[], []]);
  });

  test("deux worktrees ne se partagent pas un port : le second n'est pas servi, et c'est le setup qui est nommé", (t) => {
    const { serveurs, livraison, faits } = atelier(t);
    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app"), ["app/x"], 20007)), true);

    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/x"], 20007)), false);

    assert.deepEqual([serveurs.tenus(), faits("service.started").length], [[7], 1]);
    assert.equal(faits("service.unavailable")[0]?.payload.why, "port 20007 is already that of the server of ticket #7 (worktrees/7-a): the project's setup must assign one port per worktree");
  });

  test("une commande qui sort d'elle-même n'est plus un serveur : sa fin est au journal avec ce qu'elle a dit, et son worktree est rendu au rangement", async (t) => {
    const { journal, serveurs, avertissements, ranges, livraison, faits } = atelier(t);

    assert.equal(serveurs.servir(livraison(7, declarer('echo "vite: command not found" >&2; exit 127', "app"), ["app/x"])), true);
    await jusqua(() => ranges.length === 1);

    assert.deepEqual(faits("service.stopped").map((fin) => [fin.ticket, fin.payload]), [
      [7, { worktree: "worktrees/7-a", port: 20007, reason: "exited", code: 127, signal: null, tail: "vite: command not found" }],
    ]);
    assert.deepEqual([serveurs.tenus(), serveursEnCours(journal.base), ranges], [[], [], [7]]);
    assert.deepEqual(avertissements, ["brigade: the server of ticket #7 (worktrees/7-a, port 20007) stopped by itself — exit code 127\nvite: command not found"]);
  });

  test("un serveur arrêté meurt avec tout ce qu'il a lancé ; sourd à SIGTERM, il est tué passé la grâce — et son worktree n'est rendu qu'ensuite", async (t) => {
    const { repertoire, journal, serveurs, ranges, livraison, faits } = atelier(t, { graceMs: 20 });
    const pret = join(repertoire, "pret");
    // Un serveur qui en lance un autre, et n'entend pas SIGTERM.
    const sourd = `trap "" TERM; sleep 30 & echo $! > "${pret}.enfant"; : > "${pret}"; wait`;
    assert.equal(serveurs.servir(livraison(7, declarer(sourd, "app"), ["app/x"])), true);
    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/x"])), true);
    await jusqua(() => existsSync(pret));
    const pids = faits("service.started").map((lance) => Number(lance.payload.pid));
    const enfant = Number(readFileSync(`${pret}.enfant`, "utf8"));

    await Promise.all([serveurs.arreter(7, "served"), serveurs.arreter(8, "left")]);

    // Rendu une fois le serveur mort : le rangement ne retire pas un worktree servi.
    assert.deepEqual([...ranges].sort(), [7, 8]);
    assert.deepEqual([vivant(pids[0]), vivant(pids[1])], [false, false]);
    await mort(enfant);
    const fins = Object.fromEntries(faits("service.stopped").map((fin) => [fin.ticket, [fin.payload.reason, fin.payload.signal]]));
    assert.deepEqual(fins, { 7: ["served", "SIGKILL"], 8: ["left", "SIGTERM"] });
    assert.deepEqual([serveurs.tenus(), serveursEnCours(journal.base)], [[], []]);
    // Arrêter un ticket qui n'a pas de serveur n'attend rien.
    await serveurs.arreter(9, "retaken");
  });

  test("le rangement d'un worktree arrête son serveur d'abord — et lui seul, sans que le serveur ne le range une seconde fois", async (t) => {
    const { repertoire, journal, serveurs, ranges, avertissements, livraison, faits } = atelier(t);
    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app"), ["app/x"])), true);
    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/x"])), true);
    const [pid7, pid8] = faits("service.started").map((lance) => Number(lance.payload.pid));
    // Le rangement vu des deux côtés : à son appel, le serveur du worktree est déjà mort.
    const retires: { worktree: string; mort: boolean }[] = [];
    const nettoyage = ouvrirNettoyage({
      journal,
      projet: "brigade",
      repertoireEtat: repertoire,
      avertir: (message) => void avertissements.push(message),
      avant: (relatif) => serveurs.liberer(relatif),
      depot: {
        async ranger(worktree) {
          retires.push({ worktree, mort: !vivant(pid7 ?? 0) });
          return null;
        },
        async elaguer() {
          return false;
        },
      },
    });

    // Le rattrapage, un chemin d'erreur : tout ce qui range passe par là.
    await nettoyage.ranger(7, "worktrees/7-a", "cook/7-a");

    assert.deepEqual(retires, [{ worktree: join(repertoire, "worktrees/7-a"), mort: true }]);
    assert.deepEqual(faits("service.stopped").map((fin) => [fin.ticket, fin.payload.reason]), [[7, "removed"]]);
    assert.deepEqual([serveurs.tenus(), serveursEnCours(journal.base).map((serveur) => serveur.ticket)], [[8], [8]]);
    assert.equal(vivant(pid8 ?? 0), true);
    // Le serveur n'a pas rendu son worktree au rangement : celui-ci était déjà en cours.
    assert.deepEqual(ranges, []);
    // Un worktree sans serveur se range sans attendre.
    await nettoyage.ranger(9, "worktrees/9-a", "cook/9-a");
    assert.equal(retires.length, 2);
  });

  test("un serveur dont le worktree a disparu est détecté et arrêté : il n'est plus listé, et le journal dit pourquoi", async (t) => {
    const { repertoire, journal, serveurs, ranges, livraison, faits } = atelier(t);
    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app"), ["app/x"])), true);
    assert.equal(serveurs.servir(livraison(8, declarer(TOURNE, "app"), ["app/x"])), true);
    const pid = Number(faits("service.started")[0]?.payload.pid);
    assert.deepEqual(serveurs.orphelins(), []);

    rmSync(join(repertoire, "worktrees/7-a"), { recursive: true });

    assert.deepEqual(serveurs.orphelins(), [7]);
    await serveurs.arreter(7, "orphaned");
    await mort(pid);
    assert.deepEqual(faits("service.stopped").map((fin) => [fin.ticket, fin.payload.reason]), [[7, "orphaned"]]);
    assert.deepEqual([serveurs.tenus(), serveursEnCours(journal.base).map((serveur) => serveur.ticket), serveurs.orphelins()], [[8], [8], []]);
    // Son worktree est rendu au rangement, qui en tient le compte.
    assert.deepEqual(ranges, [7]);
  });

  test("quand le runtime s'en va, tout serveur meurt sur-le-champ et le journal le dit : rien n'est rangé, plus rien n'est lancé", async (t) => {
    const { journal, serveurs, ranges, livraison, faits } = atelier(t);
    for (const ticket of [7, 8]) assert.equal(serveurs.servir(livraison(ticket, declarer(TOURNE, "app"), ["app/x"])), true);
    const pids = faits("service.started").map((lance) => Number(lance.payload.pid));

    serveurs.fermer();

    assert.deepEqual(faits("service.stopped").map((fin) => [fin.ticket, fin.payload.reason]), [[7, "shutdown"], [8, "shutdown"]]);
    assert.deepEqual([serveurs.tenus(), serveursEnCours(journal.base)], [[], []]);
    for (const pid of pids) await mort(pid);
    assert.equal(serveurs.servir(livraison(9, declarer(TOURNE, "app"), ["app/x"])), false);
    assert.deepEqual([ranges, faits("service.started").length], [[], 2]);
  });

  test("pour une app Electron, rien n'est lancé et aucune page n'est dite : le worktree est tenu, et la livraison dit comment voir son écran", (t) => {
    const { journal, serveurs, livraison, faits, ranges } = atelier(t);
    const declaree = ["La carte dit l'écran livré.", "", "Écran : la carte", "À regarder : la carte nomme l'écran et la phrase"].join("\n");
    // Une app lancée n'a pas de port : le setup peut ne pas en attribuer.
    const app = livraison(8, declarerUneApp("app/src/vue"), ["app/src/vue/carte.ts"], null, declaree);

    assert.equal(serveurs.servir(livraison(7, declarerUneApp("app/src/vue"), ["runtime/src/station.ts"], null, declaree)), false);
    assert.equal(serveurs.servir(app), true);

    // Aucun serveur : ni process, ni port, ni page.
    assert.deepEqual([faits("service.started"), serveursEnCours(journal.base), servicesIndisponibles(journal.base)], [[], [], []]);
    const commande = `cd '${app.worktree}' && ${LANCEMENT}`;
    const how = `pas de page dans un navigateur : lancer l'app sur le worktree de la livraison, \`${commande}\`, puis y ouvrir l'écran « la carte » — à regarder : la carte nomme l'écran et la phrase`;
    assert.deepEqual(
      faits("service.held").map(({ ticket, author, payload }) => [ticket, author, payload]),
      [[8, `station:${STATION}`, { station: STATION, run: "8-a", worktree: "worktrees/8-a", branch: "cook/8-a", launch: LANCEMENT, how, screen: { name: "la carte", sentence: "la carte nomme l'écran et la phrase", source: "declare" } }]],
    );
    assert.doesNotMatch(JSON.stringify(journal.tout()), /https?:\/\//);
    // Le worktree est tenu, comme sous un serveur : il n'est pas rendu au rangement.
    assert.deepEqual([serveurs.tenus(), ranges], [[8], []]);
    const [tenu] = worktreesTenus(journal.base);
    assert.deepEqual([tenu?.ticket, tenu?.worktree, tenu?.lancement, tenu?.ecran], [8, "worktrees/8-a", LANCEMENT, { ecran: "la carte", phrase: "la carte nomme l'écran et la phrase", source: "declare" }]);
    assert.equal(direCommentLeVoir(tenu as NonNullable<typeof tenu>), how);
  });

  test("une app Electron dont la livraison ne dit aucun écran tient son worktree sans rien à regarder, et le dit", (t) => {
    const { journal, serveurs, livraison, faits } = atelier(t);
    assert.equal(serveurs.servir(livraison(8, declarerUneApp("app/src/vue"), ["app/src/vue/carte.ts"], null, "J'ai changé la carte.")), true);

    assert.deepEqual(faits("service.held").map(({ payload }) => [payload.how, payload.screen]), [[null, null]]);
    const [tenu] = worktreesTenus(journal.base);
    assert.equal(direCommentLeVoir(tenu as NonNullable<typeof tenu>), "rien à regarder : la livraison ne dit aucun écran, et n'en touche aucun que le projet déclare");
  });

  test("le worktree tenu d'une app Electron se relâche comme celui d'un serveur : rangé quand le ticket est servi, laissé à qui le range, laissé tel quel quand le runtime s'en va", async (t) => {
    const { journal, serveurs, livraison, faits, ranges } = atelier(t);
    for (const ticket of [7, 8, 9]) assert.equal(serveurs.servir(livraison(ticket, declarerUneApp("app"), ["app/x"], null)), true);

    await serveurs.arreter(7, "served");
    await serveurs.liberer("worktrees/8-a");
    assert.deepEqual(ranges, [7]);
    assert.deepEqual([serveurs.tenus(), worktreesTenus(journal.base).map((tenu) => tenu.ticket)], [[9], [9]]);

    serveurs.fermer();
    assert.deepEqual(faits("service.released").map(({ ticket, payload }) => [ticket, payload]), [
      [7, { worktree: "worktrees/7-a", reason: "served" }],
      [8, { worktree: "worktrees/8-a", reason: "removed" }],
      [9, { worktree: "worktrees/9-a", reason: "shutdown" }],
    ]);
    assert.deepEqual([ranges, serveurs.tenus(), worktreesTenus(journal.base), faits("service.stopped")], [[7], [], [], []]);
  });

  test("aucun serveur ne survit à son runtime : une vie qui commence n'en liste aucun, même si la précédente est morte sans l'écrire", (t) => {
    const { journal, serveurs, livraison } = atelier(t);
    assert.equal(serveurs.servir(livraison(7, declarer(TOURNE, "app"), ["app/x"])), true);
    assert.equal(serveursEnCours(journal.base).length, 1);

    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });

    assert.deepEqual(serveursEnCours(journal.base), []);
  });

  test("aucun worktree tenu pour une app Electron ne survit à son runtime", (t) => {
    const { journal, serveurs, livraison } = atelier(t);
    assert.equal(serveurs.servir(livraison(7, declarerUneApp("app"), ["app/x"])), true);
    assert.equal(worktreesTenus(journal.base).length, 1);

    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });

    assert.deepEqual(worktreesTenus(journal.base), []);
  });

  test("sous cloison, la commande de service part dans la même cloison que le setup et le cook : son worktree, et rien de plus", async (t) => {
    const { serveurs, temoin, livraison } = atelier(t, { cloison: true });
    const servie = livraison(7, declarer(TOURNE, "app"), ["app/x"]);

    assert.equal(serveurs.servir(servie), true);
    // La doublure crée son témoin avant d'y écrire : il n'est lu qu'écrit jusqu'au dernier argument.
    await jusqua(() => lancementsDuFauxBwrap(temoin)[0]?.at(-1) === TOURNE);
    assert.equal(lancementsDuFauxBwrap(temoin).length, 1);

    const [args = []] = lancementsDuFauxBwrap(temoin);
    assert.deepEqual(args.slice(args.indexOf("--chdir")), ["--chdir", servie.worktree, "--", "env", "--default-signal=TERM", "bash", "-c", TOURNE]);
    const lie = (option: string, chemin: string) => args.some((arg, rang) => arg === option && args[rang + 1] === chemin && args[rang + 2] === chemin);
    assert.equal(lie("--bind", servie.worktree), true);
    // Ni le réseau ni les process de la machine ne lui sont ouverts de plus qu'à un cook.
    assert.deepEqual([args.includes("--unshare-pid"), args.includes("--die-with-parent"), args.includes("--share-net")], [true, true, false]);
  });
});

// --- La station entière.

// Un projet qui se sert : sa base porte sa déclaration de service, et un setup
// de worktree qui attribue à chaque ticket le port que le test a tiré pour lui
// — aucun, pour un ticket sans port. `gates` : elle porte aussi des gates.
// `declaration` : ce que sa base déclare à la place d'une commande servie par la doublure.
function projetServi(t: TestContext, options: { interface: string[]; ports: Record<number, number>; gates?: boolean; declaration?: string }): Lieux {
  const depot = depotGit(t);
  const ports = join(repertoireTemporaire(t), "ports");
  mkdirSync(ports);
  for (const [ticket, port] of Object.entries(options.ports)) writeFileSync(join(ports, ticket), String(port));
  mkdirSync(join(depot.clone, ".claude/brigade"), { recursive: true });
  writeFileSync(join(depot.clone, DECLARATION_SERVICE), options.declaration ?? declarer(SERT, ...options.interface));
  writeFileSync(join(depot.clone, SCRIPT_SETUP), `#!/usr/bin/env bash\nif [ -f "${ports}/$1" ]; then printf 'export ${VARIABLE_DU_PORT}=%q\\n' "$(cat "${ports}/$1")"; fi\n`);
  chmodSync(join(depot.clone, SCRIPT_SETUP), 0o755);
  if (options.gates) symlinkSync(FAUSSES_GATES, join(depot.clone, SCRIPT_GATES));
  git(depot.clone, "add", ".");
  git(depot.clone, "commit", "-q", "-m", "le projet déclare comment il est servi");
  git(depot.clone, "push", "-q", "origin", BASE);
  return { repertoire: repertoireTemporaire(t), ...depot, gh: fauxGitHub(...Object.keys(options.ports).map((ticket) => issue(Number(ticket)))), heure: montre() };
}

type Cuisine = ReturnType<typeof cuisine>;

// La cuisine d'un scénario qui peut se rejouer : arrêtée quand il finit, pour
// que l'essai suivant ne trouve pas ses serveurs.
async function enCuisine(t: TestContext, options: Options, scenario: (lieu: Cuisine) => Promise<void>): Promise<void> {
  const lieu = cuisine(t, options);
  try {
    await scenario(lieu);
  } finally {
    lieu.runtime.arreter("test");
  }
}

// Les faits du service d'un ticket, dans l'ordre.
const duService = (lieu: Cuisine, ticket: number, type: "service.started" | "service.listening" | "service.stopped") =>
  lieu.journal.duTicket(ticket).flatMap((evenement) => (evenement.type === type ? [evenement.payload as Record<string, unknown>] : []));

// Ce que répond le serveur du ticket, une fois son port ouvert — depuis son
// worktree, sans quoi ce n'est pas lui. Lève `PortPris` si un voisin tenait le
// port tiré.
async function serviDepuis(lieu: Cuisine, ticket: number, rang = 0): Promise<Reponse> {
  await jusqua(() => duService(lieu, ticket, "service.started").length > rang);
  const lance = duService(lieu, ticket, "service.started")[rang] ?? {};
  const worktree = realpathSync(join(lieu.repertoire, String(lance.worktree)));
  const fin = () => duService(lieu, ticket, "service.stopped").find((arret) => arret.worktree === lance.worktree);
  await jusqua(() => duService(lieu, ticket, "service.listening").some((ecoute) => ecoute.worktree === lance.worktree) || fin() !== undefined);
  const reponse = await interroger(Number(lance.port));
  if (reponse?.cwd === worktree && fin() === undefined) return reponse;
  await jusqua(() => fin() !== undefined);
  if (/EADDRINUSE/.test(String(fin()?.tail))) throw new PortPris();
  return assert.fail(`le serveur du ticket #${ticket} ne répond pas depuis ${worktree} : ${JSON.stringify(reponse)} — ${JSON.stringify(fin())}`);
}

const montrer = async (commande: typeof status, repertoire: string) => {
  const appel = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0, appel.sortie());
  return appel.sortie();
};

describe("la station sert une livraison d'interface", { concurrency: 8 }, () => {
  test("une livraison qui touche l'interface est servie depuis le worktree de son cook, sur le port que son setup lui a attribué : une requête sur ce port y répond, et `station` comme `status` le listent", async (t) => {
    await surPortsLibres(1, async ([port = 0]) => {
      await enCuisine(t, { lieux: projetServi(t, { interface: ["travail.txt"], ports: { 15: port } }), git: true }, async (lieu) => {
        const { repertoire, dernier, etat, types, avertissements } = lieu;

        const reponse = await serviDepuis(lieu, 15);

        const lance = dernier("service.started", 15) ?? {};
        const cook = dernier("cook.launched", 15) ?? {};
        // Le worktree du cook, sa branche, et le port du setup — aucun autre.
        assert.deepEqual([lance.worktree, lance.branch, lance.port, lance.run], [cook.worktree, cook.branch, port, cook.run]);
        assert.deepEqual([reponse.port, reponse.fichiers.includes("travail.txt")], [port, true]);
        assert.equal(etat(15), "pass");
        // Le worktree reste tant qu'il est servi.
        assert.deepEqual([types(15).includes("worktree.removed"), existsSync(join(repertoire, String(lance.worktree)))], [false, true]);
        assert.deepEqual(avertissements, []);

        const ligne = `  #15  ${echapper(lance.worktree)}  port ${port}  listening since`;
        const station = await montrer(montrerStation, repertoire);
        // Son cook n'a déclaré aucun écran, et le projet n'en déclare aucun : il n'y a pas de page à ouvrir, pas même la racine.
        const sansPage = "no page to open: the delivery names no screen, and touches none that the project declares";
        assert.match(station, new RegExp(`^servers\\s+1 — each serves an interface delivery from its worktree, on that worktree's port\\n${ligne} \\S+  ${echapper(lance.branch)}  ${sansPage}$`, "m"));
        assert.doesNotMatch(station, new RegExp(`http://127\\.0\\.0\\.1:${port}`));
        assert.doesNotMatch(station, /^service /m);
        const photo = await montrer(status, repertoire);
        const sansPageEn = "no page to open: the delivery names no screen, and touches none that the project declares";
        assert.match(photo, new RegExp(`^servers    1 server — an interface delivery, served from its worktree on the port of that worktree\\n  #15  ${echapper(lance.worktree)}  port ${port}  listening since .+  ${echapper(lance.branch)}  ${sansPageEn}$`, "m"));
        assert.doesNotMatch(photo, /^service /m);

        // Le runtime s'en va : le serveur meurt avec lui, et plus rien n'est listé.
        lieu.runtime.arreter("test");
        await mort(Number(lance.pid));
        assert.notEqual((await interroger(port))?.cwd, reponse.cwd);
        assert.match(await montrer(montrerStation, repertoire), /^servers\s+none$/m);
        assert.doesNotMatch(await montrer(status, repertoire), /^servers /m);
      });
    });
  });

  test("pour un projet web, la page de la livraison est celle de l'écran que son cook déclare : le port de son worktree suivi de la route — `station` et `status` la montrent, et elle répond depuis ce worktree", async (t) => {
    await surPortsLibres(1, async ([port = 0]) => {
      await enCuisine(t, { lieux: projetServi(t, { interface: ["travail.txt"], ports: { 15: port } }), git: true, scenario: "livre-un-ecran" }, async (lieu) => {
        const { repertoire, dernier } = lieu;

        const reponse = await serviDepuis(lieu, 15);

        assert.deepEqual(dernier("service.started", 15)?.screen, { name: "/exemple", sentence: "la page d'exemple montre `travail.txt`", source: "declare" });
        const page = `http://127.0.0.1:${port}/exemple`;
        const ligne = `  #15  \\S+  port ${port}  listening since .+  ${echapper(page)}$`;
        assert.match(await montrer(montrerStation, repertoire), new RegExp(ligne, "m"));
        // `status` dit dessous l'écran, qui l'a dit, et la phrase du cook — ce que l'app pose sur la carte.
        const regard = ["    screen: /exemple (declared by the cook)", "    to look at: la page d'exemple montre `travail.txt`"].map(echapper).join("\\n");
        assert.match(await montrer(status, repertoire), new RegExp(`${ligne}\\n${regard}$`, "m"));
        // La page de l'écran est servie par le serveur de ce worktree.
        assert.equal(((await (await fetch(page)).json()) as Reponse).cwd, reponse.cwd);
      });
    });
  });

  test("pour une app Electron, la livraison n'a pas de page : rien n'est servi, son worktree reste, et `station` comme `status` disent comment voir son écran", async (t) => {
    // Le port que le setup attribue n'est jamais ouvert : rien ne s'y lance.
    const lieux = projetServi(t, { interface: ["travail.txt"], ports: { 15: 20015 }, declaration: declarerUneApp("travail.txt") });
    await enCuisine(t, { lieux, git: true, scenario: "livre-un-ecran" }, async (lieu) => {
      const { repertoire, dernier, types, avertissements } = lieu;
      await jusqua(() => dernier("service.held", 15) !== undefined);

      const tenu = dernier("service.held", 15) ?? {};
      const cook = dernier("cook.launched", 15) ?? {};
      assert.deepEqual([tenu.worktree, tenu.branch, tenu.run, tenu.launch], [cook.worktree, cook.branch, cook.run, LANCEMENT]);
      assert.deepEqual(tenu.screen, { name: "/exemple", sentence: "la page d'exemple montre `travail.txt`", source: "declare" });
      const worktree = join(repertoire, String(tenu.worktree));
      const how = `pas de page dans un navigateur : lancer l'app sur le worktree de la livraison, \`cd '${worktree}' && ${LANCEMENT}\`, puis y ouvrir l'écran « /exemple » — à regarder : la page d'exemple montre \`travail.txt\``;
      assert.equal(tenu.how, how);
      // Aucun serveur, et le worktree où lancer l'app reste.
      assert.deepEqual([types(15).filter((type) => type.startsWith("service.")), types(15).includes("worktree.removed"), existsSync(worktree)], [["service.held"], false, true]);
      assert.deepEqual(avertissements, []);

      const howEn = `no page in a browser: launch the app on the delivery's worktree, \`cd '${worktree}' && ${LANCEMENT}\`, then open the screen “/exemple” there — to look at: la page d'exemple montre \`travail.txt\``;
      const ligne = `  #15  ${echapper(tenu.worktree)}  held since .+  ${echapper(tenu.branch)}  ${echapper(howEn)}$`;
      const station = await montrer(montrerStation, repertoire);
      assert.match(station, /^servers\s+none$/m);
      assert.match(station, new RegExp(`^to launch\\s+1 — .*\\n${ligne}`, "m"));
      const photo = await montrer(status, repertoire);
      const regard = ["    screen: /exemple (declared by the cook)", "    to look at: la page d'exemple montre `travail.txt`"].map(echapper).join("\\n");
      const ligneEn = `  #15  ${echapper(tenu.worktree)}  held since .+  ${echapper(tenu.branch)}  ${echapper(howEn)}$`;
      assert.match(photo, new RegExp(`^to launch\\s+1 — .*\\n${ligneEn}\\n${regard}$`, "m"));
      assert.doesNotMatch(`${station}\n${photo}`, /http:\/\/127\.0\.0\.1/);

      // Le runtime s'en va : plus rien n'est tenu, plus rien n'est listé.
      lieu.runtime.arreter("test");
      assert.doesNotMatch(await montrer(montrerStation, repertoire), /^to launch/m);
      assert.doesNotMatch(await montrer(status, repertoire), /^to launch/m);
    });
  });

  test("deux worktrees servis en même temps écoutent sur deux ports sans se couper l'un l'autre ; le ticket servi éteint le sien, et lui seul", async (t) => {
    await surPortsLibres(2, async ([premier = 0, second = 0]) => {
      await enCuisine(t, { lieux: projetServi(t, { interface: ["travail.txt"], ports: { 15: premier, 16: second } }), git: true, cooks: 2 }, async (lieu) => {
        const { repertoire, dernier, types, runtime } = lieu;

        const [a, b] = await Promise.all([serviDepuis(lieu, 15), serviDepuis(lieu, 16)]);

        assert.deepEqual([a.port, b.port], [premier, second]);
        assert.notEqual(a.cwd, b.cwd);
        assert.deepEqual([a.cwd, b.cwd], [15, 16].map((ticket) => realpathSync(join(repertoire, String(dernier("service.started", ticket)?.worktree)))));
        // Les deux répondent encore, chacun de son worktree.
        assert.deepEqual([(await interroger(premier))?.cwd, (await interroger(second))?.cwd], [a.cwd, b.cwd]);
        const station = await montrer(montrerStation, repertoire);
        assert.match(station, new RegExp(`^servers\\s+2 — .*\\n  #15  \\S+  port ${premier}  listening .*\\n  #16  \\S+  port ${second}  listening `, "m"));
        assert.match(await montrer(status, repertoire), new RegExp(`^servers    2 servers — .*\\n  #15  \\S+  port ${premier}  listening .*\\n  #16  \\S+  port ${second}  listening `, "m"));

        // La pass sert le ticket 15 : son serveur n'a plus rien à montrer.
        runtime.rail.servir(15);
        await jusqua(() => types(15).includes("worktree.removed"));

        assert.equal(dernier("service.stopped", 15)?.reason, "served");
        assert.equal(types(15).indexOf("service.stopped") < types(15).indexOf("worktree.removed"), true);
        assert.equal(existsSync(a.cwd), false);
        assert.notEqual((await interroger(premier))?.cwd, a.cwd);
        assert.equal((await interroger(second))?.cwd, b.cwd);
        const apres = await montrer(montrerStation, repertoire);
        assert.match(apres, new RegExp(`^servers\\s+1 — .*\\n  #16  \\S+  port ${second}  listening `, "m"));
        assert.doesNotMatch(apres, /^ {2}#15 .* port /m);
      });
    });
  });

  test("une livraison qui ne touche pas l'interface n'est pas servie : aucun serveur, son worktree part à la fin de son cook, et ni `station` ni `status` n'en montrent", async (t) => {
    const [port = 0] = await portsFermesALInstant(1);
    await enCuisine(t, { lieux: projetServi(t, { interface: ["app/src/vue"], ports: { 15: port } }), git: true }, async (lieu) => {
      const { repertoire, journal, types, etat, avertissements } = lieu;
      await jusqua(() => types(15).includes("worktree.removed"));

      assert.equal(etat(15), "pass");
      assert.deepEqual(journal.tout().filter((evenement) => evenement.type.startsWith("service.")), []);
      assert.deepEqual(avertissements, []);
      const station = await montrer(montrerStation, repertoire);
      assert.match(station, /^servers\s+none$/m);
      assert.doesNotMatch(station, /^service /m);
      assert.doesNotMatch(await montrer(status, repertoire), /^(serveurs|service) /m);
    });
  });

  test("un projet sans déclaration : aucun serveur n'est lancé, et `station` comme `status` disent « ce projet ne déclare pas comment il est servi »", async (t) => {
    const lieu = cuisine(t, { issues: [issue(15), issue(16)] });
    const { repertoire, journal, types, avertissements } = lieu;
    await jusqua(() => [15, 16].every((ticket) => types(ticket).includes("worktree.removed")));

    // Dit une fois pour le projet, pas à chaque livraison ni dans l'histoire d'un ticket.
    const dits = journal.tout().filter((evenement) => evenement.type.startsWith("service."));
    assert.deepEqual(dits.map((dit) => [dit.type, dit.ticket, dit.author]), [["service.unavailable", null, `station:${STATION}`]]);
    assert.deepEqual([types(15).some((type) => type.startsWith("service.")), avertissements], [false, []]);
    const message = /NOT DECLARED — this project does not declare how it is served: its repository has no `\.claude\/brigade\/service` — a "commande: …" line \(or "lancement: …" for an app that does not open in a browser\), and one "interface: <path>" line per path whose change touches the interface \(delivery of ticket #15\); no server is launched — since /;
    const station = await montrer(montrerStation, repertoire);
    assert.match(station, /^servers\s+none$/m);
    assert.match(station, new RegExp(`^service\\s+${message.source}\\S+$`, "m"));
    const photo = await montrer(status, repertoire);
    assert.doesNotMatch(photo, /^serveurs /m);
    assert.match(photo, new RegExp(`^service    ${message.source}.+ ago on box/claude$`, "m"));
  });

  test("un projet qui déclare son service, mais dont le setup n'attribue pas de port au worktree : rien n'est servi, le motif se lit et part à journald", async (t) => {
    await enCuisine(t, { lieux: { ...projetServi(t, { interface: ["travail.txt"], ports: {} }), gh: fauxGitHub(issue(15)) }, git: true }, async (lieu) => {
      const { repertoire, journal, types, avertissements } = lieu;
      await jusqua(() => types(15).includes("worktree.removed"));

      assert.deepEqual(journal.tout().flatMap((dit): unknown[] => (dit.type === "service.unavailable" ? [dit.payload.declared] : dit.type.startsWith("service.") ? [dit.type] : [])), [true]);
      assert.equal(avertissements.length, 1);
      assert.match(avertissements[0] ?? "", /^brigade: delivery of ticket #15 not served, no server is launched — no port is assigned to this worktree/);
      assert.match(await montrer(montrerStation, repertoire), /^service\s+NOT SERVABLE — no port is assigned to this worktree: .* \(delivery of ticket #15\); no server is launched — since \S+$/m);
    });
  });

  test("un worktree qui disparaît sous son serveur : le serveur est arrêté, plus rien n'écoute sur son port et ni `station` ni `status` ne le listent", async (t) => {
    await surPortsLibres(1, async ([port = 0]) => {
      await enCuisine(t, { lieux: projetServi(t, { interface: ["travail.txt"], ports: { 15: port } }), git: true }, async (lieu) => {
        const { repertoire, dernier } = lieu;
        const reponse = await serviDepuis(lieu, 15);
        const lance = dernier("service.started", 15) ?? {};

        rmSync(reponse.cwd, { recursive: true, force: true });
        await jusqua(() => duService(lieu, 15, "service.stopped").length > 0);

        assert.equal(dernier("service.stopped", 15)?.reason, "orphaned");
        await mort(Number(lance.pid));
        assert.notEqual((await interroger(port))?.cwd, reponse.cwd);
        assert.match(await montrer(montrerStation, repertoire), /^servers\s+none$/m);
        assert.doesNotMatch(await montrer(status, repertoire), /^servers /m);
      });
    });
  });

  test("un worktree servi que le rattrapage range : son serveur s'arrête d'abord — `removed` —, plus rien n'écoute sur son port, ni `station` ni `status` ne le listent", async (t) => {
    await surPortsLibres(1, async ([port = 0]) => {
      await enCuisine(t, { lieux: projetServi(t, { interface: ["travail.txt"], ports: { 15: port } }), git: true }, async (lieu) => {
        const { repertoire, dernier, journal, types } = lieu;
        const reponse = await serviDepuis(lieu, 15);
        const lance = dernier("service.started", 15) ?? {};
        assert.equal(types(15).includes("worktree.removed"), false);

        // Un worktree gardé est rangé par le rattrapage, à chaque tick : c'est
        // lui qui, sous un serveur qui tourne, doit l'arrêter d'abord.
        journal.ajouter({
          project: "brigade",
          ticket: 15,
          author: "nettoyage",
          type: "worktree.kept",
          payload: { worktree: String(lance.worktree), branch: String(lance.branch), reason: "failed", detail: "gardé par le test" },
        });
        await jusqua(() => types(15).includes("worktree.removed"));

        assert.deepEqual(duService(lieu, 15, "service.stopped").map((arret) => arret.reason), ["removed"]);
        const ordre = types(15);
        assert.equal(ordre.lastIndexOf("service.stopped") < ordre.indexOf("worktree.removed"), true);
        await mort(Number(lance.pid));
        assert.notEqual((await interroger(port))?.cwd, reponse.cwd);
        assert.equal(existsSync(reponse.cwd), false);
        assert.match(await montrer(montrerStation, repertoire), /^servers\s+none$/m);
        assert.doesNotMatch(await montrer(status, repertoire), /^servers /m);
      });
    });
  });

  test("un cook qui reprend le ticket prend la place du serveur : l'ancien s'arrête et son worktree part avant que la branche ne soit reprise, et la nouvelle livraison est servie sur le même port", async (t) => {
    await surPortsLibres(1, async ([port = 0]) => {
      const lieux = projetServi(t, { interface: ["travail.txt"], ports: { 17: port }, gates: true });
      // Le reviewer refuse la première livraison, et laisse passer la seconde.
      await enCuisine(t, { lieux, git: true, pass: true, suite: ["livre", "ecrit-sans-commiter"], reviewer: { suite: ["relit-rouge", "relit-vert"] } }, async (lieu) => {
        const { repertoire, journal, dernier, types } = lieu;

        // Le premier serveur ne vit que le temps de la relecture : c'est le
        // second, que plus rien ne remplace, qu'on interroge.
        const seconde = await serviDepuis(lieu, 17, 1);

        const [premier, second] = duService(lieu, 17, "service.started");
        const ancien = join(repertoire, String(premier?.worktree));
        assert.notEqual(premier?.worktree, second?.worktree);
        assert.deepEqual([premier?.port, second?.port, seconde.port], [port, port, port]);
        // Le cook du renvoi a repris la branche de la livraison : elle était libre.
        const lances = journal.duTicket(17).filter((evenement) => evenement.type === "cook.launched").map((evenement) => evenement.payload);
        assert.equal(lances.length, 2);
        assert.equal(lances[0]?.branch, lances[1]?.branch);
        assert.deepEqual(duService(lieu, 17, "service.started").map((lance) => lance.worktree), lances.map((lance) => lance.worktree));
        assert.equal(types(17).some((type) => type === "worktree.kept"), false);
        // L'ancien serveur d'abord, puis son worktree, puis le cook suivant.
        const ordre = journal.duTicket(17).map((evenement) => evenement.type);
        const arret = ordre.indexOf("service.stopped");
        assert.equal(duService(lieu, 17, "service.stopped")[0]?.reason, "retaken");
        assert.equal(arret < ordre.indexOf("worktree.removed") && ordre.indexOf("worktree.removed") < ordre.lastIndexOf("cook.launched"), true);
        assert.equal(existsSync(ancien), false);
        // La livraison du renvoi porte ce que son cook a ajouté, et c'est elle qui répond.
        assert.equal(seconde.fichiers.includes("brouillon.txt"), true);
        assert.equal((await interroger(port))?.cwd, seconde.cwd);
        const station = await montrer(montrerStation, repertoire);
        assert.match(station, new RegExp(`^servers\\s+1 — .*\\n  #17  ${echapper(dernier("service.started", 17)?.worktree)}  port ${port}  listening `, "m"));
      });
    });
  });
});

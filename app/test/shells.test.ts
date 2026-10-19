// Les shells persistants du registre : ouverts sur la machine choisie, retenus, ramenés à la
// réouverture de l'app rattachés à leur session, et détruits pour de bon quand le chef les ferme.
// Contre de faux pty d'abord — ce qui est lancé, retenu, oublié —, puis sur un vrai multiplexeur,
// sur un vrai terminal : la commande lancée avant la fermeture tourne toujours, l'historique est là.
// Aucun test n'attend une durée : chacun attend ce que le terminal affiche.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { detruire, joindre, scriptDeRattachement, VIGILANCE_SSH, type Cible, type Session } from "../src/persistance.ts";
import { ouvrirPty as vraiPty, ptyDisponible } from "../src/pty.ts";
import { rappelLu, souvenirsDansFichier, type Rappel, type Souvenirs } from "../src/souvenirs.ts";
import { ouvrirTerminaux, REPRISES_MS, type Lancement, type Pty, type Terminal } from "../src/terminaux.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const WORKSTATION: Cible = { lieu: "poste" };
const STATION: Cible = { lieu: "box", nom: "parade-box", hote: "parade-box" };
const STUDIO: Cible = { lieu: "station", nom: "studio", hote: "studio" };

type FauxPty = Lancement & { ecrits: string[]; tue: boolean };

function enMemoire(depart: Rappel = {}): Souvenirs & { tel(): Rappel } {
  let rappel = structuredClone(depart);
  return { lire: () => structuredClone(rappel), ecrire: (neuf) => void (rappel = structuredClone(neuf)), tel: () => rappel };
}

// Les reprises prévues, que le test fait partir lui-même : aucune n'attend une durée.
type Prevue = { faire(): void; ms: number };
function horloge() {
  const prevues: Prevue[] = [];
  return {
    prevues,
    plusTard(faire: () => void, ms: number) {
      const prevue = { faire, ms };
      prevues.push(prevue);
      return () => {
        const rang = prevues.indexOf(prevue);
        if (rang >= 0) prevues.splice(rang, 1);
      };
    },
    // Fait partir la seule reprise prévue.
    sonner() {
      assert.equal(prevues.length, 1, "une seule reprise est prévue");
      prevues.shift()?.faire();
    },
  };
}

// Ce que la machine répond aux sondes : elle répond, ou pas — au moment où le test les laisse répondre.
type Reponse = { joint: true } | { erreur: string };
function reseau() {
  const sondees: Cible[] = [];
  let reponse: Reponse = { joint: true };
  const enCours: ((reponse: Reponse) => void)[] = [];
  return {
    sondees,
    couper: (erreur = "ssh: connect to host parade-box port 22: Network is unreachable (exit code 255)") => void (reponse = { erreur }),
    retablir: () => void (reponse = { joint: true }),
    joindre(cible: Cible): Promise<Reponse> {
      sondees.push(cible);
      return new Promise((rendre) => enCours.push(rendre));
    },
    // Rend ce que la machine répond aux sondes parties, et laisse le registre le lire.
    async repondre() {
      for (const rendre of enCours.splice(0)) rendre(reponse);
      await new Promise((suite) => setImmediate(suite));
    },
  };
}

// Un registre comme l'app en ouvre un à chaque lancement : ses pty sont faux, ses souvenirs ceux qu'on lui donne.
function lancement(souvenirs: Souvenirs, detruites: Session[] = [], rendu: { detruite: true } | { erreur: string } = { detruite: true }, reglages: { reseau?: ReturnType<typeof reseau>; horloge?: ReturnType<typeof horloge> } = {}) {
  const lances: FauxPty[] = [];
  const etats: Terminal[] = [];
  const sorties = new Map<number, string>();
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ssh: "/usr/bin/ssh",
    souvenirs,
    compte: (cible) => (cible.lieu === "poste" ? "benoit" : "debian"),
    detruire: (session) => (detruites.push(session), Promise.resolve(rendu)),
    ...(reglages.reseau === undefined ? {} : { joindre: reglages.reseau.joindre }),
    ...(reglages.horloge === undefined ? {} : { plusTard: reglages.horloge.plusTard }),
    ouvrirPty(lance) {
      const faux: FauxPty = { ...lance, ecrits: [], tue: false };
      lances.push(faux);
      return { ecrire: (donnees) => void faux.ecrits.push(donnees), redimensionner: () => {}, tuer: () => void (faux.tue = true) };
    },
    surSortie: (id, donnees) => void sorties.set(id, (sorties.get(id) ?? "") + donnees),
    surEtat: (terminal) => void etats.push(terminal),
  });
  const shells = () => lances.filter(({ commande }) => commande !== "claude");
  const sortie = (id: number) => sansEchappements(sorties.get(id) ?? "");
  return { terminaux, lances, shells, etats, sortie };
}

describe("un shell persistant, ouvert sur la machine choisie", () => {
  test("sur ce poste, `sh` crée la session du shell ou s'y rattache ; vers la box ou une station, `ssh` joint son hôte — et l'app retient chacun", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs);
    terminaux.espace(BRIGADE);

    const ici = terminaux.ouvrir(BRIGADE, WORKSTATION);
    const labas = terminaux.ouvrir(BRIGADE, STATION);
    const studio = terminaux.ouvrir(BRIGADE, STUDIO);

    assert.deepEqual(
      shells().map(({ commande, args, dossier }) => [commande, args, dossier]),
      [
        ["/bin/sh", ["-c", scriptDeRattachement("brigade-brigade-1")], "/projets/brigade"],
        ["/usr/bin/ssh", ["-t", ...VIGILANCE_SSH, "--", "parade-box", `sh -c '${scriptDeRattachement("brigade-brigade-2")}'`], "/projets/brigade"],
        ["/usr/bin/ssh", ["-t", ...VIGILANCE_SSH, "--", "studio", `sh -c '${scriptDeRattachement("brigade-brigade-3")}'`], "/projets/brigade"],
      ],
    );
    assert.deepEqual([ici.titre, labas.titre, studio.titre], ["shell 1", "shell 2 · parade-box", "shell 3 · studio"]);
    assert.equal(ici.note, "persistent shell on this Mac, in /projets/brigade — session `brigade-brigade-1`: closing the app only detaches from it, closing this shell destroys it");
    assert.equal(labas.note, "persistent shell on main station parade-box (`ssh parade-box`, with the account your ssh gives it) — session `brigade-brigade-2`: closing the app only detaches from it, closing this shell destroys it");
    assert.deepEqual(souvenirs.tel(), {
      brigade: {
        dernier: 3,
        shells: [
          { rang: 1, session: "brigade-brigade-1", cible: WORKSTATION },
          { rang: 2, session: "brigade-brigade-2", cible: STATION },
          { rang: 3, session: "brigade-brigade-3", cible: STUDIO },
        ],
      },
    });
  });

  test("le shell qu'un geste ouvre pour y écrire sa commande reste un shell de ce poste, qui finit avec l'app : il n'est pas retenu", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs);
    terminaux.espace(BRIGADE);

    const geste = terminaux.shell(BRIGADE, "git -C /projets/brigade pull");

    assert.deepEqual(shells().map(({ commande, args }) => [commande, ...args]), [["/bin/zsh", "-l"]]);
    assert.equal(geste.titre, "shell 1");
    assert.deepEqual(souvenirs.tel(), {});
    // Le rang reste pris : le shell persistant suivant ne porte pas le même titre.
    assert.equal(terminaux.ouvrir(BRIGADE, WORKSTATION).titre, "shell 2");
  });
});

describe("fermer l'app, puis la rouvrir : les shells persistants reviennent", () => {
  test("rouvert, l'espace du projet ramène chaque shell, rattaché à sa session sur sa machine, sous le même titre — et un shell neuf prend le rang suivant", () => {
    const souvenirs = enMemoire();
    const avant = lancement(souvenirs);
    avant.terminaux.espace(BRIGADE);
    avant.terminaux.ouvrir(BRIGADE, WORKSTATION);
    avant.terminaux.ouvrir(BRIGADE, STATION);
    const commandes = avant.shells().map(({ commande, args }) => [commande, ...args]);

    // Fermer l'app tue ses terminaux — les clients des sessions, pas les sessions —, et n'oublie rien.
    avant.terminaux.fermer();
    assert.ok(avant.shells().every(({ tue }) => tue));
    const retenu = souvenirs.tel();

    const apres = lancement(souvenirs);
    assert.deepEqual(apres.lances, [], "rien n'est lancé avant que l'espace du projet ne s'ouvre");
    const space = apres.terminaux.espace(BRIGADE);

    assert.deepEqual(space.map(({ genre, titre }) => [genre, titre]), [["second", "Second"], ["shell", "shell 1"], ["shell", "shell 2 · parade-box"]]);
    assert.deepEqual(apres.shells().map(({ commande, args }) => [commande, ...args]), commandes);
    assert.match(space[1]?.note ?? "", /^persistent shell, reattached on this Mac, in \/projets\/brigade — session `brigade-brigade-1`/);
    assert.deepEqual(souvenirs.tel(), retenu);
    // Rouvrir l'espace ne les relance pas une seconde fois.
    apres.terminaux.espace(BRIGADE);
    assert.equal(apres.shells().length, 2);
    assert.equal(apres.terminaux.ouvrir(BRIGADE, WORKSTATION).titre, "shell 3");
  });

  test("seul le projet ouvert ramène ses shells : ceux d'un autre attendent son espace", () => {
    const souvenirs = enMemoire({ parade: { dernier: 1, shells: [{ rang: 1, session: "brigade-parade-1", cible: WORKSTATION }] } });
    const { terminaux, shells } = lancement(souvenirs);

    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre }) => genre), ["second"]);
    assert.deepEqual(shells(), []);
    terminaux.espace({ nom: "parade", dossier: "/projets/parade" });
    assert.deepEqual(shells().map(({ args }) => args), [["-c", scriptDeRattachement("brigade-parade-1")]]);
  });
});

describe("fermer un shell pour de bon", () => {
  test("il quitte l'espace, sa session est détruite sur sa machine, et il ne revient plus à la réouverture", async () => {
    const souvenirs = enMemoire();
    const detruites: Session[] = [];
    const { terminaux, shells, etats } = lancement(souvenirs, detruites);
    terminaux.espace(BRIGADE);
    const garde = terminaux.ouvrir(BRIGADE, WORKSTATION);
    const ferme = terminaux.ouvrir(BRIGADE, STATION);

    assert.deepEqual(await terminaux.fermerShell(ferme.id), { ferme: true });

    assert.deepEqual(detruites, [{ nom: "brigade-brigade-2", cible: STATION }]);
    assert.equal(shells()[1]?.tue, true);
    assert.deepEqual(etats.map(({ id, arrete }) => [id, arrete]), [[ferme.id, true]]);
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ id }) => id).slice(1), [garde.id]);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-1"]);

    terminaux.fermer();
    const apres = lancement(souvenirs);
    assert.deepEqual(apres.terminaux.espace(BRIGADE).map(({ titre }) => titre), ["Second", "shell 1"]);
    // Son rang n'est pas rendu : un shell neuf ne retrouve pas sa session.
    assert.equal(apres.terminaux.ouvrir(BRIGADE, STATION).titre, "shell 3 · parade-box");
  });

  test("une session qui n'a pas pu être détruite : le shell est fermé et oublié quand même, et la raison dit où elle reste", async () => {
    const souvenirs = enMemoire();
    const { terminaux } = lancement(souvenirs, [], { erreur: "$ ssh … parade-box …\nssh: connect to host parade-box port 22: Connection refused\n→ exit code 255" });
    terminaux.espace(BRIGADE);
    const shell = terminaux.ouvrir(BRIGADE, STATION);

    assert.deepEqual(await terminaux.fermerShell(shell.id), {
      refus: "shell 1 · parade-box is closed, but its session `brigade-brigade-1` could not be destroyed on main station parade-box: it is no longer listed, and stays there until it is destroyed — $ ssh … parade-box …\nssh: connect to host parade-box port 22: Connection refused\n→ exit code 255",
    });
    assert.deepEqual(souvenirs.tel().brigade?.shells, []);
  });

  test("le second ne se ferme pas ainsi, ni un shell qui n'est plus là", async () => {
    const { terminaux } = lancement(enMemoire());
    const [second] = terminaux.espace(BRIGADE);
    assert.deepEqual(await terminaux.fermerShell(second?.id ?? 0), { refus: "nothing was closed: this shell is no longer open" });
    assert.deepEqual(await terminaux.fermerShell(99), { refus: "nothing was closed: this shell is no longer open" });
  });

  test("un shell dont la session finit d'elle-même (le chef y a tapé `exit`) quitte l'espace et l'app l'oublie ; celui dont `ssh` a lâché reste là, et l'app s'en souvient", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs, [], { detruite: true }, { reseau: reseau(), horloge: horloge() });
    terminaux.espace(BRIGADE);
    terminaux.ouvrir(BRIGADE, WORKSTATION);
    terminaux.ouvrir(BRIGADE, STATION);
    terminaux.ouvrir(BRIGADE, STATION);

    shells()[0]?.surFin(0);
    shells()[1]?.surFin(0);
    shells()[2]?.surFin(255);

    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre, titre }) => [genre, titre]), [["second", "Second"], ["shell", "shell 3 · parade-box"]]);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-3"]);
  });
});

describe("une machine qui n'est pas joignable : le terminal le dit, et se reconnecte seul", () => {
  // Un shell sur la box, dont la connexion vient de lâcher : `ssh` sort en 255.
  function perdu() {
    const souvenirs = enMemoire();
    const net = reseau();
    const temps = horloge();
    const app = lancement(souvenirs, [], { detruite: true }, { reseau: net, horloge: temps });
    app.terminaux.espace(BRIGADE);
    const shell = app.terminaux.ouvrir(BRIGADE, STATION);
    const [premier] = app.shells();
    net.couper();
    premier?.surFin(255);
    const dernier = () => app.etats.filter(({ id }) => id === shell.id).at(-1);
    return { ...app, souvenirs, net, temps, shell, premier, dernier };
  }

  test("la connexion perdue, le shell reste dans l'espace et son terminal dit que la machine n'est pas joignable — sa session, retenue, n'est pas détruite", () => {
    const { terminaux, shell, sortie, dernier, souvenirs, temps, net } = perdu();

    assert.match(sortie(shell.id), /\[brigade\] main station parade-box is not reachable — session `brigade-brigade-1` stays there, and this shell reattaches to it by itself as soon as the machine answers \(a keypress tries now\)/);
    assert.deepEqual(
      terminaux.espace(BRIGADE).map(({ titre, arrete, bandeau }) => [titre, arrete, bandeau]),
      [["Second", false, undefined], ["shell 1 · parade-box", false, "main station parade-box · debian — not reachable"]],
    );
    assert.equal(dernier()?.arrete, false, "la vue ne ferme pas son onglet");
    assert.match(dernier()?.note ?? "", /^main station parade-box is not reachable — its session `brigade-brigade-1` stays there: this shell reattaches to it by itself/);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-1"]);
    // Rien n'est sondé tout de suite : la première reprise est prévue, au premier délai.
    assert.deepEqual(net.sondees, []);
    assert.deepEqual(temps.prevues.map(({ ms }) => ms), [REPRISES_MS[0]]);
  });

  test("tant que la machine ne répond pas, l'app la sonde, de plus en plus espacé, et la note dit ce que `ssh` en a dit ; elle répond : le shell se rattache à la même session, sans rien qu'on fasse", async () => {
    const { shell, shells, sortie, dernier, temps, net, premier, terminaux } = perdu();

    temps.sonner();
    await net.repondre();
    assert.deepEqual(net.sondees, [STATION]);
    assert.equal(shells().length, 1, "rien n'est relancé tant que la machine ne répond pas");
    assert.match(dernier()?.note ?? "", /^main station parade-box is not reachable \(attempt 1: ssh: connect to host parade-box port 22: Network is unreachable \(exit code 255\)\) — its session `brigade-brigade-1` stays there/);
    assert.deepEqual(temps.prevues.map(({ ms }) => ms), [REPRISES_MS[1]]);
    temps.sonner();
    await net.repondre();
    assert.deepEqual(temps.prevues.map(({ ms }) => ms), [REPRISES_MS[2]]);
    // Le message n'est écrit qu'une fois dans le terminal : les sondes, elles, ne s'y montrent pas.
    assert.equal(sortie(shell.id).match(/is not reachable/g)?.length, 1);

    net.retablir();
    temps.sonner();
    await net.repondre();

    const [, revenu] = shells();
    assert.deepEqual([revenu?.commande, revenu?.args], [premier?.commande, premier?.args], "la même commande : la même session");
    assert.match(sortie(shell.id), /\[brigade\] main station parade-box answers again — reattaching to session `brigade-brigade-1`/);
    assert.deepEqual(temps.prevues, []);
    assert.deepEqual(
      terminaux.espace(BRIGADE).map(({ id, bandeau }) => [id, bandeau]).slice(1),
      [[shell.id, "main station parade-box · debian"]],
      "le même onglet, son bandeau d'avant",
    );
    assert.match(dernier()?.note ?? "", /^persistent shell, reattached on main station parade-box/);

    // Ce qu'on y tape va de nouveau à la session.
    terminaux.ecrire(shell.id, "ls\r");
    assert.deepEqual(revenu?.ecrits, ["ls\r"]);
  });

  test("une touche dans un shell qui attend sa machine essaie tout de suite, sans la sonde — c'est `ssh`, dans le terminal, qui demande ce qu'il faut ; toujours injoignable, il le redit et attend de nouveau", () => {
    const { shell, shells, sortie, temps, net, terminaux } = perdu();

    terminaux.ecrire(shell.id, "x");

    assert.equal(shells().length, 2);
    assert.deepEqual(shells()[1]?.ecrits, [], "la touche ne part pas");
    assert.deepEqual(net.sondees, []);
    assert.deepEqual(temps.prevues, [], "la reprise prévue est annulée");
    assert.match(sortie(shell.id), /trying main station parade-box now — reattaching to session `brigade-brigade-1`/);

    shells()[1]?.surFin(255);
    assert.equal(sortie(shell.id).match(/is not reachable/g)?.length, 2);
    assert.deepEqual(temps.prevues.map(({ ms }) => ms), [REPRISES_MS[0]]);
  });

  test("le poste se réveille : chaque shell distant quitte sa connexion d'avant le sommeil et se rattache à sa session ; celui qui attendait sa machine la sonde sans attendre ; un shell de ce poste n'est pas touché", async () => {
    const souvenirs = enMemoire();
    const net = reseau();
    const temps = horloge();
    const { terminaux, shells, sortie } = lancement(souvenirs, [], { detruite: true }, { reseau: net, horloge: temps });
    terminaux.espace(BRIGADE);
    const ici = terminaux.ouvrir(BRIGADE, WORKSTATION);
    const box = terminaux.ouvrir(BRIGADE, STATION);
    const studio = terminaux.ouvrir(BRIGADE, STUDIO);
    net.couper();
    shells()[2]?.surFin(255);
    assert.equal(temps.prevues.length, 1);

    terminaux.reveiller();

    assert.equal(shells()[0]?.tue, false, "le shell de ce poste tourne toujours");
    assert.equal(shells()[1]?.tue, true, "la connexion d'avant le sommeil est quittée");
    assert.match(sortie(box.id), /\[brigade\] this Mac woke up — reattaching to session `brigade-brigade-2` on main station parade-box/);
    assert.deepEqual(net.sondees, [STATION, STUDIO], "sondées sans attendre");
    assert.deepEqual(temps.prevues, []);
    // La fin du pty quitté ne dit rien : le shell n'est ni oublié ni dit injoignable.
    shells()[1]?.surFin(129);
    assert.doesNotMatch(sortie(box.id), /not reachable/);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ rang }) => rang), [1, 2, 3]);

    net.retablir();
    await net.repondre();

    assert.equal(shells().length, 5);
    assert.deepEqual(shells().slice(3).map(({ args }) => args.at(-2)), ["parade-box", "studio"]);
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ id }) => id).slice(1), [ici.id, box.id, studio.id]);
  });

  test("réveillé sans réseau : le terminal dit alors que la machine n'est pas joignable, et la sonde suivante est prévue", async () => {
    const net = reseau();
    const temps = horloge();
    const { terminaux, sortie, etats } = lancement(enMemoire(), [], { detruite: true }, { reseau: net, horloge: temps });
    terminaux.espace(BRIGADE);
    const box = terminaux.ouvrir(BRIGADE, STATION);
    net.couper();

    terminaux.reveiller();
    await net.repondre();

    assert.match(sortie(box.id), /main station parade-box is not reachable — session `brigade-brigade-1` stays there/);
    assert.equal(etats.at(-1)?.bandeau, "main station parade-box · debian — not reachable");
    assert.deepEqual(temps.prevues.map(({ ms }) => ms), [REPRISES_MS[1]]);
  });

  test("fermé pour de bon, ou l'app fermée, un shell qui attendait sa machine ne la sonde plus — même une sonde déjà partie ne relance rien", async () => {
    const ferme = perdu();
    assert.deepEqual(await ferme.terminaux.fermerShell(ferme.shell.id), { ferme: true });
    assert.deepEqual(ferme.temps.prevues, []);

    const quitte = perdu();
    quitte.temps.sonner();
    quitte.net.retablir();
    quitte.terminaux.fermer();
    await quitte.net.repondre();
    assert.equal(quitte.shells().length, 1);
    assert.deepEqual(quitte.temps.prevues, []);
  });

  test("un shell de ce poste n'a pas de machine à attendre : un 255 y est une fin comme une autre", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs, [], { detruite: true }, { reseau: reseau(), horloge: horloge() });
    terminaux.espace(BRIGADE);
    terminaux.ouvrir(BRIGADE, WORKSTATION);
    shells()[0]?.surFin(255);
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre }) => genre), ["second"]);
    assert.deepEqual(souvenirs.tel().brigade?.shells, []);
  });
});

describe("le fichier des souvenirs", () => {
  const dossier = (t: TestContext) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-souvenirs-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    return racine;
  };

  test("ce qui y est écrit se relit tel quel, et le dossier est créé s'il manque", (t) => {
    const chemin = join(dossier(t), "brigade", "shells.json");
    const souvenirs = souvenirsDansFichier(chemin);
    const rappel: Rappel = { brigade: { dernier: 4, shells: [{ rang: 2, session: "brigade-brigade-2", cible: STATION }] } };

    assert.deepEqual(souvenirs.lire(), {});
    souvenirs.ecrire(rappel);
    assert.deepEqual(souvenirsDansFichier(chemin).lire(), rappel);
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: rappel });
  });

  test("un fichier abîmé ne bloque rien : il ne ramène aucun shell", (t) => {
    const chemin = join(dossier(t), "shells.json");
    writeFileSync(chemin, "{ pas du json");
    assert.deepEqual(souvenirsDansFichier(chemin).lire(), {});
  });

  test("une entrée d'une autre forme est oubliée — dont un hôte que `ssh` lirait comme une option, ou une session qui ne se porte pas dans un script", () => {
    const lu = rappelLu({
      projets: {
        brigade: {
          dernier: 1,
          shells: [
            { rang: 1, session: "brigade-brigade-1", cible: { lieu: "poste" } },
            { rang: 2, session: "brigade-brigade-2", cible: { lieu: "box", nom: "x", hote: "-oProxyCommand=sh" } },
            { rang: 3, session: "x'; reboot; '", cible: { lieu: "poste" } },
            { rang: 4, session: "brigade-brigade-4", cible: { lieu: "ailleurs" } },
            { rang: 1, session: "brigade-brigade-1b", cible: { lieu: "poste" } },
            { rang: 6, session: "brigade-brigade-6", cible: { lieu: "station", nom: "studio", hote: "studio" } },
          ],
        },
        vide: "rien",
      },
    });
    assert.deepEqual(lu, {
      // Le dernier rang n'est jamais en deçà d'un shell retenu.
      brigade: { dernier: 6, shells: [{ rang: 1, session: "brigade-brigade-1", cible: WORKSTATION }, { rang: 6, session: "brigade-brigade-6", cible: STUDIO }] },
      vide: { dernier: 0, shells: [] },
    });
  });
});

// --- Sur un vrai multiplexeur.

const multiplexeur = ["tmux", "screen"].find((outil) => {
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${outil}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const python = (() => {
  try {
    execFileSync("python3", ["-I", "-c", "import pty"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const SAUTE = multiplexeur === undefined ? "ni tmux ni screen sur ce poste" : !ptyDisponible && !python ? `ni node-pty livré compilé pour ${process.platform}-${process.arch}, ni python3` : false;
const AIDE_PTY = join(import.meta.dirname, "aides/pty.py");

// Attend un fait. Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function jusqua(condition: () => boolean, quoi: () => string): Promise<void> {
  const limite = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limite) throw new Error(`jamais arrivé — ${quoi()}`);
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }
}

const sansEchappements = (texte: string) => texte.replace(/\x1b\[[0-9;?>=]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMc]|\r/g, "");

// Un vrai terminal pour ce qu'un registre lance, dans l'environnement du test : node-pty là où il
// est livré, l'aide en Python ailleurs. Le second, lui, n'est pas lancé : un faux pty le tient.
function vraisPty(env: Record<string, string>, fins: Promise<void>[]) {
  return (lance: Lancement): Pty => {
    if (lance.commande === "faux-claude") return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    const ligne = ["/usr/bin/env", "-i", ...Object.entries(env).map(([cle, valeur]) => `${cle}=${valeur}`), lance.commande, ...lance.args];
    if (ptyDisponible) {
      let finir = () => {};
      fins.push(new Promise((resoudre) => (finir = resoudre)));
      return vraiPty({ ...lance, commande: ligne[0] ?? "", args: ligne.slice(1), surFin: (code) => (finir(), lance.surFin(code)) });
    }
    const enfant = spawn("python3", ["-I", AIDE_PTY, ...ligne], { cwd: lance.dossier, stdio: ["pipe", "pipe", "inherit"] });
    enfant.stdout.on("data", (donnees: Buffer) => lance.surSortie(donnees.toString("utf8")));
    fins.push(new Promise((resoudre) => enfant.on("exit", (code) => (resoudre(), lance.surFin(code ?? 0)))));
    return { ecrire: (donnees) => void enfant.stdin.write(donnees), redimensionner: () => {}, tuer: () => void enfant.kill() };
  };
}

describe(`fermer l'app, la rouvrir : sur ce poste${multiplexeur === undefined ? "" : `, par ${multiplexeur}`}`, { skip: SAUTE }, () => {
  test("le shell revient rattaché à sa session : la commande lancée avant la fermeture tourne toujours, et l'historique est là — fermé pour de bon, il ne revient plus et sa session n'existe plus", async (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-shells-")));
    const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: racine, SHELL: "/bin/sh", TERM: "xterm-256color", TMUX_TMPDIR: racine, SCREENDIR: racine, LANG: "C" };
    // Un nom de projet à ce test : deux suites de front ne partagent pas une session.
    const projet = { nom: `essai-shells-${process.pid}`, dossier: racine };
    const souvenirs = souvenirsDansFichier(join(racine, "app", "shells.json"));
    const fins: Promise<void>[] = [];
    const ouvertes: Session[] = [];
    t.after(async () => {
      for (const session of ouvertes) await detruire(session, { env });
      await Promise.all(fins);
      rmSync(racine, { recursive: true, force: true });
    });

    const app = () => {
      let sortie = "";
      const terminaux = ouvrirTerminaux({
        claude: "faux-claude",
        shell: "/bin/sh",
        souvenirs,
        detruire: (session) => detruire(session, { env }),
        ouvrirPty: vraisPty(env, fins),
        surSortie: (_, donnees) => void (sortie += donnees),
        surEtat: () => {},
      });
      return { terminaux, sortie: () => sansEchappements(sortie) };
    };

    // Première ouverture : un shell sur ce poste, et une commande qui reste au premier plan —
    // `cat` ne rend ce qu'il reçoit que s'il tourne encore.
    const premiere = app();
    premiere.terminaux.espace(projet);
    const shell = premiere.terminaux.ouvrir(projet, WORKSTATION);
    const session: Session = { nom: `brigade-${projet.nom}-1`, cible: WORKSTATION };
    ouvertes.push(session);
    premiere.terminaux.ecrire(shell.id, "echo AVANT-$((6*7)); cat\r");
    await jusqua(() => premiere.sortie().includes("AVANT-42"), premiere.sortie);
    premiere.terminaux.ecrire(shell.id, "ligne-une\r");
    await jusqua(() => (premiere.sortie().match(/ligne-une/g) ?? []).length >= 2, premiere.sortie);
    premiere.terminaux.fermer();
    await Promise.all(fins);

    // Rouverte : le shell revient de lui-même avec l'espace, et montre ce que la session avait affiché.
    const seconde = app();
    const [, revenu] = seconde.terminaux.espace(projet);
    assert.equal(revenu?.titre, "shell 1");
    await jusqua(() => seconde.sortie().includes("AVANT-42") && seconde.sortie().includes("ligne-une"), seconde.sortie);
    // `cat` est toujours là : il rend ce qui lui est tapé.
    seconde.terminaux.ecrire(revenu?.id ?? 0, "apres-retour\r");
    await jusqua(() => (seconde.sortie().match(/apres-retour/g) ?? []).length >= 2, seconde.sortie);

    // Fermé pour de bon : sa session est détruite, et la réouverture suivante ne le ramène pas.
    assert.deepEqual(await seconde.terminaux.fermerShell(revenu?.id ?? 0), { ferme: true });
    seconde.terminaux.fermer();
    await Promise.all(fins);
    const existe = () => {
      try {
        execFileSync("/bin/sh", ["-c", `tmux has-session -t =${session.nom} 2>/dev/null || screen -ls 2>/dev/null | grep -q "[.]${session.nom}[[:space:]]"`], { env, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    // `screen -X quit` rend la main avant que la session ait fini de partir : on attend qu'elle soit partie.
    await jusqua(() => !existe(), () => `la session ${session.nom} existe encore sur ce poste`);
    const troisieme = app();
    assert.deepEqual(troisieme.terminaux.espace(projet).map(({ genre }) => genre), ["second"]);
  });
});

describe(`une machine qui n'est plus joignable, puis qui revient : par un faux ssh${multiplexeur === undefined ? "" : `, sur ${multiplexeur}`}`, { skip: SAUTE }, () => {
  test("le réseau coupé, le terminal dit que la machine n'est pas joignable ; rétabli, il se rattache seul à sa session, la commande en cours toujours en cours — et de même au réveil du poste", async (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-coupure-")));
    const coupure = join(racine, "reseau-coupe");
    const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: racine, SHELL: "/bin/sh", TERM: "xterm-256color", TMUX_TMPDIR: racine, SCREENDIR: racine, LANG: "C", BRIGADE_COUPURE: coupure };
    const ssh = join(import.meta.dirname, "aides/faux-ssh.sh");
    const projet = { nom: `essai-coupure-${process.pid}`, dossier: racine };
    // La « box » est jointe par le faux ssh : sa session vit sur ce poste, dans le répertoire du test.
    const box: Cible = { lieu: "box", nom: "fausse-box", hote: "fausse-box" };
    const session: Session = { nom: `brigade-${projet.nom}-1`, cible: box };
    const fins: Promise<void>[] = [];
    const temps = horloge();
    let sortie = "";
    const terminaux = ouvrirTerminaux({
      claude: "faux-claude",
      shell: "/bin/sh",
      ssh,
      compte: () => "chef",
      joindre: (cible) => joindre(cible, { ssh, env }),
      plusTard: temps.plusTard,
      detruire: (vise) => detruire(vise, { ssh, env }),
      ouvrirPty: vraisPty(env, fins),
      surSortie: (_, donnees) => void (sortie += donnees),
      surEtat: () => {},
    });
    t.after(async () => {
      terminaux.fermer();
      rmSync(coupure, { force: true });
      await detruire(session, { ssh, env });
      await Promise.all(fins);
      rmSync(racine, { recursive: true, force: true });
    });
    const lu = () => sansEchappements(sortie);
    // Ce que le terminal a affiché depuis le dernier message de l'app qui contient `marque`.
    const depuis = (marque: string) => lu().slice(lu().lastIndexOf(marque));
    const fois = (texte: string) => lu().split(texte).length - 1;

    terminaux.espace(projet);
    const shell = terminaux.ouvrir(projet, box);
    // Une commande qui reste au premier plan : `cat` ne rend ce qu'il reçoit que s'il tourne encore.
    terminaux.ecrire(shell.id, "echo AVANT-$((6*7)); cat\r");
    await jusqua(() => lu().includes("AVANT-42"), lu);
    terminaux.ecrire(shell.id, "ligne-une\r");
    await jusqua(() => fois("ligne-une") >= 2, lu);

    // Le réseau coupé : la connexion lâche, le terminal le dit, et une reprise est prévue.
    writeFileSync(coupure, "");
    await jusqua(() => lu().includes("main station fausse-box is not reachable") && temps.prevues.length === 1, lu);
    // La première sonde, réseau toujours coupé : rien ne revient, la suivante est prévue.
    temps.sonner();
    await jusqua(() => temps.prevues.length === 1, () => `reprises prévues : ${temps.prevues.length}`);
    assert.equal(fois("answers again"), 0);

    // Le réseau rétabli : la sonde suivante le trouve, et le shell se rattache seul.
    rmSync(coupure);
    temps.sonner();
    await jusqua(() => depuis("answers again").includes("AVANT-42") && depuis("answers again").includes("ligne-une"), lu);
    terminaux.ecrire(shell.id, "apres-retour\r");
    await jusqua(() => fois("apres-retour") >= 2, lu);

    // Le poste se réveille : le shell quitte sa connexion et se rattache, la commande toujours là.
    terminaux.reveiller();
    await jusqua(() => depuis("woke up").includes("apres-retour"), lu);
    terminaux.ecrire(shell.id, "apres-reveil\r");
    await jusqua(() => fois("apres-reveil") >= 2, lu);
    assert.deepEqual(temps.prevues, []);
  });
});

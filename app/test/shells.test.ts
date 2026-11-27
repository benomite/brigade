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
import { detruire, scriptDeRattachement, type Cible, type Session } from "../src/persistance.ts";
import { ouvrirPty as vraiPty, ptyDisponible } from "../src/pty.ts";
import { rappelLu, souvenirsDansFichier, type Rappel, type Souvenirs } from "../src/souvenirs.ts";
import { ouvrirTerminaux, type Lancement, type Pty, type Terminal } from "../src/terminaux.ts";
import { ICI } from "../src/plateforme.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const POSTE: Cible = { lieu: "poste" };

type FauxPty = Lancement & { ecrits: string[]; tue: boolean };

function enMemoire(depart: Rappel = {}): Souvenirs & { tel(): Rappel } {
  let rappel = structuredClone(depart);
  return { lire: () => structuredClone(rappel), ecrire: (neuf) => void (rappel = structuredClone(neuf)), tel: () => rappel };
}

// Un registre comme l'app en ouvre un à chaque lancement : ses pty sont faux, ses souvenirs ceux qu'on lui donne.
function lancement(souvenirs: Souvenirs, detruites: Session[] = [], rendu: { detruite: true } | { erreur: string } = { detruite: true }, reglages: { windows?: boolean } = {}) {
  const lances: FauxPty[] = [];
  const etats: Terminal[] = [];
  const sorties = new Map<number, string>();
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    souvenirs,
    compte: () => "benoit",
    detruire: (session) => (detruites.push(session), Promise.resolve(rendu)),
    // Ce que main.ts donne sous Windows (plateforme.ts) : le `bash` de Git, et aucune session sur ce poste.
    ...(reglages.windows === true ? { shell: "C:\\Program Files\\Git\\bin\\bash.exe", argsDuShell: ["--login", "-i"], persistantIci: false } : {}),
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
  test("sur ce poste, `sh` crée la session du shell ou s'y rattache — et l'app retient chaque shell", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs);
    terminaux.espace(BRIGADE);

    const premier = terminaux.ouvrir(BRIGADE, POSTE);
    const second = terminaux.ouvrir(BRIGADE, POSTE);

    assert.deepEqual(
      shells().map(({ commande, args, dossier }) => [commande, args, dossier]),
      [
        ["/bin/sh", ["-c", scriptDeRattachement("brigade-brigade-1")], "/projets/brigade"],
        ["/bin/sh", ["-c", scriptDeRattachement("brigade-brigade-2")], "/projets/brigade"],
      ],
    );
    assert.deepEqual([premier.titre, second.titre], ["shell 1", "shell 2"]);
    assert.equal(premier.note, `persistent shell on ${ICI}, in /projets/brigade — session \`brigade-brigade-1\`: closing the app only detaches from it, closing this shell destroys it`);
    assert.deepEqual(souvenirs.tel(), {
      brigade: {
        dernier: 2,
        shells: [
          { rang: 1, session: "brigade-brigade-1", cible: POSTE },
          { rang: 2, session: "brigade-brigade-2", cible: POSTE },
        ],
      },
    });
  });

  test("sous Windows, sans `tmux` ni `screen`, le shell de ce poste s'ouvre tel quel et finit avec son terminal : rien n'en est retenu, rien n'est à détruire", async () => {
    const souvenirs = enMemoire({ brigade: { dernier: 1, shells: [{ rang: 1, session: "brigade-brigade-1", cible: POSTE }] } });
    const detruites: Session[] = [];
    const { terminaux, shells } = lancement(souvenirs, detruites, { detruite: true }, { windows: true });
    // Un souvenir de ce poste ne se rattache à rien : il n'y a pas de session où revenir.
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre }) => genre), ["second"]);

    const ici = terminaux.ouvrir(BRIGADE, POSTE);

    assert.deepEqual(
      shells().map(({ commande, args, dossier }) => [commande, args, dossier]),
      [["C:\\Program Files\\Git\\bin\\bash.exe", ["--login", "-i"], "/projets/brigade"]],
    );
    assert.equal(ici.note, `shell on ${ICI}, in /projets/brigade — not persistent: neither tmux nor screen runs on Windows, this shell ends with its terminal`);
    // Le même bandeau que celui d'un shell persistant de ce poste : où l'on est, avec quel compte.
    assert.equal(ici.bandeau, `${ICI} · benoit`);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ cible }) => cible), [POSTE]);
    assert.deepEqual(await terminaux.fermerShell(ici.id), { ferme: true });
    assert.deepEqual(detruites, []);
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
    assert.equal(terminaux.ouvrir(BRIGADE, POSTE).titre, "shell 2");
  });
});

describe("fermer l'app, puis la rouvrir : les shells persistants reviennent", () => {
  test("rouvert, l'espace du projet ramène chaque shell, rattaché à sa session, sous le même titre — et un shell neuf prend le rang suivant", () => {
    const souvenirs = enMemoire();
    const avant = lancement(souvenirs);
    avant.terminaux.espace(BRIGADE);
    avant.terminaux.ouvrir(BRIGADE, POSTE);
    avant.terminaux.ouvrir(BRIGADE, POSTE);
    const commandes = avant.shells().map(({ commande, args }) => [commande, ...args]);

    // Fermer l'app tue ses terminaux — les clients des sessions, pas les sessions —, et n'oublie rien.
    avant.terminaux.fermer();
    assert.ok(avant.shells().every(({ tue }) => tue));
    const retenu = souvenirs.tel();

    const apres = lancement(souvenirs);
    assert.deepEqual(apres.lances, [], "rien n'est lancé avant que l'espace du projet ne s'ouvre");
    const espace = apres.terminaux.espace(BRIGADE);

    assert.deepEqual(espace.map(({ genre, titre }) => [genre, titre]), [["second", "Second"], ["shell", "shell 1"], ["shell", "shell 2"]]);
    assert.deepEqual(apres.shells().map(({ commande, args }) => [commande, ...args]), commandes);
    assert.match(espace[1]?.note ?? "", new RegExp(`^persistent shell, reattached on ${ICI}, in /projets/brigade — session \`brigade-brigade-1\``));
    assert.deepEqual(souvenirs.tel(), retenu);
    // Rouvrir l'espace ne les relance pas une seconde fois.
    apres.terminaux.espace(BRIGADE);
    assert.equal(apres.shells().length, 2);
    assert.equal(apres.terminaux.ouvrir(BRIGADE, POSTE).titre, "shell 3");
  });

  test("seul le projet ouvert ramène ses shells : ceux d'un autre attendent son espace", () => {
    const souvenirs = enMemoire({ parade: { dernier: 1, shells: [{ rang: 1, session: "brigade-parade-1", cible: POSTE }] } });
    const { terminaux, shells } = lancement(souvenirs);

    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre }) => genre), ["second"]);
    assert.deepEqual(shells(), []);
    terminaux.espace({ nom: "parade", dossier: "/projets/parade" });
    assert.deepEqual(shells().map(({ args }) => args), [["-c", scriptDeRattachement("brigade-parade-1")]]);
  });
});

describe("fermer un shell pour de bon", () => {
  test("il quitte l'espace, sa session est détruite, et il ne revient plus à la réouverture", async () => {
    const souvenirs = enMemoire();
    const detruites: Session[] = [];
    const { terminaux, shells, etats } = lancement(souvenirs, detruites);
    terminaux.espace(BRIGADE);
    const garde = terminaux.ouvrir(BRIGADE, POSTE);
    const ferme = terminaux.ouvrir(BRIGADE, POSTE);

    assert.deepEqual(await terminaux.fermerShell(ferme.id), { ferme: true });

    assert.deepEqual(detruites, [{ nom: "brigade-brigade-2", cible: POSTE }]);
    assert.equal(shells()[1]?.tue, true);
    assert.deepEqual(etats.map(({ id, arrete }) => [id, arrete]), [[ferme.id, true]]);
    assert.deepEqual(terminaux.espace(BRIGADE).map(({ id }) => id).slice(1), [garde.id]);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-1"]);

    terminaux.fermer();
    const apres = lancement(souvenirs);
    assert.deepEqual(apres.terminaux.espace(BRIGADE).map(({ titre }) => titre), ["Second", "shell 1"]);
    // Son rang n'est pas rendu : un shell neuf ne retrouve pas sa session.
    assert.equal(apres.terminaux.ouvrir(BRIGADE, POSTE).titre, "shell 3");
  });

  test("une session qui n'a pas pu être détruite : le shell est fermé et oublié quand même, et la raison dit où elle reste", async () => {
    const souvenirs = enMemoire();
    const { terminaux } = lancement(souvenirs, [], { erreur: "$ tmux kill-session …\n→ exit code 1" });
    terminaux.espace(BRIGADE);
    const shell = terminaux.ouvrir(BRIGADE, POSTE);

    assert.deepEqual(await terminaux.fermerShell(shell.id), {
      refus: `shell 1 is closed, but its session \`brigade-brigade-1\` could not be destroyed on ${ICI}: it is no longer listed, and stays there until it is destroyed — $ tmux kill-session …\n→ exit code 1`,
    });
    assert.deepEqual(souvenirs.tel().brigade?.shells, []);
  });

  test("le second ne se ferme pas ainsi, ni un shell qui n'est plus là", async () => {
    const { terminaux } = lancement(enMemoire());
    const [second] = terminaux.espace(BRIGADE);
    assert.deepEqual(await terminaux.fermerShell(second?.id ?? 0), { refus: "nothing was closed: this shell is no longer open" });
    assert.deepEqual(await terminaux.fermerShell(99), { refus: "nothing was closed: this shell is no longer open" });
  });

  test("un shell dont la session finit d'elle-même (le chef y a tapé `exit`) quitte l'espace et l'app l'oublie, quel que soit son code de sortie", () => {
    const souvenirs = enMemoire();
    const { terminaux, shells } = lancement(souvenirs, [], { detruite: true });
    terminaux.espace(BRIGADE);
    terminaux.ouvrir(BRIGADE, POSTE);
    terminaux.ouvrir(BRIGADE, POSTE);
    terminaux.ouvrir(BRIGADE, POSTE);

    shells()[0]?.surFin(0);
    shells()[1]?.surFin(255);

    assert.deepEqual(terminaux.espace(BRIGADE).map(({ genre, titre }) => [genre, titre]), [["second", "Second"], ["shell", "shell 3"]]);
    assert.deepEqual(souvenirs.tel().brigade?.shells.map(({ session }) => session), ["brigade-brigade-3"]);
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
    const rappel: Rappel = { brigade: { dernier: 4, shells: [{ rang: 2, session: "brigade-brigade-2", cible: POSTE }] } };

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

  test("une entrée d'une autre forme est oubliée — dont un shell d'une autre machine, ou une session qui ne se porte pas dans un script", () => {
    const lu = rappelLu({
      projets: {
        brigade: {
          dernier: 1,
          shells: [
            { rang: 1, session: "brigade-brigade-1", cible: { lieu: "poste" } },
            { rang: 2, session: "brigade-brigade-2", cible: { lieu: "box", nom: "x" } },
            { rang: 3, session: "x'; reboot; '", cible: { lieu: "poste" } },
            { rang: 4, session: "brigade-brigade-4", cible: { lieu: "ailleurs" } },
            { rang: 1, session: "brigade-brigade-1b", cible: { lieu: "poste" } },
            { rang: 6, session: "brigade-brigade-6", cible: { lieu: "poste" } },
          ],
        },
        vide: "rien",
      },
    });
    assert.deepEqual(lu, {
      // Le dernier rang n'est jamais en deçà d'un shell retenu.
      brigade: { dernier: 6, shells: [{ rang: 1, session: "brigade-brigade-1", cible: POSTE }, { rang: 6, session: "brigade-brigade-6", cible: POSTE }] },
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
    const shell = premiere.terminaux.ouvrir(projet, POSTE);
    const session: Session = { nom: `brigade-${projet.nom}-1`, cible: POSTE };
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

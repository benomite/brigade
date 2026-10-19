// L'étape de connexion Max d'une station serveur, telle que la commande
// d'installation du guide la joue (`paquet/installer-station.sh`), et telle
// qu'elle se rejoue pour refaire le jeton (docs/installation-station.md) :
//
//   sudo /usr/lib/brigade-station/node/bin/node /usr/lib/brigade-station/runtime/src/connexion-max/connecter-cli.ts
//
// En root, elle lance `claude` sous le compte de la station (`runuser`), et le
// pose dans le PATH du service s'il n'y est pas — le binaire officiel, par
// l'installeur d'Anthropic. Elle y fait `claude setup-token`, une fois, et
// range le jeton dans /etc/brigade/claude-token (600, au compte de la
// station), la date de sa création à côté (claude-token.cree, sans le
// jeton), et de quoi dire à l'unité où il est : la station redémarre, et le
// lit. L'interface de `claude setup-token` (le lien, le champ du code)
// s'affiche, le jeton lui-même jamais. Sous le compte de la station, elle fait
// la même chose, sauf poser `claude` et l'unité — ce qui demande root.
//
// Codes de sortie :
//   0  jeton rangé (ou déjà rangé)
//   1  connexion non faite, dite en une ligne
//   2  refus : ni root ni le compte de la station, ou un argument
import { spawn } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { PATH_DE_SYSTEMD } from "../installateur.ts";
import { COMPTE } from "./connection.ts";
import { connecterMax, ConnectionNotMade, MasqueDuJeton, type Lancement, type ModeDeLancement } from "./connecter.ts";
import { FICHIER_DU_JETON, fichierDeCreation } from "../jeton-claude.ts";

const REUSSI = 0;
const ECHEC = 1;
const REFUS = 2;

export type Machine = {
  compte: string;
  // Le fichier du jeton : hors de l'état et du clone, que la cloison masque.
  jeton: string;
  // La date de création du jeton, à côté — jamais le jeton.
  creation: string;
  // Ce que l'unité de la station lit (`EnvironmentFile`) pour savoir où est le jeton.
  environnement: string;
  // Relance la station, pour qu'elle lise le jeton ; null sans systemd.
  redemarrer: () => Promise<Lancement>;
  // Le PATH des unités de la station : celui où elles trouvent `claude`.
  path: string;
  // Là où l'étape relie `claude` quand il n'est pas dans ce PATH.
  lien: string;
  // L'installeur officiel de `claude`, joué sous le compte.
  installeur: string;
  // Le répertoire du compte, ou null s'il n'existe pas.
  home: (compte: string) => Promise<string | null>;
  root: () => boolean;
  utilisateur: () => string;
  // Montre au chef l'interface de `claude setup-token` (jeton déjà masqué).
  afficher: (texte: string) => void;
  // Au bout de combien de ms sans un mot de `setup-token` l'étape renonce.
  delaiMuet: number;
};

export const SERVER: Machine = {
  compte: COMPTE,
  jeton: "/etc/brigade/claude-token",
  creation: fichierDeCreation("/etc/brigade/claude-token"),
  environnement: "/etc/brigade/jeton.env",
  redemarrer: () => executer("systemctl", ["restart", "brigade-station.service"], { PATH: PATH_DE_SYSTEMD }, false),
  path: PATH_DE_SYSTEMD,
  lien: "/usr/local/bin/claude",
  installeur: "curl -fsSL https://claude.ai/install.sh | bash",
  home: async (compte) => {
    const { code, sortie } = await executer("getent", ["passwd", compte], {}, false);
    return code === 0 ? (sortie.trim().split(":")[5] ?? null) || null : null;
  },
  root: () => process.getuid?.() === 0,
  utilisateur: () => userInfo().username,
  afficher: (texte) => void process.stdout.write(texte),
  delaiMuet: 3 * 60_000,
};

type Montrer = { afficher: (texte: string) => void; delaiMuet: number };

// Lance une commande ; ENOENT se rend comme le ferait un shell : 127.
function executer(commande: string, args: string[], env: Record<string, string>, mode: ModeDeLancement | boolean, montrer?: Montrer): Promise<Lancement> {
  return new Promise((resoudre) => {
    const heritee = mode === true || mode === "herite";
    // `affiche` : l'entrée est au chef ; les sorties — où `claude setup-token`
    // dessine son interface et imprime le jeton — sont lues, et remontrées.
    const enfant = spawn(commande, args, { env, stdio: heritee ? "inherit" : mode === "affiche" ? ["inherit", "pipe", "pipe"] : ["ignore", "pipe", "pipe"] });
    let sortie = "";
    let muet = false;
    const masque = mode === "affiche" && montrer ? new MasqueDuJeton() : null;
    const minuteur = masque && montrer ? setTimeout(() => ((muet = true), enfant.kill("SIGTERM")), montrer.delaiMuet) : null;
    const lire = (bloc: Buffer) => {
      if (minuteur) clearTimeout(minuteur);
      const texte = bloc.toString();
      sortie += texte;
      const visible = masque?.passer(texte);
      if (visible) montrer?.afficher(visible);
    };
    enfant.stdout?.on("data", lire);
    enfant.stderr?.on("data", lire);
    enfant.on("error", (erreur: NodeJS.ErrnoException) => {
      if (minuteur) clearTimeout(minuteur);
      resoudre({ code: erreur.code === "ENOENT" ? 127 : 126, sortie: `${sortie}${erreur.message}` });
    });
    enfant.on("close", (code) => {
      if (minuteur) clearTimeout(minuteur);
      const reste = masque?.fin();
      if (reste) montrer?.afficher(reste);
      resoudre(muet ? { code, sortie, muet } : { code, sortie });
    });
  });
}

// Le premier exécutable de ce nom dans le PATH donné.
function dansLePath(nom: string, path: string): string | null {
  for (const repertoire of path.split(delimiter)) {
    const chemin = join(repertoire, nom);
    try {
      accessSync(chemin, constants.X_OK);
      return chemin;
    } catch {}
  }
  return null;
}

export async function principal({ args, dire, redire }: Appel, machine: Machine = SERVER): Promise<void> {
  const refuser = (motif: string): never => {
    redire(`brigade : connexion Max refusée — ${motif}`);
    throw new Sortie(REFUS);
  };
  if (args.length > 0) refuser(`argument inconnu « ${args[0]} » — l'étape n'en prend aucun`);
  const root = machine.root();
  if (!root && machine.utilisateur() !== machine.compte) refuser(`elle se fait en root (sudo), ou sous le compte ${machine.compte} : c'est lui qui porte la connexion Max de la station`);
  const home = (await machine.home(machine.compte)) ?? refuser(`le compte ${machine.compte} n'existe pas — la station est-elle installée ?`);

  // Ni jeton ni clé dans cet environnement : `claude setup-token` crée le jeton.
  const env = { HOME: home, PATH: machine.path, LANG: "C.UTF-8" };
  // Sous le compte de la station, quel que soit qui lance l'étape.
  const lancer = (commande: string, arguments_: string[], mode: ModeDeLancement) =>
    root
      ? executer("runuser", ["-u", machine.compte, "--", "env", "-i", ...Object.entries(env).map(([nom, valeur]) => `${nom}=${valeur}`), commande, ...arguments_], { PATH: PATH_DE_SYSTEMD }, mode, machine)
      : executer(commande, arguments_, env, mode, machine);

  // Le jeton et sa date, 600 et 644, au compte de la station ; puis l'unité
  // sait où il est, et la station le lit.
  const ranger = async (jeton: string, creation: string) => {
    try {
      mkdirSync(dirname(machine.jeton), { recursive: true, mode: 0o750 });
      const poser = (fichier: string, contenu: string, mode: number) => {
        writeFileSync(fichier, contenu, { mode });
        chmodSync(fichier, mode);
      };
      poser(machine.jeton, `${jeton}\n`, 0o600);
      poser(machine.creation, `${creation}\n`, 0o644);
      poser(machine.environnement, `${FICHIER_DU_JETON}=${machine.jeton}\n`, 0o644);
      if (root) {
        const chown = await executer("chown", [`${machine.compte}:`, dirname(machine.jeton), machine.jeton, machine.creation], { PATH: PATH_DE_SYSTEMD }, false);
        if (chown.code !== 0) throw new Error(`chown a rendu ${chown.code ?? "un signal"} — ${derniereLigne(chown.sortie)}`);
        const relance = await machine.redemarrer();
        if (relance.code !== 0) throw new Error(`la station ne redémarre pas (code ${relance.code ?? "signal"}) — ${derniereLigne(relance.sortie)}`);
      }
    } catch (erreur) {
      // Le message ne cite jamais le jeton : il vient du système de fichiers.
      throw new ConnectionNotMade(`le jeton ne se range pas dans ${machine.jeton} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  const jetonRange = () => statSync(machine.jeton, { throwIfNoEntry: false })?.size;

  try {
    // `claude`, là où les unités de la station le trouvent.
    if (dansLePath("claude", machine.path) === null) {
      const local = join(home, ".local/bin/claude");
      if (!root) throw new ConnectionNotMade(`\`claude\` n'est pas dans le PATH des unités de la station (${machine.path}) : en root, l'étape l'y pose`);
      if (!existsSync(local)) {
        dire(`installation de \`claude\` sous le compte ${machine.compte}, par l'installeur officiel`);
        const installe = await lancer("bash", ["-c", machine.installeur], "herite");
        if (installe.code !== 0 || !existsSync(local)) throw new ConnectionNotMade(`l'installeur de \`claude\` a échoué (code ${installe.code ?? "signal"}) — sa sortie est au-dessus`);
      }
      try {
        // Un lien mort à sa place — un `claude` désinstallé — se remplace.
        if (lstatSync(machine.lien, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(machine.lien);
        symlinkSync(local, machine.lien);
      } catch (erreur) {
        throw new ConnectionNotMade(`\`claude\` ne se relie pas dans ${machine.lien} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      dire(`\`claude\` relié dans le PATH des unités : ${machine.lien} → ${local}`);
    }

    await connecterMax({ lancer, claude: "claude", jetonRange: () => Boolean(jetonRange()), ranger, dire });
    throw new Sortie(REUSSI);
  } catch (erreur) {
    if (!(erreur instanceof ConnectionNotMade)) throw erreur;
    redire(`brigade : connexion Max non faite — ${erreur.message}`);
    throw new Sortie(ECHEC);
  }
}

const derniereLigne = (sortie: string) => sortie.trim().split("\n").findLast((ligne) => ligne.trim() !== "")?.trim() ?? "";

if (import.meta.main) await enProcess((appel) => principal(appel));

// L'étape de connexion Max d'une station serveur, telle que la commande
// d'installation du guide la joue (`paquet/installer-station.sh`), et telle
// qu'elle se rejoue si la connexion se perd :
//
//   sudo /usr/lib/brigade-station/node/bin/node /usr/lib/brigade-station/runtime/src/connexion-max/connecter-cli.ts
//
// En root, elle lance tout sous le compte de la station (`runuser`), et pose
// `claude` dans le PATH du service s'il n'y est pas — le binaire officiel,
// par l'installeur d'Anthropic. Sous le compte de la station, elle fait la
// même chose, sauf poser `claude`.
//
// Codes de sortie :
//   0  connexion ouverte, et reconnue par la station
//   1  connexion non faite, dite en une ligne
//   2  refus : ni root ni le compte de la station, ou un argument
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { userInfo } from "node:os";
import { delimiter, join } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { PATH_DE_SYSTEMD } from "../installateur.ts";
import { COMPTE } from "./connexion.ts";
import { connecterMax, ConnexionNonFaite, type Lancement } from "./connecter.ts";
import { configVeille } from "./veille.ts";

const REUSSI = 0;
const ECHEC = 1;
const REFUS = 2;

export type Machine = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR` de son unité).
  station: string;
  compte: string;
  // Le renouvellement que le paquet porte.
  renouvellement: string;
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
};

// Le renouvellement : celui du paquet, sinon celui du dépôt — l'étape jouée
// depuis un clone.
const RENOUVELLEMENT = [join(import.meta.dirname, "../../../renouvellement"), join(import.meta.dirname, "../../deploy/brigade-renouvellement")].find((chemin) => existsSync(chemin)) ?? "/usr/lib/brigade-station/renouvellement";

export const SERVEUR: Machine = {
  station: "/var/lib/brigade",
  compte: COMPTE,
  renouvellement: RENOUVELLEMENT,
  path: PATH_DE_SYSTEMD,
  lien: "/usr/local/bin/claude",
  installeur: "curl -fsSL https://claude.ai/install.sh | bash",
  home: async (compte) => {
    const { code, sortie } = await executer("getent", ["passwd", compte], {}, false);
    return code === 0 ? (sortie.trim().split(":")[5] ?? null) || null : null;
  },
  root: () => process.getuid?.() === 0,
  utilisateur: () => userInfo().username,
};

// Lance une commande ; ENOENT se rend comme le ferait un shell : 127.
function executer(commande: string, args: string[], env: Record<string, string>, interactif: boolean): Promise<Lancement> {
  return new Promise((resoudre) => {
    const enfant = spawn(commande, args, { env, stdio: interactif ? "inherit" : ["ignore", "pipe", "pipe"] });
    let sortie = "";
    enfant.stdout?.on("data", (bloc: Buffer) => void (sortie += bloc.toString()));
    enfant.stderr?.on("data", (bloc: Buffer) => void (sortie += bloc.toString()));
    enfant.on("error", (erreur: NodeJS.ErrnoException) => resoudre({ code: erreur.code === "ENOENT" ? 127 : 126, sortie: `${sortie}${erreur.message}` }));
    enfant.on("close", (code) => resoudre({ code, sortie }));
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

export async function principal({ args, dire, redire }: Appel, machine: Machine = SERVEUR): Promise<void> {
  const refuser = (motif: string): never => {
    redire(`brigade : connexion Max refusée — ${motif}`);
    throw new Sortie(REFUS);
  };
  if (args.length > 0) refuser(`argument inconnu « ${args[0]} » — l'étape n'en prend aucun`);
  const root = machine.root();
  if (!root && machine.utilisateur() !== machine.compte) refuser(`elle se fait en root (sudo), ou sous le compte ${machine.compte} : c'est lui qui porte la connexion Max de la station`);
  const home = (await machine.home(machine.compte)) ?? refuser(`le compte ${machine.compte} n'existe pas — la station est-elle installée ?`);

  const { renouvellement, exposition } = configVeille({}, machine.station);
  const env = { HOME: home, PATH: machine.path, BRIGADE_SESSION_STATE: renouvellement, LANG: "C.UTF-8" };
  // Sous le compte de la station, quel que soit qui lance l'étape.
  const lancer = (commande: string, arguments_: string[], interactif: boolean) =>
    root
      ? executer("runuser", ["-u", machine.compte, "--", "env", "-i", ...Object.entries(env).map(([nom, valeur]) => `${nom}=${valeur}`), commande, ...arguments_], { PATH: PATH_DE_SYSTEMD }, interactif)
      : executer(commande, arguments_, env, interactif);

  try {
    // `claude`, là où les unités de la station le trouvent.
    if (dansLePath("claude", machine.path) === null) {
      const local = join(home, ".local/bin/claude");
      if (!root) throw new ConnexionNonFaite(`\`claude\` n'est pas dans le PATH des unités de la station (${machine.path}) : en root, l'étape l'y pose`);
      if (!existsSync(local)) {
        dire(`installation de \`claude\` sous le compte ${machine.compte}, par l'installeur officiel`);
        const installe = await lancer("bash", ["-c", machine.installeur], true);
        if (installe.code !== 0 || !existsSync(local)) throw new ConnexionNonFaite(`l'installeur de \`claude\` a échoué (code ${installe.code ?? "signal"}) — sa sortie est au-dessus`);
      }
      try {
        // Un lien mort à sa place — un `claude` désinstallé — se remplace.
        if (lstatSync(machine.lien, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(machine.lien);
        symlinkSync(local, machine.lien);
      } catch (erreur) {
        throw new ConnexionNonFaite(`\`claude\` ne se relie pas dans ${machine.lien} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
      dire(`\`claude\` relié dans le PATH des unités : ${machine.lien} → ${local}`);
    }
    const etat = await lancer("mkdir", ["-p", join(machine.station, ".session")], false);
    if (etat.code !== 0) throw new ConnexionNonFaite(`le répertoire du renouvellement ne se crée pas sous ${machine.station} — ${etat.sortie.trim()}`);

    await connecterMax({ lancer, claude: "claude", renouvellement: machine.renouvellement, exposition, dire });
    dire("connexion Max faite : la station la renouvelle seule ; si elle se perd, le seul geste est un login, et la cuisine reprend seule dans la minute");
    throw new Sortie(REUSSI);
  } catch (erreur) {
    if (!(erreur instanceof ConnexionNonFaite)) throw erreur;
    redire(`brigade : connexion Max non faite — ${erreur.message}`);
    throw new Sortie(ECHEC);
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));

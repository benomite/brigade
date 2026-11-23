// Les outils que l'app ne livre pas — `gh`, `git`, `claude` —, côté process principal (#4059, épique #4054). Le runtime
// lit la machine et choisit, pour chacun qui manque, le chemin qui l'installe sans rien qu'elle n'ait
// (runtime/src/outils-requis/) ; l'app relaie ce choix à la vue, et joue le geste « install » :
//   - une `commande` (le script de Claude Code, winget, l'installeur d'Apple) est lancée ici, sans terminal ; finie, elle
//     dit si l'outil est là, ou pourquoi elle n'a pas abouti — sa dernière ligne au survol ;
//   - un installeur à télécharger, ou une page, s'ouvre dans le navigateur : le chef l'ouvre, puis « I installed it ».
// Chaque lecture rattache au PATH de l'app un outil que son installeur vient de poser hors de lui (le `gh` de winget,
// dans `Program Files`) : l'app le trouve sans redémarrer, et tout ce qu'elle lance ensuite aussi.
import { spawn } from "node:child_process";

type Requis = typeof import("../../runtime/src/outils-requis/outils-requis.ts");
type DeLaMachine = typeof import("../../runtime/src/outils-requis/machine.ts");
type Outils = typeof import("../../runtime/src/second/outils.ts");
export type OutilRequis = import("../../runtime/src/outils-requis/outils-requis.ts").OutilRequis;
export type OutilManquant = import("../../runtime/src/outils-requis/machine.ts").OutilManquant;
// `installe` : la commande finie, l'outil doit être là — la vue le relit aussitôt.
export type RenduDInstallation = { fait: string; installe?: boolean } | { refus: string; detail?: string };

export type Runtime = Pick<Requis, "choisirInstallation" | "NOMS" | "OUTILS_REQUIS"> & Pick<DeLaMachine, "lireLaMachine" | "outilsManquants"> & Pick<Outils, "programmesDe">;

export type OptionsDesOutilsRequis = {
  charger: () => Promise<Runtime>;
  // L'environnement de l'app : son PATH est complété des dossiers que les installeurs ont posés hors de lui.
  env: Record<string, string | undefined>;
  // Ouvre une page dans le navigateur du chef.
  ouvrir: (url: string) => Promise<unknown>;
  lancer?: typeof spawn;
  // Le temps laissé à une installation : au-delà, elle est arrêtée.
  delaiMs?: number;
};

const DELAI_MS = 15 * 60_000;
const DETAIL_MAX = 2_000;

const derniereLigne = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0)
    .at(-1) ?? "";

const REQUIS: readonly unknown[] = ["git", "gh", "claude"];
const estRequis = (outil: unknown): outil is OutilRequis => REQUIS.includes(outil);

export function tenirOutilsRequis(options: OptionsDesOutilsRequis) {
  const lancer = options.lancer ?? spawn;
  const enCours = new Map<OutilRequis, Promise<RenduDInstallation>>();

  async function lire() {
    const runtime = await options.charger();
    const lue = () => runtime.lireLaMachine({ env: options.env, programmes: runtime.programmesDe(options.env) });
    const machine = lue();
    const dossiers = Object.values(machine.horsDuPath);
    if (dossiers.length === 0) return { runtime, machine };
    // Sous Windows, le PATH se nomme souvent `Path` : c'est lui qui est complété.
    const cle = Object.keys(options.env).find((nom) => nom.toUpperCase() === "PATH") ?? "PATH";
    options.env[cle] = [...dossiers, options.env[cle] ?? ""].filter((dossier) => dossier !== "").join(machine.plateforme === "win32" ? ";" : ":");
    return { runtime, machine: lue() };
  }

  function jouer(argv: string[], nom: string, installeEnFinissant: boolean): Promise<RenduDInstallation> {
    const [programme = "", ...args] = argv;
    return new Promise((rendre) => {
      let sortie = "";
      // Une erreur peut être suivie de la fermeture : la première fin est la bonne, la promesse ignore la seconde.
      const finir = (fin: RenduDInstallation) => {
        clearTimeout(garde);
        rendre(fin);
      };
      const enfant = lancer(programme, args, { env: options.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const garde = setTimeout(() => enfant.kill(), options.delaiMs ?? DELAI_MS);
      for (const flux of [enfant.stdout, enfant.stderr]) flux?.on("data", (morceau: Buffer) => void (sortie = `${sortie}${morceau.toString()}`.slice(-16_384)));
      enfant.once("error", (erreur) => finir({ refus: `the install of ${nom} could not start: ${erreur.message}`, detail: erreur.message }));
      enfant.once("close", (code, signal) => {
        const detail = sortie.trim().slice(-DETAIL_MAX);
        const dit = derniereLigne(sortie).replace(/[.\s]+$/, "");
        if (code !== 0) return finir({ refus: `the install of ${nom} did not finish (${signal ?? `code ${code}`})${dit === "" ? "" : `: ${dit}`}`, ...(detail === "" ? {} : { detail }) });
        finir(installeEnFinissant ? { fait: `${nom} is installed`, installe: true } : { fait: "the installer is open: follow it, then click “I installed it”" });
      });
    });
  }

  async function installer(outil: OutilRequis): Promise<RenduDInstallation> {
    const { runtime, machine } = await lire();
    const nom = runtime.NOMS[outil];
    if (machine.presents.includes(outil)) return { fait: `${nom} is already on this computer`, installe: true };
    const { commande, lien } = runtime.choisirInstallation(outil, machine);
    if (commande) return jouer(commande.argv, nom, commande.installeEnFinissant);
    try {
      await options.ouvrir(lien);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      return { refus: `the page of ${nom} did not open in your browser: ${lien}`, detail };
    }
    return { fait: "its download page is open in your browser: install it from there, then click “I installed it”" };
  }

  return {
    // Ceux de `outils` qui manquent — les trois, sans liste —, chacun avec son chemin.
    async manquants(outils?: unknown): Promise<OutilManquant[]> {
      const { runtime, machine } = await lire();
      const voulus = Array.isArray(outils) ? runtime.OUTILS_REQUIS.filter((outil) => outils.includes(outil)) : runtime.OUTILS_REQUIS;
      return runtime.outilsManquants(machine, voulus);
    },
    // Une installation à la fois par outil : un second clic attend la même.
    installer(outil: unknown): Promise<RenduDInstallation> {
      if (!estRequis(outil)) return Promise.resolve({ refus: "this is not a tool brigade installs" });
      const deja = enCours.get(outil);
      if (deja) return deja;
      const lance = installer(outil)
        .catch((erreur: unknown) => ({ refus: "the install could not start: the app failed while preparing it", detail: erreur instanceof Error ? erreur.message : String(erreur) }))
        .finally(() => enCours.delete(outil));
      enCours.set(outil, lance);
      return lance;
    },
  };
}

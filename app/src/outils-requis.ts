// Les outils que l'app ne livre pas — `gh`, `git`, `claude` —, côté process principal (#4059, épique #4054). Le runtime
// lit la machine et dit, pour chacun qui manque, la page d'installation officielle (runtime/src/outils-requis/) ; l'app
// relaie ce choix à la vue. L'app n'installe jamais Git (#4266) ; `gh` et `claude`, elle les installe au clic du chef
// (#4350, install-tools/), sinon le chef les installe et revient dire « I installed it ». Chaque lecture rattache au
// PATH de l'app un outil que son installeur vient de poser hors de lui (le `gh` de winget, dans `Program Files`) :
// l'app le trouve sans redémarrer, et tout ce qu'elle lance ensuite aussi.

type Requis = typeof import("../../runtime/src/outils-requis/outils-requis.ts");
type DeLaMachine = typeof import("../../runtime/src/outils-requis/machine.ts");
type Outils = typeof import("../../runtime/src/second/outils.ts");
export type OutilRequis = import("../../runtime/src/outils-requis/outils-requis.ts").OutilRequis;
export type OutilManquant = import("../../runtime/src/outils-requis/machine.ts").OutilManquant;

export type Runtime = Pick<Requis, "OUTILS_REQUIS"> & Pick<DeLaMachine, "lireLaMachine" | "outilsManquants"> & Pick<Outils, "programmesDe">;

export type OptionsDesOutilsRequis = {
  charger: () => Promise<Runtime>;
  // L'environnement de l'app : son PATH est complété des dossiers que les installeurs ont posés hors de lui.
  env: Record<string, string | undefined>;
  // Appelée avec la page d'installation de chaque outil qui manque : l'app n'ouvre que les pages qu'elle a elle-même montrées.
  autoriserLaPage: (lien: string) => void;
};

export function tenirOutilsRequis(options: OptionsDesOutilsRequis) {
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

  return {
    // Ceux de `outils` qui manquent — les trois, sans liste —, chacun avec sa page d'installation.
    async manquants(outils?: unknown): Promise<OutilManquant[]> {
      const { runtime, machine } = await lire();
      const voulus = Array.isArray(outils) ? runtime.OUTILS_REQUIS.filter((outil) => outils.includes(outil)) : runtime.OUTILS_REQUIS;
      const manquants = runtime.outilsManquants(machine, voulus);
      for (const { installation } of manquants) options.autoriserLaPage(installation.lien);
      return manquants;
    },
  };
}

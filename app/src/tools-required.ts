// Les outils que l'app ne livre pas — `gh`, `git`, `claude` —, côté process principal (#4059, épique #4054). Le runtime
// lit la machine et dit, pour chacun qui manque, la page d'installation officielle (runtime/src/outils-requis/) ; l'app
// relaie ce choix à la vue. L'app n'installe rien (#4266) : installer est l'affaire du chef, qui revient dire « I
// installed it ». Chaque lecture rattache au PATH de l'app un outil que son installeur vient de poser hors de lui (le
// `gh` de winget, dans `Program Files`) : l'app le trouve sans redémarrer, et tout ce qu'elle lance ensuite aussi.

type Required = typeof import("../../runtime/src/outils-requis/outils-requis.ts");
type OfTheMachine = typeof import("../../runtime/src/outils-requis/machine.ts");
type Tools = typeof import("../../runtime/src/second/outils.ts");
export type ToolRequired = import("../../runtime/src/outils-requis/outils-requis.ts").OutilRequis;
export type ToolMissing = import("../../runtime/src/outils-requis/machine.ts").OutilManquant;

export type Runtime = Pick<Required, "OUTILS_REQUIS"> & Pick<OfTheMachine, "lireLaMachine" | "outilsManquants"> & Pick<Tools, "programmesDe">;

export type OptionsOfToolsRequired = {
  charger: () => Promise<Runtime>;
  // L'environnement de l'app : son PATH est complété des dossiers que les installeurs ont posés hors de lui.
  env: Record<string, string | undefined>;
  // Appelée avec la page d'installation de chaque outil qui manque : l'app n'ouvre que les pages qu'elle a elle-même montrées.
  autoriserLaPage: (link: string) => void;
};

export function holdToolsRequired(options: OptionsOfToolsRequired) {
  async function read() {
    const runtime = await options.charger();
    const readEntry = () => runtime.lireLaMachine({ env: options.env, programmes: runtime.programmesDe(options.env) });
    const machine = readEntry();
    const folders = Object.values(machine.horsDuPath);
    if (folders.length === 0) return { runtime, machine };
    // Sous Windows, le PATH se nomme souvent `Path` : c'est lui qui est complété.
    const key = Object.keys(options.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
    options.env[key] = [...folders, options.env[key] ?? ""].filter((folder) => folder !== "").join(machine.plateforme === "win32" ? ";" : ":");
    return { runtime, machine: readEntry() };
  }

  return {
    // Ceux de `outils` qui manquent — les trois, sans liste —, chacun avec sa page d'installation.
    async manquants(tools?: unknown): Promise<ToolMissing[]> {
      const { runtime, machine } = await read();
      const wantedOnes = Array.isArray(tools) ? runtime.OUTILS_REQUIS.filter((tool) => tools.includes(tool)) : runtime.OUTILS_REQUIS;
      const missing = runtime.outilsManquants(machine, wantedOnes);
      for (const { installation } of missing) options.autoriserLaPage(installation.lien);
      return missing;
    },
  };
}

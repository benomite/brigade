// Les outils que l'app ne livre pas — `gh`, `git`, `claude` —, côté process principal (#4059, épique #4054). Le lecteur
// que le process principal charge (`charger`) lit la machine et dit, pour chacun qui manque, la page d'installation
// officielle ; l'app relaie ce choix à la vue. L'app n'installe rien (#4266) : installer est l'affaire du chef, qui revient dire « I
// installed it ». Chaque lecture rattache au PATH de l'app un outil que son installeur vient de poser hors de lui (le
// `gh` de winget, dans `Program Files`) : l'app le trouve sans redémarrer, et tout ce qu'elle lance ensuite aussi.

export type ToolRequired = "git" | "gh" | "claude";
export type ToolMissing = { outil: ToolRequired; installation: { texte: string; lien: string } };
// La machine lue : ce qui s'y trouve, et les dossiers hors du PATH où un installeur a posé un outil.
type MachineRead = { plateforme: NodeJS.Platform; presents: readonly string[]; horsDuPath: Partial<Record<ToolRequired, string>> };
type Env = Record<string, string | undefined>;

export type Runtime = {
  OUTILS_REQUIS: readonly ToolRequired[];
  lireLaMachine(options: { env: Env; programmes: Partial<Record<ToolRequired, string>> }): MachineRead;
  outilsManquants(machine: MachineRead, tools: readonly ToolRequired[]): ToolMissing[];
  programmesDe(env: Env): Partial<Record<ToolRequired, string>>;
};

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

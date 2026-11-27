// Les outils que l'app ne livre pas — `gh`, `git`, `claude` (#4059, épique #4054) —, et ce que l'écran d'un outil qui
// manque dit pour l'obtenir : la page d'installation officielle. L'app n'installe rien (#4266).

export type ToolRequired = "git" | "gh" | "claude";
export type ToolMissing = { outil: ToolRequired; installation: { texte: string; lien: string } };

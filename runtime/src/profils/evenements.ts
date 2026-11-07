// Le fait des profils de cook : le carnet d'un profil donné au cook d'un
// ticket de son domaine. Les profils eux-mêmes sont des fichiers du dépôt
// (`profils/definition.ts`) : aucun fait ne les propose.

// Le carnet d'un profil donné au cook d'un ticket de son domaine
// (`profils/preference.ts`), à son lancement. `run` : ce cook. `name` et
// `zone` : le profil, et son domaine. `lessons` : les ids des leçons du carnet
// qu'il a reçues — vide, un carnet qui n'en a encore aucune. Le cook d'un
// généraliste n'en a pas.
export type CarnetDonne = { run: string; name: string; zone: string; file: string; lessons: string[] };

export type FaitProfil =
  // Une fois par lancement d'un cook sous un profil : c'est aussi ce qui dit,
  // tant que ce cook tourne, que le cook du profil est occupé.
  { type: "profile.notebook-given"; payload: CarnetDonne };

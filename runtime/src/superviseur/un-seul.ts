// Un seul tour de superviseur par projet à la fois (#3914) : un second
// déclenchement pendant un tour ne lance rien. Le tour suivant part au
// déclenchement d'après, une fois celui-ci fini — même s'il a échoué.

export type Lancement = "lance" | "deja-en-cours";

export function superviseurDuProjet() {
  const enCours = new Set<string>();
  return {
    // Lance `tour` pour `projet`, sauf si un tour y tourne déjà. Rend "lance"
    // quand le tour est fini ; son erreur remonte, et le projet est libéré.
    async declencher(projet: string, tour: () => Promise<unknown>): Promise<Lancement> {
      if (enCours.has(projet)) return "deja-en-cours";
      enCours.add(projet);
      try {
        await tour();
      } finally {
        enCours.delete(projet);
      }
      return "lance";
    },
    enCours: (projet: string) => enCours.has(projet),
  };
}

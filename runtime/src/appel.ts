// Une commande du chef est une fonction de ce que son process lui donne — ses
// arguments, son environnement — vers ce qu'elle lui rend : des lignes, et un
// code de sortie. `npm --prefix runtime run <commande>` la joue dans son propre
// process ; qui l'importe la joue dans le sien, sans payer un Node qui démarre.

export type Appel = {
  // Les arguments de la commande, sans `node` ni le fichier.
  args: string[];
  env: Record<string, string | undefined>;
  // Une ligne sur la sortie standard.
  dire: (ligne: string) => void;
  // Une ligne sur la sortie d'erreur.
  redire: (ligne: string) => void;
};

export type Commande = (appel: Appel) => void | Promise<void>;

// Ce qu'une commande lève pour finir avec ce code. Pas une erreur : rien de ce
// qui rattrape une erreur pour la dire ne doit la prendre pour telle.
export class Sortie {
  readonly code: number;

  constructor(code: number) {
    this.code = code;
  }
}

// Joue la commande pour le process qui a été lancé sur son fichier. Le code
// qu'elle rend devient le sien ; une erreur qu'elle laisse passer le fait
// mourir, pile d'appels à l'appui.
export async function enProcess(commande: Commande): Promise<void> {
  try {
    await commande({ args: process.argv.slice(2), env: process.env, dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    process.exitCode = erreur.code;
  }
}

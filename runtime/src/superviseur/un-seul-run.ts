// Un seul run du superviseur par projet à la fois (#3943) : un réveil pendant
// un run ne lance rien. Le registre est celui du process — une station sert un
// projet par une seule cuisine.
const enCours = new Set<string>();

// Lance `run` sur la cause du réveil, sauf s'il n'y a pas de réveil (null) ou
// qu'un run tient déjà le projet : rend alors null, et rien ne part. Sinon,
// rend la promesse du run — son échec y remonte —, et le projet est libéré
// quand il finit, réussi ou non.
export function lancerUnSeulRun<C>(projet: string, cause: C | null, run: (cause: C) => Promise<void>): Promise<void> | null {
  if (cause === null || enCours.has(projet)) return null;
  enCours.add(projet);
  return (async () => {
    try {
      await run(cause);
    } finally {
      enCours.delete(projet);
    }
  })();
}

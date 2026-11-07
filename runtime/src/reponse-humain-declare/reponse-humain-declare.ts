// La réponse d'un humain déclaré qui n'a pas l'écriture sur le dépôt (#2762) :
// son label ou son commentaire ne vaut rien par défaut, sauf sur une carte qui
// lui est assignée. Un login absent de `humans`, ou déclaré mais qui répond sur
// la carte d'un autre, reste ignoré.

// Un humain que le projet déclare dans sa config (`humans`).
export type HumainDeclare = { login: string; roles: readonly string[] };

// GitHub ne distingue pas la casse d'un login.
const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// `assignes` n'est lu que si le login est déclaré : un inconnu ne coûte aucun
// appel de plus.
export async function reponseDUnHumainDeclare(
  login: string,
  humains: readonly HumainDeclare[],
  assignes: () => Promise<readonly string[]>,
): Promise<boolean> {
  if (!humains.some((humain) => meme(humain.login, login))) return false;
  return (await assignes()).some((assigne) => meme(assigne, login));
}

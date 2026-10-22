// Une cuisine que plusieurs tests lisent sans y toucher : le même scénario,
// joué une fois, et chacun y vérifie ce qui le concerne. Elle naît au premier
// test qui la demande et s'arrête à la fin du dernier de ses lecteurs — ses
// crochets de fin, ceux qu'elle aurait posés sur un test, se jouent alors dans
// l'ordre où elle les a posés. Un lecteur qui ne se joue pas (filtré par son
// nom) ne la laisse pas tourner : la fin de la suite où elle est déclarée
// l'arrête aussi.
//
// Un test qui la partage ne doit rien y changer : ni GitHub, ni journal, ni
// gates. Ce qu'il attend, il l'attend comme s'il était seul.
//
// À déclarer hors de tout test — au niveau du fichier ou d'un `describe`.
import { after, type TestContext } from "node:test";

export function partagee<T>(lecteurs: number, creer: (t: TestContext) => T): (t: TestContext) => T {
  let lieu: T | undefined;
  let restants = lecteurs;
  let fermee = false;
  const fins: Array<() => unknown> = [];
  // Le contexte que la cuisine croit être celui de son test : elle n'en lit que `after`.
  const contexte = { after: (fin: () => unknown) => void fins.push(fin) } as unknown as TestContext;
  const fermer = async () => {
    if (fermee) return;
    fermee = true;
    for (const fin of fins) await fin();
  };
  after(fermer);
  return (t) => {
    t.after(() => (--restants > 0 ? undefined : fermer()));
    lieu ??= creer(contexte);
    return lieu;
  };
}

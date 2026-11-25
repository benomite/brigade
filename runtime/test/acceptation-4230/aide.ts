// #4230: a station of a fake GitHub, with the gate of its agents' levels, where the pass merges green deliveries. The
// cook and the review are fakes; the clock is given; no `claude` is launched. `clone`: the project's clone, whose base
// holds the project sheet; without it, the default ranks hold.
import type { TestContext } from "node:test";
import { magasinDeNiveaux, type Niveau } from "../../src/autonomie/agents/niveaux.ts";
import { porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

export const PROJET = "risque";
const A9 = () => new Date("2026-11-25T09:00:00.000Z");

export function cuisine(t: TestContext, options: { pass?: Niveau; clone?: string; sansPorte?: boolean } = {}) {
  const repertoire = repertoireTemporaire(t);
  if (options.pass !== undefined) magasinDeNiveaux(repertoire).poser(PROJET, "pass", options.pass);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9 });
  const faux = new FauxGitHub();
  const avertissements: string[] = [];
  const box = faux.station("A", { ...(options.sansPorte === true ? {} : { porte }), ...(options.clone === undefined ? {} : { clone: options.clone }), avertir: (texte) => void avertissements.push(texte) });
  // A ticket on the rail, of the kinds of action given. GitHub does not close the ticket of a merged PR: the station
  // closes it once it knows the merge done.
  const ticket = (numero: number, ...sortes: string[]) => {
    faux.feu(numero, [...CALIBRE, ...sortes.map((sorte) => `kind:${sorte}`)], "the ticket's body");
    faux.nonFermees.add(numero);
  };
  const tours = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await box.tour();
      await box.calme();
    }
  };
  return { repertoire, porte, faux, avertissements, ticket, tours };
}

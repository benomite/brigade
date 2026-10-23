// L'espace de « parade », son second qui nomme un geste à faire (#1521, épique #1518) : sous le terminal, un bouton qui
// montre la commande exacte que le second a publiée par son canal (runtime/src/second-propositions/), entière même
// longue. Rien n'est lancé : un clic ouvre la confirmation (`second-geste-confirmation`).
import type { Proposition } from "../../../runtime/src/second-propositions/proposition.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
// Une commande longue, telle que le second la publie : elle se lit en entier sur le bouton et dans la confirmation.
export const COMMANDE = '! ssh box "cd ~/parade && brigade parade pass 1480 --merge --delete-branch --comment \'approved by the chef after the review of #1482\'"';
// Ce que le second affiche : ce qu'il propose, tel qu'il l'écrit, et `claude` qui attend.
const ECRAN_DU_SECOND = [
  "\x1b[1msecond · parade\x1b[0m",
  "",
  "  #1480 is approved and its CI is green.",
  "  The merge is yours: run it when you are ready.",
  "",
  "\x1b[2m> \x1b[0m",
].join("\r\n");
// Ce que le second a publié, tel que le canal le rend à l'app.
const PROPOSITION: Proposition = { kind: "gesture", command: COMMANDE, id: "9b2e4a71-5c3d-4e8f-a106-7d4f2b9c3e15", at: MAINTENANT };

export const geste = (etapes: Ecran["etapes"]): Pick<Ecran, "largeur" | "hauteur" | "etapes" | "donnees"> => ({
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, ...etapes],
  donnees: () => {
    const envois = cuisine(RENDUS);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], propositionsDuSecond: { parade: PROPOSITION } },
      envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
    };
  },
});

export const ecran: Ecran = {
  dit: "L'espace de « parade », son second qui nomme un geste (#1521) : sous le terminal, un bouton qui montre la commande exacte, entière",
  ...geste([]),
};

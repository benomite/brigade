// Le setup de worktree d'un projet échoue sur un besoin que la station ne
// fournit pas vraiment — un Postgres qui refuse le compte de la cuisine, un
// démon Docker qui ne lui répond pas, un `psql` qu'elle n'a pas (#1533). Ce
// module lit, dans la sortie du setup, les besoins du catalogue qu'elle nomme,
// et dit en une phrase ce qui le prouve : la cause du choix que le chef en
// fait, à la place de l'échec brut du setup. Pur : rien n'est lu ni écrit ici.
import { SCRIPT_SETUP } from "../../gates.ts";
import { commandeIntrouvable } from "../../preparation-depot/setup-en-echec.ts";
import { BESOINS, type Besoin } from "./catalogue.ts";

// Ce qui dit qu'une commande appartient à un besoin : celles que la station
// cherche pour le fournir, et celles qu'un setup lance pour s'en servir.
const commandesDe = (besoin: Besoin): readonly string[] => [...besoin.fourni.commandes, ...(besoin.indices.commandes ?? [])];

// Les besoins que la sortie du setup nomme, dans l'ordre où elle les dit, une
// fois chacun : une ligne qui dit qu'il ne peut pas s'en servir, ou qu'il ne
// trouve pas une de ses commandes. Aucun : il a échoué sur autre chose.
export function besoinsNommesParLeSetup(sortie: string): Besoin[] {
  const nommes: Besoin[] = [];
  for (const ligne of sortie.split("\n").map((brute) => brute.trim())) {
    if (ligne === "") continue;
    const commande = commandeIntrouvable(ligne);
    const besoin = BESOINS.find((un) => (commande !== null && commandesDe(un).includes(commande)) || (un.erreurs ?? []).some((erreur) => erreur.test(ligne)));
    if (besoin !== undefined && !nommes.includes(besoin)) nommes.push(besoin);
  }
  return nommes;
}

// La preuve d'un besoin que le setup a nommé, telle que la cause d'un choix la
// dit : le fichier, ce qu'il fait — jamais ce qu'il a écrit.
export const preuveDuSetup = (besoin: Besoin, station: string): string => `\`${SCRIPT_SETUP}\` fails on ${station} because it cannot use ${besoin.nom} there`;

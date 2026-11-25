// La commande `parked` (#4129) : un ticket qui attend quelqu'un — qui, pour quoi, jusqu'à quand — se parque et se
// reprend sur son issue, sur tout projet GitHub, sans box (attente-github/commande.ts). Elle remplace `waiting`, dont
// les gestes passaient par le journal de la box.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { pourGitHub, principalGitHub, USAGE_GITHUB, type OuvrirGitHub } from "./attente-github/commande.ts";

// `maintenant` : l'heure du geste — celle de l'horloge, hors des tests.
// `ouvrir` : le GitHub du ticket — celui du `gh` du poste, hors des tests.
export function principal(appel: Appel, maintenant = () => new Date(), ouvrir?: OuvrirGitHub): Promise<void> {
  if (!pourGitHub(appel.args)) {
    appel.redire(`brigade : a parked ticket is named by its repository, <owner>/<repo>#<issue>\n${USAGE_GITHUB}`);
    throw new Sortie(2);
  }
  return principalGitHub(appel.args, appel, maintenant, ouvrir);
}

if (import.meta.main) await enProcess((appel) => principal(appel));

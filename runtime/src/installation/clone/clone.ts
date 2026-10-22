// Le clone d'un projet, réparé seul puis, s'il échoue vraiment, dit comme un
// blocage (#1395, #1390). Le 22 oct. 2026, le `gh` de la box avait
// `git_protocol ssh` et le clone de mirrorscreen mourait sur « Host key
// verification failed », que la page rendait en « exit status 128 ».
//
// Réparer : le premier essai nomme le dépôt par son adresse HTTPS ; si git
// l'envoie quand même sur ssh, le second réécrit, pour ce seul process, toute
// adresse ssh de GitHub en HTTPS (`GIT_CONFIG_*`, git 2.31+) — la
// configuration de gh et de git n'est jamais modifiée. Dire : un échec qui
// reste devient un blocage dont le message est la cause en une phrase, le
// lien est la page exacte du geste, et la sortie brute n'est que le `detail`.
import { CloneEnEchec, cloner } from "../../projets/preparer.ts";
import type { EchecDuClone } from "../../projets/echec-du-clone.ts";
import type { NouveauBlocage } from "../blocages/blocages.ts";

export const ID_BLOCAGE_CLONE = "clone";

// Ce que git a dit d'un protocole ou d'une clé d'hôte qui ne passe pas.
const PROTOCOLE = /host key verification failed|permission denied \(publickey|could not read from remote repository|no matching host key/i;

// Les adresses ssh de GitHub réécrites en HTTPS, pour un process.
export const reecritureHttps = (base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const dejaPosees = Number.parseInt(base.GIT_CONFIG_COUNT ?? "0", 10) || 0;
  const regles = ["git@github.com:", "ssh://git@github.com/", "ssh://git@github.com:22/", "git://github.com/"];
  const env: NodeJS.ProcessEnv = { ...base, GIT_CONFIG_COUNT: String(dejaPosees + regles.length) };
  regles.forEach((avant, rang) => {
    env[`GIT_CONFIG_KEY_${dejaPosees + rang}`] = "url.https://github.com/.insteadOf";
    env[`GIT_CONFIG_VALUE_${dejaPosees + rang}`] = avant;
  });
  return env;
};

type Options = Parameters<typeof cloner>[0];

// Clone ; si le protocole ou la clé d'hôte est en cause, recommence une fois en HTTPS.
export async function clonerEnReparant(options: Options): Promise<void> {
  try {
    return await cloner(options);
  } catch (erreur) {
    if (!(erreur instanceof CloneEnEchec) || !PROTOCOLE.test(erreur.erreurs)) throw erreur;
    return cloner({ ...options, env: reecritureHttps(options.env) });
  }
}

// Le blocage d'un clone en échec : la cause en une phrase pour message, la
// page du geste pour lien quand il se fait hors de l'app, la sortie de gh et
// de git pour seul détail.
export const blocageDuClone = (echec: EchecDuClone): NouveauBlocage => ({
  id: ID_BLOCAGE_CLONE,
  message: echec.raison,
  cause: echec.raison,
  link: echec.liens[0] ?? null,
  detail: echec.detail,
});

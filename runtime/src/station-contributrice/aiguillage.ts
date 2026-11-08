// Quelle station sert le projet, selon ce que le compte de la machine peut sur
// son dépôt (#2935) : avec l'écriture, la station GitHub seul, qui prend,
// cuisine, relit et merge ; sans elle, la station contributrice, qui cuisine
// dans sa fourche et livre par une PR du dehors. Les droits se lisent au
// premier tour ; tant qu'ils ne se lisent pas, le tour échoue et rien ne cuit,
// et le suivant les relit.
import type { StationGitHub } from "../brigade-github.ts";
import type { GitHub } from "../github.ts";
import { stationContributrice, type OptionsContributrice } from "./station.ts";

// Le compte sous lequel la station agit, et s'il peut écrire sur le dépôt.
export type Droits = { login: string; ecriture: boolean };

export type OptionsDeLAiguillage = {
  droits: () => Promise<Droits>;
  // La station GitHub seul, déjà ouverte.
  ecrivaine: StationGitHub;
  contributrice: (login: string) => StationGitHub;
  avertir?: (message: string) => void;
};

export function stationSelonLesDroits(options: OptionsDeLAiguillage): StationGitHub {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  let choisie: StationGitHub | null = null;
  const aiguillee: StationGitHub = {
    async tour() {
      if (choisie === null) {
        const { login, ecriture } = await options.droits();
        choisie = ecriture ? options.ecrivaine : options.contributrice(login);
        if (!ecriture) avertir(`brigade : @${login} has no write access to the repository — contributor station: it claims tickets with a comment, cooks them in its fork, and delivers each one as a pull request from the fork`);
        // Ce que la station choisie presse passe par la boucle qui l'a ouverte.
        choisie.presser = (maintenant) => aiguillee.presser?.(maintenant);
      }
      await choisie.tour();
    },
    enCuisine: () => choisie?.enCuisine() ?? [],
    calme: async () => choisie?.calme(),
    relu: async () => choisie?.relu(),
    quitter: async () => (choisie ?? options.ecrivaine).quitter?.(),
    arreter: () => choisie?.arreter?.(),
    sauver: async () => (await choisie?.sauver?.()) ?? [],
  };
  return aiguillee;
}

// La station du projet sur le client GitHub du runtime : la station GitHub
// seul, ou la contributrice si son compte n'a pas l'écriture. Un refus de la
// station GitHub seul — un nom qui ne signe rien, un client qui ne lit pas ce
// que le tour lit — vaut pour les deux. Un client qui ne dit pas ses droits
// (seul le client réel les dit) garde la station GitHub seul, comme avant.
export function aiguillerLaStation(github: GitHub, ecrivaine: StationGitHub | { refus: string }, contributrice: Omit<OptionsContributrice, "login" | "github">): StationGitHub | { refus: string } {
  if ("refus" in ecrivaine) return ecrivaine;
  const { droits, fourcher, prsOuvertes } = github;
  if (droits === undefined) return ecrivaine;
  return stationSelonLesDroits({
    droits: () => droits.call(github),
    ecrivaine,
    contributrice: (login) =>
      stationContributrice({
        ...contributrice,
        login,
        github: {
          tickets: () => github.tickets(),
          issue: (numero) => github.issue(numero),
          commentaires: (numero) => github.commentaires(numero),
          commenter: (numero, corps) => github.commenter(numero, corps),
          ouvrirPR: (pr) => github.ouvrirPR(pr),
          prsOuvertes: async () => {
            if (prsOuvertes === undefined) throw new Error("this GitHub client cannot list the open PRs");
            return prsOuvertes.call(github);
          },
          fourcher: async () => {
            if (fourcher === undefined) throw new Error("this GitHub client cannot fork the repository");
            return fourcher.call(github);
          },
        },
      }),
    ...(contributrice.avertir === undefined ? {} : { avertir: contributrice.avertir }),
  });
}

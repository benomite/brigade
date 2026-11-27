// Le projet prêt une fois la PR de la mise en place mergée, et le premier ticket
// que le second aide alors à écrire (#3170, épique #3164).
//
//   claudeMdDeLaBase(client, repo)   le `CLAUDE.md` de la branche d'intégration,
//                                    tel que GitHub le tient. La mise en place
//                                    écrit la section des bindings dans un
//                                    worktree jetable et la livre par une PR
//                                    (`app/src/plugin/init.sh`) : la copie
//                                    locale du chef ne l'a qu'une fois tirée.
//                                    Le constat (`depot-prepare/preparation.ts`,
//                                    `checkRepoSetup`) la lit là quand la copie
//                                    ne l'a pas : la lecture qui suit le merge
//                                    dit le projet prêt.
//   messageDuPremierTicket()         ce que le second fait à ce moment-là — quand
//                                    l'app lui redonne son rôle après le merge
//                                    (`app/src/second/role-apres-init.ts`,
//                                    #2689) : rien de plus. Le premier ticket
//                                    s'écrit dans l'app, au-dessus du rail : la
//                                    question au chef, le brouillon, et la
//                                    création avec `fire` sur son « oui »
//                                    (`premier-ticket/`, #3306) — le second ne
//                                    le propose ni ne le crée lui-même. Il part
//                                    avec le premier message de la mise en
//                                    place (`demarrage.ts`), sur une ligne.
import type { ClientGitHub } from "../proteger-branche.ts";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// `github` : `<owner>/<repo>`. `branch` : la branche d'intégration ; sans elle, celle par défaut du dépôt.
export type Base = { github: string; branch?: string };

// Le contenu du `CLAUDE.md` de la branche d'intégration ; null quand elle n'en a
// pas (404). Lève, en une phrase, quand GitHub ne le rend pas : on ne sait pas,
// et on ne décide pas à sa place que le projet n'est pas prêt.
export async function claudeMdDeLaBase(client: ClientGitHub, base: Base): Promise<string | null> {
  const ou = base.branch ? `the branch \`${base.branch}\` of ${base.github}` : `the default branch of ${base.github}`;
  const chemin = `repos/${base.github}/contents/CLAUDE.md${base.branch ? `?ref=${encodeURIComponent(base.branch)}` : ""}`;
  let reponse;
  try {
    reponse = await client({ methode: "GET", chemin });
  } catch (erreur) {
    throw new Error(`GitHub could not be reached to read the \`CLAUDE.md\` of ${ou} (${message(erreur)}).`);
  }
  if (reponse.statut === 404) return null;
  const contenu = (reponse.corps as { content?: unknown } | null)?.content;
  if (reponse.statut !== 200 || typeof contenu !== "string") throw new Error(`GitHub did not let the \`CLAUDE.md\` of ${ou} be read (HTTP ${reponse.statut}).`);
  return Buffer.from(contenu, "base64").toString("utf8");
}

// Les labels du premier ticket : `product`, né du second ; `prio:1`, le premier
// servi ; `fire`, sur le rail (`github.ts`, `LABEL`, que ce module n'importe pas :
// il part avec le lancement du second, dans l'app) — le manager le calibre, un
// cook le prend. Posés par le runtime à sa création (`premier-ticket/`), jamais
// par le chef.
export const LABELS_DU_PREMIER_TICKET = ["product", "prio:1", "fire"] as const;
// Les deux sections de son corps, celles d'une issue `product` du second (`app/src/second/role.md`).
export const SECTIONS_DU_PREMIER_TICKET = ["## Context", "## Acceptance criteria"] as const;

// Ce que le second fait une fois le projet prêt, en une ligne : laisser le premier ticket à l'app.
export function messageDuPremierTicket(): string {
  return [
    "Once the chef has merged the setup's pull request, the app gives you your role again at their next message: the project is then ready for Brigade.",
    "At that moment the app itself asks the chef, above the rail, what they want to change first, drafts the first ticket from their answer, shows it to them, and puts it on the rail on their yes.",
    "So do not offer a first ticket yourself, and never create it with `gh issue create`: if the chef asks you about it, tell them, in French, to answer the question above the rail.",
  ].join(" ");
}

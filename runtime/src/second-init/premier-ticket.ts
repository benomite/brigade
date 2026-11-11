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
//                                    #2689) : proposer au chef de lancer un
//                                    premier ticket, l'écrire avec lui, puis le
//                                    créer par son geste prévu, `gh issue
//                                    create`, avec `fire` — un cook le prend, et
//                                    le chef le suit dans l'app. Il part avec le
//                                    premier message de la mise en place
//                                    (`demarrage.ts`), sur une ligne.
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
// cook le prend.
export const LABELS_DU_PREMIER_TICKET = ["product", "prio:1", "fire"] as const;
// Les deux sections de son corps, celles d'une issue `product` du second (`app/src/second/role.md`).
export const SECTIONS_DU_PREMIER_TICKET = ["## Context", "## Acceptance criteria"] as const;

// Ce que le second fait une fois le projet prêt, en une ligne.
export function messageDuPremierTicket(): string {
  const labels = LABELS_DU_PREMIER_TICKET.map((label) => `--label ${label}`).join(" ");
  return [
    "Once the chef has merged the setup's pull request, the app gives you your role again at their next message: the project is then ready for Brigade.",
    "At that moment, after relaying the queue, offer the chef, in French, to fire a first ticket now, so that they see a cook take it and serve it.",
    "If they accept, write it with them in a dialogue: ask what they want done, in their words; then draft a short title and two to five observable acceptance criteria, each from the user's point of view (\"when I do X, I see Y\"), and show them the draft; apply their corrections until they agree.",
    `Then create it yourself, in English, with \`gh issue create --title <title> --body <body> ${labels}\`: the body has a \`${SECTIONS_DU_PREMIER_TICKET[0]}\` section (what the chef wants, and why) and a \`${SECTIONS_DU_PREMIER_TICKET[1]}\` section, one \`- \` line per criterion — no model or effort, the manager calibrates it.`,
    "Give the chef the ticket's number and link, and tell them a cook takes it from the rail: they watch it cook in the app's board. If `gh` refuses, say so in one sentence with the command to run themselves, and do not work around it.",
  ].join(" ");
}

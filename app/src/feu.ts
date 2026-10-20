// Les tickets `fire` lus sur GitHub (#728) : quand la box ne répond pas, le rail n'a plus de
// lecture neuve, et l'app ne sait rien de la cuisine. GitHub, lui, répond encore : les tickets
// que le chef a mis sur le rail s'y lisent, avec leur titre, leur numéro et leur priorité — sans
// l'état en cuisine, que seule la box dit. Comme pour la question d'un ticket (question.ts), c'est le
// `gh` du poste, lancé dans le dossier du projet : il y trouve le dépôt de lui-même.
import { execFile } from "node:child_process";
import { nombre } from "./format.ts";

export type Reglages = { gh: string; delaiMs: number };
// `prio` : le mot du label `prio:<mot>`, tel qu'écrit — absent, le ticket n'en porte pas.
export type TicketDeFeu = { ticket: number; titre: string; prio?: string; url?: string };
// `sans` : GitHub n'a pas répondu, et pourquoi — jamais un rail vide.
export type Feu = { a: string } & ({ tickets: TicketDeFeu[] } | { sans: string });

const ARGS = ["issue", "list", "--label", "fire", "--state", "open", "--limit", "100", "--json", "number,title,labels,url"];

// La sortie de `gh`, ou en quoi elle n'a pas la forme.
export function ticketsDe(sortie: string): TicketDeFeu[] | string {
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return "its output is not JSON";
  }
  if (!Array.isArray(lu)) return "its output is not a list";
  const tickets: TicketDeFeu[] = [];
  for (const brut of lu as unknown[]) {
    const { number: numero, title, labels, url } = (brut ?? {}) as Record<string, unknown>;
    if (typeof numero !== "number" || typeof title !== "string") return "an issue lacks its `number` or its `title`";
    const noms = Array.isArray(labels) ? (labels as unknown[]).map((label) => (label as { name?: unknown } | null)?.name).filter((nom): nom is string => typeof nom === "string") : [];
    const prio = noms.find((nom) => nom.startsWith("prio:"))?.slice("prio:".length);
    tickets.push({ ticket: numero, titre: title, ...(prio === undefined || prio === "" ? {} : { prio }), ...(typeof url === "string" && URL.parse(url)?.protocol === "https:" ? { url } : {}) });
  }
  // Les plus prioritaires d'abord (`prio:p0` avant `prio:p1`), puis par numéro.
  return tickets.sort((a, b) => Number(a.prio === undefined) - Number(b.prio === undefined) || (a.prio ?? "").localeCompare(b.prio ?? "") || a.ticket - b.ticket);
}

export function lireFeu(reglages: Reglages, dossier: string, maintenant = () => new Date()): Promise<Feu> {
  return new Promise((resoudre) => {
    execFile(reglages.gh, ARGS, { cwd: dossier, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
      const a = maintenant().toISOString();
      const lance = `$ ${reglages.gh} ${ARGS.join(" ")}`;
      if (erreur !== null) {
        const suite = erreur.code === "ENOENT" ? `\`${reglages.gh}\` is not on this machine` : erreur.killed === true ? `no answer within ${nombre(reglages.delaiMs / 1000)} s: gh stopped` : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
        return resoudre({ a, sans: `${lance}\n${erreurs}${sortie}`.trimEnd() + `\n→ ${suite}` });
      }
      const tickets = ticketsDe(sortie);
      resoudre(typeof tickets === "string" ? { a, sans: `${lance} — ${tickets}` } : { a, tickets });
    });
  });
}

// Ce que le cook d'un renvoi reçoit de la livraison renvoyée (#2590) : les
// remarques de la relecture en entier, les checks rouges de la CI en entier,
// et le diff de sa livraison précédente. Sans eux, le cook repris lisait les
// remarques coupées au commentaire du renvoi sur l'issue, ou ne les voyait pas,
// et s'arrêtait en quelques tours sans rien changer (#2557, #2478, #2479,
// #2558).
//
// Rien n'y est résumé ni coupé : une remarque, un check, un diff y est en
// entier ou n'y est pas. La consigne part pourtant en argument de `claude`, et
// un argument ne passe pas 128 Kio sous Linux (`bac-a-sable/hors-github.ts`) :
// au-delà de `OCTETS_DU_RENVOI`, un check rouge n'est plus que nommé, avec son
// adresse, et le diff n'est plus que la commande qui le montre. Les remarques
// de la relecture passent toujours.
import { dernierVerdict } from "./github-etat/fusion.ts";
import type { Check } from "./events/pass.ts";
import type { AnnotationDeCheck, Commentaire } from "./github.ts";

export const OCTETS_DU_RENVOI = 48_000;

// Un check rouge, avec ce que la CI a écrit de son échec.
export type CheckRouge = { nom: string; url: string | null; sortie: string };

// Ce que la livraison renvoyée laisse au cook qui la reprend. `relecture` :
// les remarques de la relecture qui a demandé des changements sur sa tête, ou
// null. `diff` : ce que sa livraison précédente change par rapport à la base.
export type Renvoi = { relecture: string | null; rouges: CheckRouge[]; diff: string };

// Ce que le brief demande au client GitHub de la station.
export type GitHubDuBrief = {
  commentaires(numero: number): Promise<Commentaire[]>;
  annotationsDuCheck?(check: Check): Promise<AnnotationDeCheck[]>;
};

// Une clôture de bloc plus longue que toute suite d'accents graves du texte.
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));
const bloc = (texte: string) => [cloture(texte), texte, cloture(texte)].join("\n");
const octets = (texte: string) => Buffer.byteLength(texte, "utf8");

function annotationEnTexte({ chemin, ligne, titre, message }: AnnotationDeCheck): string {
  const ou = chemin === null ? "" : ligne === null ? chemin : `${chemin}:${ligne}`;
  const tete = [ou, titre].filter((partie) => partie !== "").join(" — ");
  return [tete, message.trimEnd()].filter((partie) => partie !== "").join("\n");
}

// Les remarques de la relecture, si son dernier verdict demande des
// changements sur la tête `sha` : le corps du verdict, après son marqueur et sa
// ligne « Changes requested by station … ».
function remarquesDeLaRelecture(commentaires: Commentaire[], sha: string): string | null {
  const numerotes = commentaires.map((commentaire, id) => ({ ...commentaire, id }));
  const verdict = dernierVerdict(numerotes);
  if (verdict === null || verdict.verdict !== "request-changes" || verdict.sha !== sha) return null;
  return numerotes[verdict.commentaire]?.body.split("\n").slice(2).join("\n").trim() || null;
}

// Lit sur GitHub ce que la livraison renvoyée laisse au cook : la PR `pr`, ses
// checks `rouges`, et le `diff` de sa branche. Des annotations illisibles ne
// retiennent pas le cook : le check est dit sans elles.
export async function lireLeRenvoi(github: GitHubDuBrief, pr: { number: number; sha: string }, rouges: Check[], diff: string): Promise<Renvoi> {
  const relecture = remarquesDeLaRelecture(await github.commentaires(pr.number), pr.sha);
  const lus: CheckRouge[] = [];
  for (const check of rouges) {
    let annotations: AnnotationDeCheck[] = [];
    try {
      annotations = (await github.annotationsDuCheck?.(check)) ?? [];
    } catch {
      // Le check est dit sans elles.
    }
    lus.push({ nom: check.name, url: check.url, sortie: annotations.map(annotationEnTexte).join("\n\n") });
  }
  return { relecture, rouges: lus, diff };
}

// La section du brief d'un renvoi, ou "" sans renvoi — une première livraison.
export function briefDuRenvoi(renvoi: Renvoi | null, base: string): string {
  if (renvoi === null) return "";
  const parties: string[] = [];
  if (renvoi.relecture !== null) {
    parties.push(
      [
        "### What the review asked",
        "",
        "The review's remarks on your previous delivery, in full, as the reviewer wrote them. Each one is to be answered in this delivery: fixed, or, if it does not hold, your report says why.",
        "",
        bloc(renvoi.relecture),
      ].join("\n"),
    );
  }
  let taille = octets(parties.join("\n\n"));
  if (renvoi.rouges.length > 0) {
    const blocs: string[] = [];
    const nommes: string[] = [];
    for (const { nom, url, sortie } of renvoi.rouges) {
      const titre = `#### \`${nom}\``;
      const sans = url === null ? "_GitHub gives no failure annotation for this check._" : `_GitHub gives no failure annotation for this check: ${url}_`;
      const dit = sortie === "" ? [titre, "", sans].join("\n") : [titre, "", bloc(sortie)].join("\n");
      if (taille + octets(dit) > OCTETS_DU_RENVOI) {
        nommes.push(url === null ? `\`${nom}\`` : `\`${nom}\` (${url})`);
        continue;
      }
      blocs.push(dit);
      taille += octets(dit);
    }
    parties.push(
      [
        "### What the CI says is red",
        "",
        "Its failure annotations, check by check — the failing tests, with their errors, as the CI wrote them, in full. Start from these: there is no need to rebuild the CI's selection of tests to find what failed.",
        "",
        blocs.join("\n\n"),
        ...(nommes.length > 0 ? ["", `${nommes.length} more red check${nommes.length === 1 ? "" : "s"}, too long for this brief: ${nommes.join(", ")}.`] : []),
      ].join("\n"),
    );
  }
  if (renvoi.diff.trim() !== "") {
    const tete = ["### Your previous delivery", "", `What your previous delivery changes against \`origin/${base}\`: the work to take up, not to redo.`, ""].join("\n");
    const dit = `${tete}\n${bloc(renvoi.diff.trimEnd())}`;
    parties.push(taille + octets(dit) > OCTETS_DU_RENVOI ? `${tete}\nIt is too long for this brief: read it with \`git diff origin/${base}...HEAD\`.` : dit);
  }
  if (parties.length === 0) return "";
  return ["## Why your delivery was sent back", "", ...parties.flatMap((partie, i) => (i === 0 ? [partie] : ["", partie]))].join("\n");
}

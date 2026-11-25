// Les labels que la cuisine garantit dans chaque projet qu'elle sert (#4173) :
// `saturation-repair` doit exister avant que la machine sature — sans lui, le
// ticket qui la répare ne passe pas la porte de prise. Créé par la cuisine
// elle-même, jamais à la main ; un label déjà là n'est pas touché.
import type { ClientGitHub } from "./proteger-branche.ts";
import { ETIQUETTES } from "./etiquettes.ts";
import { LABEL_REPARATION_SATURATION } from "./reparation.ts";

export async function garantirLabelsDuProjet(depot: string, client: ClientGitHub): Promise<void> {
  const lus = await client({ methode: "GET", chemin: `repos/${depot}/labels?per_page=100` });
  if (lus.statut !== 200 || !Array.isArray(lus.corps)) throw new Error(`labels of ${depot} unreadable (HTTP ${lus.statut})`);
  if (lus.corps.some((lu) => String((lu as { name?: unknown }).name ?? "").toLowerCase() === LABEL_REPARATION_SATURATION)) return;
  const etiquette = ETIQUETTES.find(({ name }) => name === LABEL_REPARATION_SATURATION);
  if (etiquette === undefined) throw new Error(`${LABEL_REPARATION_SATURATION} is not in the label catalog`);
  const cree = await client({ methode: "POST", chemin: `repos/${depot}/labels`, corps: etiquette });
  if (cree.statut !== 201 && cree.statut !== 422) throw new Error(`label ${LABEL_REPARATION_SATURATION} not created on ${depot} (HTTP ${cree.statut})`);
}

export async function garantirLabelsDesProjets({ projets, client }: { projets: readonly { github: string }[]; client: (depot: string) => ClientGitHub }): Promise<void> {
  const echecs: string[] = [];
  for (const { github } of projets) {
    try {
      await garantirLabelsDuProjet(github, client(github));
    } catch (erreur) {
      echecs.push(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }
  if (echecs.length > 0) throw new Error(echecs.join("; "));
}

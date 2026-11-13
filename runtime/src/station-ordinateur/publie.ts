// Ce que la station de l'ordinateur publie de ce qu'elle sert (#3449) : les
// projets dont sa cuisine prend les tickets sur GitHub, et ceux que son service
// GitHub seul sert. Une ligne de sa liste que ni l'une ni l'autre ne sert n'y est
// pas : elle y est refusée, avec la cause `not-served`, d'où l'app dit que rien
// ne la cuisine au lieu de « cuisine ce projet ».
import type { CodeDeRefus } from "../projets/refus.ts";
import { nomDuDepot } from "../projets/ajout-de-station.ts";

export type Publie = { servis: Record<string, string>; refuses: Record<string, string>; causes: Record<string, CodeDeRefus> };

export function publieDeLaStation(
  station: { projets(): string[]; servisSurGitHub(): Record<string, string>; depots(): Record<string, string>; refuses(): Record<string, string>; cause(nom: string): CodeDeRefus | null },
  service: { servis(): string[]; refus(): Record<string, string> } | null,
): Publie {
  const servis = { ...station.servisSurGitHub() };
  for (const depot of service?.servis() ?? []) {
    const nom = nomDuDepot(depot);
    if (nom !== null) servis[nom] = depot;
  }
  const refuses = { ...station.refuses() };
  const causes: Record<string, CodeDeRefus> = Object.fromEntries(Object.keys(refuses).map((nom) => [nom, station.cause(nom) ?? "unexpected"]));
  const depots = station.depots();
  const refusDuService = service?.refus() ?? {};
  for (const nom of station.projets()) {
    if (Object.hasOwn(servis, nom) || Object.hasOwn(refuses, nom)) continue;
    const dit = refusDuService[(depots[nom] ?? "").toLowerCase()];
    refuses[nom] = dit ?? "its kitchen takes no ticket on GitHub and the GitHub-only service has not opened it yet";
    causes[nom] = "not-served";
  }
  return { servis, refuses, causes };
}

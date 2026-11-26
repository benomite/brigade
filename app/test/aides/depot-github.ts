// Un dépôt sur GitHub, en mémoire, tel que l'API REST des contenus le rend (`/repos/<dépôt>/contents/<chemin>?ref=main`) :
// un fichier, ou la liste d'un dossier. Les tests des spécialisations (#2492) y lisent et y écrivent comme l'app sur le
// vrai ; une vue relancée devant le même dépôt relit ce qu'une autre y a écrit.
import type { ClientDeLaPriorite } from "../../src/priorite.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";

export const DEPOT = "chef/parade";

// Un GitHub en mémoire : les fichiers de `main`, par chemin ; chaque demande notée — et, pour une méthode nommée, la
// réponse qu'il rend à la place. Il refuse d'écrire sur un fichier qui existe sans son `sha`, comme le vrai.
export function github(fichiers: Record<string, string>, refus: Partial<Record<"GET" | "PUT", ReponseGitHub>> = {}) {
  const depot = new Map(Object.entries(fichiers));
  const demandes: string[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const contenu = `/repos/${DEPOT}/contents/`;
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      if (refus.GET !== undefined) return refus.GET;
      const [lu = "", ref] = chemin.slice(contenu.length).split("?ref=");
      if (!chemin.startsWith(contenu) || ref !== "main") return { status: 404, data: { message: "Not Found" } };
      const texte = depot.get(lu);
      if (texte !== undefined) return { status: 200, data: { type: "file", content: Buffer.from(texte).toString("base64"), sha: "s" } };
      const dessous = [...depot.keys()].filter((chemin) => chemin.startsWith(`${lu}/`));
      if (dessous.length === 0) return { status: 404, data: { message: "Not Found" } };
      return { status: 200, data: dessous.map((chemin) => ({ type: chemin.slice(lu.length + 1).includes("/") ? "dir" : "file", name: chemin.slice(lu.length + 1).split("/")[0], path: chemin })) };
    },
    ecrire: async (methode, chemin, corps) => {
      demandes.push(`${methode} ${chemin}`);
      if (refus.PUT !== undefined) return refus.PUT;
      const recu = corps as Record<string, unknown>;
      ecrits.push(recu);
      const ou = chemin.slice(contenu.length);
      if (depot.has(ou) && recu.sha === undefined) return { status: 422, data: { message: '"sha" wasn\'t supplied.' } };
      depot.set(ou, Buffer.from(recu.content as string, "base64").toString("utf8"));
      return { status: 201, data: { content: { sha: "neuf" } } };
    },
  };
  return { client, demandes, ecrits, fichier: (chemin: string) => depot.get(chemin) };
}

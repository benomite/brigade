// Un dépôt sur GitHub, en mémoire, tel que l'API REST des contenus le rend (`/repos/<dépôt>/contents/<chemin>?ref=main`) :
// un fichier, ou la liste d'un dossier. Les tests des spécialisations (#2492) y lisent et y écrivent comme l'app sur le
// vrai ; une vue relancée devant le même dépôt relit ce qu'une autre y a écrit.
import type { ClientOfThePriority } from "../../src/priority.ts";
import type { AnswerGitHub } from "../../src/board/client.ts";

export const REPOSITORY = "chef/parade";

// Un GitHub en mémoire : les fichiers de `main`, par chemin ; chaque demande notée — et, pour une méthode nommée, la
// réponse qu'il rend à la place. Il refuse d'écrire sur un fichier qui existe sans son `sha`, comme le vrai.
export function github(files: Record<string, string>, refusal: Partial<Record<"GET" | "PUT", AnswerGitHub>> = {}) {
  const repository = new Map(Object.entries(files));
  const requests: string[] = [];
  const writtenOnes: Record<string, unknown>[] = [];
  const content = `/repos/${REPOSITORY}/contents/`;
  const client: ClientOfThePriority = {
    lire: async (path) => {
      requests.push(`GET ${path}`);
      if (refusal.GET !== undefined) return refusal.GET;
      const [readOne = "", ref] = path.slice(content.length).split("?ref=");
      if (!path.startsWith(content) || ref !== "main") return { status: 404, data: { message: "Not Found" } };
      const text = repository.get(readOne);
      if (text !== undefined) return { status: 200, data: { type: "file", content: Buffer.from(text).toString("base64"), sha: "s" } };
      const below = [...repository.keys()].filter((path) => path.startsWith(`${readOne}/`));
      if (below.length === 0) return { status: 404, data: { message: "Not Found" } };
      return { status: 200, data: below.map((path) => ({ type: path.slice(readOne.length + 1).includes("/") ? "dir" : "file", name: path.slice(readOne.length + 1).split("/")[0], path: path })) };
    },
    ecrire: async (method, path, body) => {
      requests.push(`${method} ${path}`);
      if (refusal.PUT !== undefined) return refusal.PUT;
      const received = body as Record<string, unknown>;
      writtenOnes.push(received);
      const or = path.slice(content.length);
      if (repository.has(or) && received.sha === undefined) return { status: 422, data: { message: '"sha" wasn\'t supplied.' } };
      repository.set(or, Buffer.from(received.content as string, "base64").toString("utf8"));
      return { status: 201, data: { content: { sha: "neuf" } } };
    },
  };
  return { client, demandes: requests, ecrits: writtenOnes, fichier: (path: string) => repository.get(path) };
}

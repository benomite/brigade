// Les commentaires du tableau de la cuisine vus de GitHub : ceux que le chef y
// poste pour décider, la ligne que la box répond sous chacun, et le compte du
// chef. Par `gh api`, comme le client du tableau (publication/client.ts) :
// chaque appel prend le sien au compteur du quota réel (limite-github.ts)
// avant de partir. Lire les commentaires, y répondre et demander le compte du
// chef sont ensemble le geste du chef : ni un quota bas ni la pause de la box
// ne les retiennent, sans quoi un geste posté resterait sans réponse.
import { masquerIdentifiants } from "../../identifiants.ts";
import { COMPTE_DE_LA_MACHINE, lectureDe, limiteDuProcess, prendreUnAppel, type Limite, type ReponseHttp, type Usage } from "../../limite-github.ts";
import { lancerGhApi } from "../publication/client.ts";

// Un commentaire du tableau. `id` : celui de GitHub, croissant d'un commentaire
// au suivant. `le` : son heure de création.
export type CommentaireDuTableau = { id: number; auteur: string; corps: string; le: string; url: string };

export type ClientDesGestes = {
  // Les commentaires du tableau, du plus ancien au plus récent ; `depuis` : ceux
  // modifiés à cet instant ISO ou après — tous, s'il est nul.
  commentaires(numero: number, depuis: string | null): Promise<CommentaireDuTableau[]>;
  // Poste un commentaire sous le tableau.
  repondre(numero: number, corps: string): Promise<void>;
  // Le compte GitHub du chef : celui du `gh` de la machine, sous lequel la box
  // a été installée — jamais celui d'une App de rôle.
  compteDuChef(): Promise<string>;
};

export type OptionsClient = {
  // `<owner>/<repo>`
  depot: string;
  // Le binaire `gh`. Surchargé par les tests, jamais sur la box.
  bin?: string;
  delaiMs?: number;
  // Le jeton du rôle qui lit et répond, demandé à chaque appel ; absent, `gh` s'authentifie seul.
  jeton?: () => Promise<string>;
  // Le compte dont ce client dépense le quota : par défaut, celui de la machine.
  compte?: string;
  projet?: string;
  limite?: Limite;
  maintenant?: () => number;
};

type CommentaireBrut = { id?: unknown; body?: unknown; created_at?: unknown; html_url?: unknown; user?: { login?: unknown } | null };

const pageSuivante = (reponse: ReponseHttp): string | null => /<([^>]+)>;\s*rel="next"/.exec(reponse.entetes.get("link") ?? "")?.[1] ?? null;

export function clientGitHubDesGestes(options: OptionsClient): ClientDesGestes {
  const { depot } = options;
  const bin = options.bin ?? "gh";

  // Une réponse HTTP, quel que soit son statut. `machine` : sous le `gh` de la
  // machine, sans le jeton du rôle, et à son compte.
  const appeler = async (brut: string[], { entree, machine = false, usage = "geste" }: { entree?: unknown; machine?: boolean; usage?: Usage } = {}): Promise<ReponseHttp> => {
    const args = brut.map((arg) => masquerIdentifiants(arg).texte);
    const limite = options.limite ?? limiteDuProcess();
    const compte = machine ? COMPTE_DE_LA_MACHINE : (options.compte ?? COMPTE_DE_LA_MACHINE);
    const jeton = machine ? undefined : options.jeton;
    let env: NodeJS.ProcessEnv | undefined;
    const environnement = async () => (env ??= jeton ? { ...process.env, GH_TOKEN: await jeton() } : undefined);
    const appel = await prendreUnAppel(limite, {
      usage,
      compte,
      etiquette: { projet: options.projet ?? (process.env.BRIGADE_PROJECT || depot), lecture: lectureDe(args, usage) },
      gh: bin,
      env: environnement,
      maintenant: options.maintenant,
    });
    await environnement();
    return lancerGhApi(args, entree, { bin, delaiMs: options.delaiMs, env, limite, compte, appel, maintenant: options.maintenant });
  };

  const exiger = (reponse: ReponseHttp, chemin: string, attendu = 200): ReponseHttp => {
    if (reponse.statut !== attendu) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
    return reponse;
  };

  // La première page de la dernière lecture, sous son ETag : relue sous
  // condition chaque minute, elle ne coûte rien tant que personne n'a commenté.
  const lues = new Map<string, { etag: string; commentaires: CommentaireDuTableau[] }>();
  let chef: string | null = null;

  const lireCommentaire = (brut: CommentaireBrut): CommentaireDuTableau | null =>
    typeof brut.id !== "number"
      ? null
      : {
          id: brut.id,
          auteur: typeof brut.user?.login === "string" ? brut.user.login : "",
          corps: typeof brut.body === "string" ? brut.body : "",
          le: typeof brut.created_at === "string" ? brut.created_at : "",
          url: typeof brut.html_url === "string" ? brut.html_url : "",
        };
  const lirePage = (reponse: ReponseHttp) => (JSON.parse(reponse.corps) as CommentaireBrut[]).flatMap((brut) => lireCommentaire(brut) ?? []);

  return {
    async commentaires(numero, depuis) {
      const chemin = `repos/${depot}/issues/${numero}/comments?per_page=100${depuis === null ? "" : `&since=${encodeURIComponent(depuis)}`}`;
      const gardee = lues.get(chemin);
      const premiere = await appeler([...(gardee === undefined ? [] : ["-H", `If-None-Match: ${gardee.etag}`]), chemin], { usage: "geste" });
      if (premiere.statut === 304 && gardee !== undefined) return gardee.commentaires;
      const commentaires = lirePage(exiger(premiere, chemin));
      // Au-delà d'une page, un commentaire de la page 2 ne se verrait pas dans
      // l'ETag de la première : la lecture reste alors inconditionnelle.
      let suivante = pageSuivante(premiere);
      const etag = premiere.entetes.get("etag");
      lues.delete(chemin);
      if (suivante === null && etag) lues.set(chemin, { etag, commentaires });
      while (suivante !== null) {
        const page = exiger(await appeler([suivante], { usage: "geste" }), suivante);
        commentaires.push(...lirePage(page));
        suivante = pageSuivante(page);
      }
      return commentaires;
    },
    async repondre(numero, corps) {
      const chemin = `repos/${depot}/issues/${numero}/comments`;
      exiger(await appeler(["-X", "POST", chemin], { entree: { body: corps } }), chemin, 201);
    },
    async compteDuChef() {
      if (chef !== null) return chef;
      const login = (JSON.parse(exiger(await appeler(["user"], { machine: true }), "user").corps) as { login?: unknown }).login;
      if (typeof login !== "string" || login === "") throw new Error("gh api user : le compte du `gh` de la machine est sans nom");
      chef = login;
      return chef;
    },
  };
}

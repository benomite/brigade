// La notification d'une carte de TODO (#2747, épique #2498) : l'app Android prévient le chef quand une carte lui est
// posée, sans qu'il ait ouvert l'app. Une carte de TODO se reconnaît au signal même que l'app lit pour la dessiner
// (board/wait-of-chef.ts, `lireCeQuiAttendLeChef`) : aucun nouveau marquage sur GitHub, et tout le reste — une autre
// issue, un commentaire, un label, un statut — n'est pas une entrée de cette lecture, donc ne dit rien.
//
// Ce module ne lance rien et ne touche à rien du téléphone : il lit GitHub par l'`appeler` qu'on lui donne, retient ce
// qui a été notifié par la `memoire` qu'on lui donne (elle survit au redémarrage de l'app), et montre ou retire une
// notification par le `notifier` qu'on lui donne. Sur le téléphone, un job périodique d'Android (SondeWorker.java, toutes
// les quinze minutes, sans serveur de brigade) rejoue ce module dans une WebView sans écran (android/web/sonde.html).
//
// Une carte notifie une fois : elle est retenue par son dépôt, son ticket et sa question. Elle est retirée — sa
// notification disparaît — quand le chef y répond dans l'app (`carteRepondue`), ou quand la lecture suivante ne la porte
// plus (répondue sur GitHub). Un projet dont la lecture échoue ne retire rien : « rien n'est lu » n'est pas « répondu ».
import { questionOfChef } from "./card-todo.ts";
import type { CallGitHub } from "./board/client.ts";
import { readWhatAwaitingTheChef, type WaitOfChef } from "./board/wait-of-chef.ts";
import { readTheProjectsOfAccount, type ProjectOfAccount } from "./read-github-phone.ts";


// Ce que la mémoire retient d'une carte notifiée.
export type Notified = { id: number; projet: string; depot: string; ticket: number; question: string };
export type NotifiedEntries = Record<string, Notified>;
// Les ports peuvent être asynchrones : le pont de l'app les passe au natif, la page du sondage les a de plain-pied.
type Can<T> = T | Promise<T>;
export type Memory = { lire(): Can<NotifiedEntries>; ecrire(notified: NotifiedEntries): Can<void> };
// Une notification du système : son identifiant (stable pour une carte), son texte — le projet et la question —, et la
// carte qu'un toucher ouvre.
export type Notification = { id: number; titre: string; texte: string; projet: string; ticket: number };
export type Notifier = { montrer(notification: Notification): Can<void>; retirer(id: number): Can<void> };

export type Options = {
  appeler: CallGitHub;
  memoire: Memory;
  notifier: Notifier;
  // Les projets du chef ; par défaut ceux que ses stations ont écrits dans ses gists.
  projets?: () => Promise<ProjectOfAccount[]>;
};
export type Probe = { lu: true; notifiees: number; retirees: number } | { lu: false; raison: string };

const keyOf = (repository: string, ticket: number) => `${repository.toLowerCase()}#${ticket}`;
// Un identifiant d'Android : un entier positif, le même pour la même carte (FNV-1a).
export function identifierOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 1) || 1;
}

// La question qu'une entrée de TODO pose : celle de sa carte, à défaut le début de sa ligne.
export function questionOf({ chef, ligne: line }: WaitOfChef): string {
  return (chef === undefined ? null : questionOfChef(chef)) ?? line.split(" — ")[0] ?? line;
}

export function notificationOf(project: string, ticket: number, question: string): Notification {
  return { id: identifierOf(`${project}#${ticket}`), titre: "A card awaits you", texte: `${project} — ${question}`, projet: project, ticket };
}

// Un sondage : GitHub est lu, chaque nouvelle carte notifie, chaque carte qui n'attend plus est retirée.
export async function probe({ appeler: call, memoire: memory, notifier: notify, projets: projects }: Options): Promise<Probe> {
  let readOnes: ProjectOfAccount[];
  try {
    readOnes = await (projects ?? (() => readTheProjectsOfAccount(call)))();
  } catch (error) {
    return { lu: false, raison: `The projects were not read from GitHub: ${error instanceof Error ? error.message : String(error)}` };
  }
  const kept = await memory.lire();
  let notified = 0;
  let removed = 0;
  const remove = async (key: string) => {
    const card = kept[key];
    if (card === undefined) return;
    delete kept[key];
    await memory.ecrire(kept);
    await notify.retirer(card.id);
    removed++;
  };
  // Un projet que la liste ne porte plus n'attend plus rien.
  const repositories = new Set(readOnes.map(({ depot: repository }) => repository.toLowerCase()));
  for (const [key, card] of Object.entries(kept)) if (!repositories.has(card.depot.toLowerCase())) await remove(key);
  let failure: string | undefined;
  for (const { nom: name, depot: repository } of readOnes) {
    const readOne = await readWhatAwaitingTheChef({ depot: repository, appeler: call });
    if (!readOne.lue) {
      failure ??= readOne.raison;
      continue;
    }
    const present = new Set<string>();
    for (const wait of readOne.attentes) {
      const key = keyOf(repository, wait.ticket);
      const question = questionOf(wait);
      present.add(key);
      if (kept[key]?.question === question) continue;
      // Une carte qui pose une autre question est une autre carte : l'ancienne notification cède la place.
      if (kept[key] !== undefined) await remove(key);
      const notification = notificationOf(name, wait.ticket, question);
      // Retenue avant d'être montrée : un arrêt entre les deux ne la fait pas notifier deux fois.
      kept[key] = { id: notification.id, projet: name, depot: repository, ticket: wait.ticket, question };
      await memory.ecrire(kept);
      try {
        await notify.montrer(notification);
      } catch (error) {
        delete kept[key];
        await memory.ecrire(kept);
        throw error;
      }
      notified++;
    }
    for (const [key, card] of Object.entries(kept)) if (card.depot.toLowerCase() === repository.toLowerCase() && !present.has(key)) await remove(key);
  }
  return failure === undefined ? { lu: true, notifiees: notified, retirees: removed } : { lu: false, raison: failure };
}

// Le chef vient de répondre à la carte de ce ticket, dans l'app : sa notification disparaît tout de suite.
export async function cardAnswered({ memoire: memory, notifier: notify }: Pick<Options, "memoire" | "notifier">, project: string, ticket: number): Promise<number> {
  const kept = await memory.lire();
  let removed = 0;
  for (const [key, card] of Object.entries(kept)) {
    if (card.projet !== project || card.ticket !== ticket) continue;
    delete kept[key];
    await notify.retirer(card.id);
    removed++;
  }
  if (removed > 0) await memory.ecrire(kept);
  return removed;
}

# Trusted authors

Brigade runs on a public repository, where anyone can open an issue or write a comment. This page says which authors the kitchen trusts, and why it trusts no one else. The words are those of the [glossary](glossary.md).

## The three trusted kinds of author

The kitchen trusts the text of three kinds of author, and only these:

1. **The chef**: the human who decides.
2. **Collaborators with write access** to the repository: the owner, the members and the collaborators (the author associations `OWNER`, `MEMBER` and `COLLABORATOR`). A `TODO` answer, a question answered on an issue, and a trusted comment are taken from them.
3. **The kitchen's own agents**: the `manager`, the `cook`s, the `pass`, the `reviewer` and the `second`.

## Why trust is limited to these authors

On a public repository, a stranger can write an issue or a comment, and nothing stops them. Such text can carry instructions. If an agent reads it and follows them, the agent does what the stranger wants, not what the chef wants. This is the untrusted-content leg of the lethal trifecta: an agent that reads untrusted content, holds access to data or tools, and can act on the outside is one that a stranger can steer. The kitchen cuts the first leg for text it did not get from a trusted author.

So the trust is not granted to everyone who can read the repository. It is limited to the people who already have write access to it, the chef who owns the project, and the agents that the kitchen itself runs.

## What happens to text from anyone else

Text from an author outside the three kinds above is held:

- no agent acts on it before the chef accepts it. The `manager` reads it once, to propose a choice for the chef; no `cook` works on it and no `pass` judges it;
- it is shown once in the chef's `TODO`, with its author and the choices to answer it. For a stranger's issue, the choices are `Put it on the rail` and `Close it`. Accepting it puts the ticket on the rail; nothing else happens before that;
- the ticket waits as `parked` for the chef, and it is not on the rail until then.

A `label` set by an author without write access has no effect. The kitchen reads its labels only from the authors it trusts, so a `fire` or a `prio:` label that a stranger puts on an issue moves nothing. The issue waits in the chef's `TODO` like any other text from a stranger.


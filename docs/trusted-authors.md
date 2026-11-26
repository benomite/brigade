# Trusted authors

Brigade runs on a public repository, where anyone can open an issue or write a comment. This page says which authors the kitchen trusts, and why it trusts no one else. The words are those of the [glossary](glossary.md).

## The three trusted kinds of author

The kitchen trusts the text of three kinds of author, and only these:

1. **The chef**: the human who decides.
2. **Collaborators with write access** to the repository: the owner, the members and the collaborators (the author associations `OWNER`, `MEMBER` and `COLLABORATOR`) whose permission, read from GitHub's API, is `admin`, `maintain` or `write`. A member with read access only is not trusted. The permission is read once per author and kept. A `TODO` answer, a question answered on an issue, and a trusted comment are taken from them.
3. **The kitchen's own agents**: the `manager`, the `cook`s, the `pass`, the `reviewer` and the `second`.

## Why trust is limited to these authors

On a public repository, a stranger can write an issue or a comment, and nothing stops them. Such text can carry instructions. If an agent reads it and follows them, the agent does what the stranger wants, not what the chef wants. This is the untrusted-content leg of the lethal trifecta: an agent that reads untrusted content, holds access to data or tools, and can act on the outside is one that a stranger can steer. The kitchen cuts the first leg for text it did not get from a trusted author.

So the trust is not granted to everyone who can read the repository. It is limited to the people who already have write access to it, the chef who owns the project, and the agents that the kitchen itself runs.

## What happens to text from anyone else

Text from an author outside the three kinds above is held:

- an issue from such an author is not read by any agent before the chef accepts it: the `manager` does not judge it, it is not put on the rail, and no `cook` or `reviewer` gets it;
- it is shown once in the chef's `TODO`, with its author and two choices: `Accept it` and `Close it`. A new poll does not add a second entry. Accepting it (the button, or a comment `accept` on the issue) removes the entry, and the issue is then judged like any other. The acceptance is kept on the issue, so the kitchen does not ask again unless the author rewrites the issue;
- a comment from such an author is left out of the text given to any agent, on any issue.

A `label` set by an author without write access has no effect. The kitchen reads its labels only from the authors it trusts, so a `fire`, a `prio:`, a `model:` or an `effort:` label that a stranger puts on a held issue moves nothing: the manager removes it. The same label set by a trusted author still works.

The code is in `runtime/src/trust/` (#4358).


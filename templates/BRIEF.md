# Brief: <name of the thing>

The team works from this while the owner is away. Anything not written here, the team
decides for itself and reports.

## What we are making

<Two or three sentences: what it is, who uses it, why.>

## Definition of done

A journey a tester can walk, step by step, with what must be true at each step:

1. <A new user does X and sees Y.>
2. <...>

It is done when a tester has walked this journey in the real, running application.

## Who uses it

<The people the tester should play: for example "a struggling Year 4", "a strong Year 11",
"a parent on a phone".>

## Decisions already made

<Stack, services, limits, anything the team must not reopen. One line each.>

## Limits

- **Branch**: `feature/<name>`. Never the default branch; one pull request at the end,
  not merged.
- **Secrets**: which keys exist in `.env` and what they are for (names only).
- **Spend**: what paid services may be used while building, and how sparingly.
- **Off-limits**: <deploys, production data, other repositories, anything else>.
- **Not to be copied**: <any product this is "like": take the idea, not the content>.

## Areas

Who builds what. Directories must not overlap.

| Area | Role | Owns | Builds |
|---|---|---|---|
| api | backend-dev | `apps/api` | <...> |
| web | frontend-dev | `apps/web` | <...> |

## What the owner must provide

<Keys, accounts, a repository, a design: with whether each is already in place.>

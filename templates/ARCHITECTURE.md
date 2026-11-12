# Architecture: <name>

The contract everyone builds against. Frozen while people build; a flaw goes in
`docs/HANDOFFS.md`, not into a quiet workaround.

## 1. Principles

<Three to five rules that settle arguments later. For example: plain code decides anything
that must be right and a model only words it; the browser never sees a key.>

## 2. Stack

| Choice | Why |
|---|---|
| <...> | <one line> |

## 3. Layout and ownership

| Area | Directories | Owner |
|---|---|---|
| shared contract | `packages/shared` | architect (frozen) |
| <area> | `<dir>` | <role> |

## 4. Ports, commands, environment

| Command | What it does |
|---|---|
| `<start>` | starts everything |
| `<test>`, `<typecheck>`, `<build>` | |

Environment variables (names, meaning, default). Where they are read.

## 5. Data model

<Tables or documents, their fields, and what deletes with what.>

## 6. Who may do what

<Sign-in, sessions, roles, and the rule each route enforces.>

## 7. Interfaces

Every route or function another area calls: what goes in, what comes out, who may call it,
the errors. The same shapes exist as code in the shared package.

## 8. Main flows

<State machines or numbered steps for the flows that matter.>

## 9. Outside services

<Each one: what it is used for, the one interface it sits behind, how it is cached, what
happens when it fails.>

## 10. Testing

<What each area must test, what the end-to-end journey is, and that no test calls a paid
service.>

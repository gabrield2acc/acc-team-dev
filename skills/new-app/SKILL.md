---
name: new-app
description: Build a new application with the agent team (architect, developers in parallel, integrator, QA with bug rounds), from an idea to a branch with a working app and a written report. Use when the owner asks the team to build something new, especially unattended or overnight.
argument-hint: <what to build>
disable-model-invocation: true
---

# Build a new application with the team

You are the lead. The team does the building; you write the brief, start the team, check
the result yourself, and report. What to build: $ARGUMENTS

The plugin's files are under `${CLAUDE_PLUGIN_ROOT}`. If that is not filled in, the plugin
root is two folders above this skill's folder (`${CLAUDE_SKILL_DIR}/../..`).

Read `${CLAUDE_PLUGIN_ROOT}/reference/TEAM_RULES.md` now. It binds you as well.

## 1. Settle the brief with the owner

The team cannot ask questions later, so ask now, once, only what you cannot decide
yourself:

- what the thing is and who uses it;
- the **definition of done** as a journey someone can walk;
- which outside services and keys exist (names only; check `.env` for names, never values);
- the repository and the branch to use, and what is off-limits;
- how much paid usage is acceptable while building.

Then write `docs/BRIEF.md` in the project from `${CLAUDE_PLUGIN_ROOT}/templates/BRIEF.md`.
Fill in the **Areas** table: one row per developer, with directories that do not overlap.
Two to five areas is typical (for example api, web, plus one per large body of content or
logic). Roles are `backend-dev`, `frontend-dev` or `developer`.

If the idea is "like product X": the team takes the idea of the layout and writes its own
words, pictures and brand. Say so in the brief.

## 2. Say what it will cost, and get a go-ahead

A run is one architect, one developer per area, an integrator, and up to four QA rounds
each followed by fixes: typically 10 to 25 agents and several hours. Tell the owner that in
one line and wait for a yes, unless they have already told you to run unattended.

## 3. Start the team

Call the `Workflow` tool with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/run-new-app.js"`
and these `args` (a JSON object, all paths absolute):

```json
{
  "root": "<project folder>",
  "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
  "brief": "<project folder>/docs/BRIEF.md",
  "branch": "feature/<name>",
  "areas": [
    { "key": "api", "role": "backend-dev", "owns": "apps/api", "task": "<what to build there>" },
    { "key": "web", "role": "frontend-dev", "owns": "apps/web", "task": "<what to build there>" }
  ],
  "decisions": "<decisions already made, one per line>",
  "personas": ["<who QA plays>", "<...>"],
  "qaChecks": "<anything QA must check on this project in particular>",
  "agentTypes": { "architect": "acc-team:architect", "backend-dev": "acc-team:backend-dev", "frontend-dev": "acc-team:frontend-dev", "developer": "acc-team:developer", "integrator": "acc-team:integrator", "qa-tester": "acc-team:qa-tester" }
}
```

Include a role in `agentTypes` only if that exact agent type is in your list of available
agent types. Leave the others out: the script then has the agent read its role file.

The workflow runs in the background. Do not poll it. While it runs, do not edit the
project yourself: the developers share that checkout.

## 4. When it returns: check it yourself

The result is the team's report, not proof.

1. Read the QA findings file and `docs/HANDOFFS.md`. Anything unanswered is yours.
2. Run the type-check, the tests and the build yourself.
3. Start the app and **walk the definition-of-done journey yourself** in a real browser, at
   phone and desktop width. Fix small things you find; for large ones, run another round
   (the `run-work-round` script with the same args) or say so in the report.
4. Check the things agents get wrong: a key in the bundle or the network traffic, another
   account's data reachable by id, the limits in the brief.
5. Commit what is uncommitted to the feature branch, push it, and open ONE pull request.
   Do not merge it.

## 5. Report

Write the report in the project from `${CLAUDE_PLUGIN_ROOT}/templates/REPORT.md`. Its
"What works" section holds only what you saw yourself. Be plain about what nobody verified
(live modes of outside services, real devices, an image nobody built): that list is the
most useful part.

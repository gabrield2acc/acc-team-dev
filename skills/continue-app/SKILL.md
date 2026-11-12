---
name: continue-app
description: Put the agent team to work on a project that already exists and already runs. The team surveys it first (changing nothing), writes a project map and a baseline, agrees a plan with the owner, and only then builds in small steps that follow the project's own conventions. Use when the owner wants the team to continue, extend or fix an existing application.
argument-hint: <what the owner wants done>
disable-model-invocation: true
---

# Continue an existing application with the team

You are the lead. The goal: $ARGUMENTS

On an existing project the first risk is not building the wrong thing, it is breaking what
works. So the order is: learn, record, plan, then build.

The plugin's files are under `${CLAUDE_PLUGIN_ROOT}`. If that is not filled in, the plugin
root is two folders above this skill's folder (`${CLAUDE_SKILL_DIR}/../..`).

Read `${CLAUDE_PLUGIN_ROOT}/reference/TEAM_RULES.md` now. It binds you as well.

## 1. Look before anything else

Read the project's `CLAUDE.md` and README, any `CLAUDE.md` in the folders above it, and
`git status`, `git log` and the open branches. If `docs/PROJECT_MAP.md` already exists and
is recent, read it and skip to step 3, checking only what has changed since.

If the working tree has uncommitted changes that are not yours, stop and ask the owner
what they are. Do not stash, commit or discard them.

## 2. Survey (changes nothing)

For a small project, survey it yourself. For anything larger, call the `Workflow` tool
with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/survey.js"` and:

```json
{
  "root": "<project folder>",
  "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
  "goal": "<what the owner wants done>",
  "agentTypes": { "surveyor": "acc-team:surveyor" }
}
```

Leave `agentTypes` out unless `acc-team:surveyor` is in your list of agent types. You may
pass `parts` (a list of `{ "key", "look" }`) to fit the project; the default suits a web
application with a server and an interface.

From the reports, write `docs/PROJECT_MAP.md` from
`${CLAUDE_PLUGIN_ROOT}/templates/PROJECT_MAP.md`. Check the claims that matter yourself:
run the start command and the tests and record the real result. The **Baseline** section is
what you will compare against later, so make it true: test counts, tests that were already
failing, and the journeys you walked by hand.

If the project has no `CLAUDE.md`, write a short one: the commands, the conventions found,
and what must not be touched. Ask the owner before committing either file if the project
has rules about documentation.

## 3. Plan with the owner

Before any change, show the owner:

- what you found that bears on the goal, including anything that makes it harder than it
  sounds;
- the plan as a few work items, each with an owner role, the directories it touches, and
  how it will be tested;
- the questions the survey could not answer.

Work items that touch the same files go one after another, never in parallel. Prefer
several small pull requests over one large one. Wait for the owner's yes.

## 4. Build

Use the branch convention the project already has (never the default branch).

- **One work item, a few files**: do it yourself, or give it to one agent of the right
  role, then review the diff.
- **Several independent work items**: write a short brief
  (`${CLAUDE_PLUGIN_ROOT}/templates/BRIEF.md`; its definition of done includes "everything
  in the baseline still works") and call the `Workflow` tool with
  `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/work-round.js"` and:

```json
{
  "root": "<project folder>",
  "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
  "brief": "<project folder>/docs/BRIEF.md",
  "contract": "<project folder>/docs/PROJECT_MAP.md",
  "branch": "<branch>",
  "areas": [
    { "key": "<item>", "role": "backend-dev", "owns": "<directories>", "task": "<what to change, and how it is tested>" }
  ],
  "projectNotes": "Existing project. Match its conventions (see the project map). No reformatting, renaming, dependency upgrades or refactoring beyond the task. Every test that passed in the baseline must still pass.",
  "qaChecks": "Walk the baseline journeys in the project map as well as the new work: nothing that worked before may be broken.",
  "e2eDir": "<where this project keeps end-to-end tests>",
  "push": false
}
```

Add `agentTypes` as in the new-app skill if the `acc-team:*` agent types are available.
`"push": false` keeps the work local until you have looked at it.

## 5. Check against the baseline

Run the project's whole test suite and compare with the baseline: nothing that passed may
now fail. Walk the baseline journeys and the new one in a real browser. Read the diff as a
reviewer would: anything outside the planned directories is a question.

Then push the branch and open a pull request per work item or per round, following the
project's own rules for titles and descriptions. Do not merge.

## 6. Report and update the map

Report with `${CLAUDE_PLUGIN_ROOT}/templates/REPORT.md` (shorter is fine for a small
change). Update `docs/PROJECT_MAP.md` with what the team learned, so the next session
starts from it.

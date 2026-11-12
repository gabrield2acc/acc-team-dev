# acc-team

A reusable team of coding agents for Claude Code, with the method and the scripts that
make them work together. It was taken from a real build (eliit tutor: a web application
built unattended, extended, given payments and deployed to staging and production) and
made generic, so the same team can start a new project or pick up an existing one.

Nothing in here is specific to one application. What is specific to a project (its stack,
its commands, its rules) stays in that project's own `CLAUDE.md`, `docs/BRIEF.md` and
`docs/PROJECT_MAP.md`.

## What you can ask for

| Command | What happens |
|---|---|
| `/acc-team:new-app <what to build>` | You and the lead settle a brief. Then an architect writes the contract, developers build their areas in parallel, an integrator joins them up, and QA tests in a real browser and sends bugs back to the owning developer until the journey passes. You get a branch, one pull request and a written report. |
| `/acc-team:continue-app <what you want done>` | For a project that already exists and runs. The team first surveys it and changes nothing, writes a project map and a baseline of what works, agrees a plan with you, then builds in small steps that follow the project's own conventions and checks nothing in the baseline broke. |
| `/acc-team:bulk-work <what to produce>` | For many similar pieces (content, data, generators, repeated modules). Each unit is built by one agent, checked by a different one who works samples by hand, and fixed. |
| `/acc-team:deploy-pipeline` | A staging and production pipeline: merge to `staging` deploys staging, merge to the default branch deploys production. Generates the GitHub Actions workflow, the manifests for both environments and the deploy guide from one config, and opens pull requests without merging. |

These four only run when you type them. They start many agents and cost accordingly; each
tells you roughly how many before it starts.

## The team

| Agent | Job |
|---|---|
| `architect` | Goes first on a new build: the contract, the ownership table, a scaffold that runs. |
| `backend-dev`, `frontend-dev`, `developer` | Build one area each, inside the directories they own, with tests. |
| `integrator` | Resolves handoffs, makes the whole repository green, runs the real app, commits. |
| `qa-tester` | Tests like a user, writes no product code, has a veto, routes bugs to their owners. |
| `checker` | Independently checks bulk work by working samples by hand. Changes nothing. |
| `surveyor` | Reads an existing project and reports how it is built. Changes nothing. |
| `release-engineer` | Image, workflow, environments, deploy guide. Opens pull requests and stops. |

Each can also be used on its own, for example "use the acc-team surveyor on the billing
code" or "have the acc-team qa-tester test the sign-up flow".

## Install

On this computer, from this folder:

```
claude plugin marketplace add /Users/gabrieldima/GIT/gabrield2acc/claude-v2/plugins/acc-team
```

```
claude plugin install acc-team@acc
```

Start a new session afterwards. To try it for one session without installing:

```
claude --plugin-dir /Users/gabrieldima/GIT/gabrield2acc/claude-v2/plugins/acc-team
```

On another machine: push this repository to GitHub (private is fine), then
`claude plugin marketplace add <owner>/<repo>` and the same install command.

After changing files here, start a new session (or run `/reload-plugins`). If the change
does not show up, raise `version` in `.claude-plugin/plugin.json` and run
`claude plugin update acc-team@acc`.

## How the pieces fit

```
.claude-plugin/     plugin.json and marketplace.json
agents/             the nine roles (one file each)
skills/             the four commands: what the lead does before, during and after
workflows/          the scripts that run the team
  new-app.js          architect, then work-round
  work-round.js       build in parallel, integrate, QA and fix rounds
  survey.js           read an existing project in parallel, change nothing
  build-check-fix.js  per unit: build, independent check, fix
reference/          TEAM_RULES.md: the rules every agent works to
templates/          BRIEF, ARCHITECTURE, HANDOFFS, PROJECT_MAP, REPORT, and deploy/
scripts/
  render-pipeline.mjs  writes a project's pipeline files from one config
  dry-run.mjs          runs a workflow script with pretend agents, to test an edit
```

The rules that make a team of agents safe to leave alone are in
[`reference/TEAM_RULES.md`](reference/TEAM_RULES.md). The short version:

- One written contract first; then each developer owns directories nobody else touches.
- Requests between areas go in a handoffs file, not into each other's code.
- Developers sharing a checkout do not touch git; one integrator commits.
- QA writes no product code and has a veto. A bug is fixed only when it was reproduced,
  given a regression test, and seen to pass.
- The author of bulk work is never its only checker.
- The lead walks the journey personally before reporting, and the report says plainly what
  nobody verified.
- Secrets are never printed; staging never holds live credentials; nobody merges.

## Changing it

- **A role behaves badly**: edit its file in `agents/`. The scripts read the same files.
- **The flow should differ**: edit the script in `workflows/`, then test the control flow
  without calling any model:

  ```
  node scripts/dry-run.mjs workflows/work-round.js
  ```

- **The pipeline should differ**: edit `scripts/render-pipeline.mjs`. See
  [`templates/deploy/README.md`](templates/deploy/README.md) for the config.
- **Check the plugin is well formed**: `claude plugin validate .`

## What has and has not been tested

- The roles, rules and the flow of each script come from runs that worked on a real
  project. The generic versions here have **not yet run a real build**: their control flow
  was checked with pretend agents (`scripts/dry-run.mjs`), not with real ones.
- The pipeline generator **was** checked against a pipeline that is deployed: given that
  project's config it reproduces the workflow and both manifests line for line. It assumes
  GitHub Actions, Docker Hub, ArgoCD, cert-manager and Traefik.
- Expect to adjust wording in the roles after the first real run on a second project.

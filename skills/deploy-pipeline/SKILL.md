---
name: deploy-pipeline
description: Set up a staging and production deploy pipeline for a project (merge to the staging branch deploys staging, merge to the default branch deploys production) using GitHub Actions, a container image and a GitOps repository watched by ArgoCD. Generates the workflow, the manifests for both environments and the deploy guide from one config, and opens pull requests without merging. Use when a project needs to go from a merged branch to a running environment.
argument-hint: [project folder]
disable-model-invocation: true
---

# Staging and production pipeline

You are acting as the release engineer (`${CLAUDE_PLUGIN_ROOT}/agents/release-engineer.md`:
read it, its hard limits apply to you). Project: $ARGUMENTS (default: the current folder).

The plugin's files are under `${CLAUDE_PLUGIN_ROOT}`. If that is not filled in, the plugin
root is two folders above this skill's folder (`${CLAUDE_SKILL_DIR}/../..`).

## 1. Learn how deploys work here

Read the project's `CLAUDE.md` and any `CLAUDE.md` in the folders above it: a workspace
often documents its deploy model there, and that document wins over this skill. Find a
sibling project where the same pipeline already works and read its workflow and its
manifests. Reuse its names for repository secrets, its committer identity, its ingress
class and its certificate issuer.

## 2. Ask the owner, once

- the two addresses (staging and production); never guess one;
- the two namespaces and the image name, if the convention does not settle them;
- whether the app keeps data on disk (then: one replica and a volume);
- which secrets it needs, and that staging will use test or sandbox credentials for every
  outside service;
- whether you may start Docker to build the image locally.

## 3. Make sure the image runs

If the project has no `Dockerfile`, write one
(`${CLAUDE_PLUGIN_ROOT}/templates/deploy/Dockerfile.node-single-process` and
`.dockerignore.example` are a starting point for a Node application). Build it and run it
locally with a throwaway data directory, and see the health address answer. Check that the
image holds no `.env`, no data and no keys. Do not go on until it runs.

The application needs: one health address that answers 200, settings from environment
variables only, a listen address of `0.0.0.0` in the container, and all state under one
directory.

## 4. Generate the pipeline

Write `pipeline.config.json` from
`${CLAUDE_PLUGIN_ROOT}/templates/deploy/pipeline.config.example.json` (the fields are
explained in `${CLAUDE_PLUGIN_ROOT}/templates/deploy/README.md`). Secret keys are listed by
name with a description of the value. Never put a value in it.

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/render-pipeline.mjs --config pipeline.config.json --out ./pipeline-out
```

It writes `source/` (the workflow and `docs/DEPLOY.md`, for the application's repository)
and `gitops/` (an ArgoCD Application and a manifest per environment, for the GitOps
repository). Read every file. Adapt what this project needs, then compare with the sibling
project's files and explain any difference to yourself.

## 5. Two pull requests, then stop

- In the application's repository: a branch with the workflow, the Dockerfile and
  `docs/DEPLOY.md`. Keep `pipeline.config.json` there too, so the pipeline can be
  regenerated.
- In the GitOps repository: a branch with the two Applications and the two manifests.

Open both pull requests and do not merge them. Do not create the staging branch on the
remote, change branch protection, create Secrets or run anything against the cluster
unless the owner tells you to in this session.

## 6. Hand over

Give the owner the remaining steps in order (they are in the generated `docs/DEPLOY.md`
under "One-time set-up"): repository secrets, DNS, merging the manifests, creating the
Secret in each namespace, creating and protecting the staging branch.

When the owner creates the Secrets, check them without showing a value: each key present,
the kind and length of each value, and **nothing after the value**. A `KEY=value` file with
a trailing comment or quotes puts them inside the secret; that, and live credentials on
staging, are the two mistakes to look for first when a new environment misbehaves.

## 7. After the first deploy

With the owner's go-ahead: check the health address of each environment, that staging
really uses test credentials, that the certificate is valid, and that a second deploy
replaces the first cleanly. Say plainly what has never run.

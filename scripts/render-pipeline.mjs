#!/usr/bin/env node
/**
 * Write the staging and production pipeline files for one project from a small config.
 *
 *   node scripts/render-pipeline.mjs --config pipeline.config.json --out ./pipeline-out
 *
 * It writes, under --out:
 *   source/.github/workflows/deploy.yml          for the application's repository
 *   source/docs/DEPLOY.md                        the deploy guide, same repository
 *   gitops/apps/<namespace>.yaml                 one ArgoCD Application per environment
 *   gitops/projects/<namespace>/deployment.yaml  the manifests of each environment
 *
 * Nothing is pushed, applied or committed: the files are for a person (or the release
 * engineer) to review, adapt and put in two pull requests. No secret value is ever read or
 * written: the config names the keys only.
 *
 * The config is described in templates/deploy/pipeline.config.example.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const configPath = option("config");
const outDir = option("out");
if (!configPath || !outDir) {
  console.error("usage: node scripts/render-pipeline.mjs --config pipeline.config.json --out <folder>");
  process.exit(2);
}

/* ---------- read and check the config ---------- */

const c = JSON.parse(readFileSync(resolve(configPath), "utf8"));
const problems = [];
const must = (value, what) => {
  if (value === undefined || value === null || value === "") problems.push(`${what} is missing`);
  return value;
};
must(c.project, "project");
must(c.image, "image");
must(c.sourceRepo, "sourceRepo");
must(c.gitopsRepo, "gitopsRepo");
must(c.port, "port");
must(c.healthPath, "healthPath");
must(c.environments?.staging, "environments.staging");
must(c.environments?.production, "environments.production");
if (problems.length === 0) {
  for (const [name, env] of Object.entries({ staging: c.environments.staging, production: c.environments.production })) {
    for (const key of ["branch", "host", "namespace"]) must(env[key], `environments.${name}.${key}`);
    if (env.host && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(env.host)) problems.push(`environments.${name}.host must be a bare host name such as app.example.com (got "${env.host}")`);
  }
  if (c.environments.staging.namespace === c.environments.production.namespace) problems.push("staging and production need different namespaces");
  if (c.environments.staging.branch === c.environments.production.branch) problems.push("staging and production need different branches");
  if (c.environments.staging.host === c.environments.production.host) problems.push("staging and production need different host names");
}
if (c.project && !/^[a-z0-9][a-z0-9-]*$/.test(c.project)) problems.push("project must be lower-case letters, digits and dashes");
const secretKeys = (c.secretKeys ?? []).map((key) => (typeof key === "string" ? { name: key } : key));
for (const key of secretKeys) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key.name ?? "")) problems.push(`secret key names look like STRIPE_SECRET_KEY (got "${key.name}")`);
  for (const field of ["staging", "production"]) {
    // A guard against pasting a real value where a description belongs.
    if (/(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|-----BEGIN/.test(key[field] ?? "")) {
      problems.push(`secretKeys ${key.name}.${field} looks like a real secret. Describe the value (for example "sandbox, sk_test_…"), never paste it.`);
    }
  }
}
if (problems.length) {
  console.error(`The config has problems:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const project = c.project;
const title = c.title ?? project;
const image = c.image;
const gitopsRepo = c.gitopsRepo;
const gitopsBranch = c.gitopsBranch ?? "main";
const gitopsUrl = c.gitopsSshUrl ?? `git@github.com:${gitopsRepo}.git`;
const port = Number(c.port);
const health = c.healthPath;
const stateful = c.stateful ?? null;
const secretName = c.secretName ?? `${project}-secrets`;
const publicUrlVar = c.publicUrlVar === undefined ? "PUBLIC_URL" : c.publicUrlVar;
const plainEnv = c.env ?? {};
const ingress = { className: "traefik", clusterIssuer: "letsencrypt-prod", ...(c.ingress ?? {}) };
const committer = { name: "deploy-bot", email: "deploy-bot@users.noreply.github.com", ...(c.committer ?? {}) };
const githubSecrets = { dockerUser: "DOCKERHUB_USERNAME", dockerToken: "DOCKERHUB_TOKEN", gitopsToken: "GITOPS_PAT", ...(c.githubSecrets ?? {}) };
const checks = { node: null, commands: [], ...(c.checks ?? {}) };
const inspect = c.inspectCommand ?? "kubectl -n {namespace} get pods";
const staging = { tag: "staging", replicas: 1, storage: "2Gi", memoryRequest: "256Mi", memoryLimit: "512Mi", cpuRequest: "100m", cpuLimit: "1", ...c.environments.staging };
const production = { tag: "latest", replicas: 1, storage: "5Gi", memoryRequest: "256Mi", memoryLimit: "768Mi", cpuRequest: "100m", cpuLimit: "1", ...c.environments.production };
if (stateful && (staging.replicas !== 1 || production.replicas !== 1)) {
  console.error("A stateful application (data on a volume) must run exactly one replica in each environment.");
  process.exit(1);
}

/* ---------- the workflow ---------- */

const G = (expr) => "${{ " + expr + " }}"; // a GitHub Actions expression
const isProd = `github.ref_name == '${production.branch}'`;

const deployYml = `name: Build & Deploy

# ${staging.branch} branch -> the staging environment, ${production.branch} branch -> production.
# A pull request into either branch runs the checks only: nothing is built or deployed.
# How it all fits together, and how to roll back: docs/DEPLOY.md.

on:
  push:
    branches: [${staging.branch}, ${production.branch}]
  pull_request:
    branches: [${staging.branch}, ${production.branch}]
  workflow_dispatch:

concurrency:
  # One queue per environment: two merges to the same branch deploy one after the other.
  group: deploy-${project}-${G("github.ref")}
  cancel-in-progress: false  # queue, don't skip

env:
  IMAGE: ${image}
  GITOPS_REPO: ${gitopsRepo}
  GITOPS_BRANCH: ${gitopsBranch}

jobs:
  check:
    name: Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${checks.node ? `
      - uses: actions/setup-node@v4
        with:
          node-version: ${checks.node}
          cache: npm
` : ""}
${checks.commands.length ? checks.commands.map((command) => `      - run: ${command}`).join("\n") : '      - run: echo "No checks are configured for this project. Add its type-check and tests here."'}

  build:
    name: Build & push image
    needs: check
    # Only the two deploy branches build, also when the workflow is started by hand.
    if: github.event_name != 'pull_request' && (github.ref_name == '${staging.branch}' || ${isProd})
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${G(`secrets.${githubSecrets.dockerUser}`)}
          password: ${G(`secrets.${githubSecrets.dockerToken}`)}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ${c.dockerContext ?? "."}
          file: ${c.dockerfile ?? "./Dockerfile"}
          push: true
          # The commit SHA is what gets deployed. The second tag only marks the newest build
          # of each branch: "${production.tag}" for ${production.branch}, "${staging.tag}" for ${staging.branch}.
          tags: |
            ${G("env.IMAGE")}:${G("github.sha")}
            ${G("env.IMAGE")}:${G(`${isProd} && '${production.tag}' || '${staging.tag}'`)}
          cache-from: type=gha,scope=${project}
          cache-to: type=gha,mode=max,scope=${project}

  bump-gitops:
    name: Bump image tag in gitops repo
    needs: build
    runs-on: ubuntu-latest
    env:
      # The manifest that belongs to this branch's environment.
      MANIFEST: ${G(`${isProd} && 'projects/${production.namespace}/deployment.yaml' || 'projects/${staging.namespace}/deployment.yaml'`)}
      ENVIRONMENT: ${G(`${isProd} && '${production.namespace}' || '${staging.namespace}'`)}
    steps:
      - name: Checkout gitops repo
        uses: actions/checkout@v4
        with:
          repository: ${G("env.GITOPS_REPO")}
          ref: ${G("env.GITOPS_BRANCH")}
          token: ${G(`secrets.${githubSecrets.gitopsToken}`)}
          path: gitops

      - name: Patch manifest
        working-directory: gitops
        run: |
          set -euxo pipefail
          test -f "$MANIFEST"
          # Rewrite the tag of ${image}:* to this commit.
          sed -i -E "s|(\${IMAGE}):[^[:space:]\\"]+|\\1:\${GITHUB_SHA}|g" "$MANIFEST"
          grep -q "\${IMAGE}:\${GITHUB_SHA}" "$MANIFEST"
          git diff --stat

      - name: Commit & push
        working-directory: gitops
        run: |
          set -e
          if git diff --quiet; then
            echo "No manifest change — already at $GITHUB_SHA"
            exit 0
          fi
          git config user.name  "${committer.name}"
          git config user.email "${committer.email}"
          git add "$MANIFEST"
          git commit -m "deploy(\${ENVIRONMENT}): \${GITHUB_SHA}"
          # Other projects (and the other environment) push to the same branch:
          # if one got in first, replay this one-line commit on top and try again.
          for attempt in 1 2 3 4 5; do
            if git push origin "HEAD:\${GITOPS_BRANCH}"; then
              exit 0
            fi
            sleep $((attempt * 3))
            git pull --rebase origin "\${GITOPS_BRANCH}"
          done
          echo "Could not push the tag bump after 5 attempts" >&2
          exit 1

      - name: Summary
        run: |
          echo "### Deployed \${ENVIRONMENT} @ \\\`\${GITHUB_SHA::7}\\\`" >> $GITHUB_STEP_SUMMARY
          echo "ArgoCD will sync within ~3 min. Verify: \\\`${inspect.replace("{namespace}", "${ENVIRONMENT}")}\\\`" >> $GITHUB_STEP_SUMMARY
`.replace(/\n\n\n+/g, "\n\n");

/* ---------- the manifests ---------- */

const tlsSecret = (host) => `${host.replace(/\./g, "-")}-tls`;

function application(env) {
  return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${env.namespace}
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: ${gitopsUrl}
    targetRevision: ${gitopsBranch}
    path: projects/${env.namespace}
  destination:
    server: https://kubernetes.default.svc
    namespace: ${env.namespace}
  syncPolicy:
    automated:
      prune: false
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
`;
}

function deployment(env, kind) {
  const isProduction = kind === "production";
  const url = `https://${env.host}`;
  const envLines = [];
  const plain = { ...(publicUrlVar ? { [publicUrlVar]: url } : {}), ...plainEnv, ...(env.env ?? {}) };
  if (Object.keys(plain).length) envLines.push("            # ----- not secret -----");
  for (const [name, value] of Object.entries(plain)) {
    const text = String(value);
    envLines.push(`            - name: ${name}`, `              value: ${/^[A-Za-z0-9_./-]+$/.test(text) && !/^\d+$/.test(text) ? text : JSON.stringify(text)}`);
  }
  if (secretKeys.length) envLines.push(`            # ----- secret: all from ${secretName}, key = variable name -----`);
  for (const key of secretKeys) {
    const note = isProduction ? key.productionNote : key.stagingNote;
    if (note) envLines.push(`            # ${note}`);
    envLines.push(`            - name: ${key.name}`, "              valueFrom:", "                secretKeyRef:", `                  name: ${secretName}`, `                  key: ${key.name}`);
  }
  const runAs = stateful?.runAsUser ?? c.runAsUser ?? null;

  return `# ${title} — ${isProduction ? "PRODUCTION" : "STAGING"} (${url})
# Source: ${c.sourceRepo}, branch ${env.branch}. Its deploy workflow rewrites the image tag below.
#
${stateful ? `# This application keeps its data on the volume at ${stateful.mountPath}, so it must stay at ONE
# replica with strategy Recreate: two pods must never share that volume.
#
` : ""}${secretKeys.length ? `# The Secret "${secretName}" is NOT in this repository and must never be.
# It is created by hand in this namespace (see docs/DEPLOY.md in the source repo);
# the pod waits in CreateContainerConfigError until it exists with every key below.
` : ""}apiVersion: v1
kind: Namespace
metadata:
  name: ${env.namespace}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${project}
  namespace: ${env.namespace}
  labels:
    app: ${project}
spec:
  replicas: ${env.replicas}
${stateful ? "  strategy:\n    type: Recreate\n" : ""}  selector:
    matchLabels:
      app: ${project}
  template:
    metadata:
      labels:
        app: ${project}
    spec:
${runAs ? `      securityContext:
        # The image runs as user ${runAs}${stateful ? "; fsGroup makes the volume writable for it" : ""}.
        runAsNonRoot: true
        runAsUser: ${runAs}
        runAsGroup: ${runAs}
${stateful ? `        fsGroup: ${runAs}\n        fsGroupChangePolicy: OnRootMismatch\n` : ""}` : ""}      containers:
        - name: ${project}
          image: ${image}:${env.tag}
          ports:
            - containerPort: ${port}
          securityContext:
            allowPrivilegeEscalation: false
${envLines.length ? `          env:\n${envLines.join("\n")}\n` : ""}${stateful ? `          volumeMounts:
            - name: data
              mountPath: ${stateful.mountPath}
` : ""}          startupProbe:
            httpGet:
              path: ${health}
              port: ${port}
            periodSeconds: 3
            failureThreshold: 40
          readinessProbe:
            httpGet:
              path: ${health}
              port: ${port}
            periodSeconds: 10
            timeoutSeconds: 3
          livenessProbe:
            httpGet:
              path: ${health}
              port: ${port}
            periodSeconds: 20
            timeoutSeconds: 5
            failureThreshold: 3
          resources:
            requests:
              memory: "${env.memoryRequest}"
              cpu: "${env.cpuRequest}"
            limits:
              memory: "${env.memoryLimit}"
              cpu: "${env.cpuLimit}"
${stateful ? `      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: ${project}-data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${project}-data
  namespace: ${env.namespace}
spec:
  accessModes:
    - ReadWriteOnce
  # The storage class cannot be changed after the claim is created.
  storageClassName: ${stateful.storageClass ?? "longhorn"}
  resources:
    requests:
      storage: ${env.storage}
` : ""}---
apiVersion: v1
kind: Service
metadata:
  name: ${project}
  namespace: ${env.namespace}
spec:
  selector:
    app: ${project}
  ports:
    - port: ${port}
      targetPort: ${port}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${project}
  namespace: ${env.namespace}
  annotations:
    cert-manager.io/cluster-issuer: ${ingress.clusterIssuer}
${ingress.className === "traefik" ? `    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
` : ""}spec:
  ingressClassName: ${ingress.className}
  tls:
    - hosts:
        - ${env.host}
      secretName: ${tlsSecret(env.host)}
  rules:
    - host: ${env.host}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${project}
                port:
                  number: ${port}
`;
}

/* ---------- the guide ---------- */

const secretTable = secretKeys.length
  ? `| Key | Staging | Production |\n|---|---|---|\n${secretKeys.map((key) => `| \`${key.name}\` | ${key.staging ?? "a test or sandbox value"} | ${key.production ?? "the production value"} |`).join("\n")}`
  : "";

const deployMd = `# Deploying: staging and production

| | Staging | Production |
|---|---|---|
| Branch | \`${staging.branch}\` | \`${production.branch}\` |
| Address | https://${staging.host} | https://${production.host} |
| Namespace | \`${staging.namespace}\` | \`${production.namespace}\` |
| Manifest (in \`${gitopsRepo}\`) | \`projects/${staging.namespace}/deployment.yaml\` | \`projects/${production.namespace}/deployment.yaml\` |
${stateful ? `| Data volume | ${staging.storage} | ${production.storage} |\n` : ""}
Both run the same image, \`${image}\`, tagged with the commit that built it.${stateful ? ` Each has its own
volume at \`${stateful.mountPath}\` and runs exactly one pod.` : ""}

## How a change reaches staging, then production

1. Work on a branch (\`feature/…\`, \`fix/…\`) and open a pull request into \`${staging.branch}\`.
   The workflow runs the checks on the pull request; it deploys nothing.
2. Merge it. [\`.github/workflows/deploy.yml\`](../.github/workflows/deploy.yml) then runs the
   checks again, builds the image and pushes it as \`${image}:<commit>\`, and commits
   \`deploy(${staging.namespace}): <commit>\` to \`${gitopsRepo}\`, which changes the image tag in
   the staging manifest.
3. ArgoCD notices that commit within a few minutes and replaces the pod.${stateful ? ` The old pod stops
   before the new one starts (they cannot share the volume), so expect a few seconds of
   downtime on every deploy.` : ""}
4. Try it on https://${staging.host}.
5. Open a pull request from \`${staging.branch}\` into \`${production.branch}\` and merge it. The same
   steps run for production. Production gets its own build of the \`${production.branch}\` commit,
   not the staging image.

To see what is running: \`${inspect.replace("{namespace}", staging.namespace)}\` (or the production
namespace), and \`https://<address>${health}\`.

## Rolling back

In \`${gitopsRepo}\`, revert the bump commit of the environment and push to \`${gitopsBranch}\`:

\`\`\`
git log --oneline -- projects/${production.namespace}/deployment.yaml   # find deploy(${production.namespace}): <commit>
git revert <that commit>
git push origin ${gitopsBranch}
\`\`\`

ArgoCD puts the previous image back within a few minutes. Do not use
\`kubectl rollout undo\`: ArgoCD would undo it again.
${stateful ? `
A rollback changes the code only. The data on the volume stays as the newer version left
it, so a release that changed the data layout cannot be undone this way alone.
` : ""}${secretKeys.length ? `
## The Secret in each environment

Each namespace needs one Secret called \`${secretName}\`. It is not in any repository and must
never be. The pod does not start until the Secret exists with every key.

${secretTable}

**Staging never gets live or production credentials for an outside service.** Use each
service's test or sandbox mode there.

To create it, write the \`KEY=value\` lines to a file on the machine that has cluster access,
then:

\`\`\`
kubectl -n ${staging.namespace} create secret generic ${secretName} --from-env-file=staging.env
shred -u staging.env
\`\`\`

and the same with \`-n ${production.namespace}\` and the production values. Using a file keeps
the keys out of the shell history.

**Each line is exactly \`KEY=value\` and nothing else.** Whatever follows the \`=\` becomes the
value, to the end of the line: a trailing comment, quotes or spaces all end up inside the
secret and break it. Check afterwards without showing a value:

\`\`\`
kubectl -n ${staging.namespace} get secret ${secretName} -o json \\
  | jq -r '.data | to_entries[] | "\\(.key): \\(.value | @base64d | length) characters, starts \\(.value | @base64d | .[0:8])"'
\`\`\`

After changing a Secret, restart the pod so it reads the new values:
\`kubectl -n <namespace> rollout restart deployment/${project}\`.
` : ""}
## One-time set-up, in order

1. **GitHub secrets** in \`${c.sourceRepo}\` (Settings → Secrets and variables → Actions):
   \`${githubSecrets.dockerUser}\`, \`${githubSecrets.dockerToken}\` and \`${githubSecrets.gitopsToken}\` (a token that can push to
   \`${gitopsRepo}\`).
2. **DNS**: point \`${staging.host}\` and \`${production.host}\` at the cluster's ingress. The TLS
   certificates are issued by themselves once the names resolve.
3. **Manifests**: merge the pull request in \`${gitopsRepo}\` that adds both environments.
   ArgoCD creates the namespaces.${secretKeys.length ? " The pods wait until the Secrets exist." : ""}
${secretKeys.length ? `4. **Secrets**: create \`${secretName}\` in both namespaces (above).
5. ` : "4. "}**Branches**: create \`${staging.branch}\` from \`${production.branch}\` and push it; that first push
   deploys staging. Protect both branches (a review, linear history, no force-push).
   Production deploys the first time this workflow reaches \`${production.branch}\`. If that run
   failed because an earlier step was not done yet, start it again: Actions → Build & Deploy
   → Run workflow.
${secretKeys.length ? "6" : "5"}. **Image registry**: after the first build, decide whether the \`${image}\` repository
   should be private. If it is, the cluster needs a pull secret, which these manifests do
   not have.

## Not covered yet
${stateful ? `
- **Backups of \`${stateful.mountPath}\`.** A replicated volume protects against a lost node, not against
  a bad release or a deleted volume.` : ""}
- Anything the application itself needs from outside services in each environment (webhook
  endpoints, callback addresses, allowed origins): one set per environment.
`;

/* ---------- write ---------- */

const out = resolve(outDir);
const files = {
  "source/.github/workflows/deploy.yml": deployYml,
  "source/docs/DEPLOY.md": deployMd,
  [`gitops/apps/${staging.namespace}.yaml`]: application(staging),
  [`gitops/apps/${production.namespace}.yaml`]: application(production),
  [`gitops/projects/${staging.namespace}/deployment.yaml`]: deployment(staging, "staging"),
  [`gitops/projects/${production.namespace}/deployment.yaml`]: deployment(production, "production"),
};
for (const [path, text] of Object.entries(files)) {
  const file = resolve(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${path}`);
}
console.log(`\nReview them, then: "source/" goes into ${c.sourceRepo}, "gitops/" into ${gitopsRepo}. Two pull requests; merge neither without the owner.`);

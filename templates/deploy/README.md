# The pipeline kit

`scripts/render-pipeline.mjs` writes a project's staging and production pipeline from one
small config file. It was taken from a pipeline that is running: given that project's
config it reproduces the deployed workflow and manifests line for line.

```
node scripts/render-pipeline.mjs --config pipeline.config.json --out ./pipeline-out
```

## The config

Start from `pipeline.config.example.json`.

| Field | Meaning |
|---|---|
| `project` | Short name: the Deployment, Service and container are called this. |
| `sourceRepo` | `owner/name` of the application's repository. |
| `image` | The image name without a tag, for example `my-user/my-app`. |
| `gitopsRepo`, `gitopsBranch` | The repository ArgoCD watches, and its branch (default `main`). |
| `port`, `healthPath` | Where the container listens and the address that answers 200 when it is healthy. |
| `checks.node` | Node version to set up before the checks. Leave it out for a project that is not Node. |
| `checks.commands` | The project's own checks, in order. They run on every pull request and before every build. |
| `stateful` | Present = the app keeps data on disk: one replica, `Recreate`, a persistent volume at `mountPath`. Leave it out for an app with no local state. |
| `publicUrlVar` | The environment variable that receives `https://<host>`. Set to `null` if the app does not need its own address. |
| `env` | Other plain, non-secret settings, the same in both environments. An environment can add its own under `environments.<name>.env`. |
| `secretName`, `secretKeys` | The one Secret per namespace and the keys in it. Names and descriptions only: never a value. |
| `ingress` | Ingress class and the cert-manager issuer. |
| `githubSecrets` | The names of the three repository secrets the workflow reads. |
| `committer` | Who the tag-bump commit is from. Copy it from a project that already deploys. |
| `inspectCommand` | The command printed for looking at the pods; `{namespace}` is filled in. |
| `environments` | For `staging` and `production`: `branch`, `host`, `namespace`, and optionally `storage`, `memoryLimit`, `memoryRequest`, `cpuLimit`, `cpuRequest`, `replicas`, `tag`, `env`. |

## What it assumes

GitHub Actions on GitHub-hosted runners, Docker Hub, a GitOps repository laid out as
`apps/<namespace>.yaml` and `projects/<namespace>/deployment.yaml`, ArgoCD with automated
sync, cert-manager, and Traefik by default. For anything else, generate the files and adapt
them: they are plain YAML and Markdown.

`Dockerfile.node-single-process` is an example image for a Node application that serves
its own web build from one process and keeps its data under `/data`.

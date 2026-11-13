#!/usr/bin/env node
/**
 * Run a workflow script with pretend agents, to check its control flow after an edit.
 * No model is called and nothing is changed. It prints each agent the script would start,
 * in order, and the value the script returns.
 *
 *   node scripts/dry-run.mjs workflows/run-work-round.js
 *   node scripts/dry-run.mjs workflows/run-work-round.js --args my-args.json
 *
 * The pretend QA tester reports one bug in round 1 and a clean pass in round 2; the pretend
 * checker reports one finding. So the fix paths are exercised too.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const SAMPLE_ARGS = {
  root: "/tmp/sample-project",
  pluginRoot,
  brief: "/tmp/sample-project/docs/BRIEF.md",
  branch: "feature/sample",
  areas: [
    { key: "api", role: "backend-dev", owns: "apps/api", task: "Build the API in the contract." },
    { key: "web", role: "frontend-dev", owns: "apps/web", task: "Build the screens in the contract." },
  ],
  personas: ["a new user", "a returning user"],
  what: "sample content",
  spec: "Follow the interface in docs/ARCHITECTURE.md.",
  units: [
    { key: "unit-a", owns: "src/a.ts", task: "Write unit A." },
    { key: "unit-b", owns: "src/b.ts", task: "Write unit B." },
  ],
  goal: "add a payments page",
};

/** A value that satisfies a JSON schema well enough for the scripts' own logic. */
function fake(schema, label) {
  if (!schema) return `report from ${label}`;
  if (schema.properties?.journeyPasses) {
    const firstRound = /round-1$/.test(label);
    const area = schema.properties.bugs.items.properties.area.enum[0];
    return {
      journeyPasses: !firstRound,
      summary: "pretend QA",
      verified: [],
      notVerified: [],
      bugs: firstRound ? [{ id: "B1", title: "pretend bug", area, severity: "major", steps: "s", expected: "e", actual: "a" }] : [],
    };
  }
  if (schema.properties?.findings) {
    return { samplesWorked: 12, notLookedAt: "", pattern: "", findings: [{ where: "seed 1", wrong: "w", shouldBe: "s", sure: "certain" }] };
  }
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    out[key] = prop.type === "array" ? [] : prop.type === "boolean" ? true : prop.type === "integer" ? 0 : "";
  }
  return out;
}

async function runScript(path, args, depth = 0) {
  const pad = "  ".repeat(depth);
  const source = readFileSync(path, "utf8");
  if (!/^export const meta = \{/.test(source)) throw new Error(`${path} must begin with "export const meta = {"`);
  const body = source.replace(/^export const meta/, "const meta");
  const metaMatch = /^export const meta = (\{[\s\S]*?\n\})\n/.exec(source);
  const meta = metaMatch ? new Function(`return (${metaMatch[1]})`)() : {};
  const phaseTitles = new Set((meta.phases ?? []).map((p) => p.title));
  const used = new Set();
  let count = 0;

  const agent = async (prompt, opts = {}) => {
    count++;
    if (typeof prompt !== "string" || prompt.includes("undefined")) throw new Error(`agent ${opts.label}: the prompt has "undefined" in it`);
    if (opts.phase) used.add(opts.phase);
    console.log(`${pad}agent  ${String(opts.label ?? "(no label)").padEnd(26)} ${opts.agentType ? `as ${opts.agentType}` : "role file"}  ${opts.schema ? "[structured]" : ""}`);
    return fake(opts.schema, opts.label ?? "");
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk().catch(() => null)));
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map(async (item, index) => {
        let value = item;
        try {
          for (const stage of stages) value = await stage(value, item, index);
          return value;
        } catch (error) {
          console.log(`${pad}pipeline item ${index} dropped: ${error.message}`);
          return null;
        }
      }),
    );
  const phase = (title) => {
    used.add(title);
    console.log(`${pad}phase  ${title}`);
  };
  const log = (message) => console.log(`${pad}log    ${message}`);
  const workflow = (ref, childArgs) => {
    if (depth > 0) throw new Error("workflow() cannot be nested more than one level");
    const childPath = typeof ref === "string" ? resolve(pluginRoot, "workflows", `${ref}.js`) : ref.scriptPath;
    console.log(`${pad}workflow ${childPath.replace(pluginRoot + "/", "")}`);
    return runScript(childPath, childArgs, depth + 1);
  };
  const budget = { total: null, spent: () => 0, remaining: () => Infinity };

  const result = await new AsyncFunction("args", "agent", "parallel", "pipeline", "phase", "log", "workflow", "budget", body)(args, agent, parallel, pipeline, phase, log, workflow, budget);
  for (const title of used) if (!phaseTitles.has(title)) console.log(`${pad}note   phase "${title}" is not listed in meta.phases`);
  console.log(`${pad}done   ${meta.name}: ${count} agents`);
  return result;
}

const [script, flag, argsFile] = process.argv.slice(2);
if (!script) {
  console.error("usage: node scripts/dry-run.mjs <workflow.js> [--args args.json]");
  process.exit(2);
}
const args = flag === "--args" && argsFile ? { pluginRoot, ...JSON.parse(readFileSync(argsFile, "utf8")) } : SAMPLE_ARGS;
runScript(resolve(script), args)
  .then((result) => {
    const text = JSON.stringify(result, null, 2);
    console.log(text.length > 1500 ? `${text.slice(0, 1500)}\n… (${text.length} characters)` : text);
  })
  .catch((error) => {
    console.error(`FAILED: ${error.message}`);
    process.exit(1);
  });

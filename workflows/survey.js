export const meta = {
  name: 'survey',
  description: 'Read an existing project in parallel, one surveyor per part, and return what each found. Changes nothing.',
  whenToUse: 'The first step on a project the team has not worked on before. Started by the continue-app skill, which then writes the project map from the reports.',
  phases: [
    { title: 'Survey', detail: 'one read-only surveyor per part of the project' },
  ],
}

/*
 * args:
 *   root        the project folder (absolute)
 *   pluginRoot  this plugin's folder
 * optional:
 *   parts       [{ key, look }]  what to survey; the default covers a typical web application
 *   goal        what the owner wants done next, so surveyors look hardest where it matters
 *   agentTypes  { surveyor: 'acc-team:surveyor' }
 */
const A = args || {}
for (const key of ['root', 'pluginRoot']) {
  if (!A[key]) throw new Error(`args.${key} is required`)
}
const ROOT = A.root
const PLUGIN = A.pluginRoot
const TYPE = (A.agentTypes || {}).surveyor

const PARTS = Array.isArray(A.parts) && A.parts.length ? A.parts : [
  { key: 'overview', look: 'the whole repository at a glance: purpose, stack and versions, layout, entry points, README and CLAUDE.md rules, branch and commit conventions (git log), what is deployed and how' },
  { key: 'run-and-test', look: 'how to install, start, test, type-check, lint and build. Run each command that is safe to run and report the real result, including failures that were already there. Say what the tests cover and what they do not' },
  { key: 'server-and-data', look: 'the server side: routes or handlers, the data model and migrations, authentication and who may do what, outside services and where their keys are read' },
  { key: 'interface', look: 'the user interface: screens and routing, components and styling conventions, how it talks to the server, client-side state' },
  { key: 'risks', look: 'what is dangerous to touch: production data, deploy configuration, secrets handling, generated files, code with no tests around it, dependencies far out of date, TODOs that matter' },
]

const REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'three or four sentences' },
    facts: { type: 'array', items: { type: 'string' }, description: 'one fact each, with the file (and line) that shows it' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          purpose: { type: 'string' },
          command: { type: 'string' },
          result: { type: 'string', description: 'ran and passed, ran and failed (with the error), or not run (and why)' },
        },
        required: ['purpose', 'command', 'result'],
      },
    },
    conventions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    unknowns: { type: 'array', items: { type: 'string' }, description: 'what could not be determined, and questions for the owner' },
  },
  required: ['summary', 'facts', 'commands', 'conventions', 'risks', 'unknowns'],
}

phase('Survey')
const reports = await parallel(PARTS.map((part) => () => {
  const prompt = `
You are surveying the existing project in ${ROOT} for a team that will continue it.
Read ${PLUGIN}/reference/TEAM_RULES.md first. You change nothing: no edits, no installs
outside the project, no git state changes, nothing against running services or deployments.

YOUR PART: ${part.key}
LOOK AT: ${part.look}
${A.goal ? `\nThe owner's next goal, so you know where to look hardest: ${A.goal}\n` : ''}
Cite a file (and line where it helps) for every fact. If part of what you were asked to look
at does not exist in this project, say so in one line and move on.`
  const opts = { label: `survey:${part.key}`, phase: 'Survey', schema: REPORT }
  return (TYPE
    ? agent(prompt, { ...opts, agentType: TYPE })
    : agent(`Your role is written in ${PLUGIN}/agents/surveyor.md. Read that file first and work exactly as it says.\n\n${prompt}`, opts)
  ).then((report) => ({ part: part.key, report }))
}))

const missing = PARTS.filter((part, i) => !reports[i] || !reports[i].report).map((part) => part.key)
if (missing.length) log(`No report for: ${missing.join(', ')}. The project map will have gaps there.`)

return { reports: reports.filter((r) => r && r.report), missing }

export const meta = {
  name: 'build-check-fix',
  description: 'For a list of similar units of work: one agent builds each, a different agent checks it by working samples by hand, and the builder fixes what was found',
  whenToUse: 'Bulk work made of many similar, independent pieces (content, data sets, generators, repeated modules), where the author must not be the only checker. Started by the bulk-work skill.',
  phases: [
    { title: 'Build', detail: 'one developer per unit, each inside its own files' },
    { title: 'Check', detail: 'an independent checker works samples by hand and looks at the output' },
    { title: 'Fix', detail: 'the unit developer fixes what the checker found' },
  ],
}

/*
 * args:
 *   root        the project folder (absolute)
 *   pluginRoot  this plugin's folder
 *   what        one line: what is being made
 *   spec        the instructions every builder gets: the interface, the rules, an example to copy
 *   units       [{ key, owns, task }]  owns: the files this unit may create or edit (no overlap between units)
 * optional:
 *   right       what "right" means, for the checker: the source to compare with, how many samples per unit
 *   look        how to see the output as a user would (a command that renders it), if it has a visible form
 *   builderRole default 'developer'
 *   agentTypes  { developer: 'acc-team:developer', checker: 'acc-team:checker' }
 * Units run independently: unit A can be fixed while unit B is still being built.
 * Nothing is committed: the lead reviews, runs the whole test suite and commits.
 */
const A = args || {}
for (const key of ['root', 'pluginRoot', 'what', 'spec', 'units']) {
  if (A[key] === undefined || A[key] === null || A[key] === '') throw new Error(`args.${key} is required`)
}
if (!Array.isArray(A.units) || A.units.length === 0) throw new Error('args.units must list at least one unit')
for (const unit of A.units) {
  for (const field of ['key', 'owns', 'task']) if (!unit[field]) throw new Error(`every unit needs "${field}"`)
}
const ROOT = A.root
const PLUGIN = A.pluginRoot
const TYPES = A.agentTypes || {}
const BUILDER = A.builderRole || 'developer'

const run = (role, prompt, opts) => {
  const type = TYPES[role]
  if (type) return agent(prompt, { ...opts, agentType: type })
  return agent(`Your role is written in ${PLUGIN}/agents/${role}.md. Read that file first and work exactly as it says.\n\n${prompt}`, opts)
}

const COMMON = `
You are one member of an agent team working in ${ROOT}. The owner is away: never ask questions.
Read ${PLUGIN}/reference/TEAM_RULES.md first, then ${ROOT}/CLAUDE.md if it exists.
The job: ${A.what}
Several units of this job are being worked on in this same checkout right now. Do NOT run
git add, git commit, git stash, git checkout or anything else that changes git state, and do
not edit the root manifest, the lockfile or any file outside the ones named for your unit.`

const FINDINGS = {
  type: 'object',
  properties: {
    samplesWorked: { type: 'integer' },
    notLookedAt: { type: 'string' },
    pattern: { type: 'string', description: 'one cause behind several findings, if you saw one; else empty' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          where: { type: 'string', description: 'enough to reproduce: the id, level, seed or input' },
          wrong: { type: 'string' },
          shouldBe: { type: 'string' },
          sure: { type: 'string', enum: ['certain', 'likely', 'unsure'] },
        },
        required: ['where', 'wrong', 'shouldBe', 'sure'],
      },
    },
  },
  required: ['samplesWorked', 'notLookedAt', 'pattern', 'findings'],
}

const results = await pipeline(
  A.units,
  (unit) => run(BUILDER, `${COMMON}
YOUR UNIT: ${unit.key}. You may create or edit only: ${unit.owns}
WHAT TO BUILD:
${unit.task}

RULES FOR EVERY UNIT:
${A.spec}
${A.look ? `\nYour output has a visible form. Produce it and look at it before you finish: ${A.look}\n` : ''}`,
    { label: `build:${unit.key}`, phase: 'Build' }).then((report) => ({ report })),

  (built, unit) => run('checker', `${COMMON}
You are checking unit "${unit.key}" (files: ${unit.owns}), which another agent has just built to these instructions:
${unit.task}

${A.spec}

WHAT RIGHT MEANS: ${A.right || 'the output is correct by your own working, suits the stated audience, and matches the instructions above'}
${A.look ? `See the output as a user would: ${A.look}` : ''}
You change no files. Work the samples yourself before looking at the stored answers.`,
    { label: `check:${unit.key}`, phase: 'Check', schema: FINDINGS }).then((review) => ({ ...built, review })),

  (checked, unit) => {
    const findings = checked.review ? checked.review.findings.filter((f) => f.sure !== 'unsure') : []
    if (!checked.review) log(`${unit.key}: the checker returned nothing, so this unit is UNCHECKED`)
    if (findings.length === 0) return { ...checked, fix: null }
    return run(BUILDER, `${COMMON}
YOUR UNIT: ${unit.key}. You may edit only: ${unit.owns}
An independent checker worked samples of this unit by hand and found the problems below.
For each: reproduce it, fix the cause (not just the one sample), add a test that would have
caught it, and run the tests. If a finding is mistaken, say why instead of changing the code.
${checked.review.pattern ? `The checker saw this pattern: ${checked.review.pattern}` : ''}
Findings:
${JSON.stringify(findings, null, 2)}
End with, per finding: fixed (and how you confirmed it), or not a fault (and why).`,
      { label: `fix:${unit.key}`, phase: 'Fix' }).then((fix) => ({ ...checked, fix }))
  },
)

const summary = A.units.map((unit, i) => {
  const r = results[i]
  if (!r) return { unit: unit.key, state: 'failed: no result' }
  if (!r.review) return { unit: unit.key, state: 'built, NOT checked' }
  return {
    unit: unit.key,
    state: r.review.findings.length === 0 ? 'checked, nothing found' : r.fix ? 'checked and fixed' : 'checked, only unsure findings (not acted on)',
    samplesWorked: r.review.samplesWorked,
    findings: r.review.findings.length,
    notLookedAt: r.review.notLookedAt,
  }
})
log(`${summary.filter((s) => s.state.startsWith('checked')).length} of ${A.units.length} units built and checked`)

return { summary, results }

export const meta = {
  name: 'work-round',
  description: 'Developers build their areas in parallel, an integrator joins them up, then QA tests and routes bugs back until the journey passes',
  whenToUse: 'One round of team work on a project that already has a written contract or project map: called by the new-app and continue-app skills.',
  phases: [
    { title: 'Build', detail: 'one developer per area, in parallel, each inside its own directories' },
    { title: 'Integrate', detail: 'handoffs resolved, whole repository green, real app run end to end, committed' },
    { title: 'QA', detail: 'real browser and real API; bugs routed to the owning area' },
    { title: 'Fix', detail: 'each owning developer fixes and adds a regression test' },
  ],
}

/*
 * args (all paths absolute):
 *   root          the project folder
 *   pluginRoot    this plugin's folder (the roles are read from <pluginRoot>/agents)
 *   brief         path of the brief (what to build, definition of done, limits)
 *   branch        the feature branch everyone stays on
 *   areas         [{ key, role, owns, task }]  key: short name; role: backend-dev | frontend-dev | developer;
 *                 owns: the directories this area may edit; task: what to build there
 * optional:
 *   contract      path of the contract everyone builds against (default <root>/docs/ARCHITECTURE.md)
 *   projectNotes  extra rules for everyone on this project (stack, things to leave alone)
 *   personas      who QA plays, e.g. ["a struggling Year 4", "a strong Year 11"]
 *   qaChecks      extra things QA must check on this project
 *   e2eDir        where QA keeps its tests (default <root>/e2e)
 *   findingsFile  default <root>/docs/QA_FINDINGS.md
 *   maxQaRounds   default 4; 0 skips QA
 *   push          false = commit but do not push (default true)
 *   agentTypes    { architect: 'acc-team:architect', ... } to run roles as installed agent types;
 *                 a role left out is read from its file instead
 */
const A = args || {}
const need = (key) => {
  if (A[key] === undefined || A[key] === null || A[key] === '') throw new Error(`args.${key} is required`)
  return A[key]
}
const ROOT = need('root')
const PLUGIN = need('pluginRoot')
const BRIEF = need('brief')
const BRANCH = need('branch')
const AREAS = need('areas')
if (!Array.isArray(AREAS) || AREAS.length === 0) throw new Error('args.areas must list at least one area')
for (const area of AREAS) {
  for (const field of ['key', 'role', 'owns', 'task']) {
    if (!area[field]) throw new Error(`every area needs "${field}" (area ${JSON.stringify(area.key || area)})`)
  }
}
const CONTRACT = A.contract || `${ROOT}/docs/ARCHITECTURE.md`
const RULES = `${PLUGIN}/reference/TEAM_RULES.md`
const E2E = A.e2eDir || `${ROOT}/e2e`
const FINDINGS = A.findingsFile || `${ROOT}/docs/QA_FINDINGS.md`
const MAX_ROUNDS = A.maxQaRounds === undefined ? 4 : A.maxQaRounds
const PUSH = A.push !== false
const TYPES = A.agentTypes || {}

/** Run one role: as an installed agent type when one was named, otherwise from its role file. */
const run = (role, prompt, opts) => {
  const type = TYPES[role]
  if (type) return agent(prompt, { ...opts, agentType: type })
  return agent(`Your role is written in ${PLUGIN}/agents/${role}.md. Read that file first and work exactly as it says.\n\n${prompt}`, opts)
}

const ownership = AREAS.map((a) => `- ${a.key} (${a.role}): ${a.owns}`).join('\n')

const COMMON = `
You are one member of an agent team working in ${ROOT}. The owner is away: never ask
questions, make the sensible choice and note it.

Read these first, in order:
1. ${RULES} (the team rules; they bind you)
2. ${ROOT}/CLAUDE.md if it exists (this project's own rules win over the team rules)
3. ${BRIEF} (what is being built, the definition of done, the limits)
4. ${CONTRACT} (the contract everyone builds against; follow it exactly)

Git: everyone stays on branch ${BRANCH}. Never the default branch, never a merge, never a force-push.
Who owns what in this round:
${ownership}
Requests for another area go in ${ROOT}/docs/HANDOFFS.md under that area's heading.
${A.projectNotes ? `\nOn this project:\n${A.projectNotes}\n` : ''}`

const NO_GIT = `
Other developers are editing other directories in this same checkout right now. Do NOT run
git add, git commit, git stash, git checkout or anything else that changes git state, and do
not edit the root manifest or the lockfile (team rules, section 3).`

phase('Build')
const built = await parallel(AREAS.map((area) => () =>
  run(area.role, `${COMMON}${NO_GIT}
YOUR AREA: ${area.key}. You own ${area.owns} and nothing else.
WHAT TO BUILD:
${area.task}`, { label: `build:${area.key}`, phase: 'Build' }).then((report) => ({ area: area.key, report }))))
const unfinished = AREAS.filter((area, i) => !built[i] || !built[i].report).map((area) => area.key)
if (unfinished.length) log(`Did not report back: ${unfinished.join(', ')} (the integrator covers their areas)`)

phase('Integrate')
const integration = await run('integrator', `${COMMON}
The developers above have finished in parallel without committing. Do your whole job as your
role describes: handoffs, a green repository, the real app walked end to end against the
definition of done in the brief, the README, then commit in sensible pieces to ${BRANCH}${PUSH ? ` and push it with "git push origin ${BRANCH}"` : ' (do NOT push)'}.
${unfinished.length ? `These developers did not finish, so check and complete their areas first: ${unfinished.join(', ')}.` : ''}`,
  { label: 'integrate', phase: 'Integrate' })

const QA_SCHEMA = {
  type: 'object',
  properties: {
    journeyPasses: { type: 'boolean', description: 'true only if the whole definition-of-done journey passed for every persona, seen in a real browser against the real running app' },
    summary: { type: 'string' },
    verified: { type: 'array', items: { type: 'string' }, description: 'things you personally saw working' },
    notVerified: { type: 'array', items: { type: 'string' } },
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          area: { type: 'string', enum: AREAS.map((a) => a.key) },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          steps: { type: 'string' },
          expected: { type: 'string' },
          actual: { type: 'string' },
          evidence: { type: 'string', description: 'error text, failing test name, or screenshot path' },
        },
        required: ['id', 'title', 'area', 'severity', 'steps', 'expected', 'actual'],
      },
    },
  },
  required: ['journeyPasses', 'summary', 'verified', 'notVerified', 'bugs'],
}

const personas = Array.isArray(A.personas) && A.personas.length ? A.personas : ['a first-time user who follows the happy path', 'a careless user who makes mistakes and goes back']

const qaPrompt = (round, previous) => `${COMMON}
QA round ${round}. You may add or edit files only under ${E2E} and ${FINDINGS}.
${round > 1 ? `First, if "git status" shows uncommitted changes, commit them all to ${BRANCH} with the message "fix: QA round ${round - 1} fixes" (never .env)${PUSH ? ` and push with "git push origin ${BRANCH}"` : ''}.` : ''}
Play these people, one journey each: ${personas.map((p) => `"${p}"`).join(', ')}.
Do everything your role lists under "How you test", against the definition of done in the brief.
${A.qaChecks ? `Also check, on this project:\n${A.qaChecks}` : ''}
${previous ? `These bugs were reported last round and the developers say they are fixed. Retest every one first and re-report any that still fail:\n${previous}` : ''}
Append a section for round ${round} to ${FINDINGS} and return the same findings. The "area" of each bug must be one of: ${AREAS.map((a) => a.key).join(', ')}.`

const fixPrompt = (area, bugs, round) => `${COMMON}${NO_GIT}
YOUR AREA: ${area.key}. You own ${area.owns} and nothing else. QA routed these bugs to you in round ${round}.
For each: reproduce it first, find the root cause, fix it, add a regression test, and run the
reproduction again against the running app. A bug is not fixed on reasoning alone. If the real
cause is in another area, write it in docs/HANDOFFS.md under that area and fix what you can on your side.
Bugs:
${JSON.stringify(bugs, null, 2)}
End with, per bug id: fixed (and how you confirmed it) or not fixed (and why).`

const rounds = []
let previous = ''
let last = null
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const qa = await run('qa-tester', qaPrompt(round, previous), { label: `qa:round-${round}`, phase: 'QA', schema: QA_SCHEMA })
  if (!qa) { log(`QA round ${round} returned nothing`); break }
  last = qa
  const serious = qa.bugs.filter((bug) => bug.severity !== 'minor')
  rounds.push({ round, journeyPasses: qa.journeyPasses, bugs: qa.bugs.length, serious: serious.length })
  log(`QA round ${round}: journey ${qa.journeyPasses ? 'passes' : 'fails'}, ${qa.bugs.length} bugs (${serious.length} serious)`)
  if (qa.journeyPasses && serious.length === 0) break
  if (round === MAX_ROUNDS) { log(`QA round limit reached with open bugs: they are in the result and in ${FINDINGS}`); break }
  if (qa.bugs.length === 0) { log('QA says the journey fails but listed no bugs: stopping for the lead to look'); break }
  const owners = AREAS.filter((area) => qa.bugs.some((bug) => bug.area === area.key))
  await parallel(owners.map((area) => () =>
    run(area.role, fixPrompt(area, qa.bugs.filter((bug) => bug.area === area.key), round), { label: `fix:${area.key}:round-${round}`, phase: 'Fix' })))
  previous = JSON.stringify(qa.bugs.map((bug) => ({ id: bug.id, title: bug.title, area: bug.area, steps: bug.steps, expected: bug.expected })), null, 2)
}
if (MAX_ROUNDS === 0) log('QA was skipped (maxQaRounds is 0): nothing here was tested by a tester')

return {
  builders: built.filter(Boolean),
  unfinished,
  integration,
  qaRounds: rounds,
  finalQa: last,
  // Fixes from the last fix round are uncommitted if QA did not run again after them.
  note: rounds.length && last && !(last.journeyPasses && last.bugs.every((bug) => bug.severity === 'minor'))
    ? `QA did not end clean. Open bugs are in ${FINDINGS}; check "git status" for uncommitted fixes.`
    : 'QA ended clean. Minor bugs, if any, are in the findings file.',
}

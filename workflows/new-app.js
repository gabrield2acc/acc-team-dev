export const meta = {
  name: 'new-app',
  description: 'Architect designs the contract and scaffold, then developers build in parallel, an integrator joins them up, and QA tests until the journey passes',
  whenToUse: 'Building a new application from a written brief. Started by the new-app skill, which writes the brief and the list of areas first.',
  phases: [
    { title: 'Architect', detail: 'contract, ownership table, shared types, a scaffold that runs' },
    { title: 'Team round', detail: 'build in parallel, integrate, QA and fix (the work-round workflow)' },
  ],
}

/*
 * args: everything work-round takes (root, pluginRoot, brief, branch, areas, and its options), plus
 *   decisions   optional: decisions already made that the architect must not reopen
 * The areas say who builds what; the architect turns them into the ownership table and may
 * refine the directories, but not the list of areas.
 */
const A = args || {}
for (const key of ['root', 'pluginRoot', 'brief', 'branch', 'areas']) {
  if (A[key] === undefined || A[key] === null || A[key] === '') throw new Error(`args.${key} is required`)
}
const ROOT = A.root
const PLUGIN = A.pluginRoot
const TYPES = A.agentTypes || {}
const CONTRACT = A.contract || `${ROOT}/docs/ARCHITECTURE.md`

const areaList = A.areas.map((a) => `- ${a.key} (${a.role}), owning ${a.owns}: ${a.task}`).join('\n')

const prompt = `
You are the first member of an agent team working in ${ROOT}. The owner is away: never ask
questions, make the sensible choice and note it.

Read these first, in order:
1. ${PLUGIN}/reference/TEAM_RULES.md (the team rules; they bind you)
2. ${ROOT}/CLAUDE.md if it exists (this project's own rules win over the team rules)
3. ${A.brief} (what is being built, the definition of done, the limits)

Deliver everything your role lists: ${CONTRACT}, the contract as code, a scaffold that runs,
and docs/HANDOFFS.md with one heading per area. Templates to start from, if they help:
${PLUGIN}/templates/ARCHITECTURE.md and ${PLUGIN}/templates/HANDOFFS.md.

These developers start the moment you finish, in parallel, one per area. Your ownership
table must give each of them exactly these areas, with directories that do not overlap:
${areaList}

Git: branch ${A.branch} (create it from the default branch if it does not exist). Commit the
scaffold there. Do not push.
${A.decisions ? `\nDecisions already made, not to be reopened:\n${A.decisions}\n` : ''}${A.projectNotes ? `\nOn this project:\n${A.projectNotes}\n` : ''}`

phase('Architect')
const architecture = TYPES.architect
  ? await agent(prompt, { label: 'architect', phase: 'Architect', agentType: TYPES.architect })
  : await agent(`Your role is written in ${PLUGIN}/agents/architect.md. Read that file first and work exactly as it says.\n\n${prompt}`, { label: 'architect', phase: 'Architect' })
if (!architecture) throw new Error('The architect did not finish, so there is nothing to build against.')

phase('Team round')
const round = await workflow({ scriptPath: `${PLUGIN}/workflows/work-round.js` }, { ...A, contract: CONTRACT })

return { architecture, ...round }

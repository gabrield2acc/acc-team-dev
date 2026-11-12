---
name: bulk-work
description: Produce many similar pieces of work (content, data sets, question generators, repeated modules, translations) with a build, independent check, fix pipeline, where a different agent checks each piece by working samples by hand. Use when one job splits into independent units that are too many to review one by one.
argument-hint: <what to produce>
disable-model-invocation: true
---

# Bulk work: build, check independently, fix

You are the lead. The job: $ARGUMENTS

Passing tests show that an author's code agrees with itself. For bulk work that is not
enough: every unit is checked by a second agent who works samples out by hand and looks at
the output as a user would.

The plugin's files are under `${CLAUDE_PLUGIN_ROOT}`. If that is not filled in, the plugin
root is two folders above this skill's folder (`${CLAUDE_SKILL_DIR}/../..`).

## 1. Prepare, so units cannot collide

1. **Do one unit yourself first**, end to end. It becomes the example every builder copies,
   and it shows you what the instructions must say.
2. **Fix the shared interface now**: names, ids, file layout, the registry or index the
   units plug into. Builders may not edit shared files; anything they all need to add to
   (an index, a catalogue) you add in advance or wire up afterwards.
3. **Split the work into units** with files that do not overlap. A unit is a few hours of
   one agent's work.
4. **Write down what "right" means** for the checker: the source to compare with, how many
   samples per unit, the awkward cases to try.
5. If the output has a visible form, make a command that renders one item, so builders and
   checkers can look at it.

## 2. Say what it will cost

Up to three agents per unit (build, check, fix). Tell the owner the number of units and
wait for a yes.

## 3. Run

Call the `Workflow` tool with
`scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/build-check-fix.js"` and:

```json
{
  "root": "<project folder>",
  "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
  "what": "<one line>",
  "spec": "<the rules for every unit: the interface, the example to copy, the tests each unit needs>",
  "right": "<what right means, for the checker>",
  "look": "<the command that renders one item, if there is one>",
  "units": [
    { "key": "<unit>", "owns": "<the files this unit may create or edit>", "task": "<what to build>" }
  ],
  "agentTypes": { "developer": "acc-team:developer", "checker": "acc-team:checker" }
}
```

Leave `agentTypes` out unless those agent types are in your list.

## 4. Afterwards

Nothing is committed by the workflow. You:

1. wire the units into the shared files (the registry, the index, the generated docs);
2. run the whole test suite, not just the units' own;
3. read the summary: any unit that says "NOT checked" gets checked now;
4. sample a few items from different units yourself;
5. commit and push to the feature branch.

In the report, say how many samples the checkers worked, how many findings there were, and
that nobody has reviewed every item: sampled is not the same as verified.

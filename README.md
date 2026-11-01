# Mule

Mule is an agentic framework I am building for my own use: agents, tools and
people work together in workflows that are bounded, recorded and replayable,
on a small core where almost everything else is a **plugin**: a part that
describes itself, is MCP-compatible, and is added or removed without
rebuilding the core.

**Live demo:** https://harry-ma-qiang.github.io/mule-public/ -- a read-only
"agent office" page drawn by the Mule sketch engine. One solved description
of the page, a **statement** (section 4.3), gives both the web view and the
AI text view.

Mule is meant to be:

- **an agentic workflow system**, in the spirit of LangGraph: agents, tools and
  human approvals described as workflows in plain YAML, with shared state,
  loops, fan-out, checkpoints and objective checks that decide when work is
  done;
- **a plugin-based AI harness**: a small core where tools, engines and
  capabilities are plugins;
- **a base for personal assistant agents**, in the spirit of Meta's Muse:
  agents that work for one person, hold no secrets themselves, and ask before
  doing anything risky.

This page explains the core design of Mule and of **EVC** (Engineered Vibe
Coding), the process used to build it. It explains ideas, relations and
rules that do not change. It does not give parameters, file layouts or
implementation details, because those change from release to release.

Contents:

1. [The problem](#1-the-problem)
2. [The running example: the agent office](#2-the-running-example-the-agent-office)
3. [Mule core concepts](#3-mule-core-concepts)
4. [The interface: one engine, one statement, many views](#4-the-interface-one-engine-one-statement-many-views)
5. [A real pitfall: the button on the border](#5-a-real-pitfall-the-button-on-the-border)
6. [EVC: how Mule is built](#6-evc-how-mule-is-built)
7. [How Mule and EVC fit together](#7-how-mule-and-evc-fit-together)
8. [Boundaries: what Mule and EVC are not](#8-boundaries-what-mule-and-evc-are-not)
9. [Check questions](#9-check-questions)

## 1. The problem

Picture one agent that watches market news for one person, all day and all
night. Each of these failures is ordinary in agent software today:

- The process crashes in the middle of a step. After the restart, the agent
  does the step again and sends the same message twice. Nobody can say from
  the logs which model reply led to the second send.
- A retry loop has no upper limit. It loops all night and spends the money for
  the month.
- A tool that should only read web pages can also read the model provider's
  API key, because it has the same rights as everything else.
- A second AI helps to operate the agent's web page. It reads a text version
  of the page, and that text says something different from what the person
  sees in the browser. A test passes for one of them and fails for the other.
- The software itself was written mostly by AI coding agents. A report says
  "all tests pass". Later it turns out that a number in the report was typed
  by hand, and that the check behind it never ran.

All five failures have one cause: the system trusts something that nobody
checked. Mule removes that trust while the agents work. EVC removes it while the
software is built.

## 2. The running example: the agent office

This document uses one example from start to end: the "agent office" page of
the live demo.

- The page shows four desks. Each desk is a framed box for one work lane of
  AI coding agents, with a status line and one button that opens the lane's
  page.
- In the demo, the lanes are AI development pipelines that agents drive
  outside Mule. Mule only draws the page.
- A person can use the page in a browser. An AI agent can use the same page
  through a text view. Both press the same buttons.

Section 3 asks what would change if Mule drove these lanes. Sections 4
and 5 use the page as it really is.

## 3. Mule core concepts

### 3.1 Every task becomes a bounded, checkable net

- A **spec** is a declarative task description: YAML for structure, plus a
  strict, pure expression language for conditions and values.
- A **run** is one execution of one spec. Mule loads the spec, checks it, and
  drives it. A run finishes, waits (a wait for a person can last
  without limit), or is stopped on purpose. A service run stays alive while
  something still holds a handle to it.
- Every spec, at every level of convenience, expands into one **Petri net**
  before it runs. A Petri net is a graph of **places** (where things wait),
  **transitions** (steps that fire) and **tokens** (the things that move from
  place to place).

Why a Petri net and not a loose state graph: a net is a mathematical object.
Before the run starts, the loader checks that the net is block-structured and
bounded, that every outside action is closed, and where work can run in parallel.
Deeper checkers can explore the net before the first step fires and find
dead ends, unreachable steps and conflicts. Parallel work also falls out of
the net: two transitions that touch different places can fire at the same
time.

If the office lanes ran as Mule runs, each lane would be a run, and its net
would be checked before its first step.

### 3.2 Recording what happened

- An **effect** is anything a run does to the outside world. Mule knows a
  small, fixed set of effect kinds: call a model, call a tool, ask a person or
  an AI agent, commit shared state, record a spend, and write the record
  itself.
- The **journal** is the record of truth for a run. It is append-only and
  hash-chained, and it has exactly one writer.
- The rule: every input that could change the result when the run is rebuilt (a model
  reply, a tool result, a person's answer, the clock) is written to the
  journal before it is used.
- **Replay** rebuilds a run from its journal. Resume continues a crashed run
  from the journal, so a step whose result is recorded is not done again.
- A crash can fall between the record of an intent and the record of its
  result. Then the kind of call decides. A paid call that can be repeated is
  repeated at most once, and the repeat is marked. An irreversible call is
  recorded as unknown, and the whole run pauses until a person or agent with
  the right role confirms whether it took effect.

If a lane ran as a Mule run and the machine stopped while its agent waited
for a model reply, the restart would read the journal and know which effects
had happened. The "sent twice" failure of section 1 cannot happen silently.

### 3.3 A small core; everything else is a plugin

- The **kernel** defines only meaning and interfaces: the net, the effect
  kinds, a fixed order of handlers around each effect, the loader with its
  checks, the scheduler and the single journal writer.
- Tools, model adapters, credential providers, storage, sandbox launchers,
  memory and retrieval, and the parts that draw the user interface are all
  plugins.
- Plugins never call each other directly. The kernel brokers each call, so
  each call is checked and journaled.
- The dependency direction is checked by a program: the kernel never depends
  on a plugin, and plugin names never appear in kernel code. To change the
  kernel, you must first show why a plugin cannot do the job.

### 3.4 Abilities: one algebra for what a run may touch

- An **ability** is a named permission, such as "read files under this
  directory" or "connect to this host".
- Abilities have one algebra with three parts: grants, denies and asks. The
  effective set is the grants minus the denies, and a deny always wins. An
  ask sits between allow and deny: until an approval arrives, it acts as a
  deny. Caps, where used, are an extra limit on how much of a granted ability
  a run may use.
- The engine adds no hard walls of its own. It decides what is allowed. An
  **enforcer** is a plugin (for example an operating-system sandbox) that
  makes the decision real.
- A sub-agent never has more abilities than its parent.

For the news agent of section 1: the news-reading tool gets an ability for
web reads only. It
has no ability for the credential store, so the "tool reads the key" failure
of section 1 is denied by the rules, and the enforcer blocks it in the
operating system too.

### 3.5 Bounds and spending limits

- Every loop, retry, fan-out and nested call has an upper bound in the spec.
  A spec without a bound does not load.
- A **budget** is a limit on spend in several dimensions (money, tokens,
  time, calls). Within one process, a hard budget is reserved at the maximum
  possible cost before a call starts, so a run never spends more than its
  budget. Unused reserve goes back after the call. A crash in the middle of a
  call is the known gap: section 3.2 says how many times such a call can
  repeat.

If each office lane ran as a Mule run, each would have its own budget. The
all-night loop of section 1 stops at its bound, and the journal shows where
and why.

### 3.6 Shared work in one small world

- A **session** is a group of runs that share some places, for example a
  shared inbox or a team counter.
- The **footprint** of a run is the set of shared places it reads and
  writes, worked out from the spec before it runs.
- Runs whose shared writes only merge in an order-free way (adding to a
  count, adding to a set) can run at the same time. Writes whose order
  matters (replace a value, append to a log or a message list) are ordered: a
  later run that reads what an earlier run writes, or writes the same
  order-sensitive place, waits for it.
- Conflicting runs in one session are queued in the session net in order of
  arrival.

If the four lanes were four runs in one session, they would share a board of
statuses. Adding to a shared counter would not order them; appending to a
shared log would.

### 3.7 Who acts, and how far a stolen key reaches

- A **principal** is anyone who acts: a person or an AI agent. Mule treats
  both as the same kind of principal. What a principal may do is decided by
  roles (role-based access control, **RBAC**), never by "AI or human".
- So designs say "this is the default, and this role may change it", not "the
  AI picks a default and a human decides".
- A **tenant** is one application (or a group of connected applications) with
  its own data. The design isolates tenants with three walls,
  all in place before any public site goes live:
  1. a separate browser origin per tenant (its own domain, not a path under a
     shared domain);
  2. sessions scoped to one tenant, for people and AI agents alike;
  3. a tenant id that the platform injects, with per-tenant data and
     sandboxed processes.
- Calls across tenants go only through explicit grants at the gateway.
- Agents hold no secrets. A credential is read only by the plugin or the
  outbound proxy that needs it.

Why tenants and not a long checklist of tokens and approvals: a stolen
credential cannot always be prevented. Its blast radius can be bounded to one
tenant. Public platforms that host other people's code work the same way:
one origin per site, one account per customer, one isolated process per
tenant.

### 3.8 Two tiers of users

- The **operator tier** is the interface of the system itself: every
  operation and API, shown to the staff who run it, people and AI agents
  under one RBAC.
- The **serving tier** is for the people and other systems that the
  application serves. It can be much larger and scales out on its own. It is
  a design direction, not built yet.
- The sketch interface of section 4 is the operator tier. The serving tier
  can reuse the same spec and the same statements through caches, so it does
  not need a second interface design.

### 3.9 Portable by default

Mule code is written to build and run on Linux, Windows and macOS. Platform
code is allowed only for a stated blocking or performance reason, behind a
switch, with a working fallback on the other platforms.

### 3.10 Summary of relations

| Part | Owns | Never does |
|---|---|---|
| Spec | what to do, with bounds | run code by itself |
| Kernel | meaning of the net and effects, checks, scheduling, the journal writer | depend on a plugin |
| Plugin | one capability (tool, model, storage, sandbox, drawing) | call another plugin without the kernel |
| Journal | the record of truth | change after it is written |
| Ability rules | what each run may touch | enforce it in the operating system (an enforcer does) |
| Session net | order of conflicting runs in a session | decide abilities |
| Tenant boundary | how far a stolen credential reaches | depend on who is AI and who is human |

## 4. The interface: one engine, one statement, many views

### 4.1 The problem

An operator page has at least three viewers: a person in a browser, a person
in a terminal, and an AI agent that reads text. If each view computes its own
layout, the views disagree, as in the fourth failure of section 1. Then a
test that passes in one view proves nothing about the others.

### 4.2 The principles

| Principle | Rule |
|---|---|
| Equal sight (P-EQ) | The AI and the person see the same information. There is no AI-only information and no human-only information. |
| Single engine | Only the engine computes layout, hit targets and states. No view computes geometry. |
| Integer grid | Every position and size is on an integer grid of character cells. The text view is exact, not an approximation of the web view. |
| One source | The engine paints one **cell map**: for each cell, the glyph, the node that owns it, its layer and its role (text, border, marker, fill). The text view, the terminal view and hit testing are pure serialisations of this map. |
| Rules by construction | Where possible, the solver cannot produce a bad layout. For example, children are placed inside the parent's content box, so they cannot sit on its border. Checks on the cell map are a second line. |

### 4.3 What the engine sends, and who paints it

- A **statement** is the complete, canonical description of one solved page
  for one viewer class and one state: nodes, text, hit targets, state marks
  and the actions that are allowed now. It is the only output of the engine.
- A **renderer** turns a statement into something a viewer uses: a web page,
  terminal bytes, or the text view for AI agents. A renderer is thin. It
  paints, and it sends presses back. It never computes layout and never decides what a press does.
- The **AI view** is plain text made only from the statement: the screen as
  text, a tree of nodes with short stable references and their positions,
  states and press targets, and a legend. An agent presses by reference.
- A **skin** is an appearance-only plugin in a renderer: colours, fonts,
  icons, motion. A skin may change how a node looks. It must not change what
  a node says, where it is, or what it means. If a chess board shows a piece
  as an icon, the statement still carries the piece letter, and the AI view
  still shows that letter.
- The server owns the state. A client posts a press. The server finds the
  target through the cell map, checks that it is visible, enabled and not
  covered by another layer, applies the effect, and sends the new revision.

### 4.4 One comparator for every view

A **gate** is a deterministic check that stops one named failure. Each
renderer has one small adapter that projects its output back onto the grid.
One comparator, the **equality gate**, checks that projection against
the reference text of the statement. A new renderer (for example a native
phone app) adds a renderer and an adapter, and it must pass the same
comparator. No renderer is trusted because its code looks right.

In the office: the desks, their frames and their buttons are nodes in one
statement. The browser, the terminal and the AI view are three renderers of
it, and the equality gate checks all three.

## 5. A real pitfall: the button on the border

This happened while the demo was built.

- **What was seen.** On the office page, the four desk buttons looked a little
  odd in the browser: the button text sat across the top line of the desk's
  frame. The web renderer gives text on a border cell an opaque background,
  and the theme filled the button with colour. Together they hid the frame
  line, so the layout looked deliberate.
- **The real symptom.** In the text view, the button label replaced border
  characters of the frame. The containment rule says that a child must sit
  inside its parent's content box; only the frame's own title may use the top
  edge. The buttons broke that rule.
- **Why nothing caught it.** The buttons were placed at literal grid
  positions, and the containment check for literally placed children did not
  exist yet. The web view could not catch it either, because paint covered
  the problem.
- **The fix, at the root.** The page spec moved each button into the desk's
  content box. Nobody changed the paint to hide the line better.
- **The guard.** A new deterministic rule in the equality gate: text or a
  button of another node on a frame's border cell fails. Next to it is a
  **twin**: a copy of the old, wrong layout, kept as a test input. The gate
  must fail on the twin, and it does: it flags all four buttons. If someone
  later weakens the rule, the twin starts to pass, and that pass is itself a
  failure.

Two lessons follow. First, a fix that changes only the appearance hides the
defect from people and keeps it for the AI view. Fix the layer that owns the
fact. Second, a gate without a twin can break silently. Section 6 makes both
lessons general.

## 6. EVC: how Mule is built

### 6.1 The problem

Mule is written mostly by AI coding agents. Agents are fast, and they take
the cheapest path to "done". In earlier work on this project, audits found
batch reports where tool numbers were real but some metric rows were typed by
hand, a check was cited that never ran, and samples were marked PASS by hand
although their own metrics failed. Nothing was wrong with the tools. The
process trusted a statement that nobody checked.

**EVC** (Engineered Vibe Coding) keeps the speed of AI coding and adds the
discipline of a real engineering team. Its aim is that AI-written code
reaches the standards of classic software engineering: a defined and
measured process that improves from data, complete and traceable
requirements, and verification by someone other than the author.

### 6.2 Decisions come from programs

- A gate (section 4.4) gives a **verdict**: its exit code plus a machine-readable report.
- No gate calls a language model, opens a network connection or reads the
  wall clock to decide.
- A gate that cannot decide (missing file, bad input) fails. It never passes.
- Every gate must fail on an empty output. A gate that passes an empty
  workspace is broken.
- "Done", "all pass" and "verified" from an agent are claims, not evidence.

### 6.3 Evidence

- Evidence is a file in the repository, or the exit code of a command that
  the gate tool ran itself (an argument list, no shell, no pipe).
- A verdict records the hash of every input and output. It is valid only
  while those hashes match. A verdict is a cache, not a proof: at the end of a
  batch, every gate runs again from the files.
- Every logged entry (a decision, a question, a requirement, a fact) carries
  one evidence id that resolves to its source.

### 6.4 Few gates, each with a twin

- Each gate names the real failure it prevents, one that was seen or one that
  the design makes possible. A gate that cannot name its failure is removed.
  A check that repeats another gate is not a gate.
- Each gate has twins: good examples that must pass and seeded bad examples,
  each with one defect, that must fail. A gate that lets a bad twin through
  is a bug in the gate.
- A gate that blocks honest work is also a defect in the gate, not a fault of
  the worker. Only the owner may loosen a gate.

The border rule of section 5 is a gate of this kind, and the old layout is
its twin.

### 6.5 No loss in shortening steps

- A **reducing step** makes something shorter or fewer: splitting a long
  source file, merging duplicates, summarising, generating requirements from
  a design, refactoring.
- Each reducing step is paired with a **fidelity gate**: every id that went
  in (clause, requirement, acceptance scenario, test name) is still present
  after the step, or a record says that it was merged, superseded or rejected,
  and who decided.
- A reduction decided by an AI stays open until the owner confirms it.

Example: every source file must stay under a size limit, and this rule is
paired with the rule that no feature, edge case or requirement may be dropped
to meet it. The answer to a long file is a better split, never less
function.

### 6.6 Small pieces, budgets and checkpoints

- A **unit** is the smallest piece of work that one executor finishes and one
  gate run judges: one section, one requirement file, one plan step.
- Each unit has a budget of time, tokens and attempts. After a fixed, small
  number of failed attempts, the unit is blocked and the work moves on.
- Units run in small batches, with an owner checkpoint after each batch while
  a process is new. A checkpoint is short: numbers, a sample that the tool
  picks, open owner items with options and a recommendation.

### 6.7 Separate roles

| Role | Does | Never does |
|---|---|---|
| Executor | does one unit of work inside its allowed paths | changes a gate, a fixture or the task log; declares PASS |
| Critic | finds problems, with a source quote | gives PASS or FAIL; edits outputs |
| Checker author | writes gate tools, their tests and twins, between batches | works inside a running batch; loosens anything |
| **Steward** | starts units, writes briefs, runs gates, commits work with a valid verdict, records the owner's words exactly | writes unit content; overrides a gate |
| Owner | signs rule changes, answers owner items, accepts stage exits | (no limit) |

- A role and its co-role never run in the same agent. No one judges their own
  output, and no unit may change the gate that judges it.
- Rules change only through channels: tighten between batches, loosen only by
  an owner decision.

### 6.8 The steps of a change

A change goes through eight steps, and a gate closes each one:

1. Study the design documents.
2. Write requirements and acceptance scenarios. Each requirement quotes the
   design sentence it comes from. A gap becomes a question or an explicit
   assumption, never a silent addition.
3. Check the requirements before any code exists: behaviour written as state
   tables becomes a model that a checker explores for unreachable states,
   dead ends and conflicts.
4. Write algorithm cards.
5. Design the code.
6. Write tests first, then the code.
7. Run end-to-end tests written, where possible, by someone who did not
   write the code.
8. Look back: record what escaped, and where.

### 6.9 Defaults are designed, not picked by taste

Many small decisions are not the owner's to make. The role that owns the
decision (product, analyst, architect, coder or tester) designs the default:

1. Read what the design documents and the code already say, through
   searchable maps of both.
2. Write two or three options.
3. Walk one concrete scenario through each option and write the consequence
   (a thought experiment).
4. Score each option: which requirement the scenario breaks, how many
   requirements it keeps, its size and its risk.
5. A fixed ranking picks the default: drop options that break a requirement,
   then prefer more requirements kept, then smaller, then lower risk.
6. Record the default with its references. The owner can override it.

### 6.10 Saying no, and moving on

- When a role thinks a task part or a rule is wrong, it refuses that part,
  gives the reason and an alternative.
- A refusal does not stop the work. The role takes the safest default: keep
  content rather than drop it, keep a status low rather than raise it, record
  rather than act when an action cannot be undone.
- Each refusal and default is logged for the owner.

### 6.11 Count what escaped, and keep evolving

- An **escaped defect** is a defect that a gate should have caught and did
  not. Each one records the step that should have caught it, and gets a
  tighter gate and a new twin.
- Nothing in the process is frozen. Gates, formats and roles change through
  the channels of section 6.7 when the data says they should.
- Working memory is one task file per task: goal, status, decisions, open
  questions with their defaults, and next actions. Settled decisions move to
  a long-term store of decisions with their evidence.

## 7. How Mule and EVC fit together

Mule and EVC apply one idea at two times.

| Idea | Mule (run time) | EVC (build time) |
|---|---|---|
| Decide with programs | the loader checks the net before it runs | gates give verdicts, not agents |
| Record before use | every input enters the journal first | every entry carries an evidence id |
| Bound everything | loops, retries and budgets have limits | units have budgets and a fixed, small number of attempts |
| No silent loss | replay restores the run exactly | fidelity gates keep every id |
| One source of truth | one statement for every view | files are the only truth; a verdict is a cache, run again from the files at batch close |
| Same rules for AI and people | one principal kind under RBAC | roles, not "AI or human", decide |

A second real test shows the fit. An AI agent was asked to use the demo
pages through the AI view only, pressing by reference. An audit of its tool
calls confirmed that it read nothing else. Its misses were counted and
compared with an earlier run that saw only the text screen: with the node
tree it needed fewer commands and made fewer wrong presses. The same test
found that its harness read a stale snapshot of the pages instead of the live
statement. That was a defect in the test tool, not in the engine, and it was
fixed in the tool. The method is the same as in section 5: equal sight is a
rule, a program measures it, and a failure goes to the layer that owns it.

## 8. Boundaries: what Mule and EVC are not

- Mule is not a hosted service. You run it on machines you control, and the
  journal stays with you. Analysis tools only read journals.
- Mule is not a free group chat of agents. Many agents become nets of
  agent-as-tool calls, each with no more abilities than its parent.
- Mule has no "role" or "crew" in the kernel. Role pipelines are templates
  that expand into ordinary specs.
- The Mule engine does not enforce isolation by itself. Enforcer plugins do,
  and the security story rests on tenant boundaries.
- The sketch interface is for operators. It is not the serving tier.
- EVC gates check form, not truth. A gate proves that a check ran and what it
  found. It cannot prove that an explanation is correct, so every design
  explanation still needs one review by a person or a second model.
- Neither Mule nor EVC is frozen. Both change through recorded, checked
  steps.

## 9. Check questions

1. On the office page, a designer wants the desk buttons in the web view to
   have rounded corners and a soft shadow. Which part may make this change,
   and what must stay the same?
2. Suppose an office lane ran as a Mule run, and its agent crashed after a
   model reply arrived. After the restart, why does it not call the model
   again for that step?
3. A reviewer proposes a new gate: "a language model reads the diff and says
   whether the change is safe". Why does EVC reject this as a gate, and where
   can such a review still be used?
4. An AI executor splits a long source file and, in the process, merges two
   error cases into one. The size gate passes. Which gate should catch the
   loss, and what does it need to pass?
5. Someone suggests a special, more compact text view that only AI agents
   receive. Which principle does this break, and when could it be allowed?

### Answers

<details>
<summary>1. Rounded buttons in the web view</summary>

A skin in the web renderer may make the change, because it is appearance
only. The statement, the AI view and the cell map stay the same: the button
keeps its text, position, size and press target. The equality gate must still
pass after the change (section 4.3, section 4.4).
</details>

<details>
<summary>2. No second model call after a crash</summary>

The model reply was written to the journal before it was used. Resume
rebuilds the run from the journal, sees that the call effect for that step is
complete, and uses the recorded reply (section 3.2).
</details>

<details>
<summary>3. An LLM-judged gate</summary>

A gate must be deterministic: no language model, network or wall clock in a
verdict, and it must fail when it cannot decide. A model review can still run
as a critic: it writes findings with source quotes, and it gives no PASS or
FAIL (section 6.2, section 6.7).
</details>

<details>
<summary>4. A merge hidden in a file split</summary>

The fidelity gate paired with the split. Every error case and test name that
went in must still be present after the split, or a reduction record must
name the merge and who decided it. A merge decided by the AI stays open until
the owner confirms it (section 6.5).
</details>

<details>
<summary>5. An AI-only compact view</summary>

A compact format by itself does not break equal sight (P-EQ), if it is a
pure serialisation of the same statement, with no more and no less
information than people get. It breaks equal sight when it gives the AI
information that people cannot see (section 4.2, section 4.3).
</details>

## Status

This is an early, personal project. The source code is not published yet: I
have not had time to audit it for mistakes or for sensitive data committed by
accident, and I do not expect the project to draw attention any time soon. I
may publish the full source under the MIT license in the future; until then
the released artifacts are free to use under the Mule Binary License (see
LICENSE).

If you are curious, feel free to download a release and try it.

## Releases

Binaries, libraries and scripts are published on the GitHub Releases page.
Check each download against its published SHA-256 checksum (and signature)
before running it. Mule runs with your user's permissions, so try it in a VM
or container first.

## License

Released artifacts: Mule Binary License 1.0. Documentation under docs/:
CC BY 4.0. Third-party components are listed in THIRD-PARTY-LICENSES inside
each release.

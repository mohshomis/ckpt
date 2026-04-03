# ckpt

Automatic checkpoints for AI coding sessions. Per-step undo, branching, and restore — on top of git.

```bash
ckpt watch     # start watching — auto-snapshots every AI change
# ... let Kiro / Cursor / Claude Code / Codex do its thing ...
ckpt steps     # see what happened, step by step
ckpt restore 3 # go back to step 3
ckpt end       # squash into one clean git commit
```

## The problem

AI agents edit your code in rapid bursts — 5, 10, 20 files at once. When something breaks:

- **Undo everything** (Kiro/Cursor revert) — lose all the good changes too
- **Manually figure out** which change broke things — painful and slow

No per-step undo. No timeline. No way to try a different approach without losing the first one.

### How AI agents handle errors today (and why it's wasteful)

When an AI agent breaks something, here's what actually happens:

1. The agent notices the error (or you tell it)
2. It re-reads the files it already wrote to understand the current state
3. It reasons about what went wrong — burning tokens on analysis
4. It rewrites the files — often re-generating code it already had right
5. If the fix doesn't work, repeat steps 2-4 again. And again.

Every cycle costs tokens, time, and context window. A simple revert that should take milliseconds instead takes 30-60 seconds and hundreds of tokens as the agent manually reconstructs what it already had.

With ckpt: `ckpt restore 3` — instant rollback to the last good state. Zero tokens. Zero re-reading. Zero re-writing.

## "But my IDE already has checkpoints"

Yes. Cursor has timeline. Kiro has revert. Windsurf has checkpoints. Here's what ckpt does differently:

### 1. The AI agent can operate it — not just you

IDE checkpoints are buttons in a UI. The human clicks "revert." The AI agent can't.

With ckpt, the agent itself runs `ckpt restore 3`. It becomes self-correcting — it can checkpoint its own work, detect when something broke, roll back, and try a different approach. No human in the loop. No IDE UI needed.

This is the core difference. IDE checkpoints are a human safety net. ckpt is an AI capability.

### 2. Terminal agents have nothing

Claude Code, Codex, Aider, and any agent running in a terminal have zero checkpoint support. No UI, no revert button, nothing. When they break something, they brute-force fix it by re-reading and rewriting — slow, expensive, and often makes things worse.

ckpt is the only checkpoint system that works for terminal-based agents.

### 3. Branching — try multiple approaches

No IDE has this. `ckpt try approach-a -r 2` saves the current work, goes back to step 2, and lets the agent try a completely different approach. Then `ckpt trydiff approach-a` compares the two. The agent (or you) picks the better one.

IDEs give you undo. ckpt gives you branching exploration.

### 4. Persistent history

IDE checkpoints disappear when you close the session or the IDE. `ckpt log` keeps every session permanently. Weeks later you can see exactly what the agent did, step by step.

### 5. Works everywhere

IDE checkpoints only work inside that IDE. ckpt works in any terminal, any CI pipeline, any environment. It's just git.

| Feature | IDE checkpoints | ckpt |
|---------|----------------|------|
| AI agent can use it | ✗ | ✓ |
| Terminal agents (Codex, Aider, Claude Code) | ✗ | ✓ |
| Branch & compare approaches | ✗ | ✓ |
| Persistent history | ✗ | ✓ |
| Works outside IDE | ✗ | ✓ |
| Step tagging | ✗ | ✓ |
| Auto-snapshot | ✓ | ✓ |
| Per-step restore | ✓ | ✓ |

## What happens when AI agents use ckpt

ckpt is a CLI. Every AI coding agent can already run shell commands. No plugins, no integrations, no MCP servers. Just tell the agent to use it.

Add this to your prompt or system instructions:

> Run `ckpt watch` in the background before starting work. It auto-snapshots every change you make. If something breaks, run `ckpt restore <step>` instead of manually rewriting. To try a different approach, run `ckpt try <name> -r <step>`. When done, run `ckpt end`.
>
> For richer snapshots with reasoning, use `ckpt snap "why you made this change"` after each logical step instead of relying on auto-snapshots.

Here's what changes:

### Faster error recovery

Without ckpt: agent breaks something → re-reads files → reasons about the error → rewrites the fix → maybe breaks it again → repeat. 30-60 seconds per cycle.

With ckpt: `ckpt restore 3` → back to the last good state in milliseconds. Try a different approach immediately.

### Cheaper sessions

Every time an agent re-reads and rewrites files to fix a mistake, that's tokens you're paying for. A typical error-fix cycle costs 500-2000 tokens just to get back to where you were. ckpt eliminates that entire cost — restore is free.

### Better results through exploration

Without ckpt, agents commit to one approach and push forward. If it doesn't work, they patch on top of patches until the code is a mess.

With ckpt, an agent can:
1. Try approach A → `ckpt snap "approach A: class-based"`
2. Hit a wall → `ckpt try approach-a -r 1` (save A, go back)
3. Try approach B → `ckpt snap "approach B: hooks-based"`
4. Compare → `ckpt trydiff approach-a`
5. Pick the better one

This is how good developers work. ckpt gives AI agents the same workflow.

### Cleaner context windows

When an agent manually reverts by rewriting, it fills the context window with "oops, let me fix that" back-and-forth. With ckpt, a failed approach is `ckpt restore 3` — one line instead of 20 messages of debugging. The context stays clean for actual work.

## Works with any AI agent

| Agent | Works? | How |
|-------|--------|-----|
| Kiro | ✓ | Runs shell commands natively |
| Cursor | ✓ | Runs shell commands natively |
| Claude Code | ✓ | Runs shell commands natively |
| OpenAI Codex | ✓ | Runs shell commands natively |
| GitHub Copilot | ✓ | Via terminal |
| Windsurf | ✓ | Runs shell commands natively |
| Aider | ✓ | Runs shell commands natively |
| Any human | ✓ | It's a CLI |

## What ckpt does

ckpt watches your project while an AI agent works. Every time the agent pauses, ckpt takes a snapshot. You get a timeline of every step, and you can restore to any point.

It's just git under the hood — hidden branch, real commits, squash when done.

## Install

```bash
npm install -g @mohshomis/ckpt
```

## Usage

### Auto mode (recommended)

```bash
ckpt watch
```

That's it. Let your AI agent work. ckpt snapshots automatically.

### Manual mode

```bash
ckpt start
ckpt snap "chose HS256 over RS256 because this is a monolith"
ckpt snap "updated tests — old ones used session cookies"
ckpt end -m "refactored auth to JWT"
```

### Restore

```bash
ckpt restore 5              # go back to step 5
ckpt restore --last-good    # go back to last step tagged "good"
ckpt restore --last working # go back to last step tagged "working"
```

### Tag steps

```bash
ckpt tag 3 good        # mark step 3 as good
ckpt tag 5 broken      # mark step 5 as broken
ckpt tag 2 experiment  # or any custom tag
```

### Try multiple approaches

```bash
# AI tries approach A, gets to step 5
ckpt try approach-a -r 2    # save as branch, go back to step 2

# AI tries approach B from step 2
ckpt snap "approach B: used hooks instead of HOCs"

# Compare the two approaches
ckpt trydiff approach-a

# List all experiments
ckpt tries
```

### Range diff

```bash
ckpt diff 3       # what changed at step 3
ckpt diff 2 7     # everything that changed between step 2 and step 7
```

### Session history

```bash
ckpt log                      # list all past sessions
ckpt log --detail abc123      # see full step history for a past session
```

### End a session

```bash
ckpt end -m "built auth system"  # squash into one clean commit
ckpt end --discard               # throw away everything
```

## All commands

| Command | What it does |
|---------|-------------|
| `ckpt watch` | Auto-snapshot file changes |
| `ckpt start` | Start a session manually |
| `ckpt snap <msg>` | Manual snapshot with a reason |
| `ckpt steps` | List all snapshots |
| `ckpt diff <step> [step]` | Diff for one step or between two |
| `ckpt why <step>` | Show why a step was made |
| `ckpt tag <step> <tag>` | Tag a step (good, broken, etc.) |
| `ckpt restore [step]` | Go back to a step |
| `ckpt restore --last-good` | Go back to last "good" step |
| `ckpt try <name> [-r step]` | Branch to try a different approach |
| `ckpt trydiff <name>` | Compare with an experiment branch |
| `ckpt tries` | List experiment branches |
| `ckpt end` | Squash into one commit |
| `ckpt log` | Show all past sessions |
| `ckpt status` | Current session info |

## How it works

1. `ckpt start` creates a hidden branch: `ckpt/session/<id>`
2. Each snapshot = a real git commit on that branch
3. `ckpt restore` = `git reset --hard` to that commit
4. `ckpt try` = `git branch` at current HEAD
5. `ckpt end` = `git merge --squash` back to your branch
6. Session history saved to `.ckpt/history/`

No database. No new format. Just git.

## Smart auto-labels

In watch mode, ckpt auto-categorizes changes:

```
✓ Step 1  [components] created Button.tsx, Modal.tsx
✓ Step 2  [tests] modified Button.test.tsx
✓ Step 3  [config] modified package.json
✓ Step 4  [styles] modified globals.css
```

## License

MIT

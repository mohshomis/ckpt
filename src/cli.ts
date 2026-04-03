#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import * as core from './core.js';
import { startWatch } from './watch.js';

const program = new Command();

program
  .name('ckpt')
  .description('Automatic checkpoints for AI coding sessions. Per-step undo on top of git.')
  .version('0.1.0')
  .option('-C, --path <dir>', 'Run as if ckpt was started in <dir>');

function getCwd(): string {
  const opts = program.opts();
  return opts.path ? path.resolve(opts.path) : process.cwd();
}

// ── watch ─────────────────────────────────────────────────────────────────
program
  .command('watch')
  .description('Auto-snapshot file changes — just run this and let the AI work')
  .option('-d, --debounce <ms>', 'Quiet period before snapshotting (ms)', '2000')
  .action((opts) => {
    startWatch(getCwd(), parseInt(opts.debounce));
  });

// ── start ─────────────────────────────────────────────────────────────────
program
  .command('start')
  .description('Start a session manually (watch does this automatically)')
  .action(() => {
    try {
      const session = core.startSession(getCwd());
      console.log(`\n⚡ Session started: ${session.id}`);
      console.log(`   Branch: ${session.branch}\n`);
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── snap ──────────────────────────────────────────────────────────────────
program
  .command('snap <message>')
  .description('Manual snapshot with a reason')
  .action((message: string) => {
    try {
      const snapshot = core.snap(getCwd(), message);
      if (snapshot) {
        console.log(`\n✓ Step ${snapshot.id}: ${snapshot.message}`);
        console.log(`  ${snapshot.hash} | ${snapshot.filesChanged.length} files | +${snapshot.additions} -${snapshot.deletions}\n`);
      } else {
        console.log('Nothing to snapshot — no changes.');
      }
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── steps ─────────────────────────────────────────────────────────────────
program
  .command('steps')
  .description('List all snapshots in the current session')
  .action(() => {
    try {
      const snapshots = core.steps(getCwd());
      if (snapshots.length === 0) {
        console.log('\nNo snapshots yet.\n');
        return;
      }
      console.log(`\n  Steps (${snapshots.length}):\n`);
      for (const s of snapshots) {
        const time = new Date(s.timestamp).toLocaleTimeString();
        const tag = s.tag ? ` [${s.tag}]` : '';
        console.log(`  ${s.id}  ${s.hash}  ${time}  +${s.additions} -${s.deletions}  ${s.message}${tag}`);
      }
      console.log();
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── diff ──────────────────────────────────────────────────────────────────
program
  .command('diff <from> [to]')
  .description('Show diff for a step, or between two steps (ckpt diff 2 7)')
  .action((from: string, to?: string) => {
    try {
      console.log(core.diff(getCwd(), parseInt(from), to ? parseInt(to) : undefined));
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── why ───────────────────────────────────────────────────────────────────
program
  .command('why <step>')
  .description('Show why a step was made')
  .action((step: string) => {
    try {
      const info = core.why(getCwd(), parseInt(step));
      const tag = info.tag ? ` [${info.tag}]` : '';
      console.log(`\n  Step ${step}: "${info.message}"${tag}\n`);
      console.log(`  Files: ${info.files.join(', ')}\n`);
      console.log(info.diff);
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── tag ───────────────────────────────────────────────────────────────────
program
  .command('tag <step> <tag>')
  .description('Tag a step (good, broken, experiment, or any custom tag)')
  .action((step: string, tag: string) => {
    try {
      core.tagStep(getCwd(), parseInt(step), tag);
      console.log(`\n✓ Step ${step} tagged as "${tag}".\n`);
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── restore ───────────────────────────────────────────────────────────────
program
  .command('restore [step]')
  .description('Go back to a step, or --last-good to restore last "good" tagged step')
  .option('--last-good', 'Restore to the last step tagged "good"')
  .option('--last <tag>', 'Restore to the last step with this tag')
  .action((step: string | undefined, opts) => {
    try {
      if (opts.lastGood) {
        const id = core.restoreToTag(getCwd(), 'good');
        console.log(`\n✓ Restored to step ${id} (last "good").\n`);
      } else if (opts.last) {
        const id = core.restoreToTag(getCwd(), opts.last);
        console.log(`\n✓ Restored to step ${id} (last "${opts.last}").\n`);
      } else if (step) {
        core.restore(getCwd(), parseInt(step));
        console.log(`\n✓ Restored to step ${step}.\n`);
      } else {
        console.error('✗ Provide a step number, --last-good, or --last <tag>.');
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── try ───────────────────────────────────────────────────────────────────
program
  .command('try <name>')
  .description('Save current progress as a named branch, optionally go back to try another approach')
  .option('-r, --restore <step>', 'After branching, restore to this step to try a different approach')
  .action((name: string, opts) => {
    try {
      const restoreTo = opts.restore ? parseInt(opts.restore) : undefined;
      const branch = core.branchSession(getCwd(), name, restoreTo);
      console.log(`\n✓ Saved as ${branch}`);
      if (restoreTo) console.log(`  Restored to step ${restoreTo} — try a different approach.`);
      console.log(`  Compare later with: ckpt trydiff ${name}\n`);
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── trydiff ───────────────────────────────────────────────────────────────
program
  .command('trydiff <name>')
  .description('Compare current state with a named experiment branch')
  .action((name: string) => {
    try {
      console.log(core.branchDiff(getCwd(), name));
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── tries ─────────────────────────────────────────────────────────────────
program
  .command('tries')
  .description('List all named experiment branches')
  .action(() => {
    try {
      const branches = core.listBranches(getCwd());
      if (branches.length === 0) {
        console.log('\nNo experiment branches. Use "ckpt try <name>" to create one.\n');
        return;
      }
      console.log(`\n  Experiments (${branches.length}):\n`);
      for (const b of branches) console.log(`  ${b}`);
      console.log();
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── end ───────────────────────────────────────────────────────────────────
program
  .command('end')
  .description('End session — squash all steps into one clean commit')
  .option('-m, --message <msg>', 'Commit message')
  .option('--discard', 'Throw away all changes instead of committing')
  .action((opts) => {
    try {
      const result = core.endSession(getCwd(), opts.message, opts.discard);
      console.log(`\n✓ ${result}\n`);
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

// ── status ────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show current session info')
  .action(() => {
    const session = core.status(getCwd());
    if (!session) {
      console.log('\nNo active session. Run "ckpt watch" to start.\n');
      return;
    }
    console.log(`\n  Session: ${session.id}`);
    console.log(`  Branch:  ${session.branch}`);
    console.log(`  Base:    ${session.originalBranch}`);
    console.log(`  Steps:   ${session.snapshots.length}`);
    console.log(`  Started: ${new Date(session.startedAt).toLocaleString()}\n`);
  });

// ── log ───────────────────────────────────────────────────────────────────
program
  .command('log')
  .description('Show history of all past sessions')
  .option('--detail <id>', 'Show full detail for a specific past session')
  .action((opts) => {
    try {
      if (opts.detail) {
        const s = core.logDetail(getCwd(), opts.detail);
        const st = s.discarded ? '(discarded)' : `→ ${s.commitHash}`;
        console.log(`\n  Session ${s.id} ${st}`);
        console.log(`  Branch:  ${s.originalBranch}`);
        console.log(`  Started: ${new Date(s.startedAt).toLocaleString()}`);
        console.log(`  Ended:   ${new Date(s.endedAt).toLocaleString()}`);
        console.log(`  Steps:   ${s.snapshots.length}\n`);
        for (const snap of s.snapshots) {
          const time = new Date(snap.timestamp).toLocaleTimeString();
          const tag = snap.tag ? ` [${snap.tag}]` : '';
          console.log(`  ${snap.id}  ${snap.hash}  ${time}  +${snap.additions} -${snap.deletions}  ${snap.message}${tag}`);
        }
        console.log();
      } else {
        const sessions = core.log(getCwd());
        if (sessions.length === 0) { console.log('\nNo session history yet.\n'); return; }
        console.log(`\n  Session history (${sessions.length}):\n`);
        for (const s of sessions) {
          const date = new Date(s.startedAt).toLocaleDateString();
          const time = new Date(s.startedAt).toLocaleTimeString();
          const st = s.discarded ? 'discarded' : `→ ${s.commitHash}`;
          console.log(`  ${s.id}  ${date} ${time}  ${s.snapshots.length} steps  ${st}`);
        }
        console.log(`\n  Run "ckpt log --detail <id>" for full step history.\n`);
      }
    } catch (e: any) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  });

program.parse();

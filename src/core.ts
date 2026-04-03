/**
 * ckpt core — automatic checkpoints for AI coding sessions, on top of git.
 *
 * Uses a hidden branch (ckpt/session/<id>) to store lightweight snapshots.
 * Each snapshot is a real git commit on that branch, so all git tooling works.
 * When you're done, squash into a single commit on your real branch.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type StepTag = 'good' | 'broken' | 'experiment' | string;

export interface Snapshot {
  id: number;
  hash: string;
  timestamp: string;
  message: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  tag: StepTag | null;
}

export interface Session {
  id: string;
  branch: string;
  originalBranch: string;
  startedAt: string;
  snapshots: Snapshot[];
}

export interface ArchivedSession {
  id: string;
  originalBranch: string;
  startedAt: string;
  endedAt: string;
  commitHash: string | null;
  discarded: boolean;
  snapshots: Snapshot[];
}

const CKPT_DIR = '.ckpt';
const SESSION_FILE = 'session.json';
const HISTORY_DIR = 'history';

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function gitSafe(cmd: string, cwd: string): string | null {
  try {
    return git(cmd, cwd);
  } catch {
    return null;
  }
}

function ensureGitRepo(cwd: string): void {
  if (!gitSafe('rev-parse --git-dir', cwd)) {
    throw new Error('Not a git repository. Run "git init" first.');
  }
}

function sessionPath(cwd: string): string {
  return path.join(cwd, CKPT_DIR, SESSION_FILE);
}

function historyDir(cwd: string): string {
  return path.join(cwd, CKPT_DIR, HISTORY_DIR);
}

function loadSession(cwd: string): Session | null {
  const p = sessionPath(cwd);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Session;
}

function saveSession(cwd: string, session: Session): void {
  const dir = path.join(cwd, CKPT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath(cwd), JSON.stringify(session, null, 2), 'utf8');
}

function ensureCkptIgnored(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (!gitignore.includes('.ckpt')) {
    fs.appendFileSync(gitignorePath, '\n.ckpt/\n');
  }
}

function archiveSession(cwd: string, session: Session, commitHash: string | null, discarded: boolean): void {
  const dir = historyDir(cwd);
  fs.mkdirSync(dir, { recursive: true });

  const archived: ArchivedSession = {
    id: session.id,
    originalBranch: session.originalBranch,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    commitHash,
    discarded,
    snapshots: session.snapshots,
  };

  fs.writeFileSync(path.join(dir, `${session.id}.json`), JSON.stringify(archived, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────

export function startSession(cwd: string): Session {
  ensureGitRepo(cwd);

  const existing = loadSession(cwd);
  if (existing) {
    throw new Error(`Session already active (${existing.id}). Run "ckpt end" or "ckpt end --discard" first.`);
  }

  // If repo has no commits yet, create an initial one
  if (!gitSafe('rev-parse HEAD', cwd)) {
    git('commit --allow-empty -m "initial commit"', cwd);
  }

  const status = git('status --porcelain', cwd);
  if (status) {
    git('stash push -m "ckpt: auto-stash before session"', cwd);
  }

  const originalBranch = git('rev-parse --abbrev-ref HEAD', cwd);
  const sessionId = randomUUID().slice(0, 8);
  const branchName = `ckpt/session/${sessionId}`;

  git(`checkout -b ${branchName}`, cwd);

  if (status) {
    gitSafe('stash pop', cwd);
  }

  const session: Session = {
    id: sessionId,
    branch: branchName,
    originalBranch,
    startedAt: new Date().toISOString(),
    snapshots: [],
  };

  ensureCkptIgnored(cwd);
  saveSession(cwd, session);
  return session;
}

export function snap(cwd: string, message: string): Snapshot | null {
  ensureGitRepo(cwd);

  const session = loadSession(cwd);
  if (!session) {
    throw new Error('No active session. Run "ckpt start" first.');
  }

  git('add -A', cwd);

  const status = git('status --porcelain', cwd);
  if (!status) return null;

  const diffFiles = gitSafe('diff --cached --name-only', cwd) ?? '';
  const filesChanged = diffFiles.split('\n').filter(Boolean);

  const numstat = gitSafe('diff --cached --numstat', cwd) ?? '';
  let additions = 0;
  let deletions = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [add, del] = line.split('\t');
    additions += parseInt(add) || 0;
    deletions += parseInt(del) || 0;
  }

  const stepNum = session.snapshots.length + 1;
  const commitMsg = `ckpt[${stepNum}]: ${message}`;
  git(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);

  const hash = git('rev-parse --short HEAD', cwd);

  const snapshot: Snapshot = {
    id: stepNum,
    hash,
    timestamp: new Date().toISOString(),
    message,
    filesChanged,
    additions,
    deletions,
    tag: null,
  };

  session.snapshots.push(snapshot);
  saveSession(cwd, session);
  return snapshot;
}

export function steps(cwd: string): Snapshot[] {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session. Run "ckpt start" first.');
  return session.snapshots;
}

export function diff(cwd: string, fromStep: number, toStep?: number): string {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  if (toStep !== undefined) {
    const from = session.snapshots.find((s) => s.id === fromStep);
    const to = session.snapshots.find((s) => s.id === toStep);
    if (!from) throw new Error(`Step ${fromStep} not found.`);
    if (!to) throw new Error(`Step ${toStep} not found.`);
    return git(`diff ${from.hash} ${to.hash}`, cwd);
  }

  const snapshot = session.snapshots.find((s) => s.id === fromStep);
  if (!snapshot) throw new Error(`Step ${fromStep} not found.`);
  return git(`diff ${snapshot.hash}~1 ${snapshot.hash}`, cwd);
}

export function why(cwd: string, stepId: number): { message: string; diff: string; files: string[]; tag: StepTag | null } {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const snapshot = session.snapshots.find((s) => s.id === stepId);
  if (!snapshot) throw new Error(`Step ${stepId} not found.`);

  const d = git(`diff ${snapshot.hash}~1 ${snapshot.hash} --stat`, cwd);
  return { message: snapshot.message, diff: d, files: snapshot.filesChanged, tag: snapshot.tag };
}

export function restore(cwd: string, stepId: number): void {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const snapshot = session.snapshots.find((s) => s.id === stepId);
  if (!snapshot) throw new Error(`Step ${stepId} not found.`);

  git(`reset --hard ${snapshot.hash}`, cwd);
  session.snapshots = session.snapshots.filter((s) => s.id <= stepId);
  saveSession(cwd, session);
}

export function restoreToTag(cwd: string, tag: StepTag = 'good'): number {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const tagged = session.snapshots.filter((s) => s.tag === tag);
  if (tagged.length === 0) throw new Error(`No steps tagged "${tag}".`);

  const last = tagged[tagged.length - 1];
  restore(cwd, last.id);
  return last.id;
}

export function tagStep(cwd: string, stepId: number, tag: StepTag): void {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const snapshot = session.snapshots.find((s) => s.id === stepId);
  if (!snapshot) throw new Error(`Step ${stepId} not found.`);

  snapshot.tag = tag;
  saveSession(cwd, session);
}

export function branchSession(cwd: string, name: string, restoreToStep?: number): string {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const branchName = `ckpt/try/${name}`;
  git(`branch ${branchName}`, cwd);

  if (restoreToStep !== undefined) {
    restore(cwd, restoreToStep);
  }

  return branchName;
}

export function branchDiff(cwd: string, name: string): string {
  return git(`diff HEAD ckpt/try/${name}`, cwd);
}

export function listBranches(cwd: string): string[] {
  const raw = gitSafe('branch --list "ckpt/try/*"', cwd) ?? '';
  return raw.split('\n').map((b) => b.trim()).filter(Boolean);
}

export function endSession(cwd: string, commitMessage?: string, discard = false): string {
  const session = loadSession(cwd);
  if (!session) throw new Error('No active session.');

  const snapshotCount = session.snapshots.length;

  if (discard || snapshotCount === 0) {
    git(`checkout ${session.originalBranch}`, cwd);
    gitSafe(`branch -D ${session.branch}`, cwd);
    archiveSession(cwd, session, null, true);
    cleanup(cwd);
    return discard ? 'Session discarded. All changes dropped.' : 'Session ended with no changes.';
  }

  const msg = commitMessage ?? session.snapshots.map((s) => `- ${s.message}`).join('\n');

  git(`checkout ${session.originalBranch}`, cwd);
  git(`merge --squash ${session.branch}`, cwd);
  git(`commit -m "${msg.replace(/"/g, '\\"')}"`, cwd);

  const commitHash = git('rev-parse --short HEAD', cwd);

  gitSafe(`branch -D ${session.branch}`, cwd);
  for (const b of listBranches(cwd)) {
    gitSafe(`branch -D ${b}`, cwd);
  }

  archiveSession(cwd, session, commitHash, false);
  cleanup(cwd);

  return `Committed ${snapshotCount} steps as one commit on ${session.originalBranch}.`;
}

export function status(cwd: string): Session | null {
  return loadSession(cwd);
}

// ── History ───────────────────────────────────────────────────────────────

export function log(cwd: string): ArchivedSession[] {
  const dir = historyDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ArchivedSession)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function logDetail(cwd: string, sessionId: string): ArchivedSession {
  const filePath = path.join(historyDir(cwd), `${sessionId}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Session "${sessionId}" not found in history.`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ArchivedSession;
}

function cleanup(cwd: string): void {
  const p = sessionPath(cwd);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

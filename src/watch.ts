/**
 * ckpt watch — auto-snapshot mode.
 *
 * Watches the project for file changes. After a 2-second quiet period
 * (no new changes), it auto-snapshots with a smart description.
 * Zero friction — just run "ckpt watch" and forget about it.
 */

import chokidar from 'chokidar';
import path from 'path';
import * as core from './core.js';

interface FileEvent {
  type: 'add' | 'change' | 'unlink';
  file: string;
}

export function startWatch(cwd: string, debounceMs = 2000): void {
  let session = core.status(cwd);
  if (!session) {
    session = core.startSession(cwd);
    console.log(`⚡ Session started: ${session.id}`);
  } else {
    console.log(`⚡ Resuming session: ${session.id}`);
  }

  console.log(`👀 Watching ${cwd}`);
  console.log(`   Auto-snapshot after ${debounceMs / 1000}s of quiet.`);
  console.log(`   Press Ctrl+C to stop.\n`);

  let pending: FileEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(cwd, {
    ignored: [
      /(^|[/\\])\./,
      /node_modules/,
      /dist\//,
      /build\//,
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const flush = () => {
    if (pending.length === 0) return;
    const events = [...pending];
    pending = [];
    const label = buildSmartLabel(events);

    try {
      const snapshot = core.snap(cwd, label);
      if (snapshot) {
        const time = new Date().toLocaleTimeString();
        console.log(`  ✓ Step ${snapshot.id}  ${time}  +${snapshot.additions} -${snapshot.deletions}  ${label}`);
      }
    } catch (e: any) {
      if (!e.message.includes('Nothing to snapshot')) {
        console.error(`  ✗ ${e.message}`);
      }
    }
  };

  const onEvent = (type: FileEvent['type']) => (filePath: string) => {
    pending.push({ type, file: path.relative(cwd, filePath) });
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  watcher
    .on('add', onEvent('add'))
    .on('change', onEvent('change'))
    .on('unlink', onEvent('unlink'));

  const shutdown = () => {
    console.log('\n⏹  Stopping watch...');
    if (timer) clearTimeout(timer);
    if (pending.length > 0) flush();

    watcher.close().then(() => {
      const s = core.status(cwd);
      const count = s?.snapshots.length ?? 0;
      console.log(`\n  Session ${session!.id}: ${count} steps recorded.`);
      console.log(`  Run "ckpt steps" to review.`);
      console.log(`  Run "ckpt restore <step>" to go back.`);
      console.log(`  Run "ckpt end" to commit everything.\n`);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── Smart labeling ────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string[]> = {
  'tests':       ['.test.', '.spec.', '__tests__', 'test/', 'tests/'],
  'styles':      ['.css', '.scss', '.less', '.styled.'],
  'config':      ['package.json', 'tsconfig', '.eslint', '.prettier', 'vite.config', 'webpack.config', '.env'],
  'components':  ['/components/', '.tsx', '.jsx'],
  'api':         ['/api/', '/routes/', '/controllers/', '/handlers/'],
  'types':       ['.d.ts', '/types/', '/interfaces/'],
  'docs':        ['.md', 'README', 'CHANGELOG', 'LICENSE'],
  'deps':        ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
};

function categorizeFile(file: string): string | null {
  const lower = file.toLowerCase();
  for (const [category, patterns] of Object.entries(CATEGORY_MAP)) {
    if (patterns.some((p) => lower.includes(p))) return category;
  }
  return null;
}

function buildSmartLabel(events: FileEvent[]): string {
  const added = events.filter((e) => e.type === 'add');
  const changed = events.filter((e) => e.type === 'change');
  const deleted = events.filter((e) => e.type === 'unlink');

  const categories = new Set(events.map((e) => categorizeFile(e.file)).filter(Boolean) as string[]);
  let prefix = '';
  if (categories.size === 1) prefix = `[${[...categories][0]}] `;
  else if (categories.size > 1) prefix = `[${[...categories].join(', ')}] `;

  const parts: string[] = [];
  if (added.length > 0) parts.push(added.length <= 2 ? `created ${added.map((e) => path.basename(e.file)).join(', ')}` : `created ${added.length} files`);
  if (changed.length > 0) parts.push(changed.length <= 2 ? `modified ${changed.map((e) => path.basename(e.file)).join(', ')}` : `modified ${changed.length} files`);
  if (deleted.length > 0) parts.push(deleted.length <= 2 ? `deleted ${deleted.map((e) => path.basename(e.file)).join(', ')}` : `deleted ${deleted.length} files`);

  return prefix + (parts.join(', ') || 'file changes');
}

#!/usr/bin/env node
'use strict';

/**
 * @fileoverview taskrun CLI entry point.
 * @author idirdev
 */

const path = require('path');
const { TaskRunner, loadConfig, formatResults, summary } = require('../src/index.js');

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log([
    'Usage: taskrun <task> [options]',
    '',
    'Options:',
    '  --config <file>   Path to tasks.json          [default: tasks.json]',
    '  --dry-run         Show execution plan without running',
    '  --parallel        Run top-level tasks concurrently',
    '  --list            List all available tasks',
    '  --verbose         Print commands as they run',
    '  --help            Show this help',
  ].join('\n'));
  process.exit(0);
}

function flag(name, def) {
  const idx = argv.indexOf('--' + name);
  if (idx === -1) return def;
  const next = argv[idx + 1];
  return next && !next.startsWith('--') ? next : def;
}

const configFile = flag('config', 'tasks.json');
const verbose = argv.includes('--verbose');

let config = {};
try {
  config = loadConfig(configFile);
} catch {
  // No config file — runner uses built-ins only
}

const runner = new TaskRunner(config);

if (argv.includes('--list')) {
  const tasks = runner.listTasks();
  console.log('Available tasks:');
  tasks.forEach(t => {
    const deps = t.deps.length ? '  (deps: ' + t.deps.join(', ') + ')' : '';
    console.log('  ' + t.name.padEnd(20) + (t.description || t.cmd) + deps);
  });
  process.exit(0);
}

const taskName = argv.find(a => !a.startsWith('--'));
if (!taskName) {
  console.error('Error: task name required. Use --list to see available tasks.');
  process.exit(1);
}

if (argv.includes('--dry-run')) {
  const plan = runner.dryRun(taskName);
  console.log('Dry run for "' + taskName + '":');
  plan.forEach(line => console.log('  ' + line));
  process.exit(0);
}

try {
  let results;
  if (argv.includes('--parallel')) {
    const order = runner.resolve(taskName);
    runner.runParallel(order, { verbose }).then(res => {
      console.log(formatResults(res));
      const s = summary(res);
      console.log('\n' + s.passed + '/' + s.total + ' tasks completed.');
      if (s.failed > 0) process.exit(1);
    });
  } else {
    results = runner.run(taskName, { verbose });
    console.log(formatResults(results));
    const s = summary(results);
    console.log('\n' + s.passed + '/' + s.total + ' tasks completed.');
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

'use strict';

/**
 * @fileoverview Tests for taskrun.
 * @author idirdev
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TaskRunner, loadConfig, formatResults, summary } = require('../src/index.js');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskrun-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const sampleConfig = {
  lint:  { cmd: 'node --version', deps: [],       description: 'Run linter' },
  test:  { cmd: 'node --version', deps: ['lint'],  description: 'Run tests' },
  build: { cmd: 'node --version', deps: ['test'],  description: 'Build project' },
  solo:  { cmd: 'node --version', deps: [],        description: 'Independent task' },
};

describe('TaskRunner.resolve', () => {
  it('returns tasks in dependency order', () => {
    const runner = new TaskRunner(sampleConfig);
    const order = runner.resolve('build');
    assert.ok(order.indexOf('lint') < order.indexOf('test'));
    assert.ok(order.indexOf('test') < order.indexOf('build'));
  });

  it('throws for unknown task', () => {
    const runner = new TaskRunner(sampleConfig);
    assert.throws(() => runner.resolve('nonexistent'), /not found/);
  });

  it('returns single item when no deps', () => {
    const runner = new TaskRunner(sampleConfig);
    assert.deepEqual(runner.resolve('solo'), ['solo']);
  });
});

describe('TaskRunner.detectCircular', () => {
  it('detects a circular dependency', () => {
    const runner = new TaskRunner({
      a: { cmd: '', deps: ['b'] },
      b: { cmd: '', deps: ['a'] },
    });
    assert.strictEqual(runner.detectCircular('a'), true);
  });

  it('returns false for acyclic graph', () => {
    const runner = new TaskRunner(sampleConfig);
    assert.strictEqual(runner.detectCircular('build'), false);
  });

  it('resolve throws on circular deps', () => {
    const runner = new TaskRunner({
      x: { cmd: '', deps: ['y'] },
      y: { cmd: '', deps: ['x'] },
    });
    assert.throws(() => runner.resolve('x'), /[Cc]ircular/);
  });
});

describe('TaskRunner.dryRun', () => {
  it('returns array of descriptive lines', () => {
    const runner = new TaskRunner(sampleConfig);
    const plan = runner.dryRun('build');
    assert.ok(Array.isArray(plan));
    assert.ok(plan.length >= 3);
    assert.ok(plan.some(l => l.includes('build')));
  });

  it('does not execute commands', () => {
    const runner = new TaskRunner({
      fail: { cmd: 'exit 1', deps: [] },
    });
    assert.doesNotThrow(() => runner.dryRun('fail'));
  });
});

describe('TaskRunner.listTasks', () => {
  it('returns all tasks', () => {
    const runner = new TaskRunner(sampleConfig);
    const list = runner.listTasks();
    assert.ok(Array.isArray(list));
    const names = list.map(t => t.name);
    assert.ok(names.includes('lint'));
    assert.ok(names.includes('test'));
    assert.ok(names.includes('build'));
  });

  it('each entry has name, cmd, deps, description', () => {
    const runner = new TaskRunner(sampleConfig);
    runner.listTasks().forEach(t => {
      assert.ok('name' in t);
      assert.ok('cmd' in t);
      assert.ok('deps' in t);
      assert.ok('description' in t);
    });
  });
});

describe('loadConfig', () => {
  it('loads a valid tasks.json', () => {
    const file = path.join(tmpDir, 'tasks.json');
    fs.writeFileSync(file, JSON.stringify(sampleConfig), 'utf8');
    const config = loadConfig(file);
    assert.ok(config.lint);
    assert.ok(config.build);
  });

  it('throws for non-existent file', () => {
    assert.throws(() => loadConfig(path.join(tmpDir, 'missing.json')), /not found/);
  });

  it('throws for invalid JSON', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, 'not json', 'utf8');
    assert.throws(() => loadConfig(file), /[Ff]ailed to parse/);
  });
});

describe('formatResults and summary', () => {
  it('formatResults returns a string', () => {
    const results = [
      { task: 'lint', status: 'ok', duration: 10 },
      { task: 'build', status: 'error', duration: 5 },
    ];
    const out = formatResults(results);
    assert.ok(typeof out === 'string');
    assert.ok(out.includes('lint'));
  });

  it('summary counts correctly', () => {
    const results = [
      { task: 'a', status: 'ok' },
      { task: 'b', status: 'ok' },
      { task: 'c', status: 'error' },
    ];
    const s = summary(results);
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.passed, 2);
    assert.strictEqual(s.failed, 1);
  });
});

describe('TaskRunner.run', () => {
  it('executes tasks and returns results', () => {
    const runner = new TaskRunner({
      hello: { cmd: 'node --version', deps: [] },
    });
    const results = runner.run('hello');
    assert.ok(Array.isArray(results));
    assert.strictEqual(results[0].task, 'hello');
    assert.strictEqual(results[0].status, 'ok');
  });

  it('throws when a command fails', () => {
    const runner = new TaskRunner({
      bad: { cmd: 'node -e "process.exit(1)"', deps: [] },
    });
    assert.throws(() => runner.run('bad'), /failed/);
  });
});

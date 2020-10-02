'use strict';

/**
 * @fileoverview taskrun - Minimal task runner with dependency resolution.
 * @module taskrun
 * @author idirdev
 */

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

/**
 * Built-in tasks available in every TaskRunner instance.
 * @type {Object.<string, {cmd: string, deps: string[], description: string}>}
 */
const BUILT_IN_TASKS = {
  noop: {
    cmd: '',
    deps: [],
    description: 'No-op task that does nothing.',
  },
};

/**
 * Loads a task configuration from a JSON file.
 * @param {string} filePath - Path to tasks.json.
 * @returns {Object} Parsed task config object.
 * @throws {Error} If the file cannot be read or parsed.
 */
function loadConfig(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error('Config file not found: ' + abs);
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse config file: ' + e.message);
  }
}

/**
 * Formats an array of task result objects as a human-readable summary.
 * @param {{ task: string, status: string, duration: number }[]} results
 * @returns {string}
 */
function formatResults(results) {
  const lines = results.map(r => {
    const status = r.status === 'ok' ? '\u2713' : '\u2717';
    return '  ' + status + ' ' + r.task + ' (' + r.duration + 'ms)';
  });
  return lines.join('\n');
}

/**
 * Summarises results: total, passed, failed.
 * @param {{ task: string, status: string }[]} results
 * @returns {{ total: number, passed: number, failed: number }}
 */
function summary(results) {
  const passed = results.filter(r => r.status === 'ok').length;
  return { total: results.length, passed, failed: results.length - passed };
}

/**
 * Task runner class.
 *
 * @example
 * const runner = new TaskRunner({
 *   build: { cmd: 'npm run build', deps: ['lint'], description: 'Build project' },
 *   lint:  { cmd: 'npm run lint',  deps: [],       description: 'Lint source' },
 * });
 * runner.run('build');
 */
class TaskRunner {
  /**
   * @param {Object.<string, {cmd: string, deps?: string[], description?: string, env?: Object}>} config
   */
  constructor(config = {}) {
    /** @type {Object.<string, {cmd: string, deps: string[], description: string, env: Object}>} */
    this.config = {};
    for (const [name, def] of Object.entries(BUILT_IN_TASKS)) {
      this.config[name] = { deps: [], description: '', env: {}, ...def };
    }
    for (const [name, def] of Object.entries(config)) {
      this.config[name] = {
        cmd: def.cmd || '',
        deps: def.deps || [],
        description: def.description || '',
        env: def.env || {},
      };
    }
  }

  /**
   * Returns the definition of a single task.
   * @param {string} name - Task name.
   * @returns {{ cmd: string, deps: string[], description: string, env: Object }}
   * @throws {Error} If the task is not found.
   */
  getTask(name) {
    if (!this.config[name]) throw new Error('Task not found: ' + name);
    return this.config[name];
  }

  /**
   * Returns all registered tasks as an array.
   * @returns {Array.<{name: string, cmd: string, deps: string[], description: string}>}
   */
  listTasks() {
    return Object.entries(this.config).map(([name, def]) => ({
      name,
      cmd: def.cmd,
      deps: def.deps,
      description: def.description,
    }));
  }

  /**
   * Detects circular dependencies starting from taskName.
   * @param {string} taskName - Task to check.
   * @returns {boolean} True if a cycle is detected.
   */
  detectCircular(taskName) {
    const visited = new Set();
    const stack = new Set();

    const dfs = (name) => {
      if (stack.has(name)) return true;
      if (visited.has(name)) return false;
      if (!this.config[name]) return false;
      visited.add(name);
      stack.add(name);
      for (const dep of (this.config[name].deps || [])) {
        if (dfs(dep)) return true;
      }
      stack.delete(name);
      return false;
    };

    return dfs(taskName);
  }

  /**
   * Returns the topologically sorted execution order for a task (deps first).
   * @param {string} taskName - Task to resolve.
   * @returns {string[]} Ordered array of task names to execute.
   * @throws {Error} If a circular dependency is detected or a task is missing.
   */
  resolve(taskName) {
    if (!this.config[taskName]) throw new Error('Task not found: ' + taskName);
    if (this.detectCircular(taskName)) {
      throw new Error('Circular dependency detected for task: ' + taskName);
    }

    const order = [];
    const visited = new Set();

    const visit = (name) => {
      if (visited.has(name)) return;
      if (!this.config[name]) throw new Error('Unknown dependency task: ' + name);
      for (const dep of (this.config[name].deps || [])) {
        visit(dep);
      }
      visited.add(name);
      order.push(name);
    };

    visit(taskName);
    return order;
  }

  /**
   * Executes a task (and its dependencies) synchronously.
   * @param {string} taskName - Task to run.
   * @param {Object} [opts={}] - Options.
   * @param {boolean} [opts.verbose=false] - Print commands before running.
   * @returns {{ task: string, status: string, duration: number }[]} Results.
   */
  run(taskName, opts = {}) {
    const order = this.resolve(taskName);
    const results = [];

    for (const name of order) {
      const task = this.config[name];
      if (!task.cmd) {
        results.push({ task: name, status: 'ok', duration: 0 });
        continue;
      }
      if (opts.verbose) console.log('[taskrun] Running: ' + name + '  $ ' + task.cmd);
      const start = Date.now();
      try {
        execSync(task.cmd, {
          stdio: opts.verbose ? 'inherit' : 'pipe',
          env: { ...process.env, ...task.env },
        });
        results.push({ task: name, status: 'ok', duration: Date.now() - start });
      } catch (err) {
        results.push({ task: name, status: 'error', duration: Date.now() - start, error: err.message });
        throw new Error('Task "' + name + '" failed: ' + err.message);
      }
    }

    return results;
  }

  /**
   * Runs multiple independent tasks concurrently.
   * @param {string[]} taskNames - Tasks to run in parallel.
   * @param {Object}   [opts={}]  - Options.
   * @param {boolean}  [opts.verbose=false]
   * @returns {Promise<{ task: string, status: string, duration: number }[]>}
   */
  runParallel(taskNames, opts = {}) {
    const promises = taskNames.map(name => {
      const task = this.config[name];
      if (!task) return Promise.resolve({ task: name, status: 'error', duration: 0, error: 'Task not found' });
      if (!task.cmd) return Promise.resolve({ task: name, status: 'ok', duration: 0 });

      if (opts.verbose) console.log('[taskrun] Parallel: ' + name + '  $ ' + task.cmd);
      const start = Date.now();

      return new Promise((resolve) => {
        exec(task.cmd, { env: { ...process.env, ...task.env } }, (err) => {
          resolve({
            task: name,
            status: err ? 'error' : 'ok',
            duration: Date.now() - start,
            error: err ? err.message : undefined,
          });
        });
      });
    });

    return Promise.all(promises);
  }

  /**
   * Prints what would run for a task without executing it.
   * @param {string} taskName - Task to dry-run.
   * @returns {string[]} Array of descriptive lines.
   */
  dryRun(taskName) {
    const order = this.resolve(taskName);
    return order.map((name, i) => {
      const task = this.config[name];
      return (i + 1) + '. ' + name + (task.cmd ? ' -> $ ' + task.cmd : ' -> (no-op)');
    });
  }
}

module.exports = {
  TaskRunner,
  loadConfig,
  formatResults,
  summary,
  BUILT_IN_TASKS,
};

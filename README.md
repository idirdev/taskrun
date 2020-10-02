# taskrun

> **[EN]** Minimal task runner with dependency resolution and parallel execution.
> **[FR]** Lanceur de taches minimal avec resolution de dependances et execution parallele.

---

## Features / Fonctionnalites

**[EN]**
- Define tasks with shell commands and dependencies
- Automatic dependency resolution via topological sort
- Circular dependency detection with clear error messages
- Parallel execution of independent tasks
- Dry-run mode to preview execution order
- Load configuration from JSON files
- Task timing and execution summary
- Built-in tasks support

**[FR]**
- Definir des taches avec commandes shell et dependances
- Resolution automatique des dependances par tri topologique
- Detection des dependances circulaires avec messages clairs
- Execution parallele des taches independantes
- Mode dry-run pour previsualiser l'ordre d'execution
- Chargement de configuration depuis fichiers JSON
- Chronometre et resume d'execution des taches
- Support des taches integrees

---

## Installation

```bash
npm install -g @idirdev/taskrun
```

---

## Configuration

Create a `tasks.json` / Creer un `tasks.json` :

```json
{
  "lint": { "cmd": "eslint src/", "deps": [] },
  "test": { "cmd": "node --test", "deps": ["lint"] },
  "build": { "cmd": "esbuild src/index.js --bundle", "deps": ["test"] },
  "deploy": { "cmd": "./deploy.sh", "deps": ["build"] }
}
```

---

## CLI Usage / Utilisation CLI

```bash
# Run a task (resolves all dependencies first)
taskrun build

# Preview execution order without running
taskrun deploy --dry-run

# Run tasks in parallel where possible
taskrun build --parallel

# List all available tasks
taskrun --list

# Custom config file
taskrun build --config ./ci-tasks.json

# Verbose output with timing
taskrun build --verbose
```

### Example Output / Exemple de sortie

```
$ taskrun build --verbose
[taskrun] Resolving dependencies for: build
[taskrun] Execution order: lint -> test -> build
[taskrun] Running: lint (eslint src/)
[taskrun]   lint completed in 1.2s
[taskrun] Running: test (node --test)
[taskrun]   test completed in 3.4s
[taskrun] Running: build (esbuild src/index.js --bundle)
[taskrun]   build completed in 0.8s
[taskrun] All 3 tasks completed in 5.4s
```

---

## API (Programmatic) / API (Programmation)

```js
const { TaskRunner, loadConfig } = require('taskrun');

const runner = new TaskRunner({
  lint: { cmd: 'eslint src/', deps: [] },
  test: { cmd: 'node --test', deps: ['lint'] },
  build: { cmd: 'esbuild src/index.js --bundle', deps: ['test'] }
});

// Get execution order
const order = runner.resolve('build');
// => ['lint', 'test', 'build']

// Detect circular dependencies
runner.detectCircular('build'); // throws if circular

// Dry run
const plan = runner.dryRun('build');
// => [{ name: 'lint', cmd: 'eslint src/' }, ...]

// Execute
const results = await runner.run('build');

// List all tasks
runner.listTasks();
// => [{ name: 'lint', description: '', deps: [] }, ...]
```

---

## License

MIT - idirdev

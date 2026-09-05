export type SuggestionScope = "shell" | `app:${string}`;

const APP_ALIASES: Record<string, string> = {
  mongo: "mongodb",
  mongosh: "mongodb",
  mariadb: "mysql",
  psql: "postgres",
  python3: "python",
  ipython3: "ipython",
};

/** Optional starter vocabulary. Unknown applications still get isolated,
 * learned history; this map only makes familiar REPLs useful immediately. */
export const APP_COMMANDS: Record<string, readonly string[]> = {
  mongodb: [
    "show dbs",
    "show collections",
    "use ",
    "db.getName()",
    "db.getCollectionNames()",
    "db.collection.find({})",
    "db.collection.findOne({})",
    "db.collection.insertOne({})",
    "db.collection.updateOne({}, {$set: {}})",
    "db.collection.deleteOne({})",
    "exit",
  ],
  mysql: [
    "SHOW DATABASES;",
    "SHOW TABLES;",
    "USE ",
    "DESCRIBE ",
    "SELECT * FROM ",
    "SELECT DATABASE();",
    "SHOW CREATE TABLE ",
    "exit",
  ],
  postgres: [
    "\\l",
    "\\dt",
    "\\d ",
    "\\c ",
    "SELECT current_database();",
    "SELECT * FROM ",
    "\\q",
  ],
  "redis-cli": ["PING", "GET ", "SET ", "DEL ", "KEYS *", "INFO", "quit"],
  sqlite3: [".tables", ".schema", ".databases", "SELECT * FROM ", ".quit"],
  python: ["help(", "print(", "import ", "from ", "exit()"],
  ipython: ["%history", "%timeit ", "%run ", "help(", "exit"],
  node: ["console.log(", "const ", "let ", "require(", ".help", ".exit"],
};

const WRAPPERS = new Set(["command", "env", "nice", "nohup", "sudo"]);

function executableOf(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token) || token.startsWith("-")) {
      index++;
      continue;
    }
    const executable = token.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    if (WRAPPERS.has(executable)) {
      index++;
      continue;
    }
    return executable || null;
  }
  return null;
}

/** Give every launched process a context. Shell integration resets this when
 * the process finishes, so only interactive children have time to use it. */
export function nextSuggestionScope(
  current: SuggestionScope,
  command: string,
): SuggestionScope {
  const normalized = command.trim();
  if (current !== "shell") {
    if (/^(exit|exit\(\)|quit|\.exit|\.quit|\\q)\s*;?$/i.test(normalized)) {
      return "shell";
    }
    return current;
  }
  const executable = executableOf(normalized);
  if (!executable) return "shell";
  return `app:${APP_ALIASES[executable] ?? executable}`;
}

export function contextualMatch(
  input: string,
  scope: SuggestionScope,
  history: readonly string[],
  shellCommands: readonly string[],
  customCommands: readonly string[],
): string | null {
  const app = scope === "shell" ? null : scope.slice(4);
  const candidates = app
    ? [...history, ...(APP_COMMANDS[app] ?? [])]
    : [...customCommands, ...history, ...shellCommands];
  const matches = (cmd: string) => {
    const caseInsensitive = app === "mysql" || app === "postgres";
    const prefixMatches = caseInsensitive
      ? cmd.toLowerCase().startsWith(input.toLowerCase())
      : cmd.startsWith(input);
    return prefixMatches && cmd !== input;
  };
  return candidates.find(matches) ?? null;
}

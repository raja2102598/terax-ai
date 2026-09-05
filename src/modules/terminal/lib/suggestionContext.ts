export type SuggestionScope = "shell" | "mongodb" | "mysql" | "postgres";

const CLIENTS: Record<string, SuggestionScope> = {
  mongo: "mongodb",
  mongosh: "mongodb",
  mysql: "mysql",
  mariadb: "mysql",
  psql: "postgres",
};

export const CONTEXT_COMMANDS: Record<SuggestionScope, readonly string[]> = {
  shell: [],
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
};

/** Detect entering or leaving a well-known interactive database client. */
export function nextSuggestionScope(
  current: SuggestionScope,
  command: string,
): SuggestionScope {
  const normalized = command.trim().replace(/^sudo\s+/, "");
  if (current !== "shell") {
    if (/^(exit|quit|\\q)\s*;?$/i.test(normalized)) return "shell";
    return current;
  }
  const executable = normalized.split(/\s+/)[0]?.split(/[\\/]/).pop() ?? "";
  return CLIENTS[executable.toLowerCase()] ?? "shell";
}

export function contextualMatch(
  input: string,
  scope: SuggestionScope,
  history: readonly string[],
  shellCommands: readonly string[],
  customCommands: readonly string[],
): string | null {
  const candidates =
    scope === "shell"
      ? [...customCommands, ...history, ...shellCommands]
      : [...history, ...CONTEXT_COMMANDS[scope]];
  const matches = (cmd: string) => {
    const prefixMatches =
      scope === "mysql" || scope === "postgres"
        ? cmd.toLowerCase().startsWith(input.toLowerCase())
        : cmd.startsWith(input);
    return prefixMatches && cmd !== input;
  };
  return candidates.find(matches) ?? null;
}

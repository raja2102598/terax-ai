import { describe, expect, it } from "vitest";
import { contextualMatch, nextSuggestionScope } from "./suggestionContext";

describe("terminal suggestion context", () => {
  it("recognizes database clients and returns to the shell", () => {
    expect(nextSuggestionScope("shell", "mongosh app")).toBe("mongodb");
    expect(nextSuggestionScope("shell", "sudo mysql -u root")).toBe("mysql");
    expect(nextSuggestionScope("shell", "/usr/bin/psql app")).toBe("postgres");
    expect(nextSuggestionScope("mysql", "exit;")).toBe("shell");
    expect(nextSuggestionScope("postgres", "\\q")).toBe("shell");
  });

  it("does not leak shell or custom commands into database prompts", () => {
    expect(
      contextualMatch("git", "mongodb", [], ["git status"], ["git pull"]),
    ).toBeNull();
    expect(contextualMatch("show", "mongodb", [], ["show shell"], [])).toBe(
      "show dbs",
    );
    expect(contextualMatch("SHOW", "mysql", [], [], [])).toBe(
      "SHOW DATABASES;",
    );
    expect(contextualMatch("show t", "mysql", [], [], [])).toBe("SHOW TABLES;");
  });

  it("keeps history scoped and ranked ahead of built-ins", () => {
    expect(
      contextualMatch("db.", "mongodb", ["db.users.find({})"], [], []),
    ).toBe("db.users.find({})");
  });
});

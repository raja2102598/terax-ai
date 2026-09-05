import { describe, expect, it } from "vitest";
import { contextualMatch, nextSuggestionScope } from "./suggestionContext";

describe("terminal suggestion context", () => {
  it("creates contexts for known and arbitrary interactive applications", () => {
    expect(nextSuggestionScope("shell", "mongosh app")).toBe("app:mongodb");
    expect(nextSuggestionScope("shell", "sudo mysql -u root")).toBe(
      "app:mysql",
    );
    expect(nextSuggestionScope("shell", "/usr/bin/python3")).toBe("app:python");
    expect(
      nextSuggestionScope("shell", "ACME=1 custom-repl --interactive"),
    ).toBe("app:custom-repl");
  });

  it("recognizes generic ways to leave an interactive application", () => {
    expect(nextSuggestionScope("app:mysql", "exit;")).toBe("shell");
    expect(nextSuggestionScope("app:postgres", "\\q")).toBe("shell");
    expect(nextSuggestionScope("app:node", ".exit")).toBe("shell");
    expect(nextSuggestionScope("app:python", "exit() ")).toBe("shell");
  });

  it("does not leak shell or custom commands into application prompts", () => {
    expect(
      contextualMatch(
        "git",
        "app:custom-repl",
        [],
        ["git status"],
        ["git pull"],
      ),
    ).toBeNull();
    expect(contextualMatch("show", "app:mongodb", [], ["show shell"], [])).toBe(
      "show dbs",
    );
    expect(contextualMatch("show t", "app:mysql", [], [], [])).toBe(
      "SHOW TABLES;",
    );
  });

  it("learns unknown application vocabularies from isolated history", () => {
    expect(
      contextualMatch(
        "deploy",
        "app:company-console",
        ["deploy staging"],
        ["deploy shell"],
        [],
      ),
    ).toBe("deploy staging");
  });
});

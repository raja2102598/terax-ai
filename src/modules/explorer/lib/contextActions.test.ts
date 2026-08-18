import { describe, expect, it } from "vitest";
import { isExtractableArchive, relativePath } from "./contextActions";

describe("relativePath", () => {
  it("returns '.' when the path is the root itself", () => {
    expect(relativePath("/a/b", "/a/b")).toBe(".");
  });

  it("strips the root prefix for a descendant path", () => {
    expect(relativePath("/a/b", "/a/b/c/d")).toBe("c/d");
  });

  it("does not relativize a sibling that only shares the root prefix", () => {
    expect(relativePath("/a/b", "/a/bc/d")).toBe("/a/bc/d");
  });

  it("returns an unrelated path unchanged", () => {
    expect(relativePath("/a/b", "/x/y")).toBe("/x/y");
  });
});

describe("isExtractableArchive", () => {
  it("accepts zip, tar.gz, and tgz", () => {
    expect(isExtractableArchive("/tmp/a.zip")).toBe(true);
    expect(isExtractableArchive("/tmp/a.tar.gz")).toBe(true);
    expect(isExtractableArchive("/tmp/a.tgz")).toBe(true);
    expect(isExtractableArchive("/tmp/a.csv")).toBe(false);
  });
});

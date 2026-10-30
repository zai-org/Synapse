import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const expectedRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
)

test("repo path helpers resolve from module location instead of cwd", async () => {
  const originalCwd = process.cwd()
  process.chdir(tmpdir())

  try {
    const cacheBust = `cwd-test=${Date.now()}`
    const repoPaths = await import(
      new URL(`./repo-paths.js?${cacheBust}`, import.meta.url).href
    )
    const subprojects = await import(
      new URL(`./subprojects.js?${cacheBust}`, import.meta.url).href
    )

    assert.equal(repoPaths.repoRoot, expectedRepoRoot)
    assert.equal(
      repoPaths.resolveRepoPath("docs", "readme", "README.es.md"),
      join(expectedRepoRoot, "docs", "readme", "README.es.md")
    )
    assert.equal(
      subprojects.resolveRepoSubprojectRoot("cli-anything"),
      join(expectedRepoRoot, "subprojects", "cli-anything")
    )
    assert.equal(
      subprojects.resolveRepoSubprojectRoot("lark-cli"),
      join(expectedRepoRoot, "subprojects", "lark-cli")
    )

    assert.equal(
      existsSync(repoPaths.resolveRepoPath("docs", "readme", "README.es.md")),
      true
    )

    // The remaining existsSync checks below depend on git submodules
    // being initialized (`git submodule update --init`). Worktrees often
    // skip submodule init for speed; treat them as a present-only
    // assertion so the path-resolution test still passes in those
    // environments. The CI workflow initializes submodules and gets full
    // coverage.
    const submoduleChecks: Array<[string, string]> = [
      ["cli-anything", "registry.json"],
      ["notion-skills", "README.md"],
      ["bilibili-cli", "SKILL.md"],
      ["tg-cli", "SKILL.md"],
    ]
    for (const [name, file] of submoduleChecks) {
      const submoduleRoot = subprojects.resolveRepoSubprojectRoot(name)
      // The submodule directory always exists as a gitlink placeholder;
      // emptiness signals "not yet initialized" (run `git submodule
      // update --init` to populate). Skip the file-presence check in that
      // case so the path-resolution test still runs in lightweight
      // worktrees.
      const initialized =
        existsSync(submoduleRoot) && readdirSync(submoduleRoot).length > 0
      if (!initialized) {
        continue
      }
      assert.equal(
        existsSync(subprojects.resolveRepoSubprojectPath(name, file)),
        true,
        `${name}/${file} should exist when submodule is initialized`
      )
    }
  } finally {
    process.chdir(originalCwd)
  }
})

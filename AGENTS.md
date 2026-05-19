## Code Standards

**MANDATORY**: Follow these standards. Before finishing any task, run Ultracite and the typecheck script.

- Use Ultracite/Biome for formatting and linting.
- Preferred flow:
  - Run `bun x ultracite check`.
  - If Ultracite reports formatting or safe fixable lint issues, run `bun x ultracite fix` before manually editing those files.
  - Re-run `bun x ultracite check`.
  - Only manually edit issues that remain after `ultracite fix`, such as semantic lint errors, type errors, or unsafe changes that need judgment.
  - Use `bun x ultracite doctor` when the Ultracite setup itself appears broken or inconsistent.
- Write accessible, performant, type-safe, maintainable code. Prefer clear, explicit logic over clever shortcuts.
- TypeScript: prefer `unknown` over `any`, type narrowing over assertions, `const` by default, top-level regex literals, specific imports, and `for...of` over `.forEach()`.
- Async: use `async`/`await`, handle errors intentionally, and do not use async Promise executors.
- Keep functions focused, extract complex conditions, prefer early returns, and avoid unrelated refactors.
- Use the typecheck script to actually check for type errors. Do not rely on editor diagnostics alone.

## E2E Testing Work

Before changing or verifying desktop, Android, Tauri, fixture app, fixture backend, or `tests/e2e` smoke automation, read `docs/knowledge/E2E-TESTING-RUNBOOK.md`.

That runbook is the source of truth for fixture app boundaries, required Nix tooling, backend ownership, run isolation, async UI waits, outbox/clean-state assertions, common failure modes, and the verification commands expected before claiming E2E work is complete.

## Review Focus

Biome/Ultracite handle formatting. Human review should focus on business correctness, naming, architecture, edge cases, UX/accessibility/performance, and useful documentation.

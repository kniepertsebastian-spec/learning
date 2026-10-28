# Knowvia — Gemini Instructions

## Project
Adaptive learning PWA for certifications and professional training.
Stack: Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, Auth.js v5, Serwist, Google Gemini.

## General Workflow
- Reply in German; keep responses concise.
- Inspect relevant code, tests, configuration and `AGENTS.md` before making changes.
- Follow existing architecture and conventions. Prefer minimal, targeted changes.
- Search before opening files; read only context relevant to the task.
- Do not assume APIs or conventions from older Next.js versions.
- Ask questions only when ambiguity blocks safe implementation.
- Never claim checks passed unless they were actually run.

## Code Reviews
- Report only actionable, code-supported findings.
- Prioritize security, data integrity, functional bugs, regressions and significant performance issues.
- List findings first, highest severity first.
- For each finding, include severity, file and line, triggering condition, concrete impact and recommended fix.
- Verify the relevant code path and check whether existing safeguards prevent the issue.
- Prefer fewer high-confidence findings over many low-confidence findings.
- Do not invent findings to fill a quota.
- If no substantiated findings exist, state that clearly.
- Do not modify code during a review unless explicitly asked.
- Focus on changed code and its direct dependencies by default.
- Inspect wider parts of the repository only when required to verify a relevant execution path or when explicitly requested.

### Ignore Unless Material
Do not report:
- Purely stylistic preferences, formatting, naming or refactoring suggestions without a concrete benefit.
- Hypothetical issues without a realistic, code-supported failure scenario.
- Findings based on assumptions unsupported by the repository or task context.
- Feature requests, enhancements or product ideas outside the review scope.
- Pre-existing issues unrelated to changed code, unless they create a critical security, privacy or data-integrity risk.
- Duplicate findings or multiple reports caused by the same root issue.
- Minor performance optimizations without plausible, meaningful user impact.
- Generic best-practice advice that does not identify a specific defect in this codebase.
- Issues already prevented by an existing, verified safeguard.
- Test coverage gaps alone, unless they leave an important, concrete regression insufficiently detected.

Do not ignore a real security or correctness issue simply because it is in unchanged code. Report it when it materially affects the reviewed change or reveals a serious risk.

## PWA Review Checklist
When relevant, inspect:
- Service worker lifecycle, installation, updates and recovery.
- Cache invalidation, stale assets and version mismatches.
- Offline behavior and network failure handling.
- Exposure of authenticated or sensitive data through caches.
- Web app manifest, installation and app-like behavior.
- Mobile usability, accessibility and browser compatibility.
- Performance, loading behavior and unnecessary network requests.
- Navigation, authentication and session behavior across online/offline transitions.

Only report checklist items when the code reveals a concrete issue. Do not produce generic checklist findings.

## Security, Privacy and Data Integrity
- Enforce authentication, authorization, ownership and tenant isolation server-side.
- Never trust client-s

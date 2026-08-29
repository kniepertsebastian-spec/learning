# Certification Learning PWA — v2 Rearchitecture Tracker

> Relationship to `roadmap.md`: that file is the historical record of the deployed
> MVP (client-side PWA, Dexie/IndexedDB, no auth, live at `learning.pwa-tree.de`)
> and stays untouched. This file is the **full rearchitecture** described below —
> a real backend, Postgres, multi-user auth, admin tooling, analytics, and
> eventually multiple certifications. Confirmed direction: full rearchitecture (not
> a client-side-only adaptation), self-hosted Postgres in this repo's
> `docker-compose.yml`, Drizzle ORM, Auth.js (NextAuth). Work proceeds through the
> **development order** below, incrementally across sessions — items are only
> checked off once actually built and verified, never speculatively.
>
> The prose "Phase 1"–"Phase 31" sections further down are the original design
> reference (kept as-is) explaining the *why* behind each step. This tracker at the
> top is the actual checklist, organized by the **recommended development order**
> from the bottom of the original doc, since that's the order work happens in
> (multiple "Phase N" sections often land in one dev-order step).

## Development order tracker

- [x] **1. Certification/objective database** — (Phase 2, Phase 3)
  - [x] Postgres added to `docker-compose.yml` (`postgres:17-alpine`, internal
        network only, named volume, healthcheck) — no host port published; this
        server already has another Postgres container on host `5432`
  - [x] Drizzle ORM + `drizzle-kit` wired (`drizzle.config.ts`,
        `lib/server/db/client.ts` — lazy singleton, `lib/server/db/schema.ts`)
  - [x] Full relational schema for all 17 entities from Phase 3 migrated and
        applied (`drizzle/0000_flawless_abomination.sql`, verified via a live
        `psql \dt` against the running container): `users`, `certifications`,
        `domains`, `objectives`, `topics`, `sections`, `lessons`, `questions`,
        `question_options`, `quizzes`, `quiz_attempts`, `quiz_answers`,
        `objective_progress`, `remediation_sessions`, `exams`, `exam_questions`,
        `exam_attempts`. Bilingual fields use the same `{de,en}` (`Localized<T>`)
        convention as the existing Dexie schema, as `jsonb` columns.
  - [x] Seed script (`scripts/seed.ts`, `npm run db:seed`) — inserts the
        `CompTIA Security+ SY0-701` certification + its 5 official top-level
        domain names, verified live in Postgres
  - [ ] **Open follow-up:** only domain *names* are seeded. Full official
        objective/sub-objective text and domain weight percentages are **not**
        populated — per Phase 2 ("official objectives are the source of truth")
        and Phase 28 (guard against hallucinated/outdated requirements), that text
        must come from CompTIA's actual published exam objectives document, not
        from an LLM's memory. Needs the real document sourced and ingested.
- [x] **2. Backend + authentication** — (Phase 14, Phase 15, Phase 27 partial)
  - [x] Auth.js (`next-auth@5.0.0-beta.32`) wired with a `Credentials` provider,
        JWT sessions (no DB adapter/session tables needed for credentials-only
        auth), `lib/server/auth.ts`
  - [x] `POST /api/register` (zod-validated, `bcryptjs` password hashing)
  - [x] `GET/POST /api/auth/[...nextauth]` (Auth.js route handler)
  - [x] `GET /api/me` — example protected route (calls `auth()` server-side),
        proves session verification works
  - [x] End-to-end verified live against `learning.pwa-tree.de`: register → sign
        in via `/api/auth/callback/credentials` → session cookie → `/api/me`
        returns the authenticated user (test users cleaned up after verification)
  - [x] `trustHost: true` set — required because the app runs behind the
        `cloudflared` tunnel (not Vercel's own proxy), and Auth.js rejects
        untrusted `Host` headers by default (`UntrustedHost` error, hit and fixed
        during verification)
  - [ ] **Deferred, not yet done:** no login/register UI in the existing frontend
        (only raw API routes so far); no `proxy.ts` route-gating yet (no protected
        pages exist to gate — Next.js 16 renamed `middleware.ts` to `proxy.ts`,
        confirmed by reading `node_modules/next/dist/docs`); existing pages
        (`app/page.tsx`, `app/cert/**`) still work entirely off Dexie/IndexedDB,
        completely unaware of the new backend
- [x] **3. AI model integration** — (Phase 14, Phase 15) — went through three
      providers: Claude (`@anthropic-ai/sdk`) → OpenAI (`openai`,
      `gpt-5.4-mini`) → **Google Gemini** (`@google/genai`, `gemini-3.6-flash`,
      current). Reason for the last switch: OpenAI's API has no free tier at all
      (confirmed via web search — `gpt-5.4-mini` being "free" is true only
      inside the ChatGPT *app*, not the developer API) and the account had a
      $0 credit balance; a $5 minimum purchase is required for any OpenAI API
      usage with no way around it. Gemini genuinely has a free API tier (no
      card required). `lib/gemini.ts` (client, was `lib/claude.ts` →
      `lib/openai.ts`), `lib/ai/generate.ts`, `lib/ai/http.ts` (Gemini's SDK
      has one `ApiError` with an HTTP-status field rather than OpenAI's
      per-error-type classes) all updated; verified against the real
      `@google/genai` type definitions (not just docs prose) before writing
      the integration. Added `lib/server/ai/service.ts` as the actual
      `AIService` layer (Phase 15) — currently one real method,
      `generateCurriculumDraftForDomain()`; the other methods Phase 15 lists
      (`generateLesson`, `generateQuiz`, `evaluateQuiz`, `generateRemediation`,
      `generateExamBlueprint`, `generateFinalExam`, `evaluateFinalExam`) are
      intentionally **not** stubbed out yet — they get added with their own
      dev-order steps (6, 7, 9, 11-13), not as empty placeholders now.
- [x] **4. Structured output schemas** — (Phase 16) — `lib/server/ai/schemas.ts`
      added (`draftObjectiveSchema`/`curriculumDraftForDomainResponseSchema`),
      matching the new normalized `objectives`/`sections` tables rather than the
      old embedded-array Dexie shape. Schemas for lessons/questions/exams follow
      alongside their own generators (steps 6, 7, 12), not built ahead of need.
- [x] **5. Curriculum generator** — (Phase 4) — `npm run content:draft-curriculum`
      run successfully against the live Postgres, for real, at zero cost (Gemini
      free tier). One model hiccup along the way: `gemini-2.5-flash` returned a
      live `404` telling new accounts to use `gemini-3.6-flash` instead — that
      became the actual default (more reliable than guessing from docs). Result,
      independently verified via `psql` (not just script log output): **23
      objectives, 82 sections** across all 5 Security+ domains. Spot-checked
      content quality is genuinely solid — e.g. objective 1.1 correctly covers
      "Technical/Managerial/Operational/Physical" control categories and 1.2
      correctly covers the CIA triad/AAA/Zero Trust, matching the real SY0-701
      structure, with natural-reading bilingual (DE/EN) section titles.
- [x] **6. Lesson generator** — (Phase 5) — persist into `lessons`, ahead-of-time,
      versioned. Code built (`lib/server/ai/service.ts`
      `generateLessonsAndQuestionsForObjective()`, `scripts/generate-lessons-and-questions.ts`,
      `npm run content:draft-lessons`) and **fully run**: all 23 objectives done.
      Two real bugs found and fixed along the way:
      1. `extractJson()` in `lib/ai/generate.ts` naively sliced first-`{`-to-last-`}`,
         which broke once responses got long enough to include trailing content
         after the real JSON object — replaced with a proper brace-depth scanner
         that respects string literals and stops at the first balanced object.
      2. Gemini returned `content`/`keyTakeaways`/`examFocusPoints` as plain
         strings/arrays instead of the required bilingual `{de,en}` objects until
         the prompt included a literal example of the exact expected JSON shape —
         prose instructions alone weren't enough for these longer fields (short
         fields like objective/section titles worked fine without an example).
      Hit the free-tier 20 req/day cap during generation; resolved by adding
      billing to the Gemini API key (removes the free-tier quota). `gemini-3.7-flash`
      was tried as a fallback but consistently returned `503 UNAVAILABLE` (high
      demand); `gemini-3.6-flash` with billing became the working default.
      Script is fully idempotent (skips objectives that already have both lessons
      and questions). Note: the `DATABASE_URL` hostname `postgres` is only
      resolvable inside the Docker internal network — run via:
      `docker run --rm --network learning_internal --env-file .env.local -v $(pwd):/app -w /app node:20-alpine npx tsx scripts/generate-lessons-and-questions.ts`
- [x] **7. Question generator** — (Phase 6, Phase 7) — persist into
      `questions`/`question_options`, deduplicated, human-readable IDs
      (`SEC-<code>-Q<seq>`). Built and generating correctly (same script as step
      6 — produces both together); all 23 objectives have a question pool,
      verified live in Postgres.
- [x] **8. Quiz UI** — (Phase 23) — rewired `app/cert/**` off Dexie onto the new
      backend. `app/page.tsx` (dashboard) and `app/cert/[id]/page.tsx` are now
      Server Components querying Postgres directly. New
      `app/cert/[id]/section/[sectionId]/page.tsx` fetches pre-generated lessons
      and questions and passes them to client components for rendering. Added
      `proxy.ts` (Next.js 16 auth gate — `middleware.ts` renamed) protecting
      `/cert/**` with a session-cookie check + redirect to `/login?from=…`.
      Added `/app/login/page.tsx` and `/app/register/page.tsx` (login uses
      `useActionState` + Auth.js `signIn` Server Action; register calls existing
      `/api/register` route). `SectionContent` client component renders lesson
      markdown (ReactMarkdown + remark-gfm + rehype-highlight) with key
      takeaways and exam focus points; `SectionQuiz` client component shows
      questions one-by-one using `QuizQuestionCard` and posts results to the
      attempt API. Locale detected via cookie (`certstudy-locale`) in Server
      Components — `persistLocale()` now also sets the cookie alongside
      localStorage. Old Dexie-based `day/[day]` and `exam` pages remain but
      are no longer linked.
- [x] **9. Quiz scoring** — (Phase 8) — `quiz_attempts`/`quiz_answers` write
      path implemented as part of step 8:
      `app/api/sections/[id]/attempt/route.ts` (POST, auth-required) gets or
      creates a `quizzes` record for the section, creates a `quiz_attempts`
      row with the user ID, writes one `quiz_answers` row per answer
      (evaluating correctness via `questionOptions.isCorrect`), and returns
      `{ score, results, attemptId }`. `SectionQuiz` calls this endpoint
      fire-and-forget after the final question.
- [ ] **10. Objective-level progress tracking** — (Phase 10) — `objective_progress`
      write path + dashboard UI.
- [ ] **11. Remediation engine** — (Phase 9) — `remediation_sessions`.
- [ ] **12. Final exam generator** — (Phase 11, Phase 12) — `exams`/
      `exam_questions` + blueprint logic.
- [ ] **13. Final exam scoring** — (Phase 13) — `exam_attempts`, readiness
      language ("practice readiness", not a pass guarantee).
- [ ] **14. Admin/content review system** — (Phase 18, Phase 25).
- [ ] **15. Source grounding/file search** — (Phase 17) — also where the seeded
      official-objectives follow-up from step 1 gets consumed.
- [ ] **16. Caching + cost optimization** — (Phase 20, Phase 21).
- [ ] **17. Offline PWA functionality** — (Phase 24) — extend beyond the MVP's
      existing service worker (`app/sw.ts`) to the new backend-sourced content.
- [ ] **18. Analytics** — (Phase 26).
- [ ] **19. Automated content quality checks** — (Phase 28) — the safeguards this
      step exists for are exactly why step 1's objective-text follow-up isn't
      being filled in from memory.
- [ ] **20. Add more certifications** — (Phase 31) — architecture should already
      support this (schema has no Security+-specific assumptions); mainly a
      content-sourcing exercise once step 1's follow-up is resolved for a second
      certification too.

---

# Certification Learning PWA — Development Roadmap

## Phase 1 — Define the product

### Goal

Build a PWA where a learner can:

1. Select a certification.
2. Follow a structured learning curriculum.
3. Study AI-generated learning material.
4. Take a short test after every section.
5. Receive explanations for incorrect answers.
6. Get targeted remediation for weak topics.
7. Track progress by certification objective.
8. Take a comprehensive final practice exam.
9. See a certification-readiness score.

### Initial certification

Start with **one certification**, e.g.:

> CompTIA Security+ SY0-701

Do not build support for 50 certifications initially.

Build the architecture so additional certifications can be added later.

---

# Phase 2 — Certification data model

Before involving AI, create a reliable certification structure.

```text
Certification
│
├── Domains
│   │
│   ├── Objectives
│   │   │
│   │   └── Topics
│   │
│   └── ...
│
└── Exam information
```

Each objective should have a stable ID.

Example:

```text
Certification:
security-plus

Exam:
SY0-701

Domain:
1

Objective:
1.2

Topic:
Security concepts
```

### Store

* certification name
* certification provider
* exam name
* exam version
* official objectives
* domains
* objectives
* sub-objectives
* topics
* source references
* exam metadata
* last verified date

### Important

The official certification objectives should be your **source of truth**.

AI should generate educational material *from* those objectives, not invent the curriculum independently.

---

# Phase 3 — Database

Create the database around the learning relationship rather than around AI responses.

Recommended entities:

```text
users

certifications

domains

objectives

topics

sections

lessons

questions

question_options

quizzes

quiz_attempts

quiz_answers

objective_progress

remediation_sessions

exams

exam_questions

exam_attempts
```

### Important relationships

```text
Certification
    ↓
Domain
    ↓
Objective
    ↓
Section
    ↓
Lesson
    ↓
Quiz
    ↓
Attempt
    ↓
Objective Progress
```

This allows you to answer questions like:

> "What does this learner actually know?"

rather than merely:

> "What score did they get?"

---

# Phase 4 — Curriculum generation

Create a backend process that takes:

```text
Certification
+
Official objectives
+
Source material
```

and generates the learning curriculum.

The AI should determine:

* section structure
* learning order
* prerequisites
* related topics
* estimated learning time
* difficulty
* objective mapping

Example:

```text
Security+
│
├── Domain 1
│   ├── Security Concepts
│   ├── Security Controls
│   ├── Authentication
│   └── Cryptography
│
├── Domain 2
│   ├── Threat Actors
│   ├── Vulnerabilities
│   ├── Social Engineering
│   └── Mitigations
│
└── ...
```

### Output

Store the generated curriculum in your database.

**Don't regenerate the curriculum every time a learner opens the course.**

Generate it once, review it, then reuse it.

---

# Phase 5 — Learning material generation

For every section:

```text
Section
   ↓
AI generation
   ↓
Lesson
```

Generate structured material containing:

* introduction
* concepts
* explanations
* examples
* scenarios
* terminology
* comparisons
* common mistakes
* exam-focused points
* summary
* key takeaways

Each piece of content must retain its objective mapping.

Example:

```text
Lesson
 ├── Objective: 1.2
 ├── Topic: CIA Triad
 ├── Content
 ├── Examples
 └── Key Takeaways
```

### Generation strategy

Generate the material **ahead of time**, rather than every time the learner requests it.

This will:

* reduce API costs
* improve response speed
* make content consistent
* allow human review
* reduce unnecessary API calls

---

# Phase 6 — Section quizzes

After every learning section:

```text
Lesson completed
       ↓
Mini quiz
       ↓
5–10 questions
       ↓
Learner answers
       ↓
Score
```

Questions should be linked to:

* certification
* domain
* objective
* topic
* difficulty
* question type

Use a mixture of:

* knowledge
* comprehension
* application
* scenario-based questions
* troubleshooting

### Do not only test memorization.

For example, instead of asking:

> "What does CIA stand for?"

occasionally ask:

> "A company needs to prevent unauthorized modification of financial records. Which security property is most relevant?"

That tests understanding.

---

# Phase 7 — Question bank

Build a persistent question bank.

```text
Question
│
├── Certification
├── Domain
├── Objective
├── Topic
├── Difficulty
├── Type
├── Question
├── Options
├── Answer
├── Explanation
└── Source/reference
```

Each generated question gets a unique ID.

Example:

```text
SEC-1.2-Q000183
```

### Why this matters

You can prevent the final exam from accidentally selecting questions the learner has already seen.

You can also reuse high-quality questions for:

* practice
* revision
* remediation
* mock exams

---

# Phase 8 — Answer evaluation

When the learner submits a quiz:

```text
Question
+
Selected answer
+
Correct answer
       ↓
Evaluation
```

The system should calculate:

### Overall score

```text
8 / 10 = 80%
```

### Objective performance

```text
Objective 1.1 → 100%
Objective 1.2 → 60%
Objective 1.3 → 90%
```

### Topic performance

```text
Authentication → 90%
Authorization → 60%
Accounting → 100%
```

This becomes the foundation of your adaptive learning system.

---

# Phase 9 — Adaptive learning

Don't simply say:

> "You scored 60%. Try again."

Instead:

```text
Quiz results
     ↓
Analyze incorrect answers
     ↓
Identify weak objectives
     ↓
Identify misconceptions
     ↓
Generate targeted remediation
     ↓
Mini re-test
```

Example:

```text
Objective 2.3
Score: 45%

Status:
NEEDS_REMEDIATION
```

The learner gets a shorter lesson specifically about that weakness.

Then:

```text
Remediation
     ↓
3–5 practice questions
     ↓
Improved?
     ├── Yes → Continue
     └── No → More remediation
```

---

# Phase 10 — Progress system

Create a learner dashboard.

### Certification progress

```text
Security+
██████████████░░░░░░ 72%
```

### Objective mastery

```text
Domain 1     91%   Strong
Domain 2     67%   Needs work
Domain 3     84%   Good
Domain 4     93%   Strong
Domain 5     71%   Needs work
```

### Individual objectives

```text
1.1  ██████████ 100%
1.2  ████████░░  80%
1.3  ██████░░░░  60%  ← Review
```

Use multiple signals rather than only quiz percentage.

For example:

```text
Mastery =
recent accuracy
+ repeated accuracy
+ difficulty
+ objective coverage
+ remediation performance
```

---

# Phase 11 — Final practice exam

Once the learner has completed the curriculum:

```text
Course completed
       ↓
Analyze learner performance
       ↓
Build exam blueprint
       ↓
Select/generate questions
       ↓
Final practice exam
```

The final exam should:

* cover all relevant domains
* cover objectives proportionally
* include multiple difficulty levels
* contain scenario questions
* contain original questions
* avoid previously seen questions
* include weak areas
* remain representative of the certification

---

# Phase 12 — Exam blueprint

Before generating the final exam, create an internal blueprint.

Example:

```text
Final Exam: 90 questions

Domain 1
  15 questions

Domain 2
  25 questions

Domain 3
  20 questions

Domain 4
  15 questions

Domain 5
  15 questions
```

The exact distribution should come from the certification's official objectives/exam information rather than arbitrary numbers.

This prevents AI from accidentally creating an exam that heavily focuses on one topic.

---

# Phase 13 — Final exam evaluation

After completion:

```text
Final Exam
    ↓
Score
    ↓
Domain analysis
    ↓
Objective analysis
    ↓
Weakness analysis
    ↓
Readiness assessment
```

Show something like:

```text
Practice Exam

Score
82%

Estimated readiness
GOOD

Strong areas
✓ Security concepts
✓ Architecture
✓ Security operations

Review before exam
⚠ Threats & vulnerabilities
⚠ Identity management
```

Be careful with the terminology.

Call it:

> **Practice readiness**

rather than claiming:

> "You will pass the certification."

---

# Phase 14 — AI generation architecture

Your backend should communicate with the model rather than your PWA directly.

```text
PWA
 │
 ▼
Backend API
 │
 ├── Authentication
 ├── User progress
 ├── Database
 ├── Content management
 └── AI service
          │
          ▼
      GPT-5.4 Mini
```

### Never expose your OpenAI API key in the browser.

The key should remain server-side.

---

# Phase 15 — AI service layer

Create a dedicated service:

```text
AIService
│
├── generateCurriculum()
├── generateLesson()
├── generateQuiz()
├── evaluateQuiz()
├── generateRemediation()
├── generateExamBlueprint()
├── generateFinalExam()
└── evaluateFinalExam()
```

This keeps AI logic out of your frontend.

It also makes it easy to change models later.

---

# Phase 16 — Structured Outputs

Every AI generation task should have a defined schema.

For example:

```text
generateLesson()
       ↓
LessonSchema

generateQuiz()
       ↓
QuizSchema

generateExam()
       ↓
ExamSchema
```

This makes the application much more reliable.

Your frontend receives predictable data rather than trying to parse AI-generated prose.

---

# Phase 17 — Source grounding

For certification content, introduce a source layer.

```text
Official objectives
        +
Approved learning resources
        +
Your curated knowledge base
        ↓
       AI
```

Use retrieval/file search where appropriate.

The AI should be grounded in your source material whenever accuracy matters.

This is particularly important because certification objectives and exam versions can change.

---

# Phase 18 — Content validation

Don't immediately publish everything generated by AI.

Create an automated validation pipeline.

```text
AI generates content
        ↓
Schema validation
        ↓
Objective validation
        ↓
Duplicate detection
        ↓
Question quality checks
        ↓
Source/grounding checks
        ↓
Publish
```

For example:

### Check 1

Does every question have an objective ID?

### Check 2

Does that objective actually exist?

### Check 3

Are there exactly four options?

### Check 4

Is there exactly one correct answer?

### Check 5

Is the answer one of the available options?

### Check 6

Is the question duplicated?

### Check 7

Does the question actually test the assigned objective?

---

# Phase 19 — Prompt management

Keep all generation prompts separate from your application logic.

For example:

```text
/prompts
    curriculum
    lesson
    quiz
    evaluation
    remediation
    exam
```

The prompts we've discussed should live here.

You can use **Claude to help write, refine, test, and optimize these prompts**, which can be cheaper and more convenient during development.

Your production application does **not** need to use Claude for generation if GPT-5.4 Mini is the model you want to run the actual learning experience.

---

# Phase 20 — Cost optimization

This is where your architecture matters a lot.

### Don't do this

```text
Every page load
     ↓
Call GPT
     ↓
Generate lesson
```

You'll pay repeatedly for the same content.

### Do this

```text
Certification created
       ↓
Generate curriculum
       ↓
Generate lessons
       ↓
Generate question bank
       ↓
Store everything
       ↓
Learners consume stored content
```

AI is used primarily when **creating or updating content**.

Then learners mostly interact with your database.

---

# Phase 21 — Caching

Cache generated content.

For example:

```text
certification_id
objective_id
content_version
model
prompt_version
```

If the same content already exists:

```text
Database → return content
```

instead of:

```text
Database → GPT → generate again
```

---

# Phase 22 — Versioning

Certification material changes.

Therefore, everything should have versions.

```text
Security+
SY0-701
Content version 1
```

Later:

```text
Security+
SY0-702
Content version 2
```

Never silently replace old certification content.

Store:

```text
certification_version
content_version
prompt_version
model_version
created_at
updated_at
```

This will save you major headaches later.

---

# Phase 23 — Frontend

Your PWA could have:

### Home

```text
My Certifications

Security+
72% complete

Continue learning →
```

### Certification page

```text
Security+

Progress: 72%

Domain 1       ✓
Domain 2       72%
Domain 3       ✓
Domain 4       81%
Domain 5       64%

[ Continue Learning ]
[ Practice Exam ]
```

### Lesson

```text
Security Controls

Progress
██████░░░░

Lesson content...

Key concepts
✓
✓
✓

[ Take Section Test ]
```

### Quiz

```text
Question 4 / 8

A company...

A. ...
B. ...
C. ...
D. ...

[ Submit ]
```

### Results

```text
8 / 10

80%

Strong:
Authentication

Review:
Authorization

[ Review Weak Areas ]
[ Continue ]
```

---

# Phase 24 — Offline PWA functionality

Because it's a PWA, take advantage of it.

Cache:

* completed lessons
* images
* terminology
* previously downloaded questions
* progress state

Allow learners to study offline where possible.

When they reconnect:

```text
Local progress
     ↓
Sync
     ↓
Backend
```

For the initial version, you can keep AI generation online-only.

---

# Phase 25 — Admin dashboard

You'll eventually need an admin interface.

### Certification management

```text
Security+
SY0-701

Domains: 5
Objectives: 28
Sections: 42
Questions: 480
```

### Content review

```text
Generated
↓
Pending Review
↓
Approved
↓
Published
```

Allow administrators to:

* edit lessons
* delete bad questions
* modify objectives
* approve content
* regenerate content
* flag problematic questions
* replace source material
* create new certification versions

---

# Phase 26 — Analytics

Track:

### Learner analytics

* completion rate
* quiz scores
* objective mastery
* time per lesson
* failed questions
* remediation rate
* final exam scores
* repeated weak objectives

### Content analytics

* questions frequently answered incorrectly
* questions frequently disputed
* lessons with poor completion
* objectives causing the most failures
* AI-generated content requiring frequent corrections

This can eventually tell you:

> "Objective 2.4 consistently causes problems."

That may indicate either:

1. learners struggle with the topic, or
2. your lesson/question is poorly designed.

---

# Phase 27 — Security

Implement:

* server-side API keys
* authentication
* authorization
* rate limiting
* request validation
* database security
* abuse prevention
* usage limits
* logging
* API cost monitoring

Especially important:

**Never allow the browser to directly control arbitrary AI parameters.**

For example, don't let a user send:

```text
model = expensive-model
tokens = 1,000,000
```

Your backend should control these values.

---

# Phase 28 — AI safety and quality controls

Add safeguards against:

* hallucinated certification requirements
* fake exam questions
* outdated objectives
* duplicate questions
* ambiguous answers
* multiple correct answers
* incorrect explanations
* irrelevant material
* unsupported technical claims

For certification preparation, **quality matters more than quantity**.

I'd rather have:

> 300 excellent questions

than:

> 10,000 mediocre AI questions.

---

# Phase 29 — MVP

Don't build everything at once.

Your first version should contain only:

### Certification

* Security+
* official objectives

### Learning

* domains
* sections
* AI-generated lessons

### Testing

* 5–10 questions per section
* scoring
* explanations

### Progress

* section completion
* objective scores

### Final exam

* one comprehensive practice exam

### Technology

```text
PWA
 ↓
Backend
 ↓
Database
 ↓
GPT-5.4 Mini
```

That's enough to validate the product.

---

# Phase 30 — Version 2

Once the MVP works:

* adaptive remediation
* flashcards
* spaced repetition
* bookmarks
* notes
* search
* daily study goals
* weak-topic recommendations
* additional practice tests
* exam history
* readiness score
* offline synchronization

---

# Phase 31 — Version 3

Then expand into a certification platform.

```text
Certifications
├── Security+
├── Network+
├── A+
├── Linux+
├── AWS
├── Azure
├── Cisco
└── ...
```

Your AI architecture remains essentially the same.

Only the certification data and source material change.

---

# Recommended final architecture

```text
                         ┌─────────────────┐
                         │   PWA Frontend  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Backend API   │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
        ┌───────────┐       ┌───────────┐       ┌───────────┐
        │ PostgreSQL│       │ AI Service│       │   Auth    │
        └───────────┘       └─────┬─────┘       └───────────┘
                                  │
                                  ▼
                           ┌──────────────┐
                           │ GPT-5.4 Mini │
                           └──────┬───────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
               Curriculum      Lessons       Questions
                    │             │             │
                    └─────────────┼─────────────┘
                                  ▼
                         ┌─────────────────┐
                         │ Learning Engine │
                         └────────┬────────┘
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                    Mini Tests       Final Exam
                         │                 │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ Mastery Engine  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Learner Profile │
                         │ + Readiness     │
                         └─────────────────┘
```

## The development order I'd actually follow

**1.** Certification/objective database
**2.** Backend + authentication
**3.** GPT-5.4 Mini integration
**4.** Structured output schemas
**5.** Curriculum generator
**6.** Lesson generator
**7.** Question generator
**8.** Quiz UI
**9.** Quiz scoring
**10.** Objective-level progress tracking
**11.** Remediation engine
**12.** Final exam generator
**13.** Final exam scoring
**14.** Admin/content review system
**15.** Source grounding/file search
**16.** Caching + cost optimization
**17.** Offline PWA functionality
**18.** Analytics
**19.** Automated content quality checks
**20.** Add more certifications

The key design principle is: **AI generates and adapts the educational content; your application owns the curriculum state, question bank, scoring, progress, versions, and learner history.** That separation will make the PWA much cheaper, more reliable, and easier to scale.


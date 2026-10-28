<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Formulas are data in `src/lib/formulas.ts` (spec string + pure calc); add new formulas there, never as separate pages — keeps 370+ calculators on one generic route.
- Login is by username: `signInWithUsername` server fn resolves the email server-side and returns a session — emails must never reach the browser.

- Media files live in a private `media` bucket and are shown via signed URLs (public buckets are blocked in this workspace).
- Courses are DB-driven: subjects → courses → course_units → course_sections, with quizzes/quiz_questions; admin builds them in the admin dashboard tabs, never hardcode course content in code.
- Admin-editable site text/options live in `site_settings` (key/value, public read); PayMongo keys live in `payment_settings` (admin-only RLS).
- Quiz grading is the pure `gradeQuiz` in `src/lib/quiz.ts` (tested in `src/test/quiz.test.ts`); attempts persist to `quiz_attempts`.
- Paid courses use PayMongo: `createCourseCheckout` (src/lib/paymongo.functions.ts) creates the checkout session with the admin's stored secret key; `/api/public/paymongo-webhook` verifies the Paymongo-Signature HMAC and enrolls via `reference_number` = "userId:courseId". Prices are PHP pesos (₱), sent to PayMongo in centavos.
- Admin role is granted by email only (jcoins.net@gmail.com) in the signup trigger — username does not matter. Login accepts username or email.
- MFP assistant chats through `mfpChat` server fn (src/lib/ai.functions.ts); the Ollama key is retrieved from `OLLAMA_API_KEY` or `site_settings` `ai_key`, never a VITE_ var, so it can't leak to browsers. URL/model come from site_settings ai_url/ai_model.
- Course pages use index routes (courses.index.tsx, courses.$subjectId.index.tsx) so deeper pages are not swallowed by a parent without <Outlet />. Lesson text uses the simple formatting in src/components/RichContent.tsx; category logos come from site_settings cat_logo_<id>.
- Quizzes can attach to a section via quizzes.section_id (shown under that section in the reader); unit-level quizzes have section_id null. Admin attaches them inside the section editor.
- MFP chat history is kept per-browser in localStorage ("mfp-chats") — no server storage of conversations.
- Custom user equations use the safe parser in `src/lib/equation.ts` (never eval; tested in src/test/equation.test.ts); saved per-browser in localStorage "mfp-equations".
- Pages open the MFP assistant via `askMfp()` in src/lib/mfp-bus.ts (window event) — no direct coupling to MfpButton. MFP photos are sent as Ollama `images` base64 on the last user message and are not stored in chat history.
- Exam results/retake admin data comes from `src/lib/results.functions.ts` (admin-checked; emails resolved server-side). Netlify uses netlify.toml with NITRO_PRESET=netlify; no SPA _redirects.

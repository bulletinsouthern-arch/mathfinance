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
- MFP assistant chats through `mfpChat` server fn (src/lib/ai.functions.ts); the Ollama key is the server secret OLLAMA_API_KEY, never a VITE_ var, so it can't leak to browsers. URL/model come from site_settings ai_url/ai_model.

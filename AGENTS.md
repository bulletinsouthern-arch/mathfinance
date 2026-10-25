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
- Admin role is granted only by the signup trigger for the reserved username + email pair; roles live in `user_roles`, checked via `has_role` — never trust client flags.
- Media files live in a private `media` bucket and are shown via signed URLs (public buckets are blocked in this workspace).

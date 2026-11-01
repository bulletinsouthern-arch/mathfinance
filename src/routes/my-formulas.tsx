import { createFileRoute, redirect } from "@tanstack/react-router";

// Private formulas now live on the Formulas page.
export const Route = createFileRoute("/my-formulas")({
  beforeLoad: () => { throw redirect({ to: "/formulas", search: {} }); },
});

import { verifiedCertificate } from "../src/lib/certificates.server";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
export default async (request: Request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return Response.json({ valid: false }, { status: 400 });
  try {
    const certificate = await verifiedCertificate(id);
    const status = certificate ? 200 : 404;
    if (request.headers.get("accept")?.includes("text/html")) {
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Certificate verification — Math & Finance Pro</title><style>body{margin:0;background:#f5f3eb;color:#173f35;font:16px/1.6 system-ui;padding:8vh 20px}main{max-width:640px;margin:auto;background:#fffef9;border:1px solid #bd9c55;padding:40px;box-shadow:0 16px 60px #173f3510}.brand{font-size:12px;letter-spacing:.18em;font-weight:bold;text-transform:uppercase}h1{font:36px/1.2 Georgia,serif}h2{font:28px/1.3 Georgia,serif}hr{border:0;border-top:1px solid #dfd6bf;margin:28px 0}.muted{color:#58665e;font-size:14px}.id{word-break:break-all}a{color:inherit}</style></head><body><main><p class="brand">Math & Finance Pro</p><h1>${certificate ? "Verified certificate" : "Certificate unavailable"}</h1>${certificate ? `<p>This Certificate of Completion is recorded in our system.</p><hr><h2>${escape(certificate.studentName)}</h2><p>Passed all course quizzes and examinations in<br><strong>${escape(certificate.courseTitle)}</strong></p><p class="muted">Issued ${escape(new Date(certificate.issuedAt).toLocaleDateString("en-PH", { dateStyle: "long" }))}</p><p class="muted id">Certificate ID: ${escape(certificate.id)}</p><hr><p class="muted">A course completion credential issued by Math & Finance Pro.</p>` : "<p>This certificate does not exist or its assessment requirements are no longer satisfied. Contact the course administrator for help.</p>"}<p><a href="/">Visit Math & Finance Pro</a></p></main></body></html>`;
      return new Response(html, {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        },
      });
    }
    return Response.json(
      {
        valid: !!certificate,
        issuer: "Math & Finance Pro",
        credential: "Certificate of Completion",
        certificate,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Verification is temporarily unavailable" }, { status: 503 });
  }
};
export const config = { path: "/api/public/verify-certificate" };

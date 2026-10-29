import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { accountDocuments } from "@/lib/account-documents.functions";
import { courseCertificate } from "@/lib/certificates.functions";
import { downloadCertificate, downloadReceipt, money, documentDate } from "@/lib/course-documents";
import { Button } from "./ui/button";
export function AccountDocuments({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["account-documents", userId],
    queryFn: () => accountDocuments(),
  });
  const perform = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      toast.error("Document unavailable. Please retry or open the course to check its status.");
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <FileCheck2 className="h-5 w-5 text-primary" />
        Receipts & certificates
      </h2>
      {query.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading your documents…</p>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-sm">
          Documents could not load.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
              Payment receipts
            </h3>
            {!query.data.receipts.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Your verified payment receipts appear here.
              </p>
            )}
            <ul className="divide-y divide-border">
              {query.data.receipts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/courses/$subjectId/$courseId"
                      params={{ subjectId: r.subjectId, courseId: r.courseId }}
                      search={{ s: undefined, q: undefined, paid: undefined }}
                      className="font-semibold hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {documentDate(r.paidAt)} · {money(r.amountCentavos)} · {r.plan}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void perform(() => downloadReceipt(r, r.title))}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Receipt
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
              Course certificates
            </h3>
            {!query.data.certificates.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Pass every course quiz and exam, then open the course to receive your certificate.
              </p>
            )}
            <ul className="divide-y divide-border">
              {query.data.certificates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.courseTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {documentDate(c.issuedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void perform(async () => {
                        const status = await courseCertificate({ data: { courseId: c.courseId } });
                        if (!status.certificate) throw new Error("Certificate unavailable");
                        await downloadCertificate(status.certificate);
                      })
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Certificate
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

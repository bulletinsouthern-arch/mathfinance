import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Download, ReceiptText } from "lucide-react";
import { courseReceipts } from "@/lib/paymongo.functions";
import { courseCertificate } from "@/lib/certificates.functions";
import {
  downloadCertificate,
  downloadReceipt,
  documentDate,
  money,
  type Receipt,
} from "@/lib/course-documents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export function CourseDocuments({
  courseId,
  title,
  userId,
  checkoutId,
  allowed,
}: {
  courseId: string;
  title: string;
  userId: string;
  checkoutId?: string | undefined;
  allowed: boolean;
}) {
  const qc = useQueryClient();
  const seen = useRef<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const validCheckout = checkoutId && /^[0-9a-f-]{36}$/i.test(checkoutId) ? checkoutId : undefined;
  const receipts = useQuery({
    queryKey: ["course-receipts", courseId, userId, validCheckout],
    queryFn: () =>
      courseReceipts({
        data: { courseId, ...(validCheckout ? { checkoutId: validCheckout } : {}) },
      }),
    // The database can be slow to wake up; retry with backoff and keep recovering in the background.
    refetchInterval: (query) =>
      validCheckout && !query.state.data?.some((r) => r.id === validCheckout)
        ? 4000
        : query.state.status === "error"
          ? 15000
          : false,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
  const certificate = useQuery({
    queryKey: ["course-certificate", courseId, userId],
    enabled: allowed,
    queryFn: async () => {
      const status = await courseCertificate({ data: { courseId } });
      return status.eligible && !status.certificate
        ? courseCertificate({ data: { courseId, issue: true } })
        : status;
    },
  });
  const perform = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      toast.error("Download unavailable. Please try the download button again.");
    }
  };
  useEffect(() => {
    const confirmed = receipts.data?.find((r) => r.id === validCheckout);
    if (!confirmed || seen.current === confirmed.id) return;
    seen.current = confirmed.id;
    setReceipt(confirmed);
    void qc.invalidateQueries({ queryKey: ["course-access", courseId] });
    void qc.invalidateQueries({ queryKey: ["enrollment", courseId] });
    void downloadReceipt(confirmed, title).catch(() =>
      toast.info("Your receipt is ready. Use Download receipt to save it."),
    );
    toast.success("Payment confirmed. Your course is unlocked.");
  }, [receipts.data, validCheckout, courseId, title, qc]);
  return (
    <div className="mt-5 space-y-4">
      {validCheckout && !receipts.data?.some((r) => r.id === validCheckout) && (
        <div role="status" className="rounded-lg border border-border bg-accent p-3 text-sm">
          {receipts.isError
            ? "We could not confirm payment yet. Your access opens only after payment is verified."
            : "Confirming your payment with PayMongo… Your course opens automatically once confirmed."}{" "}
          <button className="underline" onClick={() => void receipts.refetch()}>
            Check again
          </button>
        </div>
      )}
      {receipts.isError && !validCheckout && (
        <p role="alert" className="text-sm">
          Receipts are temporarily unavailable.{" "}
          <button className="underline" onClick={() => void receipts.refetch()}>
            Retry
          </button>
        </p>
      )}
      {!!receipts.data?.length && (
        <details className="rounded-lg border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <ReceiptText className="h-4 w-4" />
            Your payment receipts ({receipts.data.length})
          </summary>
          <div className="mt-3 space-y-2">
            {receipts.data.map((r) => (
              <button
                key={r.id}
                onClick={() => setReceipt(r)}
                className="flex w-full items-center justify-between gap-3 rounded-md bg-muted p-3 text-left text-sm"
              >
                <span>
                  {documentDate(r.paidAt)} · {r.plan}
                </span>
                <span className="font-bold text-primary">{money(r.amountCentavos)} · View</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {allowed && (
        <section className="overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-accent/60 to-card p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Award className="h-5 w-5" />
            Course achievement
          </div>
          {certificate.data?.certificate ? (
            <>
              <h3 className="mt-2 font-serif text-2xl">Your certificate is ready</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Awarded to {certificate.data.certificate.studentName} for passing every course quiz
                and exam.
              </p>
              <Button
                className="mt-3"
                onClick={() =>
                  void perform(() => downloadCertificate(certificate.data!.certificate!))
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Download certificate PDF
              </Button>
            </>
          ) : (
            <>
              <h3 className="mt-2 font-serif text-xl">Certificate of Completion</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {certificate.isError
                  ? "Certificate unavailable. Check your account name and try again."
                  : certificate.data
                    ? `${certificate.data.passed} of ${certificate.data.total} assessments passed. Complete every quiz and exam to earn your certificate. Flagged attempts require administrator review.`
                    : "Checking your achievements…"}
              </p>
              {certificate.isError && (
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => void certificate.refetch()}
                >
                  Retry certificate
                </Button>
              )}
            </>
          )}
        </section>
      )}
      <Dialog
        open={!!receipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogTitle className="font-serif text-2xl">Payment received</DialogTitle>
          <DialogDescription>
            Your PayMongo payment is verified. Your course access is ready.
          </DialogDescription>
          {receipt && (
            <>
              <div className="space-y-4 rounded-lg border border-dashed border-primary/30 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  Math & Finance Pro · Receipt
                </p>
                <p className="text-3xl font-bold">{money(receipt.amountCentavos)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
                  <dt>Course</dt>
                  <dd className="text-right">{title}</dd>
                  <dt>Access plan</dt>
                  <dd className="text-right capitalize">{receipt.plan}</dd>
                  <dt>Paid</dt>
                  <dd className="text-right">{documentDate(receipt.paidAt)}</dd>
                  <dt>Current access</dt>
                  <dd className="text-right">
                    {receipt.expiresAt ? documentDate(receipt.expiresAt) : "No expiry"}
                  </dd>
                </dl>
                <p className="break-all text-xs text-muted-foreground">
                  Receipt {receipt.id}
                  <br />
                  PayMongo {receipt.reference}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                An automatic download is attempted. If it does not appear, use the button below.
                This acknowledgement is not a tax invoice.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void perform(() => downloadReceipt(receipt, title))}>
                  <Download className="mr-2 h-4 w-4" />
                  Download receipt
                </Button>
                <Button variant="outline" onClick={() => setReceipt(null)}>
                  Enter course
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

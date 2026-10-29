export type Receipt = {
  id: string;
  plan: string;
  amountCentavos: number;
  reference: string;
  paidAt: string;
  expiresAt: string | null;
};
export type Certificate = {
  id: string;
  studentName: string;
  courseTitle: string;
  issuedAt: string;
};
export const money = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
export const documentDate = (date: string) =>
  new Date(date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
export async function downloadReceipt(receipt: Receipt, course: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setTextColor(20, 65, 55);
  pdf.setFontSize(22);
  pdf.text("Math & Finance Pro", 20, 25);
  pdf.setFontSize(15);
  pdf.text("PAYMENT RECEIPT", 20, 42);
  pdf.setTextColor(40);
  pdf.setFontSize(11);
  const lines = [
    `Receipt: ${receipt.id}`,
    `Course: ${course}`,
    `Plan: ${receipt.plan}`,
    `Amount paid: PHP ${(receipt.amountCentavos / 100).toFixed(2)}`,
    `Paid: ${documentDate(receipt.paidAt)}`,
    `PayMongo reference: ${receipt.reference}`,
    `Current access: ${receipt.expiresAt ? `until ${documentDate(receipt.expiresAt)}` : "No expiry"}`,
    "Payment confirmed by PayMongo.",
  ];
  let y = 58;
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line, 170);
    pdf.text(wrapped, 20, y);
    y += wrapped.length * 6 + 5;
  }
  pdf.setFontSize(9);
  pdf.text("Course payment acknowledgement. Not a tax invoice.", 20, y + 12);
  pdf.save(`MFP-receipt-${receipt.id}.pdf`);
}
export async function downloadCertificate(c: Certificate) {
  const [{ jsPDF }, qr] = await Promise.all([import("jspdf"), import("qrcode")]);
  const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
  pdf.setDrawColor(22, 72, 58);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, 277, 190);
  pdf.setDrawColor(180, 145, 70);
  pdf.setLineWidth(0.5);
  pdf.rect(14, 14, 269, 182);
  pdf.setTextColor(22, 72, 58);
  pdf.setFont("times", "bold");
  pdf.setFontSize(18);
  pdf.text("MATH & FINANCE PRO", 148.5, 35, { align: "center" });
  pdf.setFontSize(34);
  pdf.text("Certificate of Completion", 148.5, 58, { align: "center" });
  pdf.setFont("times", "normal");
  pdf.setFontSize(13);
  pdf.text("This certifies that", 148.5, 78, { align: "center" });
  pdf.setFont("times", "italic");
  pdf.setFontSize(27);
  let nameSize = 27;
  while (pdf.getTextWidth(c.studentName) > 240 && nameSize > 12) {
    pdf.setFontSize(--nameSize);
  }
  pdf.text(pdf.splitTextToSize(c.studentName, 240), 148.5, 95, { align: "center" });
  pdf.setFont("times", "normal");
  pdf.setFontSize(13);
  pdf.text("has successfully passed all course quizzes and examinations in", 148.5, 116, {
    align: "center",
  });
  pdf.setFont("times", "bold");
  pdf.setFontSize(19);
  let titleSize = 19;
  while (pdf.splitTextToSize(c.courseTitle, 230).length > 2 && titleSize > 10) {
    pdf.setFontSize(--titleSize);
  }
  pdf.text(pdf.splitTextToSize(c.courseTitle, 230), 148.5, 131, { align: "center" });
  pdf.setFont("times", "normal");
  pdf.setFontSize(11);
  pdf.text(`Issued ${documentDate(c.issuedAt)}`, 25, 165);
  pdf.setFontSize(9);
  pdf.text(`Certificate ID: ${c.id}`, 25, 177);
  pdf.text("Course completion credential issued by Math & Finance Pro.", 25, 185);
  const url = `${window.location.origin}/api/public/verify-certificate?id=${c.id}`;
  pdf.addImage(await qr.toDataURL(url, { margin: 1, width: 160 }), "PNG", 241, 153, 30, 30);
  pdf.text("Scan to verify", 256, 188, { align: "center" });
  pdf.save(`MFP-certificate-${c.id}.pdf`);
}

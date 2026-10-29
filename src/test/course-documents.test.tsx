import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { receipts, certificate, download } = vi.hoisted(() => ({
  receipts: vi.fn(),
  certificate: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/paymongo.functions", () => ({ courseReceipts: receipts }));
vi.mock("@/lib/certificates.functions", () => ({ courseCertificate: certificate }));
vi.mock("@/lib/course-documents", () => ({
  downloadReceipt: download,
  downloadCertificate: vi.fn(),
  money: (n: number) => `PHP ${n / 100}`,
  documentDate: (d: string) => d,
}));
import { CourseDocuments } from "@/components/CourseDocuments";
const id = "00000000-0000-4000-8000-000000000001";
const receipt = {
  id,
  plan: "monthly",
  amountCentavos: 25000,
  reference: "cs_verified",
  paidAt: "2026-10-29",
  expiresAt: "2026-11-29",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(checkoutId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CourseDocuments
        courseId="course"
        title="Finance"
        userId="student"
        checkoutId={checkoutId}
        allowed={false}
      />
    </QueryClientProvider>,
  );
}
it("keeps the receipt popup and download hidden until a verified receipt exists", async () => {
  receipts.mockResolvedValue([]);
  mount(id);
  expect(await screen.findByRole("status")).toHaveTextContent("Confirming your payment");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(download).not.toHaveBeenCalled();
});
it("opens the paid receipt and attempts its download automatically", async () => {
  receipts.mockResolvedValue([receipt]);
  download.mockResolvedValue(undefined);
  mount(id);
  expect(await screen.findByRole("dialog")).toHaveTextContent("PHP 250");
  await waitFor(() => expect(download).toHaveBeenCalledExactlyOnceWith(receipt, "Finance"));
  fireEvent.click(screen.getByRole("button", { name: "Enter course" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /View/ }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("does not download old receipts merely because a customer opens a course", async () => {
  receipts.mockResolvedValue([receipt]);
  mount();
  await screen.findByText("Your payment receipts (1)");
  expect(download).not.toHaveBeenCalled();
});

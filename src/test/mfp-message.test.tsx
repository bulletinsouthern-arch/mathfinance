import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MfpMessage } from "@/components/MfpMessage";

afterEach(cleanup);

describe("MFP rich answers", () => {
  it("formats headings and emphasis while preserving money and emojis", () => {
    render(<MfpMessage content={'## 💡 Your result\n\n**Total:** $50 plus $100 = $150.\n\n- Multiply by 2 × 3.'} />);
    expect(screen.getByRole("heading").textContent).toBe("💡 Your result");
    expect(screen.getByText("Total:").tagName).toBe("STRONG");
    expect(screen.getByText(/plus/).textContent).toContain("$50 plus $100 = $150");
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("makes both bare URLs and named sources safe clickable links", () => {
    render(<MfpMessage content={'[Reference](https://example.com/guide)\n\nhttps://example.org/source'} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://example.com/guide");
    expect(links[1]).toHaveAttribute("target", "_blank");
    expect(links[1]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders equations without removing currency", () => {
    const { container } = render(<MfpMessage content={'Cost: $50. Formula: \\(\\frac{1}{2} \\times 100\\).\n\n$$\nx^2 = 4\n$$'} />);
    expect(container.textContent).toContain("Cost: $50");
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".katex-display")).toBeInTheDocument();
  });

  it("does not execute HTML or create dangerous links or remote images", () => {
    const { container } = render(<MfpMessage content={'[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n![image](https://example.com/pixel.png)'} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { formulaSentence, sentenceText, type SentenceContext } from "@/lib/formula-sentence";

const labels: Record<string, string> = { Price: "Price per Unit", Units_Sold: "Units Sold", Debt: "Debt", Cost: "Cost" };
const peso = (n: number) => `₱${n.toLocaleString("en-US")}`;
const nums = { Price: 500, Units_Sold: 1000, Debt: 2000, Cost: 100 };
const ctx = (result: number | null, outputLabel = "Revenue"): SentenceContext => ({
  label: (k) => labels[k] ?? k,
  value: (k) => (k === "Units_Sold" ? (nums as Record<string, number>)[k]!.toLocaleString("en-US") : peso((nums as Record<string, number>)[k]!)),
  money: peso,
  outputLabel,
  result,
});

describe("formula sentence", () => {
  it("reads a minus debt as standard accounting", () => {
    const s = formulaSentence("Price * Units_Sold - Debt", nums, ctx(498000));
    expect(sentenceText(s)).toBe("Gross Revenue (₱500,000) MINUS Debt (₱2,000) = ₱498,000 Net Revenue.");
    expect(s.debtSign).toBe("-");
    expect(s.terms["t0"]!.full).toBe("Gross Revenue (Price per Unit × Units Sold)");
    expect(s.terms["t1"]!.full).toBe("Less: Debt");
  });

  it("flags a plus debt as a total base pool", () => {
    const s = formulaSentence("Price * Units_Sold + Debt", nums, ctx(502000));
    expect(sentenceText(s)).toBe("Gross Revenue (₱500,000) PLUS Debt (₱2,000) = ₱502,000 Total Base Pool.");
    expect(s.debtSign).toBe("+");
    expect(s.terms["t1"]!.short).toBe("Add: Debt");
  });

  it("spells out times and divided by", () => {
    expect(sentenceText(formulaSentence("Price * Units_Sold", nums, ctx(500000))))
      .toBe("Price per Unit (₱500) TIMES Units Sold (1,000) = ₱500,000 Revenue.");
    expect(sentenceText(formulaSentence("Price / Units_Sold", nums, ctx(0.5))))
      .toBe("Price per Unit (₱500) DIVIDED BY Units Sold (1,000) = ₱0.5 Revenue.");
  });

  it("does not call a cost formula gross revenue", () => {
    const s = formulaSentence("Cost * Units_Sold - Debt", nums, ctx(98000, "Total cost"));
    expect(sentenceText(s)).toBe("Cost (₱100) TIMES Units Sold (1,000) MINUS Debt (₱2,000) = ₱98,000 Total cost.");
    expect(s.terms["t1"]!.short).toBe("Less: Debt");
  });

  it("leaves out the answer when it cannot be worked out", () => {
    expect(sentenceText(formulaSentence("Price - Debt", nums, ctx(null)))).toBe("Price per Unit (₱500) MINUS Debt (₱2,000).");
  });
});

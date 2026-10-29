import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MfpPracticeQuiz } from "@/components/MfpPracticeQuiz";
import { parsePracticeQuestions } from "@/lib/practice-questions";
afterEach(cleanup);
const batch =
  "**Question 1 of 2**\n\nWhat is 2 + 2?\nA. 3\nB. 4\nC. 5\nD. 6\n\n**Question 2 of 2**\n\nWhat is 1 + 1?\nA. 2\nB. 3\nC. 4\nD. 5";
it("keeps each question's options separate and rejects incomplete batches", () => {
  const questions = parsePracticeQuestions(batch);
  expect(questions).toHaveLength(2);
  expect(questions[0]!.options[0]!.text).toBe("3");
  expect(questions[1]!.options[0]!.text).toBe("2");
  expect(parsePracticeQuestions(batch.split("**Question 2")[0]!)).toEqual([]);
});
it("submits selected letters with the right item numbers", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <MfpPracticeQuiz content={batch} format="multiple-choice" disabled={false} onSubmit={submit} />,
  );
  expect(screen.getByRole("button", { name: "Submit answers" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "B 4" }));
  fireEvent.click(screen.getByRole("button", { name: "A 2" }));
  expect(screen.getByRole("button", { name: "B 4" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith("1: B\n2: A"));
  expect(screen.getByRole("button", { name: "Answers submitted" })).toBeDisabled();
});
it("gives every open-ended item a separate answer box", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <MfpPracticeQuiz
      content={"**Question 1 of 2**\nExplain interest.\n\n**Question 2 of 2**\nExplain profit.\n"}
      format="open-ended"
      disabled={false}
      onSubmit={submit}
    />,
  );
  const boxes = screen.getAllByRole("textbox");
  expect(boxes).toHaveLength(2);
  fireEvent.change(boxes[0]!, { target: { value: "Cost of borrowing" } });
  fireEvent.change(boxes[1]!, { target: { value: "Revenue minus costs" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith("1: Cost of borrowing\n2: Revenue minus costs"),
  );
});
it("prevents answering a quiz from an earlier conversation turn", () => {
  render(<MfpPracticeQuiz content={batch} format="multiple-choice" disabled onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "B 4" })).toBeDisabled();
});

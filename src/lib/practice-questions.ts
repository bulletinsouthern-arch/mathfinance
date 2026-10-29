import { quizOptions } from "./mfp-study";
export type PracticeQuestion = {
  number: number;
  total: number;
  text: string;
  options: { letter: string; text: string }[];
};
export function parsePracticeQuestions(content: string): PracticeQuestion[] {
  const headings = [
    ...content.matchAll(
      /(?:^|\n)[ \t]*(?:#{1,3}\s*)?\*{0,2}Question (\d+) of (\d+)\*{0,2}[^\n]*\n/gi,
    ),
  ];
  if (!headings.length) return [];
  const total = Number(headings[0]![2]);
  if (
    total < 1 ||
    total > 20 ||
    headings.length !== total ||
    !headings.every((m, i) => Number(m[1]) === i + 1 && Number(m[2]) === total)
  )
    return [];
  return headings.map((m, i) => {
    const body = content
      .slice(m.index! + m[0].length, headings[i + 1]?.index ?? content.length)
      .trim();
    const options = quizOptions(body);
    const optionStart = body.search(/^[ \t>*-]*\**\(?[Aa][.)]\**[ \t]+/m);
    const text = (options.length && optionStart >= 0 ? body.slice(0, optionStart) : body)
      .replace(
        /\n+(?:Send|Submit|Answer all|Provide your) (?:your |the )?(?:numbered )?answers[\s\S]*$/i,
        "",
      )
      .trim();
    return { number: i + 1, total, text, options };
  });
}

// Lets any page open the MFP assistant with a prepared question.
export const MFP_ASK = "mfp-ask";
export const MFP_STUDY_CONTEXT = "mfp-study-context";
export type StudyContext = { course: string; lesson: string; content: string };
export type StudyContextRequest = CustomEvent<{ provide: (context: StudyContext) => void }>;

// Request only the currently visible, authorized lesson, without coupling chat to its page.
export function getStudyContext(): StudyContext | undefined {
  let context: StudyContext | undefined;
  window.dispatchEvent(new CustomEvent(MFP_STUDY_CONTEXT, {
    detail: { provide: (value: StudyContext) => { context = value; } },
  }));
  return context;
}
export function askMfp(text: string) {
  window.dispatchEvent(new CustomEvent<string>(MFP_ASK, { detail: text }));
}

// Lets any page open the MFP assistant with a prepared question.
export const MFP_ASK = "mfp-ask";
export function askMfp(text: string) {
  window.dispatchEvent(new CustomEvent<string>(MFP_ASK, { detail: text }));
}

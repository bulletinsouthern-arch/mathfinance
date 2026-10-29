export function downloadAnswer(content: string, format: "txt" | "md") {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `mfp-document.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Print the rendered answer so Unicode, equations and tables survive PDF export.
export function printAnswer(element: HTMLElement) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  popup.opener = null;
  popup.document.title = "MFP document";
  for (const style of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    popup.document.head.appendChild(style.cloneNode(true));
  }
  const printStyle = popup.document.createElement("style");
  printStyle.textContent = "body{background:white!important;color:#171717!important;padding:24px} .mfp-message{font-size:12pt;line-height:1.6} pre,table{white-space:pre-wrap;overflow:visible!important} @page{margin:18mm} @media print{body{padding:0} a{color:inherit}}";
  popup.document.head.appendChild(printStyle);
  popup.document.body.appendChild(element.cloneNode(true));
  // Styles and equation fonts must finish loading before opening print preview.
  popup.onload = async () => { await popup.document.fonts.ready; popup.focus(); popup.print(); };
  popup.document.close();
  return true;
}

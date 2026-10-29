export function ReadingPace({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  return <div className="space-y-1.5">
    <div role="group" aria-label="Reading speed" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold text-muted-foreground">Reading speed</span>
      {([{ rate: 0.8, label: "Slower · 0.8×" }, { rate: 1, label: "Natural pace · 1×" }, { rate: 1.25, label: "Faster · 1.25×" }, { rate: 1.5, label: "Fast · 1.5×" }]).map(option =>
        <button key={option.rate} type="button" aria-pressed={rate === option.rate} onClick={() => onChange(option.rate)} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${rate === option.rate ? "border-primary bg-accent text-primary" : "border-border bg-background hover:bg-accent"}`}>{option.label}</button>
      )}
    </div>
    <p className="text-xs text-muted-foreground">Speed changes apply from the next passage. Natural pace uses normal speaking speed.</p>
  </div>;
}

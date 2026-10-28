import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
const colors = ["#d4ad55", "#1c6658", "#4d8f83", "#8bb9ac", "#b8c6a0", "#6f7f89"];
export function EquationPie({ values }: { values: Record<string, string> }) {
  const entries = Object.entries(values)
    .filter(([, v]) => v.trim() !== "")
    .map(([name, v]) => ({ name: name.replaceAll("_", " "), value: Number(v) }));
  const valid =
    entries.length >= 2 &&
    entries.every((x) => Number.isFinite(x.value) && x.value >= 0) &&
    entries.some((x) => x.value > 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
        Business pie · Input composition
      </p>
      {valid ? (
        <>
          <div
            className="h-56"
            role="img"
            aria-label={entries.map((x) => `${x.name}: ${x.value}`).join(", ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={entries}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {entries.map((x, i) => (
                    <Cell key={x.name} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {entries.map((x, i) => (
              <span key={x.name}>
                <span style={{ color: colors[i % colors.length] }}>●</span> {x.name}:{" "}
                {x.value.toLocaleString()}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Relative input values, not a breakdown of the calculated result. Compare inputs with
            compatible units.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Enter at least two nonnegative input values to display a pie chart. Negative values and
          equations without inputs do not form pie slices.
        </p>
      )}
    </section>
  );
}

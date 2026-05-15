"use client";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

const COLORS = ["#66B2B2", "#F59E0B", "#EF4444", "#6366F1", "#16A34A"];

export function DonutChart({
  data,
  total,
  totalLabel = "Total",
  height = 260,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
  total?: number | string;
  totalLabel?: string;
  height?: number;
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {total !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold text-ink">{total}</div>
          <div className="text-xs text-ink-muted">{totalLabel}</div>
        </div>
      )}
    </div>
  );
}

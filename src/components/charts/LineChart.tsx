"use client";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export function LineChart({
  data,
  xKey,
  yKey,
  height = 260,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#EEF2F4" vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            boxShadow: "0 8px 20px rgba(16,24,40,.08)",
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke="#66B2B2"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#66B2B2", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </RLineChart>
    </ResponsiveContainer>
  );
}

"use client";
import { useAuth } from "@/hooks/useAuth";
import EmployeeDashboard from "@/features/dashboards/EmployeeDashboard";
import AdminDashboard from "@/features/dashboards/AdminDashboard";

export default function DashboardPage() {
  const user = useAuth();
  if (!user) return null;
  if (user.role === "admin" || user.role === "manager") return <AdminDashboard />;
  return <EmployeeDashboard />;
}

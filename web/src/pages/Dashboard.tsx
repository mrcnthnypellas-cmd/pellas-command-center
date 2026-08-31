import { useAuth } from "../lib/auth";
import EmployeeDashboard from "./employee/EmployeeDashboard";
import OverviewDashboard from "./admin/OverviewDashboard";

export default function Dashboard() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role === "employee") return <EmployeeDashboard />;
  return <OverviewDashboard />;
}

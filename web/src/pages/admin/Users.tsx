import { useEffect, useState } from "react";
import { Plus, KeyRound, Ban, CheckCircle, Pencil, Trash2, Search } from "lucide-react";
import { supabase, callAdminFunction } from "../../lib/supabase";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";
import { Button, Card, Modal, Input, Select, ConfirmDialog, Spinner, EmptyState } from "../../components/ui/ui";
import type { Profile, Department, WorkSchedule, Role } from "../../types";

type UserRow = Profile;

const emptyForm = {
  username: "", password: "", first_name: "", middle_name: "", last_name: "",
  role: "employee" as Role, department_id: "", position: "", employee_code: "",
  email: "", phone: "", date_hired: "", schedule_id: "",
};

export default function Users() {
  const { profile: me } = useAuth();
  const { push } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [statusTarget, setStatusTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: u }, { data: d }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*, departments(name)").order("created_at", { ascending: false }),
      supabase.from("departments").select("*").eq("is_active", true).order("name"),
      supabase.from("work_schedules").select("*").eq("is_active", true).order("name"),
    ]);
    setUsers((u as UserRow[]) ?? []);
    setDepartments((d as Department[]) ?? []);
    setSchedules((s as WorkSchedule[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = users.filter((u) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || `${u.first_name} ${u.last_name} ${u.username} ${u.employee_code ?? ""}`.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  async function handleCreate() {
    if (!form.username || !form.password || !form.first_name || !form.last_name) {
      push("error", "Please fill in username, password, first name and last name.");
      return;
    }
    setSaving(true);
    try {
      await callAdminFunction("create_user", { ...form, department_id: form.department_id || null, schedule_id: form.schedule_id || null, date_hired: form.date_hired || null });
      push("success", `User "${form.username}" created.`);
      setCreateOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editUser) return;
    setSaving(true);
    try {
      await callAdminFunction("update_user", {
        user_id: editUser.id,
        username: editUser.username,
        first_name: editUser.first_name,
        middle_name: editUser.middle_name,
        last_name: editUser.last_name,
        role: editUser.role,
        department_id: editUser.department_id,
        position: editUser.position,
        employment_status: editUser.employment_status,
        schedule_id: editUser.schedule_id,
        employee_code: editUser.employee_code,
        email: editUser.email,
        phone: editUser.phone,
        date_hired: editUser.date_hired,
      });
      push("success", "User updated.");
      setEditUser(null);
      load();
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!resetUser || newPassword.length < 6) {
      push("error", "Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    try {
      await callAdminFunction("reset_password", { user_id: resetUser.id, new_password: newPassword });
      push("success", `Password reset for ${resetUser.username}.`);
      setResetUser(null);
      setNewPassword("");
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!statusTarget) return;
    setSaving(true);
    const next = statusTarget.status === "active" ? "inactive" : "active";
    try {
      await callAdminFunction("set_status", { user_id: statusTarget.id, status: next });
      push("success", `${statusTarget.username} is now ${next}.`);
      setStatusTarget(null);
      load();
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await callAdminFunction("delete_user", { user_id: deleteTarget.id });
      push("success", `${deleteTarget.username} deleted.`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Users</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create User</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search name, username, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-40">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="hr">HR</option>
          <option value="employee">Employee</option>
        </Select>
      </div>

      <Card className="overflow-x-auto">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{u.first_name} {u.last_name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.username}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3">{u.departments?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Edit" onClick={() => setEditUser(u)}><Pencil className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Reset password" onClick={() => setResetUser(u)}><KeyRound className="h-4 w-4" /></IconBtn>
                      <IconBtn title={u.status === "active" ? "Deactivate" : "Activate"} onClick={() => setStatusTarget(u)}>
                        {u.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      </IconBtn>
                      {u.id !== me?.id && (
                        <IconBtn title="Delete" danger onClick={() => setDeleteTarget(u)}><Trash2 className="h-4 w-4" /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create user */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create User" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="Temporary Password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input label="First Name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <Input label="Middle Name" value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} />
          <Input label="Last Name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <Input label="Employee ID" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </Select>
          <Select label="Department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <Select label="Schedule" value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })}>
            <option value="">—</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Date Hired" type="date" value={form.date_hired} onChange={(e) => setForm({ ...form, date_hired: e.target.value })} />
          <Input label="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={saving}>Create</Button>
        </div>
      </Modal>

      {/* Edit user */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User" wide>
        {editUser && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Username" value={editUser.username} onChange={(e) => setEditUser({ ...editUser, username: e.target.value })} />
              <Input label="Employee ID" value={editUser.employee_code ?? ""} onChange={(e) => setEditUser({ ...editUser, employee_code: e.target.value })} />
              <Input label="First Name" value={editUser.first_name} onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })} />
              <Input label="Last Name" value={editUser.last_name} onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })} />
              <Select label="Role" value={editUser.role} onChange={(e) => setEditUser({ ...editUser, role: e.target.value as Role })}>
                <option value="employee">Employee</option>
                <option value="hr">HR</option>
                <option value="admin">Admin</option>
              </Select>
              <Select label="Department" value={editUser.department_id ?? ""} onChange={(e) => setEditUser({ ...editUser, department_id: e.target.value || null })}>
                <option value="">—</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Input label="Position" value={editUser.position ?? ""} onChange={(e) => setEditUser({ ...editUser, position: e.target.value })} />
              <Select label="Employment Status" value={editUser.employment_status} onChange={(e) => setEditUser({ ...editUser, employment_status: e.target.value as any })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="separated">Separated</option>
              </Select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={handleUpdate} loading={saving}>Save Changes</Button>
            </div>
          </>
        )}
      </Modal>

      {/* Reset password */}
      <Modal open={!!resetUser} onClose={() => { setResetUser(null); setNewPassword(""); }} title={`Reset Password — ${resetUser?.username ?? ""}`}>
        <Input label="New Password" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setResetUser(null); setNewPassword(""); }}>Cancel</Button>
          <Button onClick={handleResetPassword} loading={saving}>Reset Password</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === "active" ? "Deactivate User" : "Activate User"}
        message={`Are you sure you want to ${statusTarget?.status === "active" ? "deactivate" : "activate"} ${statusTarget?.username}?`}
        confirmLabel={statusTarget?.status === "active" ? "Deactivate" : "Activate"}
        danger={statusTarget?.status === "active"}
        loading={saving}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        message={`This permanently deletes ${deleteTarget?.username} and cannot be undone. Continue?`}
        confirmLabel="Delete"
        danger
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function IconBtn({ children, title, danger, onClick }: { children: React.ReactNode; title: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 hover:bg-slate-100 ${danger ? "text-red-500 hover:bg-red-50" : "text-slate-500"}`}
    >
      {children}
    </button>
  );
}

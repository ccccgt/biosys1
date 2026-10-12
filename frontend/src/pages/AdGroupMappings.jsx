import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { swalConfirm, swalError, swalSuccess } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

export default function SystemUsers() {
  const token = localStorage.getItem("token");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const loadUsers = async () => {
    const res = await axios.get(`${API}/api/system-users`, {
      headers,
      params: q ? { q } : {},
    });
    setUsers(Array.isArray(res.data) ? res.data : []);
  };

  const loadRoles = async () => {
    const res = await axios.get(`${API}/api/roles`, { headers });
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  const loadUser = async (id) => {
    const res = await axios.get(`${API}/api/system-users/${id}`, { headers });
    setSelected(res.data);
  };

  useEffect(() => {
    loadUsers();
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!selected?.id) return;

    setSaving(true);
    try {
      await axios.put(`${API}/api/system-users/${selected.id}`, selected, { headers });
      await loadUsers();
      await loadUser(selected.id);
      await swalSuccess("Usuario actualizado correctamente");
    } catch (err) {
      console.error(err);
      await swalError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          "Error actualizando usuario"
      );
    } finally {
      setSaving(false);
    }
  };

  const resyncAd = async () => {
    if (!selected?.id) return;

    const ok = await swalConfirm({
      title: "Re-sincronizar usuario",
      text: "Se volverán a leer los datos y grupos desde Active Directory.",
      confirmButtonText: "Sí, resincronizar",
    });

    if (!ok) return;

    setResyncing(true);
    try {
      await axios.post(`${API}/api/system-users/${selected.id}/resync-ad`, {}, { headers });
      await loadUsers();
      await loadUser(selected.id);
      await swalSuccess("Usuario resincronizado desde AD");
    } catch (err) {
      console.error(err);
      await swalError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          "Error resincronizando usuario"
      );
    } finally {
      setResyncing(false);
    }
  };

  const selectedRole = roles.find((r) => Number(r.id) === Number(selected?.role_id));

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Usuarios del sistema</h1>
            <p className="text-sm text-slate-500">
              Administración local de perfiles y roles de BioSys
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              to="/roles"
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Permisos por rol
            </Link>

            <Link
              to="/ad-group-mappings"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Mapeo grupos AD
            </Link>

            <Link
              to="/permissions-diagnostic"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Diagnóstico permisos
            </Link>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar usuario..."
              className="border rounded-lg p-2 bg-sky-50"
            />
            <button
              onClick={loadUsers}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white"
            >
              Buscar
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold">Listado</div>
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left p-3">Usuario</th>
                    <th className="text-left p-3">Nombre</th>
                    <th className="text-left p-3">Rol</th>
                    <th className="text-left p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t cursor-pointer hover:bg-slate-50"
                      onClick={() => loadUser(u.id)}
                    >
                      <td className="p-3">{u.name}</td>
                      <td className="p-3">{u.display_name || u.email || "-"}</td>
                      <td className="p-3">{u.role_name || "-"}</td>
                      <td className="p-3">{Number(u.is_active) ? "Activo" : "Inactivo"}</td>
                    </tr>
                  ))}
                  {!users.length ? (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Sin usuarios
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-4">Detalle</div>

            {!selected ? (
              <div className="text-slate-500">Selecciona un usuario.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-600">Usuario</label>
                  <input value={selected.name || ""} disabled className="w-full mt-1 border rounded-lg p-2 bg-slate-100" />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Email</label>
                  <input value={selected.email || ""} disabled className="w-full mt-1 border rounded-lg p-2 bg-slate-100" />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Nombre a mostrar</label>
                  <input
                    value={selected.display_name || ""}
                    onChange={(e) => setSelected((p) => ({ ...p, display_name: e.target.value }))}
                    className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Employee Code</label>
                    <input
                      value={selected.employee_code || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, employee_code: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                      placeholder="Ej: 20170243"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Card ID</label>
                    <input
                      value={selected.card_id || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, card_id: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Rol</label>
                    <select
                      value={selected.role_id || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, role_id: Number(e.target.value) }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    >
                      <option value="">Seleccione</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Estado</label>
                    <select
                      value={Number(selected.is_active) ? "1" : "0"}
                      onChange={(e) => setSelected((p) => ({ ...p, is_active: Number(e.target.value) }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    >
                      <option value="1">Activo</option>
                      <option value="0">Inactivo</option>
                    </select>
                  </div>
                </div>

                {selectedRole ? (
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="font-medium mb-3">Permisos heredados del rol</div>
                    <div className="grid md:grid-cols-2 gap-2 text-sm">
                      <div>Usuarios del sistema: {Number(selectedRole.menu_users_enabled) ? "Sí" : "No"}</div>
                      <div>Dashboard: {Number(selectedRole.dashboard_enabled) ? "Sí" : "No"}</div>
                      <div>Reportes: {Number(selectedRole.reports_enabled) ? "Sí" : "No"}</div>
                      <div>Usuarios biométricos: {Number(selectedRole.biometric_users_enabled) ? "Sí" : "No"}</div>
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="text-sm text-slate-600">Grupos AD</label>
                  <div className="mt-2 border rounded-lg p-3 bg-slate-50 max-h-48 overflow-auto text-sm">
                    {selected.ad_groups?.length ? (
                      selected.ad_groups.map((g, i) => (
                        <div key={i} className="py-1 border-b last:border-b-0">
                          {g.group_name}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">Sin grupos AD</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>

                  <button
                    onClick={resyncAd}
                    disabled={resyncing || String(selected.auth_source || "").toLowerCase() !== "ad"}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {resyncing ? "Resincronizando..." : "Re-sincronizar desde AD"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
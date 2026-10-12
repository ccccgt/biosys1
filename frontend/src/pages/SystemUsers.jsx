import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { swalConfirm, swalError, swalSuccess } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

function formatDateTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 19);
}

function formatDateOnly(value) {
  if (!value) return "";
  const s = String(value);
  if (s.includes("T")) return s.slice(0, 10);
  if (s.includes(" ")) return s.slice(0, 10);
  return s;
}

function methodLabel(method) {
  if (method === "direct_user_mapping") return "Mapeo directo";
  if (method === "name_match") return "Coincidencia por nombre";
  if (method === "not_found") return "Sin coincidencia";
  return method || "-";
}

export default function SystemUsers() {
  const token = localStorage.getItem("token");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [employeeMatch, setEmployeeMatch] = useState(null);

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
    setEmployeeMatch(null);
  };

  const loadEmployeeMatch = async (id) => {
    setLoadingMatch(true);
    try {
      const res = await axios.get(`${API}/api/system-users/${id}/employee-match`, {
        headers,
      });
      setEmployeeMatch(res.data || null);
    } catch (err) {
      console.error(err);
      setEmployeeMatch(null);
      await swalError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          "Error consultando coincidencia en employees"
      );
    } finally {
      setLoadingMatch(false);
    }
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

  const filteredUsersInfo = useMemo(() => {
    return {
      total: users.length,
      adCount: users.filter((u) => String(u.auth_source || "").toLowerCase() === "ad").length,
      localCount: users.filter((u) => String(u.auth_source || "").toLowerCase() !== "ad").length,
    };
  }, [users]);

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Usuarios del sistema</h1>
            <p className="text-sm text-slate-500">
              Administración local de perfiles, roles y validación contra employees
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
              placeholder="Buscar usuario, employee o card..."
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

        <div className="mt-4 flex gap-3 flex-wrap text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 border">
            Total: {filteredUsersInfo.total}
          </span>
          <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            AD: {filteredUsersInfo.adCount}
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            Local: {filteredUsersInfo.localCount}
          </span>
        </div>

        <div className="grid xl:grid-cols-2 gap-6 mt-6">
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold">Listado</div>
            <div className="max-h-[720px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3">Usuario</th>
                    <th className="text-left p-3">Rol</th>
                    <th className="text-left p-3">Employee</th>
                    <th className="text-left p-3">Card</th>
                    <th className="text-left p-3">Fuente</th>
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
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500">
                          {u.display_name || u.email || "-"}
                        </div>
                      </td>
                      <td className="p-3">{u.role_name || "-"}</td>
                      <td className="p-3">{u.employee_code || "-"}</td>
                      <td className="p-3">{u.card_id || "-"}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 rounded bg-slate-100 border text-xs">
                          {u.auth_source || "-"}
                        </span>
                      </td>
                      <td className="p-3">
                        {Number(u.is_active) ? (
                          <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs">
                            Activo
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">
                            Inactivo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!users.length ? (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={6}>
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
              <div className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Usuario</label>
                    <input
                      value={selected.name || ""}
                      disabled
                      className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Email</label>
                    <input
                      value={selected.email || ""}
                      disabled
                      className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                    />
                  </div>
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
                    <label className="text-sm text-slate-600">Primer nombre</label>
                    <input
                      value={selected.first_name || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, first_name: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Apellido</label>
                    <input
                      value={selected.last_name || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, last_name: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>
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
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, role_id: Number(e.target.value) }))
                      }
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
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, is_active: Number(e.target.value) }))
                      }
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    >
                      <option value="1">Activo</option>
                      <option value="0">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Fuente autenticación</label>
                    <input
                      value={selected.auth_source || ""}
                      disabled
                      className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Último login</label>
                    <input
                      value={formatDateTime(selected.last_login_at)}
                      disabled
                      className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Última sincronización</label>
                    <input
                      value={formatDateTime(selected.last_sync_at)}
                      disabled
                      className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Teléfono</label>
                    <input
                      value={selected.phone || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, phone: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Ciudad</label>
                    <input
                      value={selected.city || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, city: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Fecha de nacimiento</label>
                    <input
                      type="date"
                      value={formatDateOnly(selected.birth_date)}
                      onChange={(e) => setSelected((p) => ({ ...p, birth_date: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Organización</label>
                    <input
                      value={selected.organization || ""}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, organization: e.target.value }))
                      }
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600">Job Title</label>
                    <input
                      value={selected.job_title || ""}
                      onChange={(e) => setSelected((p) => ({ ...p, job_title: e.target.value }))}
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-600">Foto perfil URL</label>
                    <input
                      value={selected.profile_photo_url || ""}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, profile_photo_url: e.target.value }))
                      }
                      className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-600">Bio</label>
                  <textarea
                    value={selected.bio || ""}
                    onChange={(e) => setSelected((p) => ({ ...p, bio: e.target.value }))}
                    className="w-full mt-1 border rounded-lg p-2 bg-sky-50 min-h-[100px]"
                  />
                </div>

                {selectedRole ? (
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="font-medium mb-3">Permisos heredados del rol</div>
                    <div className="grid md:grid-cols-2 gap-2 text-sm">
                      <div>Usuarios del sistema: {Number(selectedRole.menu_users_enabled) ? "Sí" : "No"}</div>
                      <div>Dashboard: {Number(selectedRole.dashboard_enabled) ? "Sí" : "No"}</div>
                      <div>Reportes: {Number(selectedRole.reports_enabled) ? "Sí" : "No"}</div>
                      <div>Usuarios biométricos: {Number(selectedRole.biometric_users_enabled) ? "Sí" : "No"}</div>
                      <div>Solicitudes de marcaje: {Number(selectedRole.mark_requests_enabled) ? "Sí" : "No"}</div>
                      <div>Gestionar solicitudes: {Number(selectedRole.mark_requests_manage_enabled) ? "Sí" : "No"}</div>
                    </div>
                  </div>
                ) : null}

                <div className="border rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div className="font-medium">Coincidencia en employees</div>
                    <button
                      onClick={() => loadEmployeeMatch(selected.id)}
                      disabled={loadingMatch}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {loadingMatch ? "Buscando..." : "Ver coincidencia"}
                    </button>
                  </div>

                  {!employeeMatch ? (
                    <div className="text-sm text-slate-500">
                      Presiona “Ver coincidencia” para validar este usuario contra la tabla employees.
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <div className="text-slate-500">Resultado</div>
                          <div className="font-medium">
                            {employeeMatch.matched ? "Coincidencia encontrada" : "Sin coincidencia"}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Método</div>
                          <div className="font-medium">
                            {methodLabel(employeeMatch.method)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Score</div>
                          <div className="font-medium">{employeeMatch.score ?? "-"}</div>
                        </div>
                      </div>

                      {employeeMatch.employee ? (
                        <div className="grid md:grid-cols-2 gap-3 border rounded-lg p-3 bg-slate-50">
                          <div>
                            <div className="text-slate-500">Nombre employee</div>
                            <div className="font-medium">{employeeMatch.employee.full_name || "-"}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Employee Code</div>
                            <div className="font-medium">{employeeMatch.employee.employee_code || "-"}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Card ID</div>
                            <div className="font-medium">{employeeMatch.employee.card_id || "-"}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Departamento</div>
                            <div className="font-medium">{employeeMatch.employee.department || "-"}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Puesto</div>
                            <div className="font-medium">{employeeMatch.employee.position || "-"}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Estado</div>
                            <div className="font-medium">{employeeMatch.employee.status || "-"}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-red-600">
                          No se encontró una coincidencia suficientemente confiable en employees.
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
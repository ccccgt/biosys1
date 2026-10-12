import { useEffect, useState } from "react";
import axios from "axios";
import { swalConfirm, swalError, swalSuccess } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

export default function PermissionsDiagnostic() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const loadUsers = async () => {
    const res = await axios.get(`${API}/api/permissions-diagnostic/users`, {
      headers,
      params: q ? { q } : {},
    });
    setUsers(Array.isArray(res.data) ? res.data : []);
  };

  const loadDiagnostic = async (id) => {
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${API}/api/permissions-diagnostic/user/${id}`, {
        headers,
      });
      setSelected(res.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resyncAd = async () => {
    const id = selected?.user?.id;
    if (!id) return;

    const ok = await swalConfirm({
      title: "Re-sincronizar usuario",
      text: "Se volverán a leer los datos y grupos desde Active Directory.",
      confirmButtonText: "Sí, resincronizar",
    });

    if (!ok) return;

    setResyncing(true);
    try {
      await axios.post(`${API}/api/system-users/${id}/resync-ad`, {}, { headers });
      await loadUsers();
      await loadDiagnostic(id);
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

  const permBadge = (value) => (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        Number(value) ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {Number(value) ? "Sí" : "No"}
    </span>
  );

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Diagnóstico de permisos</h1>
            <p className="text-sm text-slate-500 mt-1">
              Verifica grupos AD, mapeos coincidentes y permisos efectivos de cada usuario.
            </p>
          </div>

          <div className="flex gap-2">
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

        <div className="grid xl:grid-cols-2 gap-6 mt-6">
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold">Usuarios</div>
            <div className="max-h-[700px] overflow-auto">
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
                      onClick={() => loadDiagnostic(u.id)}
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
            <div className="font-semibold mb-4 flex items-center justify-between gap-3">
              <span>Detalle de diagnóstico</span>
              {selected?.user?.id ? (
                <button
                  onClick={resyncAd}
                  disabled={resyncing || String(selected?.user?.auth_source || "").toLowerCase() !== "ad"}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 text-sm"
                >
                  {resyncing ? "Resincronizando..." : "Re-sincronizar desde AD"}
                </button>
              ) : null}
            </div>

            {loadingDetail ? (
              <div className="text-slate-500">Cargando diagnóstico...</div>
            ) : !selected ? (
              <div className="text-slate-500">Selecciona un usuario.</div>
            ) : (
              <div className="space-y-6">
                <div className="border rounded-xl p-4 bg-slate-50">
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500">Usuario</div>
                      <div className="font-medium">{selected.user?.name}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Nombre</div>
                      <div className="font-medium">{selected.user?.display_name || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Email</div>
                      <div className="font-medium">{selected.user?.email || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Rol actual en users</div>
                      <div className="font-medium">{selected.user?.role_name || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Auth source</div>
                      <div className="font-medium">{selected.user?.auth_source || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Estado</div>
                      <div className="font-medium">
                        {Number(selected.user?.is_active) ? "Activo" : "Inactivo"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <div className="font-semibold mb-3">Grupos AD detectados</div>
                  <div className="max-h-48 overflow-auto text-sm space-y-2">
                    {selected.groups?.length ? (
                      selected.groups.map((g, idx) => (
                        <div key={idx} className="border rounded-lg p-2 bg-slate-50">
                          <div className="font-medium">{g.group_name}</div>
                          <div className="text-xs text-slate-500 break-all">{g.group_dn}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">Sin grupos AD</div>
                    )}
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <div className="font-semibold mb-3">Mapeos AD coincidentes</div>
                  <div className="max-h-48 overflow-auto text-sm space-y-2">
                    {selected.matching_mappings?.length ? (
                      selected.matching_mappings.map((m) => (
                        <div key={m.id} className="border rounded-lg p-3 bg-slate-50">
                          <div className="font-medium">{m.ad_group_name}</div>
                          <div className="text-xs text-slate-500 mb-2">
                            Rol mapeado: {m.role_name || "-"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">No hay mapeos que coincidan con sus grupos</div>
                    )}
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <div className="font-semibold mb-3">Permisos del rol actual</div>
                  {selected.role_permissions ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Usuarios sistema: {permBadge(selected.role_permissions.menu_users_enabled)}</div>
                      <div>Dashboard: {permBadge(selected.role_permissions.dashboard_enabled)}</div>
                      <div>Reportes: {permBadge(selected.role_permissions.reports_enabled)}</div>
                      <div>Usuarios biométricos: {permBadge(selected.role_permissions.biometric_users_enabled)}</div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm">Este rol aún no tiene permisos configurados.</div>
                  )}
                </div>

                <div className="border rounded-xl p-4 bg-indigo-50">
                  <div className="font-semibold mb-3">Resultado efectivo</div>
                  <div className="text-sm mb-2">
                    <span className="text-slate-500">Fuente:</span>{" "}
                    <span className="font-medium">{selected.resolved?.source || "-"}</span>
                  </div>
                  <div className="text-sm mb-3">
                    <span className="text-slate-500">Rol final:</span>{" "}
                    <span className="font-medium">{selected.resolved?.role || "-"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Usuarios sistema: {permBadge(selected.resolved?.permissions?.menu_users_enabled)}</div>
                    <div>Dashboard: {permBadge(selected.resolved?.permissions?.dashboard_enabled)}</div>
                    <div>Reportes: {permBadge(selected.resolved?.permissions?.reports_enabled)}</div>
                    <div>Usuarios biométricos: {permBadge(selected.resolved?.permissions?.biometric_users_enabled)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
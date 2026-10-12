import { useEffect, useState } from "react";
import axios from "axios";
import { swalError, swalSuccess } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

export default function Roles() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRoles = async () => {
    try {
      const res = await axios.get(`${API}/api/roles`, { headers });
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      await swalError("Error cargando roles");
    }
  };

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!selected?.id) return;

    setSaving(true);
    try {
      await axios.put(`${API}/api/roles/${selected.id}`, selected, { headers });
      await loadRoles();
      await swalSuccess("Permisos del rol actualizados");
    } catch (err) {
      console.error(err);
      await swalError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          "Error actualizando permisos del rol"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permisos por rol</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define aquí los permisos base de cada rol. Los usuarios heredarán estos permisos según su rol.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold">Roles</div>
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left p-3">Rol</th>
                    <th className="text-left p-3">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelected({ ...r })}
                    >
                      <td className="p-3">{r.name}</td>
                      <td className="p-3">{r.description || "-"}</td>
                    </tr>
                  ))}
                  {!roles.length ? (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={2}>
                        Sin roles
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-4">Detalle del rol</div>

            {!selected ? (
              <div className="text-slate-500">Selecciona un rol.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-600">Rol</label>
                  <input
                    value={selected.name || ""}
                    disabled
                    className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Descripción</label>
                  <input
                    value={selected.description || ""}
                    disabled
                    className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.menu_users_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, menu_users_enabled: e.target.checked ? 1 : 0 }))
                      }
                    />
                    <span>Menú usuarios del sistema</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.dashboard_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, dashboard_enabled: e.target.checked ? 1 : 0 }))
                      }
                    />
                    <span>Dashboard</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.reports_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, reports_enabled: e.target.checked ? 1 : 0 }))
                      }
                    />
                    <span>Reportes</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.biometric_users_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({
                          ...p,
                          biometric_users_enabled: e.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    <span>Usuarios biométricos</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.mark_requests_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({
                          ...p,
                          mark_requests_enabled: e.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    <span>Solicitudes de marcajes</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected.mark_requests_manage_enabled}
                      onChange={(e) =>
                        setSelected((p) => ({
                          ...p,
                          mark_requests_manage_enabled: e.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    <span>Gestionar solicitudes</span>
                  </label>
                </div>

                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
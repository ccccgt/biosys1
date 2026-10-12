import { useEffect, useState } from "react";
import axios from "axios";
import { alertSuccess, alertError, alertConfirm, alertInfo } from "../../utils/alerts";

const API = import.meta.env.VITE_API_URL || "";

const EMPTY_FORM = {
  id: "",
  employee_code: "",
  biometric_user_id: "",
  card_id: "",
  full_name: "",
  department: "",
  position: "",
  status: "active",
};

export default function UsersManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewRange, setPreviewRange] = useState(null);

  async function loadUsers() {
    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(`${API}/api/biometric-users`, {
        params: {
          q: search || "",
          status: statusFilter || "",
          limit: 500,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 20000,
      });

      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      console.error("Error cargando usuarios biométricos:", err);
      await alertError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "No se pudo cargar el listado de usuarios biométricos."
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadPreviewAutoInactive() {
    setPreviewLoading(true);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(`${API}/api/biometric-users/preview/auto-inactive`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 20000,
      });

      setPreviewItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setPreviewRange(res.data?.range || null);
    } catch (err) {
      console.error("Error preview auto inactive:", err);
      await alertError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "No se pudo cargar el preview de auto-inactive."
      );
      setPreviewItems([]);
      setPreviewRange(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadPreviewAutoInactive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEditor(row) {
    setSelected(row);
    setForm({
      id: row?.id ?? "",
      employee_code: row?.employee_code ?? "",
      biometric_user_id: row?.biometric_user_id ?? "",
      card_id: row?.card_id ?? "",
      full_name: row?.full_name ?? "",
      department: row?.department ?? "",
      position: row?.position ?? "",
      status: row?.status ?? "active",
    });
  }

  function closeEditor() {
    setSelected(null);
    setForm(EMPTY_FORM);
  }

  function updateForm(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveUser() {
    if (!form.id) {
      await alertError("No hay usuario seleccionado.");
      return;
    }

    setSaving(true);

    try {
      const token = localStorage.getItem("token");

      const payload = {
        employee_code: form.employee_code,
        biometric_user_id: form.biometric_user_id,
        card_id: form.card_id,
        full_name: form.full_name,
        department: form.department,
        position: form.position,
        status: form.status,
      };

      const res = await axios.put(
        `${API}/api/biometric-users/${form.id}`,
        payload,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 20000,
        }
      );

      const updated = res?.data?.item || null;

      setItems((prev) =>
        prev.map((it) => (it.id === form.id ? { ...it, ...updated } : it))
      );

      if (updated) {
        openEditor(updated);
      }

      await alertSuccess("Usuario biométrico actualizado correctamente.");
      await loadUsers();
      await loadPreviewAutoInactive();
    } catch (err) {
      console.error("Error guardando usuario biométrico:", err);
      await alertError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "No se pudo actualizar el usuario biométrico."
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshAll() {
    await loadUsers();
    await loadPreviewAutoInactive();
  }

  async function runAutoInactive() {
    const result = await alertConfirm(
      "Esto cambiará a inactivo a los usuarios sin marcajes en el rango configurado. ¿Deseas continuar?"
    );

    if (!result.isConfirmed) return;

    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API}/api/biometric-users/run/auto-inactive`,
        {},
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 30000,
        }
      );

      await alertSuccess(
        `Proceso completado. Usuarios actualizados a inactivo: ${Number(
          res?.data?.updated || 0
        )}`
      );

      await refreshAll();
      closeEditor();
    } catch (err) {
      console.error("Error run auto inactive:", err);
      await alertError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "No se pudo ejecutar el auto-inactive."
      );
    } finally {
      setLoading(false);
    }
  }

  async function activateUser(row) {
    const result = await alertConfirm(
      `¿Deseas activar a ${row.full_name || row.name || "este usuario"}?`
    );

    if (!result.isConfirmed) return;

    setActivatingId(row.id);

    try {
      const token = localStorage.getItem("token");

      const payload = {
        employee_code: row.employee_code || "",
        biometric_user_id: row.biometric_user_id || "",
        card_id: row.card_id || "",
        full_name: row.full_name || row.name || "",
        department: row.department || "",
        position: row.position || "",
        status: "active",
      };

      const res = await axios.put(
        `${API}/api/biometric-users/${row.id}`,
        payload,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 20000,
        }
      );

      const updated = res?.data?.item || { ...row, status: "active" };

      setItems((prev) => prev.map((it) => (it.id === row.id ? updated : it)));
      setPreviewItems((prev) => prev.filter((it) => it.id !== row.id));

      if (selected?.id === row.id) {
        openEditor(updated);
      }

      await alertSuccess("Usuario activado correctamente.");
      await loadUsers();
      await loadPreviewAutoInactive();
    } catch (err) {
      console.error("Error activando usuario:", err);
      await alertError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "No se pudo activar el usuario."
      );
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios Biométricos</h1>
          <div className="text-sm text-slate-500">
            Administra datos de empleados usados en reportes y dashboard.
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={refreshAll}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Actualizar
          </button>

          <button
            onClick={runAutoInactive}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
          >
            Ejecutar auto-inactive
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow p-4 min-h-[700px]">
          <div className="flex gap-3 flex-wrap mb-4">
            <input
              type="text"
              placeholder="Buscar por código, user id, card id, nombre, departamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border border-slate-300"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white"
            >
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>

            <button
              onClick={loadUsers}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Buscar
            </button>
          </div>

          <div className="overflow-auto max-h-[620px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b text-slate-500">
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">NIP</th>
                  <th className="text-left py-2 px-2">No. de Tarjeta</th>
                  {/*<th className="text-left py-2 px-2">Card ID</th>*/}
                  <th className="text-left py-2 px-2">Nombre</th>
                  <th className="text-left py-2 px-2">Departamento</th>
                  <th className="text-left py-2 px-2">Estado</th>
                  <th className="text-left py-2 px-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      {loading ? "Cargando usuarios..." : "Sin registros"}
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-2 px-2">{row.id}</td>
                      <td className="py-2 px-2">{row.employee_code || ""}</td>
                      <td className="py-2 px-2">{row.biometric_user_id || ""}</td>
                      {/*<td className="py-2 px-2">{row.card_id || ""}</td>*/}
                      <td className="py-2 px-2">{row.full_name || ""}</td>
                      <td className="py-2 px-2">{row.department || ""}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            row.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {row.status || ""}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditor(row)}
                            className="px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 text-xs"
                          >
                            Editar
                          </button>

                          {row.status === "inactive" ? (
                            <button
                              onClick={() => activateUser(row)}
                              disabled={activatingId === row.id}
                              className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-xs"
                            >
                              {activatingId === row.id ? "..." : "Activar"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow p-4 min-h-[700px]">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Editar usuario</h2>

            {!selected ? (
              <div className="text-slate-400 mb-6">
                Selecciona un usuario para editar.
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={form.employee_code}
                    onChange={(e) => updateForm("employee_code", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Biometric User ID</label>
                  <input
                    type="text"
                    value={form.biometric_user_id}
                    onChange={(e) => updateForm("biometric_user_id", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Card ID</label>
                  <input
                    type="text"
                    value={form.card_id}
                    onChange={(e) => updateForm("card_id", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Nombre completo</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => updateForm("full_name", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Departamento</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Puesto</label>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => updateForm("position", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateForm("status", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveUser}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>

                  <button
                    onClick={closeEditor}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              Preview auto-inactive (2 meses)
            </h3>

            <div className="text-xs text-slate-400 mb-3">
              {previewRange
                ? `Rango: ${previewRange.start} a ${previewRange.end}`
                : "Cargando rango..."}
            </div>

            <div className="overflow-auto max-h-[360px] border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b text-slate-500">
                    <th className="text-left py-2 px-2">Código</th>
                    <th className="text-left py-2 px-2">Nombre</th>
                    <th className="text-right py-2 px-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLoading ? (
                    <tr>
                      <td colSpan={3} className="py-4 px-2 text-center text-slate-400">
                        Cargando preview...
                      </td>
                    </tr>
                  ) : previewItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 px-2 text-center text-slate-400">
                        No hay usuarios en el preview.
                      </td>
                    </tr>
                  ) : (
                    previewItems.map((row) => (
                      <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50">
                        <td className="py-2 px-2 whitespace-nowrap">
                          {row.employee_code || ""}
                        </td>
                        <td className="py-2 px-2">
                          {row.full_name || row.name || ""}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => activateUser(row)}
                            disabled={activatingId === row.id}
                            className="inline-flex items-center justify-center min-w-[82px] px-3 py-1.5 rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 disabled:opacity-60 text-xs font-medium"
                          >
                            {activatingId === row.id ? "..." : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-400 mt-2">
              Si no tienen marcajes en los últimos 2 meses, pasarán a inactive.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
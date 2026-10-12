import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { swalError, swalSuccess, swalConfirm } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

function safeParseSelectedDates(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // sigue
    }

    if (trimmed.includes(",")) {
      return trimmed.split(",").map((x) => x.trim()).filter(Boolean);
    }

    return [trimmed];
  }

  return [];
}

function formatDateTime(value) {
  if (!value) return "-";
  const s = String(value).replace("T", " ");
  return s.slice(0, 19);
}

function formatDateOnly(value) {
  if (!value) return "-";
  const s = String(value);
  if (s.includes("T")) return s.slice(0, 10);
  if (s.includes(" ")) return s.slice(0, 10);
  return s.slice(0, 10);
}

function renderMethod(method) {
  if (method === "direct_user_mapping") return "Mapeo directo";
  if (method === "name_match") return "Coincidencia por nombre";
  if (method === "not_found") return "Sin coincidencia";
  return method || "-";
}

function StatusBadge({ value }) {
  if (value === "pendiente") {
    return (
      <span className="inline-flex px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs font-medium">
        Pendiente
      </span>
    );
  }

  if (value === "aprobada") {
    return (
      <span className="inline-flex px-3 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">
        Aprobada
      </span>
    );
  }

  if (value === "rechazada") {
    return (
      <span className="inline-flex px-3 py-1 rounded bg-red-100 text-red-700 text-xs font-medium">
        Rechazada
      </span>
    );
  }

  return (
    <span className="inline-flex px-3 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">
      {value || "-"}
    </span>
  );
}

export default function MarkRequestsAdmin() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [employeeMatchByUser, setEmployeeMatchByUser] = useState({});
  const [loadingMatchUserId, setLoadingMatchUserId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/mark-requests/all`, {
        headers,
        params: status ? { status } : {},
      });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error cargando solicitudes:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error cargando solicitudes"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async (id) => {
    const ok = await swalConfirm({
      title: "Aprobar solicitud",
      text: "¿Deseas aprobar esta solicitud de marcajes?",
      confirmButtonText: "Sí, aprobar",
    });

    if (!ok) return;

    try {
      setWorkingId(id);
      await axios.post(`${API}/api/mark-requests/${id}/approve`, {}, { headers });
      await load();
      await swalSuccess("Solicitud aprobada correctamente");
    } catch (error) {
      console.error("Error aprobando solicitud:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error aprobando solicitud"
      );
    } finally {
      setWorkingId(null);
    }
  };

  const reject = async (id) => {
    const result = await Swal.fire({
      title: "Motivo de rechazo",
      input: "textarea",
      inputLabel: "Escribe el motivo",
      inputPlaceholder: "Ingrese el motivo del rechazo...",
      inputAttributes: {
        "aria-label": "Motivo de rechazo",
      },
      showCancelButton: true,
      confirmButtonText: "Rechazar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      inputValidator: (value) => {
        if (!String(value || "").trim()) {
          return "Debes escribir un motivo de rechazo";
        }
        return null;
      },
    });

    if (!result.isConfirmed) return;

    try {
      setWorkingId(id);
      await axios.post(
        `${API}/api/mark-requests/${id}/reject`,
        { rejection_reason: String(result.value || "").trim() },
        { headers }
      );
      await load();
      await swalSuccess("Solicitud rechazada correctamente");
    } catch (error) {
      console.error("Error rechazando solicitud:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error rechazando solicitud"
      );
    } finally {
      setWorkingId(null);
    }
  };

  const goToSystemUser = (userId) => {
    if (!userId) return;
    navigate("/system-users", { state: { openUserId: userId } });
  };

  const loadEmployeeMatch = async (userId) => {
    if (!userId) return;

    setLoadingMatchUserId(userId);
    try {
      const res = await axios.get(`${API}/api/system-users/${userId}/employee-match`, {
        headers,
      });

      setEmployeeMatchByUser((prev) => ({
        ...prev,
        [userId]: res.data || null,
      }));
    } catch (error) {
      console.error("Error cargando coincidencia employees:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error cargando coincidencia en employees"
      );
    } finally {
      setLoadingMatchUserId(null);
    }
  };

  const filteredRows = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const haystack = [
        r.owner_username,
        r.owner_display_name,
        r.employee_id,
        r.card_id,
        r.reason,
        r.status,
        r.user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Gestión de solicitudes
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Aprueba o rechaza solicitudes de marcajes realizadas por los usuarios.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario, employee, card..."
              className="border rounded-lg p-2 bg-sky-50"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border rounded-lg p-2 bg-sky-50"
            >
              <option value="">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>

            <button
              onClick={load}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Actualizar
            </button>
          </div>
        </div>

        <div className="mt-6 border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 w-[24%]">Solicitante</th>
                  <th className="text-left p-3 w-[14%]">Employee / Card</th>
                  <th className="text-left p-3 w-[16%]">Rango</th>
                  <th className="text-left p-3 w-[10%]">Estado</th>
                  <th className="text-left p-3 w-[12%]">Creada</th>
                  <th className="text-left p-3 w-[24%]">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-4 text-slate-500" colSpan={6}>
                      Cargando solicitudes...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-slate-500" colSpan={6}>
                      Sin solicitudes
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const expanded = expandedId === r.id;
                    const selectedDates = safeParseSelectedDates(r.selected_dates_json);
                    const matchData = employeeMatchByUser[r.user_id];

                    return (
                      <>
                        <tr key={`row-${r.id}`} className="border-t align-top">
                          <td className="p-3">
                            <div className="font-medium text-slate-900 break-words">
                              {r.owner_display_name || r.owner_username || "-"}
                            </div>
                            <div className="text-xs text-slate-500 break-all">
                              {r.owner_username || "-"}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              user_id: {r.user_id || "-"}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-medium">{r.employee_id || "-"}</div>
                            <div className="text-xs text-slate-500 break-all">
                              Card: {r.card_id || "-"}
                            </div>
                          </td>

                          <td className="p-3">
                            <div>{formatDateOnly(r.start_date)}</div>
                            <div className="text-xs text-slate-500">
                              a {formatDateOnly(r.end_date)}
                            </div>
                          </td>

                          <td className="p-3">
                            <StatusBadge value={r.status} />
                          </td>

                          <td className="p-3">
                            {formatDateTime(r.created_at)}
                          </td>

                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  setExpandedId((prev) => (prev === r.id ? null : r.id))
                                }
                                className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
                              >
                                {expanded ? "Ocultar" : "Ver detalle"}
                              </button>

                              <button
                                onClick={() => goToSystemUser(r.user_id)}
                                className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                              >
                                Ver usuario
                              </button>

                              <button
                                onClick={() => loadEmployeeMatch(r.user_id)}
                                disabled={loadingMatchUserId === r.user_id}
                                className="px-3 py-1 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-60"
                              >
                                {loadingMatchUserId === r.user_id
                                  ? "Buscando..."
                                  : "Ver coincidencia"}
                              </button>

                              {r.status === "pendiente" ? (
                                <>
                                  <button
                                    onClick={() => approve(r.id)}
                                    disabled={workingId === r.id}
                                    className="px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    {workingId === r.id ? "Procesando..." : "Aprobar"}
                                  </button>

                                  <button
                                    onClick={() => reject(r.id)}
                                    disabled={workingId === r.id}
                                    className="px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {workingId === r.id ? "Procesando..." : "Rechazar"}
                                  </button>
                                </>
                              ) : (
                                <span className="text-slate-400 text-xs self-center">
                                  Sin acciones
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {expanded ? (
                          <tr key={`detail-${r.id}`} className="border-t bg-slate-50">
                            <td className="p-4" colSpan={6}>
                              <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Solicitante
                                    </div>
                                    <div className="font-medium text-slate-900">
                                      {r.owner_display_name || r.owner_username || "-"}
                                    </div>
                                    <div className="text-sm text-slate-500">
                                      Usuario: {r.owner_username || "-"}
                                    </div>
                                    <div className="text-sm text-slate-500">
                                      user_id: {r.user_id || "-"}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Datos resueltos
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Employee ID: {r.employee_id || "-"}
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Card ID: {r.card_id || "-"}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Rango solicitado
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Inicio: {formatDateOnly(r.start_date)}
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Fin: {formatDateOnly(r.end_date)}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Días específicos
                                    </div>
                                    {selectedDates.length ? (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {selectedDates.map((d) => (
                                          <span
                                            key={d}
                                            className="px-2 py-1 rounded bg-sky-100 text-sky-800 text-xs border border-sky-200"
                                          >
                                            {d}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-slate-500">
                                        No especificó días puntuales
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Motivo
                                    </div>
                                    <div className="text-sm text-slate-900 whitespace-pre-wrap">
                                      {r.reason || "-"}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500">
                                      Validación
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Estado: {r.status || "-"}
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Validado por:{" "}
                                      {r.approved_by_display_name ||
                                        r.approved_by_username ||
                                        "-"}
                                    </div>
                                    <div className="text-sm text-slate-900">
                                      Fecha validación: {formatDateTime(r.approved_at)}
                                    </div>
                                    <div className="text-sm text-slate-900 whitespace-pre-wrap">
                                      Motivo rechazo: {r.rejection_reason || "-"}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {matchData ? (
                                <div className="mt-5 border rounded-xl p-4 bg-white">
                                  <div className="font-medium mb-3">
                                    Coincidencia en employees del usuario
                                  </div>

                                  <div className="grid md:grid-cols-3 gap-3 text-sm">
                                    <div>
                                      <div className="text-slate-500">Resultado</div>
                                      <div className="font-medium">
                                        {matchData.matched
                                          ? "Coincidencia encontrada"
                                          : "Sin coincidencia"}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-slate-500">Método</div>
                                      <div className="font-medium">
                                        {renderMethod(matchData.method)}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-slate-500">Score</div>
                                      <div className="font-medium">
                                        {matchData.score ?? "-"}
                                      </div>
                                    </div>
                                  </div>

                                  {matchData.employee ? (
                                    <div className="grid md:grid-cols-2 gap-3 mt-4 border rounded-lg p-3 bg-slate-50 text-sm">
                                      <div>
                                        <div className="text-slate-500">Nombre employee</div>
                                        <div className="font-medium">
                                          {matchData.employee.full_name || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500">Employee Code</div>
                                        <div className="font-medium">
                                          {matchData.employee.employee_code || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500">Card ID</div>
                                        <div className="font-medium">
                                          {matchData.employee.card_id || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500">Departamento</div>
                                        <div className="font-medium">
                                          {matchData.employee.department || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500">Puesto</div>
                                        <div className="font-medium">
                                          {matchData.employee.position || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500">Estado</div>
                                        <div className="font-medium">
                                          {matchData.employee.status || "-"}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 text-sm text-red-600">
                                      No se encontró coincidencia suficientemente confiable.
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
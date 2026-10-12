import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { swalError, swalSuccess, swalWarning } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";
const PDF_API = "http://192.140.50.51:10532/biometrico/pdf/reporte";

function isValidYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function uniqueSortedDates(values) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).filter((v) => isValidYmd(v)))
  ).sort();
}

function safeParseSelectedDates(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return uniqueSortedDates(raw.map((x) => String(x).trim()));
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return uniqueSortedDates(parsed.map((x) => String(x).trim()));
      }
    } catch {
      // sigue
    }

    if (trimmed.includes(",")) {
      return uniqueSortedDates(
        trimmed.split(",").map((x) => x.trim().replace(/^"|"$/g, ""))
      );
    }

    if (isValidYmd(trimmed)) {
      return [trimmed];
    }

    return [];
  }

  return [];
}

export default function MarkRequests() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const headers = { Authorization: `Bearer ${token}` };

  const [context, setContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(true);

  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    selected_dates: [],
    reason: "",
  });

  const [selectedDateInput, setSelectedDateInput] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);

  const canManage = Number(user?.permissions?.mark_requests_manage_enabled || 0) === 1;

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const res = await axios.get(`${API}/api/mark-requests/me-context`, { headers });
      setContext(res?.data || null);
    } catch (error) {
      console.error("Error cargando contexto:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error cargando contexto del usuario"
      );
    } finally {
      setLoadingContext(false);
    }
  };

  const loadMine = async () => {
    try {
      const res = await axios.get(`${API}/api/mark-requests/mine`, { headers });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error cargando solicitudes:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Error cargando solicitudes"
      );
    }
  };

  useEffect(() => {
    loadContext();
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSelectedDate = async () => {
    if (!selectedDateInput) return;

    if (!isValidYmd(selectedDateInput)) {
      await swalWarning("La fecha seleccionada no es válida.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      selected_dates: uniqueSortedDates([...(prev.selected_dates || []), selectedDateInput]),
    }));
    setSelectedDateInput("");
  };

  const removeSelectedDate = (dateToRemove) => {
    setForm((prev) => ({
      ...prev,
      selected_dates: (prev.selected_dates || []).filter((d) => d !== dateToRemove),
    }));
  };

  const createRequest = async () => {
    if (
      (!form.start_date || !form.end_date) &&
      (!form.selected_dates || form.selected_dates.length === 0)
    ) {
      await swalWarning("Debes ingresar Inicio/Fin o seleccionar días específicos");
      return;
    }

    if (!context?.employee?.employee_code && !context?.employee?.card_id) {
      await swalError(
        "No fue posible identificar tu registro en employees. Contacta al administrador."
      );
      return;
    }

    setSaving(true);
    try {
      await axios.post(
        `${API}/api/mark-requests`,
        {
          ...form,
          selected_dates: uniqueSortedDates(form.selected_dates || []),
        },
        { headers }
      );

      setForm({
        start_date: "",
        end_date: "",
        selected_dates: [],
        reason: "",
      });
      setSelectedDateInput("");
      await loadMine();
      await swalSuccess("Solicitud creada correctamente");
    } catch (e) {
      console.error("Error creando solicitud:", e);
      await swalSuccess(e?.response?.data?.message || e?.response?.data?.detail || "Error creando solicitud");
    } finally {
      setSaving(false);
    }
  };

  const generatePdf = async (requestRow) => {
    try {
      if (!requestRow || requestRow.status !== "aprobada") {
        await swalWarning("La solicitud aún no está aprobada.");
        return;
      }

      setGeneratingId(requestRow.id);

      const selectedDates = safeParseSelectedDates(requestRow.selected_dates_json);

      const reportParams = {
        start: requestRow.start_date,
        end: requestRow.end_date,
        employee_id: requestRow.employee_id || "",
        card_id: requestRow.card_id || "",
        device_id: "",
        door_number: "",
        mode: "all",
        name_like: "",
        terminal_like: "",
        page: 1,
        pageSize: 500,
        selected_dates_json: JSON.stringify(selectedDates),
      };

      const reportResponse = await axios.get(`${API}/api/reports/attendance`, {
        headers,
        params: reportParams,
      });

      const reportData = reportResponse?.data || {};
      const reportRows = Array.isArray(reportData.rows) ? reportData.rows : [];

      if (!reportRows.length) {
        await swalWarning("No se encontraron marcajes para esta solicitud aprobada.");
        return;
      }

      const pdfPayload = {
        start: requestRow.start_date,
        end: requestRow.end_date,
        employee_id: requestRow.employee_id || "",
        card_id: requestRow.card_id || "",
        device_id: "",
        door_number: "",
        mode: "all",
        name_like: "",
        terminal_like: "",
        selected_dates: selectedDates,
        info: reportData,
      };

      const pdfResponse = await axios.post(PDF_API, pdfPayload, {
        timeout: 120000,
      });

      const base64Pdf = pdfResponse?.data?.data;

      if (!base64Pdf || typeof base64Pdf !== "string" || !base64Pdf.includes(",")) {
        await swalError("La API de PDF no devolvió un documento válido.");
        return;
      }

      const binaryData = atob(base64Pdf.split(",")[1]);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const byteArray = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binaryData.length; i++) {
        byteArray[i] = binaryData.charCodeAt(i);
      }

      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const nuevaPestana = window.open(blobUrl, "_blank");

      if (!nuevaPestana) {
        await swalWarning("El navegador bloqueó la ventana emergente del PDF.");
      }
    } catch (error) {
      console.error("Error generando PDF desde solicitud:", error);
      await swalError(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          error?.message ||
          "Error generando PDF"
      );
    } finally {
      setGeneratingId(null);
    }
  };

  const selectedDatesText = useMemo(
    () => (form.selected_dates || []).join(", "),
    [form.selected_dates]
  );

  return (
    <div className="p-6">
      <div className="bg-white border rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold text-slate-900">Solicitudes de marcajes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Crea solicitudes únicamente para tus propios marcajes.
        </p>

        {canManage ? (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Tu usuario también tiene permiso para gestionar solicitudes.
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="border rounded-xl p-4 space-y-4">
            <div className="font-semibold">Nueva solicitud</div>

            {loadingContext ? (
              <div className="text-sm text-slate-500">Identificando tu registro...</div>
            ) : (
              <div className="border rounded-xl p-4 bg-slate-50">
                <div className="text-sm font-medium text-slate-900">
                  Usuario autenticado
                </div>

                <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500">Nombre AD</div>
                    <div className="font-medium">
                      {context?.user?.display_name ||
                        [context?.user?.first_name, context?.user?.last_name]
                          .filter(Boolean)
                          .join(" ") ||
                        context?.user?.username ||
                        "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Usuario</div>
                    <div className="font-medium">{context?.user?.username || "-"}</div>
                  </div>

                  <div>
                    <div className="text-slate-500">Registro en employees</div>
                    <div className="font-medium">
                      {context?.employee?.full_name || "No identificado"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Método de resolución</div>
                    <div className="font-medium">{context?.resolution_method || "-"}</div>
                  </div>

                  <div>
                    <div className="text-slate-500">No. NIP</div>
                    <div className="font-medium">
                      {context?.employee?.employee_code || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">No. de Tarjeta</div>
                    <div className="font-medium">{context?.employee?.card_id || "-"}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-600">Inicio</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Fin</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-600">Días específicos</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={selectedDateInput}
                  onChange={(e) => setSelectedDateInput(e.target.value)}
                  className="w-full border rounded-lg p-2 bg-sky-50"
                />
                <button
                  type="button"
                  onClick={addSelectedDate}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white"
                >
                  Agregar
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {(form.selected_dates || []).map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-2 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs border border-sky-200"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeSelectedDate(d)}
                      className="font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {selectedDatesText ? (
                <div className="mt-2 text-xs text-slate-500">{selectedDatesText}</div>
              ) : null}
            </div>

            <div>
              <label className="text-sm text-slate-600">Motivo</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50 min-h-[100px]"
              />
            </div>

            <button
              onClick={createRequest}
              disabled={saving || loadingContext}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Crear solicitud"}
            </button>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold">
              Mis solicitudes
            </div>

            <div className="max-h-[700px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-left p-3">Rango</th>
                    <th className="text-left p-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">
                        {String(r.created_at || "").slice(0, 19).replace("T", " ")}
                      </td>
                      <td className="p-3">
                        {r.status === "pendiente" && (
                          <span className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs">
                            Solicitado
                          </span>
                        )}
                        {r.status === "aprobada" && (
                          <span className="px-3 py-1 rounded bg-emerald-100 text-emerald-700 text-xs">
                            Aprobada
                          </span>
                        )}
                        {r.status === "rechazada" && (
                          <span className="px-3 py-1 rounded bg-red-100 text-red-700 text-xs">
                            Rechazada
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {r.start_date} a {r.end_date}
                      </td>
                      <td className="p-3">
                        {r.status === "aprobada" ? (
                          <button
                            onClick={() => generatePdf(r)}
                            disabled={generatingId === r.id}
                            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-60"
                          >
                            {generatingId === r.id ? "Generando..." : "Generar PDF"}
                          </button>
                        ) : (
                          <button
                            disabled
                            className="px-3 py-1 rounded bg-slate-300 text-slate-600 text-xs"
                          >
                            Solicitado
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Sin solicitudes
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
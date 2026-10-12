import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Legend,
  Cell,
} from "recharts";

import { swalError, swalWarning } from "../lib/swal";

const API = import.meta.env.VITE_API_URL || "";

const PIE_COLORS = ["#2563eb", "#f59e0b", "#ef4444"];
const LINE_COLOR = "#2563eb";
const BAR_GREEN = "#16a34a";
const BAR_AMBER = "#f59e0b";

function Card({ title, value, sub }) {
  return (
    <div className="rounded-xl shadow bg-white p-4 border border-slate-200 min-h-[110px]">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1">{value}</div>
      {sub ? <div className="text-xs text-slate-400 mt-1">{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="text-lg font-semibold text-slate-900 mb-2">{children}</div>;
}

function normalizeHourData(data) {
  const map = new Map((data || []).map((x) => [Number(x.hour), Number(x.count)]));
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ hour: i, count: map.get(i) || 0 });
  return out;
}

function toYmdSafe(v) {
  if (!v) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return dayjs(v).format("YYYY-MM-DD");

  const s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = dayjs(s);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");

  return s;
}

function fmtTimeAmPm(v) {
  const s = v == null ? "" : String(v).trim();
  if (!s) return "";

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return s;

  let hh = Number(m[1]);
  const mm = m[2];
  const suffix = hh >= 12 ? "PM" : "AM";

  hh = hh % 12;
  if (hh === 0) hh = 12;

  return `${String(hh).padStart(2, "0")}:${mm} ${suffix}`;
}

function fmtDateLabel(v) {
  const ymd = toYmdSafe(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return dayjs(ymd).format("DD/MM");
  return String(v || "");
}

function fmtDateFull(v) {
  const ymd = toYmdSafe(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return dayjs(ymd).format("DD/MM/YYYY");
  return String(v || "");
}

function Modal({ open, title, subtitle, loading, error, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-slate-500">Cargando detalle...</div>
          ) : error ? (
            <div className="bg-red-100 text-red-800 border border-red-200 p-3 rounded">
              {error}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function renderItemsTable(items) {
  if (!items || items.length === 0) return <div className="text-slate-400">Sin datos.</div>;

  const keys = Object.keys(items[0] || {});
  return (
    <div className="overflow-auto max-h-[60vh] hidden-scrollbar">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b text-slate-500">
            {keys.map((k) => (
              <th key={k} className="text-left py-2 px-2 whitespace-nowrap">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b last:border-b-0">
              {keys.map((k) => (
                <td key={k} className="py-2 px-2 whitespace-nowrap">
                  {row[k] == null ? "" : String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewerDashboard({ data }) {
  return (
    <div className="dashboard-scroll bg-slate-50 px-4 sm:px-6 pt-6 pb-10 outline-none" tabIndex={0}>
      <div className="max-w-[1600px] mx-auto">
        <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 pb-4 mb-6">
          <div className="flex justify-between items-center gap-3 flex-wrap pt-1">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Mi Dashboard</h1>
              <div className="text-sm text-slate-500">
                {data?.user?.display_name || data?.user?.username || "Usuario"}
              </div>
              <div className="text-xs text-slate-400">
                Grupo: {data?.user?.group_name || "Sin grupo"} | Entrada: {data?.user?.entry_time || "08:00:00"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Card title="Código empleado" value={data?.user?.employee_code || "-"} />
          <Card title="Tardanzas del mes" value={data?.cards?.tardanzas ?? 0} />
          <Card title="Ausencias del mes" value={data?.cards?.ausencias ?? 0} />
          <Card title="Minutos tarde" value={data?.cards?.totalLateMinutes ?? 0} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-4 rounded-xl shadow border border-slate-200 min-w-0">
            <SectionTitle>Minutos tarde por día</SectionTitle>
            <div className="w-full h-[320px] sm:h-[360px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.charts?.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtDateLabel(d)} />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(d) => fmtDateFull(d)} />
                  <Bar dataKey="late_minutes" fill={BAR_AMBER} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow border border-slate-200 min-w-0">
            <SectionTitle>Último marcaje</SectionTitle>
            {!data?.lastMark ? (
              <div className="text-slate-400">Sin marcajes</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-500">Fecha:</span>{" "}
                  <span className="font-medium">{fmtDateFull(data.lastMark.date)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Hora:</span>{" "}
                  <span className="font-medium">{fmtTimeAmPm(data.lastMark.time)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Terminal:</span>{" "}
                  <span className="font-medium">{data.lastMark.terminal || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Tipo:</span>{" "}
                  <span className="font-medium">
                    {Number(data.lastMark.in_out) === 1 ? "Entrada" : "Salida"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow border border-slate-200">
          <SectionTitle>Detalle diario</SectionTitle>
          <div className="overflow-auto hidden-scrollbar max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b text-slate-500">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-left py-2">Primera entrada</th>
                  <th className="text-left py-2">Minutos tarde</th>
                </tr>
              </thead>
              <tbody>
                {(data?.tables?.daily || []).length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-400" colSpan={4}>
                      Sin datos
                    </td>
                  </tr>
                ) : (
                  (data.tables.daily || []).map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2">{fmtDateFull(r.date)}</td>
                      <td className="py-2">{r.status}</td>
                      <td className="py-2">{r.first_in ? fmtTimeAmPm(r.first_in) : "-"}</td>
                      <td className="py-2">{r.late_minutes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="h-12 shrink-0" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const token = localStorage.getItem("token");

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const role = String(user?.role || "").toLowerCase();

  const [payload, setPayload] = useState(null);
  const [viewerPayload, setViewerPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [dateFilter, setDateFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const [ddOpen, setDdOpen] = useState(false);
  const [ddTitle, setDdTitle] = useState("");
  const [ddSubtitle, setDdSubtitle] = useState("");
  const [ddLoading, setDdLoading] = useState(false);
  const [ddError, setDdError] = useState("");
  const [ddItems, setDdItems] = useState([]);

  const hasLoadedRef = useRef(false);

  async function loadAdminDashboard(custom = {}) {
    setLoading(true);
    setError("");

    try {
      const params = {};

      const effectiveDate =
        typeof custom.date !== "undefined" ? custom.date : dateFilter;
      const effectiveMonth =
        typeof custom.month !== "undefined" ? custom.month : monthFilter;

      if (effectiveDate) {
        params.date = effectiveDate;
      } else if (effectiveMonth) {
        params.month = effectiveMonth;
      }

      const res = await axios.get(`${API}/api/dashboard/summary`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 30000,
      });

      setPayload(res.data || null);
    } catch (err) {
      console.error("Dashboard admin fetch error:", err);
      const msg =
        err?.code === "ECONNABORTED"
          ? "Timeout: el API no respondió."
          : err?.response?.data?.detail
            ? `API error: ${err.response.data.detail}`
            : err?.response?.data?.error
              ? String(err.response.data.error)
              : err?.response?.data?.message || "No se pudo conectar al API.";
      setError(msg);
      setPayload(null);
      await swalError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadViewerDashboard() {
    setLoading(true);
    setError("");

    try {
      const res = await axios.get(`${API}/api/dashboard/my-summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 30000,
      });

      const data = res.data || null;
      setViewerPayload(data);

      if (data?.needs_mapping) {
        await swalWarning(data.message || "Este usuario necesita employee_code");
      }
    } catch (err) {
      console.error("Dashboard viewer fetch error:", err);
      const msg =
        err?.code === "ECONNABORTED"
          ? "Timeout: el API no respondió."
          : err?.response?.data?.detail
            ? `API error: ${err.response.data.detail}`
            : err?.response?.data?.error
              ? String(err.response.data.error)
              : err?.response?.data?.message || "No se pudo conectar al API.";
      setError(msg);
      setViewerPayload(null);
      await swalError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    if (role === "viewer") {
      loadViewerDashboard();
    } else {
      loadAdminDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function openDrilldown({ title, subtitle, params }) {
    try {
      setDdOpen(true);
      setDdTitle(title);
      setDdSubtitle(subtitle);
      setDdLoading(true);
      setDdError("");
      setDdItems([]);

      const res = await axios.get(`${API}/api/dashboard/drilldown`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 20000,
      });

      const items = Array.isArray(res.data?.rows)
        ? res.data.rows
        : Array.isArray(res.data?.items)
          ? res.data.items
          : [];

      setDdItems(items);
    } catch (err) {
      console.error("Drilldown error:", err);
      const msg =
        err?.response?.data?.detail
          ? String(err.response.data.detail)
          : err?.response?.data?.error
            ? String(err.response.data.error)
            : err?.response?.data?.message
              ? String(err.response.data.message)
              : "Error cargando detalle";
      setDdError(msg);
    } finally {
      setDdLoading(false);
    }
  }

  function handleApplyFilters() {
    loadAdminDashboard();
  }

  function handleClearFilters() {
    setDateFilter("");
    setMonthFilter("");
    loadAdminDashboard({ date: "", month: "" });
  }

  if (role === "viewer") {
    return <ViewerDashboard data={viewerPayload} />;
  }

  const meta = payload?.meta || {};
  const kpi = payload?.kpi || {};
  const distribution = payload?.distribution || [];
  const charts = payload?.charts || {};
  const tables = payload?.tables || {};
  const byHour = useMemo(() => normalizeHourData(charts.byHour || []), [charts.byHour]);
  const dashboardDate = meta.today || "";
  const dashboardMonth = meta.month || "";

  function handleHourClick(e) {
    const hour = e?.activeLabel;
    if (hour == null) return;

    const baseDate = dashboardDate || "";
    const baseMonth = dashboardMonth || (baseDate ? String(baseDate).slice(0, 7) : monthFilter || "");

    if (!baseDate && !baseMonth) return;

    openDrilldown({
      title: `Usuarios que entraron a las ${String(hour).padStart(2, "0")}:00`,
      subtitle: baseDate
        ? `Fecha: ${fmtDateFull(baseDate)}`
        : `Mes: ${baseMonth}`,
      params: {
        type: "byHour",
        date: baseDate || undefined,
        hour,
        month: baseMonth || undefined,
      },
    });
  }

  function handleDistributionClick(data) {
    const name = data?.name;
    if (!name) return;

    const baseDate = dashboardDate || "";
    const baseMonth = dashboardMonth || (baseDate ? String(baseDate).slice(0, 7) : monthFilter || "");

    if (!baseDate && !baseMonth) return;

    openDrilldown({
      title: `Detalle: ${name}`,
      subtitle: baseDate
        ? `Fecha: ${fmtDateFull(baseDate)}`
        : `Mes: ${baseMonth}`,
      params: {
        type: "distribution",
        date: baseDate || undefined,
        category: name,
        month: baseMonth || undefined,
      },
    });
  }

  function handleLast7Click(state) {
    const rawDate = state?.activePayload?.[0]?.payload?.date ?? state?.payload?.date ?? state?.activeLabel;
    const normalizedDate = toYmdSafe(rawDate);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) return;

    openDrilldown({
      title: "Usuarios con asistencia",
      subtitle: `Fecha: ${fmtDateFull(normalizedDate)}`,
      params: {
        type: "last7",
        drillDate: normalizedDate,
        date: normalizedDate,
        month: normalizedDate.slice(0, 7),
      },
    });
  }

  function handleDeviceClick(state) {
    const device = state?.activeLabel || state?.payload?.device;
    if (!device) return;

    const baseDate = dashboardDate || "";
    const baseMonth = dashboardMonth || (baseDate ? String(baseDate).slice(0, 7) : monthFilter || "");

    if (!baseDate && !baseMonth) return;

    openDrilldown({
      title: `Usuarios por dispositivo: ${device}`,
      subtitle: baseDate
        ? `Fecha: ${fmtDateFull(baseDate)}`
        : `Mes: ${baseMonth}`,
      params: {
        type: "byDevice",
        date: baseDate || undefined,
        device,
        month: baseMonth || undefined,
      },
    });
  }

  return (
    <>
      <style>{`
        .hidden-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hidden-scrollbar::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        .dashboard-scroll {
          height: 100vh;
          min-height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-behavior: smooth;
          padding-bottom: 40px;
        }
        .dashboard-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
      `}</style>

      <div className="dashboard-scroll bg-slate-50 px-4 sm:px-6 pt-6 pb-10 outline-none" tabIndex={0}>
        <Modal
          open={ddOpen}
          title={ddTitle}
          subtitle={ddSubtitle}
          loading={ddLoading}
          error={ddError}
          onClose={() => setDdOpen(false)}
        >
          {renderItemsTable(ddItems)}
        </Modal>

        <div className="max-w-[1600px] mx-auto">
          <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 pb-4 mb-6">
            <div className="flex justify-between items-center gap-3 flex-wrap pt-1">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Dashboard Asistencia</h1>
                {meta.today ? (
                  <div className="text-sm text-slate-500">
                    Fecha: {fmtDateFull(meta.today)}
                  </div>
                ) : meta.month ? (
                  <div className="text-sm text-slate-500">
                    Mes: {meta.month}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">Cargando fecha...</div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    if (e.target.value) setMonthFilter("");
                  }}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-500"
                  title="Filtrar por fecha"
                />

                <input
                  type="month"
                  value={monthFilter}
                  onChange={(e) => {
                    setMonthFilter(e.target.value);
                    if (e.target.value) setDateFilter("");
                  }}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-500"
                  title="Filtrar por mes"
                />

                <button
                  onClick={handleApplyFilters}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 active:scale-[0.99] shadow-sm"
                >
                  {loading ? "Actualizando..." : "Aplicar"}
                </button>

                <button
                  onClick={handleClearFilters}
                  className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 active:scale-[0.99] shadow-sm"
                >
                  Limpiar
                </button>

                <button
                  onClick={() => loadAdminDashboard()}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 active:scale-[0.99] shadow-sm"
                >
                  {loading ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="bg-red-100 text-red-800 border border-red-200 p-3 rounded mb-4">
              <div className="font-semibold">No cargó el dashboard</div>
              <div className="text-sm mt-1">{error}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <Card title="Empleados" value={kpi.totalEmployees ?? "-"} />
            <Card title="Presentes hoy" value={kpi.present ?? "-"} sub="Click en Distribución → Presentes" />
            <Card title="Tardanzas" value={kpi.late ?? "-"} sub="Click en Distribución → Tarde" />
            <Card title="Ausentes" value={kpi.absent ?? "-"} sub="Click en Distribución → Ausentes" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-4 rounded-xl shadow border border-slate-200 xl:col-span-2 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SectionTitle>Entradas por hora</SectionTitle>
                <div className="text-xs text-slate-400">Click sobre la gráfica</div>
              </div>

              <div className="w-full h-[320px] sm:h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={byHour}
                    onClick={handleHourClick}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={LINE_COLOR}
                      strokeWidth={3}
                      dot={{ r: 4, fill: LINE_COLOR }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow border border-slate-200 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SectionTitle>Distribución</SectionTitle>
                <div className="text-xs text-slate-400">Click en una sección</div>
              </div>

              <div className="w-full h-[320px] sm:h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={100}
                      label
                      onClick={handleDistributionClick}
                    >
                      {distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="bg-white p-4 rounded-xl shadow border border-slate-200 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SectionTitle>Asistencia últimos 7 días</SectionTitle>
                <div className="text-xs text-slate-400">Click en una barra</div>
              </div>

              <div className="w-full h-[320px] sm:h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts.last7 || []}
                    onClick={handleLast7Click}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="date" tickFormatter={(d) => fmtDateLabel(d)} />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={(d) => fmtDateFull(d)} />
                    <Bar dataKey="count" fill={BAR_GREEN} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow border border-slate-200 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SectionTitle>Marcajes por dispositivo</SectionTitle>
                <div className="text-xs text-slate-400">Click en una barra</div>
              </div>

              <div className="w-full h-[320px] sm:h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts.byDevice || []}
                    onClick={handleDeviceClick}
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="device" interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill={BAR_AMBER} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-12">
            <div className="bg-white p-4 rounded-xl shadow border border-slate-200">
              <SectionTitle>Top tardanzas</SectionTitle>
              <div className="overflow-auto hidden-scrollbar max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b text-slate-500">
                      <th className="text-left py-2">Empleado</th>
                      <th className="text-left py-2">Nombre</th>
                      <th className="text-left py-2">Tardanzas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tables.topLate || []).length === 0 ? (
                      <tr>
                        <td className="py-3 text-slate-400" colSpan={3}>
                          Sin datos
                        </td>
                      </tr>
                    ) : (
                      (tables.topLate || []).map((r, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-2">{r.employee_id}</td>
                          <td className="py-2">{r.name}</td>
                          <td className="py-2">{r.late_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow border border-slate-200">
              <SectionTitle>Últimos marcajes</SectionTitle>
              <div className="overflow-auto hidden-scrollbar max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b text-slate-500">
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-left py-2">Hora</th>
                      <th className="text-left py-2">Empleado</th>
                      <th className="text-left py-2">Terminal</th>
                      <th className="text-left py-2">Grupo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tables.recentPunches || []).length === 0 ? (
                      <tr>
                        <td className="py-3 text-slate-400" colSpan={5}>
                          Sin marcajes
                        </td>
                      </tr>
                    ) : (
                      (tables.recentPunches || []).map((r, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-2">{fmtDateFull(r.date)}</td>
                          <td className="py-2">{fmtTimeAmPm(r.time)}</td>
                          <td className="py-2">
                            {r.name} ({r.employee_id})
                          </td>
                          <td className="py-2">{r.terminal}</td>
                          <td className="py-2">{r.group_name || "Sin grupo"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="h-12 shrink-0" />
        </div>
      </div>
    </>
  );
}
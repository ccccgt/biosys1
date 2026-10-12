import { useEffect, useMemo, useState } from "react";
import axios from "axios";

// ✅ pon tu logo aquí: frontend/src/assets/logo.png
import logo from "../assets/logo.png";

const API = import.meta.env.VITE_API_URL || "";

// ✅ Cambia este nombre cuando me digas el oficial
const REPORT_BRAND_NAME = "BioSys -UME - Reporte de Marcajes";

export default function Reports() {
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    employee_id: "",
    card_id: "",
    device_id: "",
    door_number: "",
    mode: "all",
    name_like: "",
    terminal_like: "",
  });

  // ✅ ya no hay paginación visual, solo pedimos un lote grande para scroll
  const page = 1;
  const pageSize = 500;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ rows: [], total: 0 });

  const [devices, setDevices] = useState([]);
  const [doors, setDoors] = useState([]);
  const [doorsCache, setDoorsCache] = useState({});

  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${API}/api/devices`);
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Error cargando devices:", e);
      setDevices([]);
    }
  };

  const fetchDoorsForDevice = async (deviceId) => {
    if (!deviceId) {
      setDoors([]);
      return;
    }

    const did = Number(deviceId);
    if (!Number.isFinite(did)) {
      setDoors([]);
      return;
    }

    if (doorsCache[did]) {
      setDoors(doorsCache[did]);
      return;
    }

    try {
      const res = await axios.get(`${API}/api/devices/${did}/doors`);
      const list = Array.isArray(res.data) ? res.data : [];
      setDoors(list);
      setDoorsCache((prev) => ({ ...prev, [did]: list }));
    } catch (e) {
      console.error("Error cargando doors:", e);
      setDoors([]);
    }
  };

  const fetchData = async () => {
    if (!filters.start || !filters.end) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(`${API}/api/reports/attendance`, {
        params: { ...filters, page, pageSize },
        headers: { Authorization: `Bearer ${token}` },
      });

      // res.data: { page, pageSize, total, rows }
      setData(res.data);
    } catch (e) {
      console.error(e);
      alert("Error cargando reporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    fetchDoorsForDevice(filters.device_id);
    // al cambiar biométrico, limpia puerta
    setFilters((prev) => ({ ...prev, door_number: "" }));
    // eslint-disable-next-line
  }, [filters.device_id]);

  const onChange = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));

  const onSearch = () => {
    fetchData();
  };

  const clearFilters = () => {
    setFilters({
      start: "",
      end: "",
      employee_id: "",
      card_id: "",
      device_id: "",
      door_number: "",
      mode: "all",
      name_like: "",
      terminal_like: "",
    });
    setDoors([]);
    setData({ rows: [], total: 0 });
  };

  const exportXlsx = () => {
    if (!filters.start || !filters.end) return alert("Selecciona start/end");
    const params = new URLSearchParams({ ...filters }).toString();
    window.open(`${API}/api/reports/attendance/export.xlsx?${params}`, "_blank");
  };

  const printOrPdf = () => window.print();

  const deviceNameById = (id) =>
    devices.find((d) => Number(d.id) === Number(id))?.name || `Device ${id}`;

  const doorNameFromCatalog = (deviceId, doorNumber) => {
    const did = Number(deviceId);
    const dn = Number(doorNumber);
    const list = doorsCache[did] || doors || [];
    return list.find((x) => Number(x.door_number) === dn)?.door_name;
  };

  // ✅ contador visible (por si quieres mostrar cuántos trajo)
  const rowsCount = useMemo(() => (Array.isArray(data.rows) ? data.rows.length : 0), [data.rows]);

  return (
    <div className="w-full h-full flex flex-col gap-4 min-h-0">
      {/* Barra superior (NO imprime) */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">Reportes de marcajes</h1>
        <div className="flex gap-2">
          <button
            onClick={exportXlsx}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Exportar XLSX
          </button>
          <button
            onClick={printOrPdf}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Filtros (NO imprime) */}
      <div className="bg-white rounded-xl border p-4 space-y-3 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm text-slate-600">Inicio</label>
            <input
              type="date"
              value={filters.start}
              onChange={(e) => onChange("start", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Fin</label>
            <input
              type="date"
              value={filters.end}
              onChange={(e) => onChange("end", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Employee ID</label>
            <input
              value={filters.employee_id}
              onChange={(e) => onChange("employee_id", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              placeholder="Ej: 20060252"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Card ID</label>
            <input
              value={filters.card_id}
              onChange={(e) => onChange("card_id", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              placeholder="Ej: 13936427"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Biométrico</label>
            <select
              value={filters.device_id}
              onChange={(e) => onChange("device_id", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
            >
              <option value="">Todos</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">Puerta</label>
            <select
              value={filters.door_number}
              onChange={(e) => onChange("door_number", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50 disabled:opacity-60"
              disabled={!filters.device_id}
              title={!filters.device_id ? "Primero selecciona un biométrico" : ""}
            >
              <option value="">
                {!filters.device_id ? "Selecciona biométrico..." : "Todas"}
              </option>
              {doors.map((d) => (
                <option key={d.door_number} value={d.door_number}>
                  {d.door_name} ({d.door_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">Modo</label>
            <select
              value={filters.mode}
              onChange={(e) => onChange("mode", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
            >
              <option value="all">Todos los marcajes</option>
              <option value="first_last">Primer y último por día</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">Nombre contiene</label>
            <input
              value={filters.name_like}
              onChange={(e) => onChange("name_like", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              placeholder="Casasola"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Terminal contiene</label>
            <input
              value={filters.terminal_like}
              onChange={(e) => onChange("terminal_like", e.target.value)}
              className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              placeholder="Salas"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSearch}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>

          <button
            onClick={clearFilters}
            className="px-4 py-2 rounded-lg bg-sky-100 text-slate-700 hover:bg-sky-200 border"
            disabled={loading}
          >
            Limpiar
          </button>

          <div className="text-sm text-slate-600">
            Registros mostrados: <b>{rowsCount}</b>
            {rowsCount >= pageSize ? (
              <span className="text-slate-500"> (límite {pageSize}, ajustable)</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ✅ SOLO ESTO SE IMPRIME */}
      <div className="print-area flex-1 min-h-0">
        {/* Encabezado SOLO impresión */}
        <div className="hidden print:block mb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Si aún no tienes logo, igual compila; si da error, me dices y lo hacemos opcional */}
              <img src={logo} alt="logo" className="h-10 w-auto" />
              <div>
                <div className="text-lg font-bold">{REPORT_BRAND_NAME}</div>
                <div className="text-xs text-slate-600">
                  Rango: {filters.start || "-"} a {filters.end || "-"} | Modo:{" "}
                  {filters.mode === "first_last" ? "Primer/Último" : "Todos"}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600">
              Generado: {new Date().toISOString().slice(0, 19).replace("T", " ")}
            </div>
          </div>
        </div>

        {/* Tabla: altura adaptable + scrollbar */}
        <div className="bg-white rounded-xl border overflow-hidden flex flex-col min-h-0">
          {/* ✅ Esta área toma el alto disponible y muestra scrollbar */}
          <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
            <table className="min-w-[1200px] w-full text-sm print:text-[10px] print:min-w-0">
              <thead className="bg-slate-100 text-slate-700 print:bg-white sticky top-0">
                <tr>
                  <th className="text-left p-3 print:p-2">Fecha</th>
                  <th className="text-left p-3 print:p-2">Hora</th>
                  <th className="text-left p-3 print:p-2">Employee</th>
                  <th className="text-left p-3 print:p-2">Card</th>
                  <th className="text-left p-3 print:p-2">Nombre</th>
                  <th className="text-left p-3 print:p-2">Terminal</th>
                  <th className="text-left p-3 print:p-2">In/Out</th>
                  <th className="text-left p-3 print:p-2">Puerta</th>
                  <th className="text-left p-3 print:p-2">Biométrico</th>
                </tr>
              </thead>

              <tbody>
                {data.rows?.map((r) => {
                  const doorFromDb = r.door_name;
                  const doorFromCatalog = doorNameFromCatalog(r.device_id, r.door_number);
                  const finalDoorName = doorFromDb || doorFromCatalog || "-";

                  return (
                    <tr key={`${r.device_id}-${r.id}`} className="border-t">
                      <td className="p-3 print:p-2">{String(r.date).slice(0, 10)}</td>
                      <td className="p-3 print:p-2">{r.time}</td>
                      <td className="p-3 print:p-2">{r.employee_id}</td>
                      <td className="p-3 print:p-2">{r.card_id}</td>
                      <td className="p-3 print:p-2">{r.name}</td>
                      <td className="p-3 print:p-2">{r.terminal}</td>
                      <td className="p-3 print:p-2">{r.in_out}</td>
                      <td className="p-3 print:p-2">
                        {finalDoorName} ({r.door_number})
                      </td>
                      <td className="p-3 print:p-2">{deviceNameById(r.device_id)}</td>
                    </tr>
                  );
                })}

                {!loading && (!data.rows || data.rows.length === 0) && (
                  <tr>
                    <td className="p-6 text-slate-500" colSpan={9}>
                      Sin resultados para ese rango/filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer no imprime */}
          <div className="p-3 border-t bg-white print:hidden text-xs text-slate-500">
            Nota: el reporte muestra hasta {pageSize} registros por consulta (para scroll sin paginación).
          </div>
        </div>
      </div>
    </div>
  );
}
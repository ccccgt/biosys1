import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { swalError, swalSuccess, swalWarning } from "../lib/swal";

import logo from "../assets/logo.png";
import firmaCasasola from "../assets/firma-placeholder.svg";
import firmaEstuardo from "../assets/firma-placeholder.svg";

const API = import.meta.env.VITE_API_URL || "";
const REPORT_BRAND_NAME = "BioSys -UME - Reporte de Marcajes";

const PAGE_SIZE = 500;

function isValidYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function uniqueSortedDates(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : []).filter((v) =>
        isValidYmd(v)
      )
    )
  ).sort();
}

function getEffectiveRange(start, end, selectedDates) {
  const validDates = uniqueSortedDates(selectedDates || []);

  if (validDates.length > 0) {
    return {
      start: validDates[0],
      end: validDates[validDates.length - 1],
    };
  }

  return {
    start: start || "",
    end: end || "",
  };
}

/*
 * Reduce los registros a un máximo de un registro
 * por persona / fecha / hora.
 */
function reduceRowsOnePerHour(rows) {
  const map = new Map();

  const ordered = [...(Array.isArray(rows) ? rows : [])].sort(
    (a, b) => {
      const nameA = String(a.name || "");
      const nameB = String(b.name || "");

      const dateA = String(a.date || "").slice(0, 10);
      const dateB = String(b.date || "").slice(0, 10);

      const timeA = String(a.time || "");
      const timeB = String(b.time || "");

      return (
        nameA.localeCompare(nameB) ||
        dateA.localeCompare(dateB) ||
        timeA.localeCompare(timeB)
      );
    }
  );

  for (const r of ordered) {
    const date = String(r.date || "").slice(0, 10);
    const hour = String(r.time || "").slice(0, 2);

    const personKey =
      r.card_id ||
      r.employee_id ||
      r.name ||
      "SIN_ID";

    const key = `${personKey}|${date}|${hour}`;

    if (!map.has(key)) {
      map.set(key, r);
    }
  }

  return Array.from(map.values());
}

export default function Reports() {
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    selected_dates: [],
    employee_id: "",
    card_id: "",
    device_id: "",
    door_number: "",
    mode: "all",
    name_like: "",
    terminal_like: "",
  });

  const [selectedDateInput, setSelectedDateInput] = useState("");

  const [printMode, setPrintMode] = useState("all");

  /*
   * Paginación real.
   *
   * El navegador solamente carga 500 registros por página.
   */
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [data, setData] = useState({
    rows: [],
    total: 0,
  });

  const [devices, setDevices] = useState([]);
  const [doors, setDoors] = useState([]);
  const [doorsCache, setDoorsCache] = useState({});

  const lastDeviceIdRef = useRef("");

  /* ===================================================== */
  /* Devices */
  /* ===================================================== */

  const fetchDevices = async () => {
    try {
      const res = await axios.get(
        `${API}/api/devices`
      );

      setDevices(
        Array.isArray(res.data)
          ? res.data
          : []
      );
    } catch (e) {
      console.error(
        "Error cargando devices:",
        e
      );

      setDevices([]);
    }
  };

  const fetchDoorsForDevice = async (
    deviceId
  ) => {
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
      const res = await axios.get(
        `${API}/api/devices/${did}/doors`
      );

      const list = Array.isArray(res.data)
        ? res.data
        : [];

      setDoors(list);

      setDoorsCache((prev) => ({
        ...prev,
        [did]: list,
      }));
    } catch (e) {
      console.error(
        "Error cargando doors:",
        e
      );

      setDoors([]);
    }
  };

  /* ===================================================== */
  /* Parámetros del reporte */
  /* ===================================================== */

  const buildRequestParams = (
    requestedPage = page
  ) => {
    const effectiveRange =
      getEffectiveRange(
        filters.start,
        filters.end,
        filters.selected_dates
      );

    return {
      ...filters,

      start: effectiveRange.start,
      end: effectiveRange.end,

      selected_dates_json:
        JSON.stringify(
          uniqueSortedDates(
            filters.selected_dates || []
          )
        ),

      page: requestedPage,
      pageSize,
    };
  };

  /* ===================================================== */
  /* Consulta paginada */
  /* ===================================================== */

  const fetchData = async (
    requestedPage = page
  ) => {
    const effectiveRange =
      getEffectiveRange(
        filters.start,
        filters.end,
        filters.selected_dates
      );

    if (
      !effectiveRange.start ||
      !effectiveRange.end
    ) {
      await swalWarning(
        "Selecciona Inicio y Fin o agrega al menos un día específico."
      );

      return;
    }

    setLoading(true);

    try {
      const token =
        localStorage.getItem("token");

      const res = await axios.get(
        `${API}/api/reports/attendance`,
        {
          params:
            buildRequestParams(
              requestedPage
            ),

          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        }
      );

      const payload =
        res?.data || {};

      const total =
        Number(payload.total) || 0;

      setData({
        rows: Array.isArray(
          payload.rows
        )
          ? payload.rows
          : [],

        total,
      });

      setPage(requestedPage);

      const totalPages =
        Math.max(
          1,
          Math.ceil(
            total / pageSize
          )
        );

      if (
        requestedPage >
        totalPages
      ) {
        setPage(totalPages);
      }
    } catch (e) {
      console.error(e);

      await swalError(
        "Error cargando reporte"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ===================================================== */
  /* Inicialización */
  /* ===================================================== */

  useEffect(() => {
    fetchDevices();
  }, []);

  /* ===================================================== */
  /* Cambio de biométrico */
  /* ===================================================== */

  useEffect(() => {
    const current = String(
      filters.device_id || ""
    );

    if (
      lastDeviceIdRef.current ===
      current
    ) {
      return;
    }

    lastDeviceIdRef.current =
      current;

    fetchDoorsForDevice(
      filters.device_id
    );

    setFilters((prev) => ({
      ...prev,
      door_number: "",
    }));

    // eslint-disable-next-line
  }, [filters.device_id]);

  /* ===================================================== */
  /* Cambios de filtros */
  /* ===================================================== */

  const onChange = (k, v) => {
    setFilters((prev) => ({
      ...prev,
      [k]: v,
    }));

    /*
     * Cualquier cambio de filtro
     * devuelve la paginación a la primera página.
     */
    if (k !== "door_number") {
      setPage(1);
    }
  };

  const onSearch = async () => {
    setPage(1);

    await fetchData(1);
  };

  /* ===================================================== */
  /* Navegación */
  /* ===================================================== */

  const goToPage = async (
    targetPage
  ) => {
    const totalPages =
      Math.max(
        1,
        Math.ceil(
          (Number(data.total) || 0) /
            pageSize
        )
      );

    const nextPage =
      Math.min(
        totalPages,
        Math.max(
          1,
          Number(targetPage) || 1
        )
      );

    if (
      nextPage === page &&
      data.rows.length > 0
    ) {
      return;
    }

    await fetchData(nextPage);
  };

  /* ===================================================== */
  /* Fechas específicas */
  /* ===================================================== */

  const addSelectedDate =
    async () => {
      if (!selectedDateInput) {
        return;
      }

      if (
        !isValidYmd(
          selectedDateInput
        )
      ) {
        await swalWarning(
          "La fecha seleccionada no es válida."
        );

        return;
      }

      if (
        filters.start &&
        selectedDateInput <
          filters.start
      ) {
        await swalWarning(
          "La fecha específica no puede ser menor que Inicio."
        );

        return;
      }

      if (
        filters.end &&
        selectedDateInput >
          filters.end
      ) {
        await swalWarning(
          "La fecha específica no puede ser mayor que Fin."
        );

        return;
      }

      setFilters((prev) => ({
        ...prev,

        selected_dates:
          uniqueSortedDates([
            ...(prev.selected_dates ||
              []),
            selectedDateInput,
          ]),
      }));

      setPage(1);
      setSelectedDateInput("");
    };

  const removeSelectedDate = (
    dateToRemove
  ) => {
    setFilters((prev) => ({
      ...prev,

      selected_dates:
        (
          prev.selected_dates ||
          []
        ).filter(
          (d) =>
            d !== dateToRemove
        ),
    }));

    setPage(1);
  };

  const clearSelectedDates = () => {
    setFilters((prev) => ({
      ...prev,
      selected_dates: [],
    }));

    setSelectedDateInput("");
    setPage(1);
  };

  /* ===================================================== */
  /* Limpiar filtros */
  /* ===================================================== */

  const clearFilters = () => {
    setFilters({
      start: "",
      end: "",
      selected_dates: [],
      employee_id: "",
      card_id: "",
      device_id: "",
      door_number: "",
      mode: "all",
      name_like: "",
      terminal_like: "",
    });

    setSelectedDateInput("");
    setPrintMode("all");
    setDoors([]);

    setData({
      rows: [],
      total: 0,
    });

    setPage(1);
    lastDeviceIdRef.current = "";
  };

  /* ===================================================== */
  /* Parámetros de exportación */
  /* ===================================================== */

  const buildExportParams = () => {
    const effectiveRange =
      getEffectiveRange(
        filters.start,
        filters.end,
        filters.selected_dates
      );

    const params =
      new URLSearchParams();

    params.set(
      "start",
      effectiveRange.start
    );

    params.set(
      "end",
      effectiveRange.end
    );

    params.set(
      "employee_id",
      filters.employee_id || ""
    );

    params.set(
      "card_id",
      filters.card_id || ""
    );

    params.set(
      "device_id",
      filters.device_id || ""
    );

    params.set(
      "door_number",
      filters.door_number || ""
    );

    params.set(
      "mode",
      filters.mode || "all"
    );

    params.set(
      "name_like",
      filters.name_like || ""
    );

    params.set(
      "terminal_like",
      filters.terminal_like || ""
    );

    params.set(
      "selected_dates_json",
      JSON.stringify(
        uniqueSortedDates(
          filters.selected_dates || []
        )
      )
    );

    return params;
  };

  /* ===================================================== */
  /* XLSX */
  /* ===================================================== */

  const exportXlsx = async () => {
    const effectiveRange =
      getEffectiveRange(
        filters.start,
        filters.end,
        filters.selected_dates
      );

    if (
      !effectiveRange.start ||
      !effectiveRange.end
    ) {
      return await swalWarning(
        "Selecciona Inicio y Fin o agrega al menos un día específico."
      );
    }

    const params =
      buildExportParams();

    window.open(
      `${API}/api/reports/attendance/export.xlsx?${params.toString()}`,
      "_blank"
    );
  };

  /* ===================================================== */
  /* Catálogos */
  /* ===================================================== */

  const deviceNameById = (id) =>
    devices.find(
      (d) =>
        Number(d.id) ===
        Number(id)
    )?.name ||
    `Device ${id}`;

  const doorNameFromCatalog = (
    deviceId,
    doorNumber
  ) => {
    const did = Number(
      deviceId
    );

    const dn = Number(
      doorNumber
    );

    const list =
      doorsCache[did] ||
      doors ||
      [];

    return list.find(
      (x) =>
        Number(
          x.door_number
        ) === dn
    )?.door_name;
  };

  /* ===================================================== */
  /* Registros de página actual */
  /* ===================================================== */

  const rowsForPrint =
    useMemo(() => {
      const rows =
        Array.isArray(
          data.rows
        )
          ? data.rows
          : [];

      if (
        printMode !== "hourly"
      ) {
        return rows;
      }

      return reduceRowsOnePerHour(
        rows
      );
    }, [
      data.rows,
      printMode,
    ]);

  /* ===================================================== */
  /* PDF COMPLETO */
  /* ===================================================== */

  const biometrico = async () => {
    const effectiveRange =
      getEffectiveRange(
        filters.start,
        filters.end,
        filters.selected_dates
      );

    if (
      !effectiveRange.start ||
      !effectiveRange.end
    ) {
      return swalWarning(
        "Selecciona Inicio y Fin o agrega al menos un día específico."
      );
    }

    setExporting(true);

    try {
      const token =
        localStorage.getItem("token");

      /*
       * IMPORTANTE:
       *
       * No usamos data.rows.
       *
       * data.rows contiene únicamente
       * los 500 registros de la página
       * visible.
       *
       * Aquí solicitamos el conjunto
       * completo al backend.
       */
      const fullDataResponse =
        await axios.get(
          `${API}/api/reports/attendance/export-data`,
          {
            params:
              buildExportParams(),

            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : {},
          }
        );

      const fullPayload =
        fullDataResponse?.data ||
        {};

      let fullRows =
        Array.isArray(
          fullPayload.rows
        )
          ? fullPayload.rows
          : [];

      /*
       * El modo horario se aplica
       * sobre TODOS los registros.
       */
      if (
        printMode === "hourly"
      ) {
        fullRows =
          reduceRowsOnePerHour(
            fullRows
          );
      }

      const requestBody = {
        ...filters,

        start:
          effectiveRange.start,

        end:
          effectiveRange.end,

        selected_dates:
          uniqueSortedDates(
            filters.selected_dates ||
              []
          ),

        print_mode:
          printMode,

        print_mode_label:
          printMode === "hourly"
            ? "1 marcaje por hora/persona"
            : "Todos los marcajes",

        info: {
          rows: fullRows,

          total:
            fullRows.length,

          original_total:
            Array.isArray(
              fullPayload.rows
            )
              ? fullPayload.rows.length
              : 0,
        },
      };

      /*
       * Servicio existente de PDF.
       */
      const url =
        `${window.location.origin}/api/biometrico/pdf/reporte`;

      const response =
        await axios.post(
          url,
          requestBody
        );

      const info =
        response?.data?.data;

      if (!info) {
        throw new Error(
          "El servidor PDF no devolvió datos."
        );
      }

      /*
       * El servicio PDF devuelve
       * data URI/base64.
       */
      const base64Part =
        String(info).includes(",")
          ? String(info).split(",")[1]
          : String(info);

      const binaryData =
        atob(base64Part);

      const arrayBuffer =
        new ArrayBuffer(
          binaryData.length
        );

      const byteArray =
        new Uint8Array(
          arrayBuffer
        );

      for (
        let i = 0;
        i < binaryData.length;
        i++
      ) {
        byteArray[i] =
          binaryData.charCodeAt(i);
      }

      const blob = new Blob(
        [arrayBuffer],
        {
          type: "application/pdf",
        }
      );

      const blobUrl =
        URL.createObjectURL(
          blob
        );

      const nuevaPestana =
        window.open(
          blobUrl,
          "_blank"
        );

      if (nuevaPestana) {
        setTimeout(() => {
          try {
            nuevaPestana.print();
          } catch (printError) {
            console.warn(
              "No fue posible iniciar impresión automática:",
              printError
            );
          }
        }, 1000);
      }

      /*
       * No hacemos reload.
       *
       * El estado actual del reporte
       * se conserva.
       */
      await swalSuccess(
        `PDF generado con ${fullRows.length.toLocaleString()} registros.`
      );

      setTimeout(() => {
        URL.revokeObjectURL(
          blobUrl
        );
      }, 60000);
    } catch (e) {
      console.error(
        "Error generando PDF:",
        e
      );

      const message =
        e?.response?.data?.message ||
        e?.message ||
        "Error descargando reporte PDF";

      await swalError(
        message
      );
    } finally {
      setExporting(false);
    }
  };

  /* ===================================================== */
  /* Información de paginación */
  /* ===================================================== */

  const rowsCount = useMemo(
    () =>
      Array.isArray(
        data.rows
      )
        ? data.rows.length
        : 0,
    [data.rows]
  );

  const totalRecords =
    Number(data.total) || 0;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalRecords /
          pageSize
      )
    );

  const firstRecord =
    totalRecords === 0
      ? 0
      : (page - 1) *
          pageSize +
        1;

  const lastRecord =
    totalRecords === 0
      ? 0
      : Math.min(
          page * pageSize,
          totalRecords
        );

  /* ===================================================== */
  /* Fecha de generación */
  /* ===================================================== */

  const generatedAt =
    useMemo(() => {
      const d =
        new Date();

      const pad = (n) =>
        String(n).padStart(
          2,
          "0"
        );

      return `${d.getFullYear()}-${pad(
        d.getMonth() + 1
      )}-${pad(
        d.getDate()
      )} ${pad(
        d.getHours()
      )}:${pad(
        d.getMinutes()
      )}:${pad(
        d.getSeconds()
      )}`;
    }, [
      filters.start,
      filters.end,
      JSON.stringify(
        filters.selected_dates ||
          []
      ),
      filters.mode,
      filters.device_id,
      filters.door_number,
      printMode,
    ]);

  /* ===================================================== */
  /* Páginas de impresión HTML */
  /* ===================================================== */

  const printPages =
    useMemo(() => {
      const chunkSize = 13;
      const pages = [];

      for (
        let i = 0;
        i < rowsForPrint.length;
        i += chunkSize
      ) {
        pages.push(
          rowsForPrint.slice(
            i,
            i + chunkSize
          )
        );
      }

      return pages.length
        ? pages
        : [[]];
    }, [
      rowsForPrint,
    ]);

  const effectiveRangeForDisplay =
    getEffectiveRange(
      filters.start,
      filters.end,
      filters.selected_dates
    );

  /* ===================================================== */
  /* Botones de paginación */
  /* ===================================================== */

  const paginationItems =
    useMemo(() => {
      if (totalPages <= 7) {
        return Array.from(
          {
            length:
              totalPages,
          },
          (_, i) =>
            i + 1
        );
      }

      const items = [];

      items.push(1);

      if (page > 4) {
        items.push(
          "ellipsis-left"
        );
      }

      const start = Math.max(
        2,
        page - 2
      );

      const end = Math.min(
        totalPages - 1,
        page + 2
      );

      for (
        let p = start;
        p <= end;
        p++
      ) {
        items.push(p);
      }

      if (
        page <
        totalPages - 3
      ) {
        items.push(
          "ellipsis-right"
        );
      }

      items.push(
        totalPages
      );

      return items;
    }, [
      page,
      totalPages,
    ]);

  /* ===================================================== */
  /* Render */
  /* ===================================================== */

  return (
    <div className="w-full h-full">
      <div className="no-print flex flex-col gap-4 min-h-0">

        {/* ================================================= */}
        {/* Header */}
        {/* ================================================= */}

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            Reportes de marcajes
          </h1>

          <div className="flex gap-2">
            <button
              onClick={exportXlsx}
              disabled={
                loading ||
                exporting
              }
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting
                ? "Procesando..."
                : "Exportar XLSX"}
            </button>

            <button
              onClick={biometrico}
              disabled={
                loading ||
                exporting
              }
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting
                ? "Generando PDF..."
                : "Imprimir / PDF"}
            </button>
          </div>
        </div>

        {/* ================================================= */}
        {/* Filtros */}
        {/* ================================================= */}

        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

            {/* Inicio */}
            <div>
              <label className="text-sm text-slate-600">
                Inicio
              </label>

              <input
                type="date"
                value={
                  filters.start
                }
                onChange={(e) =>
                  onChange(
                    "start",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            {/* Fin */}
            <div>
              <label className="text-sm text-slate-600">
                Fin
              </label>

              <input
                type="date"
                value={
                  filters.end
                }
                onChange={(e) =>
                  onChange(
                    "end",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            {/* Días específicos */}
            <div className="md:col-span-2">
              <label className="text-sm text-slate-600">
                Días específicos
              </label>

              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={
                    selectedDateInput
                  }
                  onChange={(e) =>
                    setSelectedDateInput(
                      e.target.value
                    )
                  }
                  className="w-full border rounded-lg p-2 bg-sky-50"
                />

                <button
                  type="button"
                  onClick={
                    addSelectedDate
                  }
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
                >
                  Agregar día
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  filters.selected_dates ||
                  []
                ).length === 0 ? (
                  <span className="text-xs text-slate-400">
                    Sin días específicos
                    seleccionados. Se usará
                    todo el rango Inicio/Fin.
                  </span>
                ) : (
                  <>
                    {(
                      filters.selected_dates ||
                      []
                    ).map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-2 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs border border-sky-200"
                      >
                        {d}

                        <button
                          type="button"
                          onClick={() =>
                            removeSelectedDate(
                              d
                            )
                          }
                          className="font-bold hover:text-red-600"
                          title="Quitar fecha"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    <button
                      type="button"
                      onClick={
                        clearSelectedDates
                      }
                      className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs border hover:bg-slate-200"
                    >
                      Limpiar días
                    </button>
                  </>
                )}
              </div>

              {(
                filters.selected_dates ||
                []
              ).length > 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  Rango efectivo automático:{" "}
                  {
                    effectiveRangeForDisplay.start
                  }{" "}
                  a{" "}
                  {
                    effectiveRangeForDisplay.end
                  }
                </div>
              )}
            </div>

            {/* NIP */}
            <div>
              <label className="text-sm text-slate-600">
                NIP
              </label>

              <input
                value={
                  filters.employee_id
                }
                onChange={(e) =>
                  onChange(
                    "employee_id",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                placeholder="Ej: 20350265"
              />
            </div>

            {/* Tarjeta */}
            <div>
              <label className="text-sm text-slate-600">
                No. de Tarjeta
              </label>

              <input
                value={
                  filters.card_id
                }
                onChange={(e) =>
                  onChange(
                    "card_id",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                placeholder="Ej: 13936427"
              />
            </div>

            {/* Biométrico */}
            <div>
              <label className="text-sm text-slate-600">
                Biométrico
              </label>

              <select
                value={
                  filters.device_id
                }
                onChange={(e) =>
                  onChange(
                    "device_id",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              >
                <option value="">
                  Todos
                </option>

                {devices.map(
                  (d) => (
                    <option
                      key={d.id}
                      value={d.id}
                    >
                      {d.name}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Puerta */}
            <div>
              <label className="text-sm text-slate-600">
                Puerta
              </label>

              <select
                value={
                  filters.door_number
                }
                onChange={(e) =>
                  onChange(
                    "door_number",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50 disabled:opacity-60"
                disabled={
                  !filters.device_id
                }
                title={
                  !filters.device_id
                    ? "Primero selecciona un biométrico"
                    : ""
                }
              >
                <option value="">
                  {!filters.device_id
                    ? "Selecciona biométrico..."
                    : "Todas"}
                </option>

                {doors.map(
                  (d) => (
                    <option
                      key={
                        d.door_number
                      }
                      value={
                        d.door_number
                      }
                    >
                      {d.door_name} (
                      {
                        d.door_number
                      }
                      )
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Modo */}
            <div>
              <label className="text-sm text-slate-600">
                Modo
              </label>

              <select
                value={
                  filters.mode
                }
                onChange={(e) =>
                  onChange(
                    "mode",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              >
                <option value="all">
                  Todos los marcajes
                </option>

                <option value="first_last">
                  Primer y último por día
                </option>
              </select>
            </div>

            {/* Modo impresión */}
            <div>
              <label className="text-sm text-slate-600">
                Modo impresión
              </label>

              <select
                value={
                  printMode
                }
                onChange={(e) =>
                  setPrintMode(
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              >
                <option value="all">
                  Imprimir todos los marcajes
                </option>

                <option value="hourly">
                  Imprimir 1 marcaje por hora/persona
                </option>
              </select>
            </div>

            {/* Nombre */}
            <div>
              <label className="text-sm text-slate-600">
                Nombre contiene
              </label>

              <input
                value={
                  filters.name_like
                }
                onChange={(e) =>
                  onChange(
                    "name_like",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                placeholder="Casasola"
              />
            </div>

            {/* Terminal */}
            <div>
              <label className="text-sm text-slate-600">
                Terminal contiene
              </label>

              <input
                value={
                  filters.terminal_like
                }
                onChange={(e) =>
                  onChange(
                    "terminal_like",
                    e.target.value
                  )
                }
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
                placeholder="Salas"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-wrap">

            <button
              onClick={onSearch}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={
                loading ||
                exporting
              }
            >
              {loading
                ? "Buscando..."
                : "Buscar"}
            </button>

            <button
              onClick={
                clearFilters
              }
              className="px-4 py-2 rounded-lg bg-sky-100 text-slate-700 hover:bg-sky-200 border disabled:opacity-50"
              disabled={
                loading ||
                exporting
              }
            >
              Limpiar
            </button>

            <div className="text-sm text-slate-600">
              Mostrando:{" "}
              <b>
                {firstRecord.toLocaleString()}{" "}
                -{" "}
                {lastRecord.toLocaleString()}
              </b>{" "}
              de{" "}
              <b>
                {totalRecords.toLocaleString()}
              </b>{" "}
              registros
            </div>

            {rowsCount > 0 && (
              <div className="text-xs text-slate-500">
                Página{" "}
                {page} de{" "}
                {totalPages}
              </div>
            )}
          </div>
        </div>

        {/* ================================================= */}
        {/* Tabla */}
        {/* ================================================= */}

        <div className="bg-white rounded-xl border overflow-hidden flex flex-col min-h-0">
          <div
            className="overflow-auto"
            style={{
              maxHeight: "520px",
            }}
          >
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 sticky top-0">
                <tr>
                  <th className="text-left p-3">
                    Fecha
                  </th>

                  <th className="text-left p-3">
                    Hora
                  </th>

                  <th className="text-left p-3">
                    NIP
                  </th>

                  <th className="text-left p-3">
                    No. de Tarjeta
                  </th>

                  <th className="text-left p-3">
                    Nombre
                  </th>

                  <th className="text-left p-3">
                    Terminal
                  </th>

                  <th className="text-left p-3">
                    In/Out
                  </th>

                  <th className="text-left p-3">
                    Puerta
                  </th>

                  <th className="text-left p-3">
                    Biométrico
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.rows?.map(
                  (r, idx) => {
                    const doorFromDb =
                      r.door_name;

                    const doorFromCatalog =
                      doorNameFromCatalog(
                        r.device_id,
                        r.door_number
                      );

                    const finalDoorName =
                      doorFromDb ||
                      doorFromCatalog ||
                      "-";

                    const rowKey =
                      r.id != null
                        ? `${r.device_id}-${r.id}`
                        : `${r.device_id}-${r.employee_id}-${r.date}-${r.time}-${idx}`;

                    return (
                      <tr
                        key={rowKey}
                        className="border-t"
                      >
                        <td className="p-3">
                          {String(
                            r.date
                          ).slice(
                            0,
                            10
                          )}
                        </td>

                        <td className="p-3">
                          {r.time}
                        </td>

                        <td className="p-3">
                          {r.employee_id}
                        </td>

                        <td className="p-3">
                          {r.card_id}
                        </td>

                        <td className="p-3">
                          {r.name}
                        </td>

                        <td className="p-3">
                          {r.terminal}
                        </td>

                        <td className="p-3">
                          {r.in_out}
                        </td>

                        <td className="p-3">
                          {finalDoorName}{" "}
                          (
                          {
                            r.door_number
                          }
                          )
                        </td>

                        <td className="p-3">
                          {deviceNameById(
                            r.device_id
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}

                {!loading &&
                  (
                    !data.rows ||
                    data.rows.length ===
                      0
                  ) && (
                    <tr>
                      <td
                        className="p-6 text-slate-500"
                        colSpan={9}
                      >
                        Sin resultados para ese rango/filtros.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>

          {/* ================================================= */}
          {/* Paginación */}
          {/* ================================================= */}

          {totalRecords > 0 && (
            <div className="p-3 border-t bg-white flex items-center justify-between gap-3 flex-wrap">

              <div className="text-xs text-slate-500">
                Registros{" "}
                <b>
                  {firstRecord.toLocaleString()}
                  -
                  {lastRecord.toLocaleString()}
                </b>{" "}
                de{" "}
                <b>
                  {totalRecords.toLocaleString()}
                </b>
              </div>

              <div className="flex items-center gap-1">

                <button
                  type="button"
                  disabled={
                    loading ||
                    exporting ||
                    page <= 1
                  }
                  onClick={() =>
                    goToPage(
                      page - 1
                    )
                  }
                  className="px-3 py-1.5 rounded border bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Anterior
                </button>

                {paginationItems.map(
                  (item) => {
                    if (
                      item ===
                        "ellipsis-left" ||
                      item ===
                        "ellipsis-right"
                    ) {
                      return (
                        <span
                          key={item}
                          className="px-2 text-slate-400"
                        >
                          …
                        </span>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={item}
                        disabled={
                          loading ||
                          exporting ||
                          item === page
                        }
                        onClick={() =>
                          goToPage(
                            item
                          )
                        }
                        className={`min-w-[36px] px-2 py-1.5 rounded border ${
                          item === page
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        } disabled:cursor-default`}
                      >
                        {item}
                      </button>
                    );
                  }
                )}

                <button
                  type="button"
                  disabled={
                    loading ||
                    exporting ||
                    page >=
                      totalPages
                  }
                  onClick={() =>
                    goToPage(
                      page + 1
                    )
                  }
                  className="px-3 py-1.5 rounded border bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          <div className="p-3 border-t bg-white text-xs text-slate-500">
            La pantalla muestra hasta{" "}
            {pageSize.toLocaleString()}{" "}
            registros por página.
            XLSX y PDF trabajan
            independientemente de esta
            paginación.
          </div>
        </div>
      </div>

      {/* =================================================== */}
      {/* Área de impresión HTML */}
      {/* =================================================== */}

      <div
        id="print-area"
        className="only-print"
      >
        {printPages.map(
          (pageRows, idx) => {
            const pageNum =
              idx + 1;

            const totalPrintPages =
              printPages.length;

            const isLast =
              pageNum ===
              totalPrintPages;

            return (
              <div
                key={idx}
                className="print-page"
              >
                <div className="print-head">
                  <div className="flex items-center justify-between gap-4 w-full">

                    <div className="flex items-center gap-3">
                      <img
                        src={logo}
                        alt="logo"
                        className="h-10 w-auto"
                      />

                      <div>
                        <div className="text-lg font-bold">
                          {
                            REPORT_BRAND_NAME
                          }
                        </div>

                        <div className="text-xs text-slate-600">
                          Rango:{" "}
                          {
                            effectiveRangeForDisplay.start ||
                            "-"
                          }{" "}
                          a{" "}
                          {
                            effectiveRangeForDisplay.end ||
                            "-"
                          }{" "}
                          | Modo:{" "}
                          {filters.mode ===
                          "first_last"
                            ? "Primer/Último"
                            : "Todos"}{" "}
                          | Impresión:{" "}
                          {printMode ===
                          "hourly"
                            ? "1 marcaje por hora/persona"
                            : "Todos los marcajes"}
                        </div>

                        <div className="text-xs text-slate-600">
                          Días específicos:{" "}
                          {(
                            filters.selected_dates ||
                            []
                          ).length
                            ? filters.selected_dates.join(
                                ", "
                              )
                            : "No"}
                        </div>
                      </div>
                    </div>

                    <div className="print-head-right">
                      <div>
                        Generado:{" "}
                        {generatedAt}
                      </div>

                      <div className="print-pagecount">
                        Página{" "}
                        {pageNum} de{" "}
                        {
                          totalPrintPages
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <table className="print-table">
                  <thead>
                    <tr>
                      <th className="text-left p-3">
                        Fecha
                      </th>

                      <th className="text-left p-3">
                        Hora
                      </th>

                      <th className="text-left p-3">
                        Employee
                      </th>

                      <th className="text-left p-3">
                        Card
                      </th>

                      <th className="text-left p-3">
                        Nombre
                      </th>

                      <th className="text-left p-3">
                        Terminal
                      </th>

                      <th className="text-left p-3">
                        In/Out
                      </th>

                      <th className="text-left p-3">
                        Puerta
                      </th>

                      <th className="text-left p-3">
                        Biométrico
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pageRows.map(
                      (r, i2) => {
                        const doorFromDb =
                          r.door_name;

                        const doorFromCatalog =
                          doorNameFromCatalog(
                            r.device_id,
                            r.door_number
                          );

                        const finalDoorName =
                          doorFromDb ||
                          doorFromCatalog ||
                          "-";

                        const rowKey =
                          r.id != null
                            ? `p${idx}-${r.device_id}-${r.id}`
                            : `p${idx}-${r.device_id}-${r.employee_id}-${r.date}-${r.time}-${i2}`;

                        return (
                          <tr
                            key={rowKey}
                          >
                            <td className="p-3">
                              {String(
                                r.date
                              ).slice(
                                0,
                                10
                              )}
                            </td>

                            <td className="p-3">
                              {r.time}
                            </td>

                            <td className="p-3">
                              {
                                r.employee_id
                              }
                            </td>

                            <td className="p-3">
                              {
                                r.card_id
                              }
                            </td>

                            <td className="p-3">
                              {r.name}
                            </td>

                            <td className="p-3">
                              {r.terminal}
                            </td>

                            <td className="p-3">
                              {r.in_out}
                            </td>

                            <td className="p-3">
                              {
                                finalDoorName
                              }{" "}
                              (
                              {
                                r.door_number
                              }
                              )
                            </td>

                            <td className="p-3">
                              {deviceNameById(
                                r.device_id
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}

                    {pageRows.length ===
                      0 && (
                      <tr>
                        <td
                          className="p-6 text-slate-500"
                          colSpan={9}
                        >
                          Sin resultados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="print-signatures">
                  <div>
                    <img
                      src={
                        firmaCasasola
                      }
                      alt="firma casasola"
                      className="sig-img"
                    />
                  </div>

                  <div>
                    <img
                      src={
                        firmaEstuardo
                      }
                      alt="firma estuardo"
                      className="sig-img"
                    />
                  </div>
                </div>

                {!isLast ? (
                  <div className="page-break" />
                ) : null}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

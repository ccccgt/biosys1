import { useState } from "react";
import {
  Search,
  UserRound,
  CreditCard,
  Building2,
  BriefcaseBusiness,
  RefreshCw,
  Loader2,
  Fingerprint,
  X,
  Trash2,
} from "lucide-react";

import { api } from "../../services/api";
import {
  alertConfirm,
  alertError,
  alertInfo,
  alertToast,
} from "../../utils/alerts";

import DeviceCard from "./DeviceCard";

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

function getEmployeeCardId(employee) {
  return String(
    employee?.card_id ||
    employee?.biometric_user_id ||
    ""
  ).trim();
}

export default function CardManager() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [employees, setEmployees] = useState([]);

  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [checkingStatus, setCheckingStatus] = useState(false);
  const [devices, setDevices] = useState([]);
  const [actionState, setActionState] = useState(null);

  async function searchEmployees(event) {
    event?.preventDefault();

    const value = query.trim();

    if (value.length < 2) {
      await alertInfo("Escribe al menos 2 caracteres para buscar.");
      return;
    }

    setSearching(true);
    setEmployees([]);

    try {
      const response = await api.get(
        "/api/biometric-cards/employees/search",
        {
          params: {
            q: value,
            limit: 20,
          },
          timeout: 20000,
        }
      );

      const items = Array.isArray(response.data?.items)
        ? response.data.items
        : [];

      setEmployees(items);

      if (!items.length) {
        await alertInfo("No se encontraron empleados con ese criterio.");
      }
    } catch (error) {
      console.error("Error buscando empleados:", error);

      await alertError(
        getErrorMessage(
          error,
          "No fue posible buscar empleados."
        )
      );
    } finally {
      setSearching(false);
    }
  }

  async function checkCardStatus(employee = selectedEmployee) {
    const cardId = getEmployeeCardId(employee);

    if (!cardId) {
      await alertError(
        "El empleado seleccionado no tiene tarjeta ni ID biométrico configurado."
      );
      return;
    }

    setCheckingStatus(true);
    setDevices([]);

    try {
      const response = await api.post(
        "/api/biometric-cards/status",
        {
          card_id: cardId,
        },
        {
          timeout: 40000,
        }
      );

      setDevices(
        Array.isArray(response.data?.devices)
          ? response.data.devices
          : []
      );
    } catch (error) {
      console.error("Error consultando tarjeta:", error);

      await alertError(
        getErrorMessage(
          error,
          "No fue posible consultar la tarjeta en los dispositivos CHIYU."
        )
      );
    } finally {
      setCheckingStatus(false);
    }
  }

  async function selectEmployee(employee) {
    setSelectedEmployee(employee);
    setEmployees([]);
    await checkCardStatus(employee);
  }

  async function changeCardStatus(device, action) {
    const cardId = getEmployeeCardId(selectedEmployee);

    if (!cardId) {
      await alertError("No hay una tarjeta seleccionada.");
      return;
    }

    const actionLabel =
      action === "activate" ? "activar" : "desactivar";

    const employeeName =
      selectedEmployee?.full_name || "el empleado seleccionado";

    const confirmation = await alertConfirm(
      `¿Deseas ${actionLabel} la tarjeta ${cardId} de ${employeeName} en ${device.device_name}?`
    );

    if (!confirmation.isConfirmed) return;

    setActionState({
      deviceId: device.device_id,
      action,
    });

    try {
      const response = await api.post(
        "/api/biometric-cards/action",
        {
          card_id: cardId,
          action,
          device_ids: [device.device_id],
        },
        {
          timeout: 50000,
        }
      );

      const result = Array.isArray(response.data?.devices)
        ? response.data.devices[0]
        : null;

      if (!result?.success) {
        throw new Error(
          result?.error ||
            "El dispositivo no confirmó el cambio solicitado."
        );
      }

      const message =
        action === "activate"
          ? `Tarjeta activada correctamente en ${device.device_name}.`
          : `Tarjeta desactivada correctamente en ${device.device_name}.`;

      await alertToast(message);
      await checkCardStatus(selectedEmployee);
    } catch (error) {
      console.error("Error cambiando tarjeta:", error);

      await alertError(
        getErrorMessage(
          error,
          `No fue posible ${actionLabel} la tarjeta.`
        )
      );

      await checkCardStatus(selectedEmployee);
    } finally {
      setActionState(null);
    }
  }


  async function deleteCardFromDevices() {
    const cardId = getEmployeeCardId(selectedEmployee);

    if (!cardId) {
      await alertError(
        "El empleado seleccionado no tiene una tarjeta ni un ID biométrico válido."
      );
      return;
    }

    const employeeName =
      selectedEmployee?.full_name || "el usuario seleccionado";

    const confirmation = await alertConfirm(
      `¿Confirmas eliminar permanentemente a ${employeeName}, `
      + `con tarjeta/ID ${cardId}, de todos los dispositivos CHIYU activos? `
      + "Esta acción no se puede deshacer."
    );

    if (!confirmation.isConfirmed) return;

    setActionState({ action: "delete" });

    try {
      const response = await api.post(
        "/api/biometric-cards/delete",
        { card_id: cardId },
        { timeout: 90000 }
      );

      const results = Array.isArray(response.data?.devices)
        ? response.data.devices
        : [];

      const failures = results.filter(
        (device) => !device.success
      );

      if (response.data?.ok !== true) {
        const details = failures
          .map(
            (device) =>
              `${device.device_name || "Dispositivo"}: `
              + `${device.error || "No se confirmó la eliminación"}`
          )
          .join("\n");

        await alertError(
          "La eliminación no se completó en todos los dispositivos. "
          + "Revisa el resultado de cada equipo.\n"
          + details
        );

        await checkCardStatus(selectedEmployee);
        return;
      }

      await alertToast(
        `Usuario ${employeeName} eliminado y verificado en `
        + `${response.data.successful_devices} dispositivo(s) CHIYU.`
      );

      clearSelection();
    } catch (error) {
      console.error("Error eliminando usuario CHIYU:", error);

      await alertError(
        getErrorMessage(
          error,
          "No fue posible eliminar al usuario de los dispositivos CHIYU."
        )
      );

      await checkCardStatus(selectedEmployee);
    } finally {
      setActionState(null);
    }
  }

  function clearSelection() {
    setSelectedEmployee(null);
    setDevices([]);
    setEmployees([]);
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Fingerprint className="text-indigo-600" size={24} />
              <h2 className="text-xl font-bold text-slate-900">
                Administración de tarjetas CHIYU
              </h2>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Busca un empleado y consulta el estado de su tarjeta en todos
              los dispositivos biométricos activos.
            </p>
          </div>
        </div>

        <form
          onSubmit={searchEmployees}
          className="relative mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, NIP, ID biométrico, tarjeta o departamento..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <button
            type="submit"
            disabled={searching}
            className="inline-flex min-w-[130px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search size={18} />
                Buscar
              </>
            )}
          </button>
        </form>

        {employees.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Resultados encontrados
            </div>

            <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
              {employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => selectEmployee(employee)}
                  className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-indigo-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {employee.full_name || "Empleado sin nombre"}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span>NIP: {employee.employee_code || "-"}</span>
                      <span>
                        ID biométrico: {employee.biometric_user_id || "-"}
                      </span>
                      <span>Tarjeta/ID CHIYU: {getEmployeeCardId(employee) || "-"}</span>
                    </div>
                  </div>

                  <span className="text-sm font-medium text-indigo-600">
                    Seleccionar
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {selectedEmployee ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-700">
                <UserRound size={28} />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedEmployee.full_name || "Empleado seleccionado"}
                </h2>

                <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <UserRound size={16} className="text-slate-400" />
                    <span>NIP: {selectedEmployee.employee_code || "-"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600">
                    <CreditCard size={16} className="text-slate-400" />
                    <span>  Tarjeta/ID CHIYU: {getEmployeeCardId(selectedEmployee) || "-"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 size={16} className="text-slate-400" />
                    <span>{selectedEmployee.department || "Sin departamento"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600">
                    <BriefcaseBusiness size={16} className="text-slate-400" />
                    <span>{selectedEmployee.position || "Sin puesto"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => checkCardStatus()}
                disabled={checkingStatus || actionState !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={checkingStatus ? "animate-spin" : ""}
                />
                Actualizar estado
              </button>

              <button
                type="button"
                onClick={deleteCardFromDevices}
                disabled={
                  checkingStatus ||
                  actionState !== null
                }
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState?.action === "delete" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                {actionState?.action === "delete"
                  ? "Eliminando..."
                  : "Eliminar usuario"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={actionState !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <X size={16} />
                Cerrar
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {checkingStatus ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2
              size={34}
              className="mx-auto animate-spin text-indigo-600"
            />
            <div className="mt-3 font-medium text-slate-700">
              Consultando dispositivos CHIYU...
            </div>
            <div className="mt-1 text-sm text-slate-400">
              La consulta puede tardar algunos segundos.
            </div>
          </div>
        </div>
      ) : null}

      {!checkingStatus && selectedEmployee && devices.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Estado por dispositivo
            </h2>

            <div className="text-sm text-slate-500">
              {devices.length} dispositivo{devices.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {devices.map((device) => (
              <DeviceCard
                key={device.device_id}
                device={device}
                actionState={actionState}
                onAction={changeCardStatus}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!checkingStatus &&
      selectedEmployee &&
      devices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No se recibieron resultados de los dispositivos CHIYU.
        </div>
      ) : null}
    </div>
  );
}

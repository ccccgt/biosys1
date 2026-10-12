import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  WifiOff,
  CreditCard,
  Loader2,
} from "lucide-react";

function getStatusConfig(device) {
  if (device?.connection === "error" || device?.status === "connection_error") {
    return {
      label: "Sin conexión",
      description: device?.error || "No fue posible conectar con el dispositivo.",
      icon: WifiOff,
      badge: "bg-slate-100 text-slate-700 border-slate-300",
      panel: "border-slate-300",
    };
  }

  if (!device?.exists || device?.status === "not_found") {
    return {
      label: "No registrada",
      description: "La tarjeta no existe en este dispositivo.",
      icon: AlertTriangle,
      badge: "bg-amber-50 text-amber-700 border-amber-300",
      panel: "border-amber-200",
    };
  }

  if (device?.status === "active") {
    return {
      label: "Activa",
      description: "La tarjeta está habilitada en este dispositivo.",
      icon: CheckCircle2,
      badge: "bg-emerald-50 text-emerald-700 border-emerald-300",
      panel: "border-emerald-200",
    };
  }

  if (device?.status === "inactive") {
    return {
      label: "Inactiva",
      description: "La tarjeta está deshabilitada en este dispositivo.",
      icon: XCircle,
      badge: "bg-red-50 text-red-700 border-red-300",
      panel: "border-red-200",
    };
  }

  return {
    label: "Estado desconocido",
    description: "El dispositivo respondió, pero no fue posible determinar el estado.",
    icon: AlertTriangle,
    badge: "bg-slate-100 text-slate-700 border-slate-300",
    panel: "border-slate-300",
  };
}

export default function DeviceCard({
  device,
  actionState,
  onAction,
}) {
  const config = getStatusConfig(device);
  const StatusIcon = config.icon;

  const processing =
    actionState?.deviceId === device.device_id;

  const processingAction = processing
    ? actionState?.action
    : null;

  const canChange =
    device?.connection === "ok" &&
    device?.exists === true &&
    ["active", "inactive"].includes(device?.status);

  const desiredAction =
    device?.status === "active" ? "deactivate" : "activate";

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${config.panel}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-slate-900 p-3 text-white">
            <CreditCard size={22} />
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {device.device_name || `Dispositivo ${device.device_id}`}
            </h3>

            <div className="mt-1 text-sm text-slate-500">
              {device.ip_address || "Dirección IP no disponible"}
            </div>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.badge}`}
        >
          <StatusIcon size={14} />
          {config.label}
        </span>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-600">{config.description}</p>

        {device?.exists ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Tarjeta mostrada
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {device.displayed_card_id || device.requested_card_id || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                ID interno CHIYU
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {device.internal_id || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                ID empleado
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {device.biometric_employee_id || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Nombre en CHIYU
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {device.biometric_name || "-"}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {Number.isFinite(Number(device?.elapsed_ms))
            ? `Respuesta: ${device.elapsed_ms} ms`
            : ""}
        </div>

        {canChange ? (
          <button
            type="button"
            disabled={processing}
            onClick={() => onAction(device, desiredAction)}
            className={`inline-flex min-w-[130px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              desiredAction === "activate"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {processing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {processingAction === "activate"
                  ? "Activando..."
                  : "Desactivando..."}
              </>
            ) : desiredAction === "activate" ? (
              "Activar tarjeta"
            ) : (
              "Desactivar tarjeta"
            )}
          </button>
        ) : null}
      </div>
    </article>
  );
}

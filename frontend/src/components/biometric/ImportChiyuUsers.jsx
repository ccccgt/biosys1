import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  LoaderCircle,
  RefreshCw,
  Terminal,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

export default function ImportChiyuUsers() {
  const [running, setRunning] = useState(false);
  const [terminal, setTerminal] = useState(
    "BIOSYS 1.0\n" +
    "Terminal de sincronización CHIYU\n\n" +
    "Listo para iniciar.\n" +
    "La importación solo comienza cuando confirmas la operación.\n"
  );
  const [result, setResult] = useState(null);
  const terminalRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminal]);

  function appendOutput(text) {
    setTerminal((previous) => previous + text);
  }

  async function startSync() {
    if (runningRef.current) return;

    const confirmed = window.confirm(
      "¿Deseas iniciar la sincronización REAL de usuarios biométricos CHIYU?\n\n" +
      "Se insertarán únicamente los usuarios que el importador determine seguros. " +
      "Los registros existentes no se actualizarán."
    );

    if (!confirmed) return;

    runningRef.current = true;
    setRunning(true);
    setResult(null);
    setTerminal(
      "BIOSYS 1.0\n" +
      "Terminal de sincronización CHIYU\n" +
      "====================================================\n" +
      "Solicitando inicio de sincronización...\n\n"
    );

    try {
      const token = localStorage.getItem("token");

      const headers = {
        Accept: "text/plain",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API}/api/biometric-users/sync/chiyu/stream`,
        {
          method: "POST",
          headers,
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${message || response.statusText}`
        );
      }

      if (!response.body) {
        throw new Error("El navegador no recibió el flujo de salida.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullOutput = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullOutput += chunk;
        appendOutput(chunk);
      }

      const remainder = decoder.decode();

      if (remainder) {
        fullOutput += remainder;
        appendOutput(remainder);
      }

      const successful =
        /\[RESULTADO:\s*EXITOSO\]/.test(fullOutput) &&
        /\[CÓDIGO DE SALIDA:\s*0\]/.test(fullOutput);

      if (successful) {
        setResult({
          type: "success",
          message: "El importador terminó con código de salida 0.",
        });
      } else {
        setResult({
          type: "error",
          message:
            "La sincronización no terminó correctamente. Revisa la salida completa.",
        });
      }
    } catch (error) {
      const message = String(error?.message || error);

      appendOutput(
        `\n[ERROR DE SOLICITUD] ${message}\n`
      );

      setResult({
        type: "error",
        message,
      });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className="text-slate-700" size={21} />
              <h2 className="text-lg font-bold text-slate-900">
                Sincronizar usuarios biométricos
              </h2>
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Ejecuta el importador oficial de CHIYU y observa su salida en
              tiempo real. Se conservan las validaciones de conflictos y
              las reglas de inserción del script existente.
            </p>
          </div>

          <button
            type="button"
            onClick={startSync}
            disabled={running}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <>
                <LoaderCircle className="animate-spin" size={17} />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw size={17} />
                Iniciar sincronización
              </>
            )}
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>
            Esta operación realiza inserciones reales en la base de datos.
            No la inicies si no deseas importar usuarios en este momento.
          </p>
        </div>
      </div>

      {result && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            result.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
          ) : (
            <CircleStop className="mt-0.5 shrink-0" size={20} />
          )}

          <div>
            <p className="font-semibold">
              {result.type === "success"
                ? "Proceso finalizado"
                : "Proceso con errores"}
            </p>
            <p className="mt-1 text-sm">{result.message}</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Terminal size={17} />
            Consola de importación
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className={`h-2 w-2 rounded-full ${
                running ? "animate-pulse bg-amber-400" : "bg-emerald-400"
              }`}
            />
            {running ? "EJECUCIÓN EN CURSO" : "ESPERANDO"}
          </div>
        </div>

        <pre
          ref={terminalRef}
          aria-live="polite"
          aria-label="Salida en tiempo real de la sincronización biométrica"
          className="h-[480px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6 text-emerald-300 sm:text-sm"
        >
          {terminal}
        </pre>

        <div className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
          La consola muestra la salida recibida del proceso del servidor.
          Cada INSERT se muestra antes del COMMIT; el resumen final confirma el resultado de la transacción.
        </div>
      </div>
    </section>
  );
}

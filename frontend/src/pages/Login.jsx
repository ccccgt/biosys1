import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onChange = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/login`, {
        username: form.username,
        password: form.password,
      });

      const token = res?.data?.token;
      const user = res?.data?.user;

      if (!token || !user) {
        throw new Error("Respuesta inválida del servidor");
      }

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          "No se pudo iniciar sesión"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-2xl shadow-xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">BioSys</h1>
          <p className="text-sm text-slate-500 mt-1">
            Inicia sesión con tu cuenta de Windows
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-600">Usuario</label>
            <input
              value={form.username}
              onChange={(e) => onChange("username", e.target.value)}
              className="w-full mt-1 border rounded-lg p-3 bg-sky-50"
              placeholder="Ej: Ingresar Usuario de Dominio"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              className="w-full mt-1 border rounded-lg p-3 bg-sky-50"
              placeholder="Tu Contraseña de Dominio"
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <div className="bg-red-100 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 text-white py-3 hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
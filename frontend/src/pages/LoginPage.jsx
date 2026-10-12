import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e293b]">

      <div className="w-[400px] bg-slate-800/70 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700">

        <h2 className="text-2xl font-bold text-white text-center mb-6">
          Iniciar Sesión
        </h2>

        {/* Email */}
        <div className="mb-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-700 text-white outline-none focus:ring-2 focus:ring-purple-500 transition"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-700 text-white outline-none focus:ring-2 focus:ring-purple-500 transition"
          />
        </div>

        {/* Button */}
        <button className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:opacity-90 transition">
          LOGIN
        </button>

        <div className="text-center text-sm text-slate-400 mt-6">
          ¿Olvidaste tu contraseña?
        </div>

      </div>
    </div>
  )
}

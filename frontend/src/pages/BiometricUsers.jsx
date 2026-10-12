import { useState } from "react";
import { Users, CreditCard } from "lucide-react";

import UsersManager from "../components/biometric/UsersManager";
import CardManager from "../components/biometric/CardManager";

export default function BiometricUsers() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Administración Biométrica
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Administra usuarios internos y tarjetas almacenadas en los
          dispositivos CHIYU.
        </p>
      </div>

      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "users"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Users size={17} />
          Usuarios
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cards")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "cards"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <CreditCard size={17} />
          Tarjetas CHIYU
        </button>
      </div>

      {activeTab === "users" ? <UsersManager /> : <CardManager />}
    </div>
  );
}

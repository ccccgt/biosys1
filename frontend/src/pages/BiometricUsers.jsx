import { useState } from "react";
import { Users, CreditCard, RefreshCw } from "lucide-react";

import UsersManager from "../components/biometric/UsersManager";
import CardManager from "../components/biometric/CardManager";
import ImportChiyuUsers from "../components/biometric/ImportChiyuUsers";

export default function BiometricUsers() {
  const [activeTab, setActiveTab] = useState("users");

  const tabClass = (tab) =>
    `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Administración Biométrica
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Administra usuarios internos, tarjetas y sincronización de usuarios
          de los dispositivos CHIYU.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={tabClass("users")}
        >
          <Users size={17} />
          Usuarios
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cards")}
          className={tabClass("cards")}
        >
          <CreditCard size={17} />
          Tarjetas CHIYU
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sync")}
          className={tabClass("sync")}
        >
          <RefreshCw size={17} />
          Sincronizar usuarios biométricos
        </button>
      </div>

      {activeTab === "users" && <UsersManager />}
      {activeTab === "cards" && <CardManager />}
      {activeTab === "sync" && <ImportChiyuUsers />}
    </div>
  );
}

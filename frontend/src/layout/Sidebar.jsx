import { Home, Users, FileText } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
  const location = useLocation();

  const itemClass = (path) => {
    const active = location.pathname === path;
    return `flex items-center gap-3 p-2 rounded-lg transition ${
      active ? "bg-slate-800" : "hover:bg-slate-800"
    }`;
  };

  return (
    <aside className="h-screen w-64 bg-slate-900 text-white flex flex-col p-6 print:hidden">
      <h2 className="text-2xl font-bold mb-10">BioSys</h2>

      <nav className="flex flex-col gap-4">
        <Link to="/" className={itemClass("/")}>
          <Home size={18} />
          Inicio
        </Link>

        <Link to="/biometric-users" className={itemClass("/biometric-users")}>
          <Users size={18} />
          Usuarios Biometricos
        </Link>

        <Link to="/reports" className={itemClass("/reports")}>
          <FileText size={18} />
          Reporte de Marcajes
        </Link>
      </nav>

      <div className="mt-auto text-sm text-slate-400">
        BioSys • v1.1.0
      </div>
    </aside>
  );
}
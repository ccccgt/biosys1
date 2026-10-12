import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  LayoutDashboard,
  Fingerprint,
  FileText,
  ClipboardList,
  Shield,
  Users,
  KeyRound,
  Network,
  SearchCheck,
  UserCircle2,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function MenuLink({ to, label, icon: Icon, collapsed = false }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : ""}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
          isActive
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-700 hover:bg-slate-100",
          collapsed ? "justify-center" : "",
        ].join(" ")
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed ? <span>{label}</span> : null}
    </NavLink>
  );
}

function SecuritySubmenu({ collapsed, open, setOpen, items }) {
  const hasAny = items.length > 0;
  if (!hasAny) return null;

  if (collapsed) {
    return (
      <div className="space-y-1">
        <div
          className="flex items-center justify-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
          title="Seguridad"
        >
          <Shield size={18} className="shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        <span className="flex items-center gap-3">
          <Shield size={18} className="shrink-0" />
          <span>Seguridad</span>
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="ml-4 pl-3 border-l border-slate-200 space-y-1">
          {items.map((item) => (
            <MenuLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });

  const [collapsed, setCollapsed] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const syncMe = async () => {
      if (!token) return;

      try {
        const res = await axios.get(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res?.data) {
          localStorage.setItem("user", JSON.stringify(res.data));
          setUser(res.data);
        }
      } catch (err) {
        console.error("Error cargando /auth/me:", err);
      }
    };

    syncMe();
  }, [token, location.pathname]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const permissions = user?.permissions || {};

  const mainItems = useMemo(() => {
    const out = [];

    if (Number(permissions.dashboard_enabled || 0)) {
      out.push({ to: "/", label: "Inicio", icon: LayoutDashboard });
    }

    if (Number(permissions.biometric_users_enabled || 0)) {
      out.push({
        to: "/biometric-users",
        label: "Usuarios biométricos",
        icon: Fingerprint,
      });
    }

    if (Number(permissions.reports_enabled || 0)) {
      out.push({
        to: "/reports",
        label: "Reporte de marcajes",
        icon: FileText,
      });
    }

    if (Number(permissions.mark_requests_enabled || 0)) {
      out.push({
        to: "/mark-requests",
        label: "Solicitudes de marcaje",
        icon: ClipboardList,
      });
    }

    if (Number(permissions.mark_requests_manage_enabled || 0)) {
      out.push({
        to: "/mark-requests-admin",
        label: "Aprobación de solicitudes",
        icon: SearchCheck,
      });
    }

    return out;
  }, [permissions]);

  const securityItems = useMemo(() => {
    const out = [];

    if (Number(permissions.menu_users_enabled || 0)) {
      out.push({
        to: "/system-users",
        label: "Usuarios del sistema",
        icon: Users,
      });
      out.push({
        to: "/roles",
        label: "Permisos por rol",
        icon: KeyRound,
      });
      out.push({
        to: "/ad-group-mappings",
        label: "Mapeo grupos AD",
        icon: Network,
      });
      out.push({
        to: "/permissions-diagnostic",
        label: "Diagnóstico permisos",
        icon: SearchCheck,
      });
    }

    return out;
  }, [permissions]);

  const profilePhoto =
    user?.profile_photo_url && String(user.profile_photo_url).trim()
      ? user.profile_photo_url
      : null;

  const displayName =
    user?.display_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "Usuario";

  const roleName = user?.role || "-";

  const initials = (() => {
    const source =
      displayName && typeof displayName === "string" ? displayName.trim() : "";
    if (!source) return "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  })();

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside
        className={`${
          collapsed ? "w-20" : "w-72"
        } bg-white border-r border-slate-200 min-h-screen flex flex-col transition-all duration-200`}
      >
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between">
          {!collapsed ? (
            <div>
              <div className="text-2xl font-bold text-slate-900 leading-none">BioSys</div>
              <div className="text-sm text-slate-500 mt-1">Control biométrico</div>
            </div>
          ) : (
            <div className="w-full text-center text-xl font-bold text-slate-900">B</div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {mainItems.map((item) => (
            <MenuLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={collapsed}
            />
          ))}

          <SecuritySubmenu
            collapsed={collapsed}
            open={securityOpen}
            setOpen={setSecurityOpen}
            items={securityItems}
          />
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className={`w-full flex items-center ${
                collapsed ? "justify-center" : "justify-between"
              } gap-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-3`}
              title={collapsed ? displayName : ""}
            >
              <div className="flex items-center gap-3 min-w-0">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="Perfil"
                    className="h-11 w-11 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-semibold shrink-0">
                    {initials}
                  </div>
                )}

                {!collapsed ? (
                  <div className="min-w-0 text-left">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {displayName}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      Rol: {roleName}
                    </div>
                  </div>
                ) : null}
              </div>

              {!collapsed ? (
                <ChevronDown
                  size={16}
                  className={`text-slate-500 transition-transform ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              ) : null}
            </button>

            {userMenuOpen ? (
              <div
                className={`absolute ${
                  collapsed ? "bottom-14 left-0 w-64" : "bottom-16 left-0 right-0"
                } bg-white border border-slate-200 rounded-2xl shadow-lg z-50 overflow-hidden`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <UserCircle2 size={18} />
                  <span>Mi perfil</span>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={18} />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
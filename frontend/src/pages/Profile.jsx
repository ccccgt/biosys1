import { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

export default function Profile() {
  const token = localStorage.getItem("token");
  const [form, setForm] = useState({
    display_name: "",
    first_name: "",
    last_name: "",
    phone: "",
    city: "",
    birth_date: "",
    organization: "",
    job_title: "",
    bio: "",
    profile_photo_url: "",
  });
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadMe = async () => {
    try {
      const res = await axios.get(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const u = res.data;
      setInfo(u);
      setForm({
        display_name: u.display_name || "",
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        phone: u.phone || "",
        city: u.city || "",
        birth_date: u.birth_date ? String(u.birth_date).slice(0, 10) : "",
        organization: u.organization || "",
        job_title: u.job_title || "",
        bio: u.bio || "",
        profile_photo_url: u.profile_photo_url || "",
      });

      localStorage.setItem("user", JSON.stringify(u));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setMsg("");
    setSaving(true);
    try {
      const res = await axios.put(`${API}/api/auth/profile`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      setMsg("Perfil actualizado correctamente");
      await loadMe();
    } catch (err) {
      console.error(err);
      setMsg(err?.response?.data?.message || "Error actualizando perfil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl border shadow p-6">
        <h1 className="text-2xl font-bold text-slate-900">Perfil</h1>
        <p className="text-sm text-slate-500 mt-1">
          Los datos de acceso vienen de Active Directory. Aquí puedes editar tu perfil local de BioSys.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-6">
          <div className="space-y-4">
            <div className="border rounded-xl p-4 bg-slate-50">
              {form.profile_photo_url ? (
                <img
                  src={form.profile_photo_url}
                  alt="perfil"
                  className="w-32 h-32 rounded-full object-cover mx-auto border"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-slate-900 text-white flex items-center justify-center mx-auto text-3xl font-bold">
                  {info?.display_name?.[0]?.toUpperCase() || info?.username?.[0]?.toUpperCase() || "A"}
                </div>
              )}
              <div className="mt-4 text-center">
                <div className="font-semibold text-slate-900">
                  {info?.display_name || info?.username}
                </div>
                <div className="text-sm text-slate-500">{info?.email || "-"}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Rol: {info?.role || "-"}
                </div>
              </div>
            </div>

            <div className="border rounded-xl p-4">
              <div className="text-sm text-slate-500">Usuario AD</div>
              <div className="font-medium">{info?.username || "-"}</div>

              <div className="text-sm text-slate-500 mt-3">UPN</div>
              <div className="font-medium break-all">{info?.ad_upn || "-"}</div>

              <div className="text-sm text-slate-500 mt-3">Departamento</div>
              <div className="font-medium">{info?.department || "-"}</div>

              <div className="text-sm text-slate-500 mt-3">Cargo</div>
              <div className="font-medium">{info?.position || "-"}</div>
            </div>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600">Nombre a mostrar</label>
              <input
                value={form.display_name}
                onChange={(e) => onChange("display_name", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Foto URL</label>
              <input
                value={form.profile_photo_url}
                onChange={(e) => onChange("profile_photo_url", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Primer nombre</label>
              <input
                value={form.first_name}
                onChange={(e) => onChange("first_name", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Apellido</label>
              <input
                value={form.last_name}
                onChange={(e) => onChange("last_name", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Teléfono</label>
              <input
                value={form.phone}
                onChange={(e) => onChange("phone", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Ciudad</label>
              <input
                value={form.city}
                onChange={(e) => onChange("city", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Fecha de nacimiento</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => onChange("birth_date", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Organización</label>
              <input
                value={form.organization}
                onChange={(e) => onChange("organization", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-slate-600">Cargo interno</label>
              <input
                value={form.job_title}
                onChange={(e) => onChange("job_title", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-slate-600">Biografía</label>
              <textarea
                rows={5}
                value={form.bio}
                onChange={(e) => onChange("bio", e.target.value)}
                className="w-full mt-1 border rounded-lg p-2 bg-sky-50"
              />
            </div>

            {msg ? (
              <div className="md:col-span-2 text-sm text-slate-700 bg-slate-100 border rounded-lg p-3">
                {msg}
              </div>
            ) : null}

            <div className="md:col-span-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                {saving ? "Guardando..." : "Guardar perfil"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
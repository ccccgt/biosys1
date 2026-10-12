import axios from "axios";

const API_BASE = "";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const reportsApi = {
  attendance: (params) =>
    api.get("/api/reports/attendance", { params }),

  dailySummary: (params) =>
    api.get("/api/reports/summary/daily", { params }),

  exportXlsxUrl: (params) => {
    const usp = new URLSearchParams(params);
    return `/api/reports/attendance/export.xlsx?${usp.toString()}`;
  },
};

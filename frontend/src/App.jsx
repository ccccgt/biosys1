import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import SystemUsers from "./pages/SystemUsers";
import AdGroupMappings from "./pages/AdGroupMappings";
import PermissionsDiagnostic from "./pages/PermissionsDiagnostic";
import BiometricUsers from "./pages/BiometricUsers";
import Roles from "./pages/Roles";
import MarkRequests from "./pages/MarkRequests";
import MarkRequestsAdmin from "./pages/MarkRequestsAdmin";

import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./layout/AppLayout";

function WithLayout({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<WithLayout><Dashboard /></WithLayout>} />
        <Route path="/reports" element={<WithLayout><Reports /></WithLayout>} />
        <Route path="/profile" element={<WithLayout><Profile /></WithLayout>} />
        <Route path="/system-users" element={<WithLayout><SystemUsers /></WithLayout>} />
        <Route path="/roles" element={<WithLayout><Roles /></WithLayout>} />
        <Route path="/ad-group-mappings" element={<WithLayout><AdGroupMappings /></WithLayout>} />
        <Route path="/permissions-diagnostic" element={<WithLayout><PermissionsDiagnostic /></WithLayout>} />
        <Route path="/biometric-users" element={<WithLayout><BiometricUsers /></WithLayout>} />
        <Route path="/mark-requests" element={<WithLayout><MarkRequests /></WithLayout>} />
        <Route path="/mark-requests-admin" element={<WithLayout><MarkRequestsAdmin /></WithLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
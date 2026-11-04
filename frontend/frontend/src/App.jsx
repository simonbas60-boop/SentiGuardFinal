import {
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import CrowdDensity from "./pages/CrowdDensity";
import Dashboard from "./pages/Dashboard";
import EmergencyBroadcast from "./pages/EmergencyBroadcast";
import HeadCount from "./pages/HeadCount";
import EventAlert from "./pages/EventAlert";
import LiveCameras from "./pages/LiveCameras";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Snapshots from "./pages/Snapshots";
import VideoAnalysis from "./pages/VideoAnalysis";


function ProtectedRoute() {
  const token =
    localStorage.getItem(
      "token",
    );

  return token
    ? <Outlet />
    : (
      <Navigate
        to="/"
        replace
      />
    );
}


export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Login />}
      />

      {/* Public QR attendee route. No admin login required. */}
      <Route
        path="/event-alert"
        element={<EventAlert />}
      />

      <Route
        element={
          <ProtectedRoute />
        }
      >
        <Route
          element={<AppShell />}
        >
          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/live-cameras"
            element={<LiveCameras />}
          />

          <Route
            path="/video-analysis"
            element={<VideoAnalysis />}
          />

          <Route
            path="/crowd-density"
            element={<CrowdDensity />}
          />

          <Route
            path="/head-count"
            element={<HeadCount />}
          />

          <Route
            path="/analytics"
            element={<Analytics />}
          />

          <Route
            path="/alerts"
            element={<Alerts />}
          />

          <Route
            path="/snapshots"
            element={<Snapshots />}
          />

          <Route
            path="/emergency-broadcast"
            element={
              <EmergencyBroadcast />
            }
          />

          <Route
            path="/settings"
            element={<Settings />}
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />
    </Routes>
  );
}

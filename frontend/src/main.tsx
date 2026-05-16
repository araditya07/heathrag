import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import App from "./App";
import EvalRunsPage from "./pages/EvalRunsPage";
import GenerationPage from "./pages/GenerationPage";
import GuardrailsPage from "./pages/GuardrailsPage";
import MetricsPage from "./pages/MetricsPage";
import RetrievalPage from "./pages/RetrievalPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to="/search" replace />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="dashboard">
            <Route index element={<Navigate to="/dashboard/retrieval" replace />} />
            <Route path="retrieval" element={<RetrievalPage />} />
            <Route path="generation" element={<GenerationPage />} />
            <Route path="guardrails" element={<GuardrailsPage />} />
            <Route path="metrics" element={<MetricsPage />} />
          </Route>
          <Route path="eval-runs" element={<EvalRunsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

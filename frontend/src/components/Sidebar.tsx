import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ListChecks,
  MessageSquareText,
  Moon,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

const navSections: { label: string; items: { to: string; label: string; Icon: any }[] }[] = [
  {
    label: "Main",
    items: [
      { to: "/search", label: "Search", Icon: Search },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { to: "/dashboard/retrieval", label: "Retrieval", Icon: BarChart3 },
      { to: "/dashboard/generation", label: "Generation", Icon: MessageSquareText },
      { to: "/dashboard/guardrails", label: "Guardrails", Icon: ShieldCheck },
      { to: "/dashboard/metrics", label: "Metrics", Icon: Activity },
      { to: "/eval-runs", label: "Eval runs", Icon: ListChecks },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", Icon: SettingsIcon },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("healthrag-theme");
    return (stored === "dark" ? "dark" : "light");
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("healthrag-theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

export default function Sidebar() {
  const [theme, setTheme] = useTheme();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo health">
        <span className="icon">
          <Activity size={17} strokeWidth={2} />
        </span>
        <span className="wordmark">HealthRAG</span>
      </div>

      {navSections.map((section) => (
        <div key={section.label}>
          <div className="section-label">{section.label}</div>
          {section.items.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <Icon size={17} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar-bottom">
        <button
          className="theme-toggle"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <div className="run-info">HealthRAG v0.1</div>
      </div>
    </aside>
  );
}

import { Outlet } from "react-router-dom";
import DemoNotice from "./components/DemoNotice";
import Sidebar from "./components/Sidebar";

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="page">
          <DemoNotice />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

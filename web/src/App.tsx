import { useState, useEffect } from "preact/hooks";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/downloads/Dashboard";
import { DownloadList } from "./components/downloads/DownloadList";
import { QueueList } from "./components/queue/QueueList";
import { TaskDetail } from "./components/queue/TaskDetail";
import { Settings } from "./components/Settings";
import { connect } from "./ws/socket";

export function App() {
  const [page, setPage] = useState("dashboard");
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    connect();
  }, []);

  function handleNavigate(p: string, id?: number) {
    setPage(p);
    if (id !== undefined) setDetailId(id);
    if (p === "queue") setDetailId(null);
  }

  function renderPage() {
    switch (page) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavigate} />;
      case "downloads":
        return <DownloadList onNavigate={handleNavigate} />;
      case "queue":
        return <QueueList onNavigate={handleNavigate} />;
      case "queue-detail":
        return detailId != null ? <TaskDetail taskId={detailId} onNavigate={handleNavigate} /> : <QueueList onNavigate={handleNavigate} />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  }

  return (
    <Layout current={page} onNavigate={handleNavigate}>
      {renderPage()}
    </Layout>
  );
}

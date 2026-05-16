import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";

export default function MetricsPage() {
  return (
    <div className="page">
      <PageHeader title="Product metrics" subtitle="Live signal from real user queries." />
      <EmptyState
        title="Product metrics will appear here"
        body="Once a daily job aggregates the queries table into product_metrics, this page shows volume, satisfaction, disclaimer compliance, and latency trends."
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { getEvalResults, getEvalRuns, type EvalResult, type EvalRun } from "./api";

export function useEvalData() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await getEvalRuns();
        setRuns(r);
        if (r.length) setSelectedId(r[0].id);
      } catch (_e) {
        // empty state handled by caller
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setResults([]);
      return;
    }
    (async () => {
      try {
        const r = await getEvalResults(selectedId);
        setResults(r);
      } catch {
        setResults([]);
      }
    })();
  }, [selectedId]);

  const current = useMemo(() => runs.find((r) => r.id === selectedId) ?? null, [runs, selectedId]);
  const previous = useMemo(() => {
    if (!current) return null;
    return (
      runs
        .filter((r) => r.id !== current.id && r.created_at < current.created_at)
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null
    );
  }, [runs, current]);

  const trend = useMemo(
    () =>
      [...runs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [runs]
  );

  const currentIndex = useMemo(
    () => (current ? trend.findIndex((r) => r.id === current.id) : -1),
    [trend, current]
  );

  return {
    runs,
    selectedId,
    setSelectedId,
    current,
    previous,
    trend,
    currentIndex,
    results,
    loading,
  };
}

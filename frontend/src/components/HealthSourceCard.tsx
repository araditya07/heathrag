import { ExternalLink } from "lucide-react";
import type { Source } from "../lib/api";

function scoreClass(score: number) {
  if (score >= 0.6) return "success";
  if (score >= 0.4) return "warning";
  return "danger";
}

function orgTagFromUrl(url: string): { label: string; cls: string } | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("who.int")) return { label: "WHO", cls: "who" };
  if (u.includes("cdc.gov")) return { label: "CDC", cls: "cdc" };
  if (u.includes("nih.gov") || u.includes("medlineplus")) return { label: "NIH", cls: "nih" };
  if (u.includes("cdsco")) return { label: "CDSCO", cls: "cdsco" };
  if (u.includes("icmr") || u.includes("nin.res.in")) return { label: "ICMR", cls: "icmr" };
  if (u.includes("fssai")) return { label: "FSSAI", cls: "warning" };
  return null;
}

export default function HealthSourceCard({
  source,
  index,
  active,
  onClick,
}: {
  source: Source;
  index: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const score = source.similarity_score ?? 0;
  const cls = scoreClass(score);
  const tag = orgTagFromUrl(source.source_url);
  return (
    <article
      id={`source-${index}`}
      className={`source-card${active ? " active" : ""}`}
      onClick={onClick}
    >
      {tag && <span className={`org-tag ${tag.cls}`}>{tag.label}</span>}
      <div className="row1">
        <span className="name">Source {index}</span>
        <span className={`score ${cls}`}>{score.toFixed(2)}</span>
      </div>
      <div className="score-bar">
        <div
          className="score-fill"
          style={{
            width: `${Math.max(0, Math.min(1, score)) * 100}%`,
            background:
              cls === "success" ? "var(--success)" : cls === "warning" ? "var(--warning)" : "var(--danger)",
          }}
        />
      </div>
      <div className="path">{source.section_title || source.document_title || ""}</div>
      <div className="content">{source.content}</div>
      <a
        className="external"
        href={source.source_url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        Open source <ExternalLink size={11} strokeWidth={2} />
      </a>
    </article>
  );
}

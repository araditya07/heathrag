import { ShieldCheck } from "lucide-react";

export default function RefusalBlock() {
  return (
    <div className="refusal-block" aria-label="The system cannot diagnose conditions">
      <ShieldCheck size={18} strokeWidth={2} />
      <div className="text">
        I cannot diagnose medical conditions. Only a qualified healthcare professional can provide
        a diagnosis after proper clinical evaluation.
      </div>
    </div>
  );
}

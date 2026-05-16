import { Stethoscope } from "lucide-react";

export default function Disclaimer() {
  return (
    <div className="disclaimer" role="note" aria-label="Medical disclaimer: this is not medical advice">
      <Stethoscope size={16} strokeWidth={2} />
      <span>
        This information is for educational purposes only and is not medical advice. Please
        consult a qualified healthcare professional for personalized guidance.
      </span>
    </div>
  );
}

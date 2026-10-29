import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cameraOptions } from "@/lib/course-plans.functions";
import { Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
export function CameraOption({ quizId }: { quizId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ["camera-option", quizId],
    queryFn: () => cameraOptions({ data: { quizId } }),
  });
  async function save(required: boolean) {
    setBusy(true);
    try {
      await cameraOptions({ data: { quizId, required } });
      await qc.invalidateQueries({ queryKey: ["camera-option", quizId] });
      toast.success("Camera requirement saved");
    } catch {
      toast.error("Could not save camera requirement");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="px-2 text-sm font-bold">Webcam requirement</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {[true, false].map((required) => (
          <label
            key={String(required)}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${data === required ? "border-primary bg-accent" : "border-border"}`}
          >
            <input
              type="radio"
              name={`camera-${quizId}`}
              checked={data === required}
              disabled={busy || data === undefined}
              onChange={() => void save(required)}
            />
            {required ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            {required ? "Webcam required" : "No webcam required"}
          </label>
        ))}
      </div>
      {isError && <p role="alert">Camera settings could not load.</p>}
    </fieldset>
  );
}

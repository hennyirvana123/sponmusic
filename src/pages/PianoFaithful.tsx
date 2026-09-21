import { useState } from "react";

const API = "/api/piano-faithful";

export default function PianoFaithful() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startTranscription() {
    if (!file) return;

    setLoading(true);
    setError("");
    setStatus("Uploading...");

    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("task", "piano_faithful");

      const response = await fetch(`${API}/transcribe`, {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Upload failed");
      }

      setJobId(data.job_id);
      setStatus("Queued...");

      pollJob(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function pollJob(id: string) {
    try {
      const response = await fetch(`${API}/transcribe/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to check job");
      }

      if (data.status === "queued") {
        setStatus("Waiting for piano AI...");
        setTimeout(() => pollJob(id), 2000);
        return;
      }

      if (data.status === "processing") {
        setStatus(
          data.diagnostics?.stage === "inference"
            ? "AI is transcribing the piano..."
            : "Processing..."
        );
        setTimeout(() => pollJob(id), 3000);
        return;
      }

      if (data.status === "completed") {
        setStatus(
          `Done · ${data.diagnostics?.output_note_count ?? "?"} notes detected`
        );
        setLoading(false);
        return;
      }

      if (data.status === "failed") {
        throw new Error(
          data.error?.message || "Piano transcription failed"
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#120e1d] px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            AI Piano Faithful
          </h1>

          <p className="mt-2 text-violet-200">
            Experimental piano transcription using
            piano_transcription_inference.
          </p>

          <p className="mt-2 text-sm text-gray-400">
            This is a separate experiment and does not modify the existing
            AI Piano Arrangement system.
          </p>
        </div>

        <div className="rounded-2xl border border-violet-500/30 bg-[#1b1528] p-6">
          <label className="mb-3 block text-sm font-medium">
            Piano MP3 / WAV
          </label>

          <input
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
              setStatus("");
              setJobId("");
            }}
            className="block w-full rounded-xl border border-white/10 bg-[#120e1d] p-3 text-sm"
          />

          {file && (
            <div className="mt-3 text-sm text-gray-400">
              Selected: {file.name}
            </div>
          )}

          <button
            onClick={startTranscription}
            disabled={!file || loading}
            className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Processing..." : "Transcribe Piano"}
          </button>

          {status && (
            <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-950/30 p-4">
              <div className="font-medium">{status}</div>

              {jobId && (
                <div className="mt-1 text-xs text-gray-500">
                  Job: {jobId}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-red-300">
              {error}
            </div>
          )}

          {jobId && !loading && !error && status.startsWith("Done") && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={`${API}/transcribe/${jobId}/download/raw`}
                className="rounded-xl border border-violet-500/40 px-5 py-3 text-center font-medium hover:bg-violet-900/30"
              >
                Download Raw MIDI
              </a>

              <a
                href={`${API}/transcribe/${jobId}/download/cleaned`}
                className="rounded-xl bg-violet-600 px-5 py-3 text-center font-medium hover:bg-violet-500"
              >
                Download MIDI
              </a>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[#181321] p-6 text-sm text-gray-400">
          <h2 className="mb-3 font-semibold text-white">
            About this experiment
          </h2>

          <ul className="space-y-2">
            <li>• Piano-focused transcription</li>
            <li>• CPU inference</li>
            <li>• No Demucs source separation</li>
            <li>• No pYIN melody extraction</li>
            <li>• No chord reconstruction</li>
            <li>• MIDI output is kept as close as possible to the model output</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

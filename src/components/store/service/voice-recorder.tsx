"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { MAX_VOICE_SECONDS } from "@/features/service/constants";

export type VoiceNote = { blob: Blob; ext: "webm" | "ogg" | "mp4"; url: string };

function pickMime(): { mime: string; ext: VoiceNote["ext"] } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [["audio/webm", "webm"], ["audio/mp4", "mp4"], ["audio/ogg", "ogg"]] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/** Record a short voice complaint in the browser (no app needed). */
export function VoiceRecorder({ value, onChange }: { value: VoiceNote | null; onChange: (v: VoiceNote | null) => void }) {
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError(null);
    const fmt = pickMime();
    if (!fmt || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording isn't supported on this browser. Please type the problem instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(stream, { mimeType: fmt.mime });
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: fmt.mime });
        if (blob.size > 10 * 1024 * 1024) {
          setError("That recording is too long. Keep it under 2 minutes.");
          return;
        }
        onChange({ blob, ext: fmt.ext, url: URL.createObjectURL(blob) });
      };
      rec.current = r;
      r.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone permission was denied. Allow it, or type the problem instead.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    setRecording(false);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          <audio controls src={value.url} className="h-10 max-w-full" />
          <button type="button" onClick={() => onChange(null)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm font-semibold text-danger hover:bg-danger-soft">
            <Trash2 aria-hidden className="size-4" /> <L en="Delete" ml="നീക്കുക" />
          </button>
        </div>
      ) : recording ? (
        <button type="button" onClick={stop} className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-danger px-5 text-sm font-semibold text-white">
          <Square aria-hidden className="size-4 fill-current" /> <L en="Stop" ml="നിർത്തുക" /> · <span className="tabular">{mmss}</span>
        </button>
      ) : (
        <button type="button" onClick={start} className="inline-flex h-11 w-fit items-center gap-2 rounded-full border border-royal-200 bg-royal-50 px-5 text-sm font-semibold text-royal hover:bg-royal-100">
          <Mic aria-hidden className="size-4" /> <L en="Record voice note" ml="ശബ്ദ സന്ദേശം റെക്കോർഡ് ചെയ്യുക" />
        </button>
      )}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : <p className="text-xs text-muted-foreground"><L en="Up to 2 minutes. Malayalam or English is fine." ml="2 മിനിറ്റ് വരെ. മലയാളത്തിലോ ഇംഗ്ലീഷിലോ പറയാം." /></p>}
    </div>
  );
}

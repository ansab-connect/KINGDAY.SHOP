"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { MAX_VOICE_SECONDS } from "@/features/service/constants";

export type VoiceNote = { blob: Blob; ext: "webm" | "ogg" | "mp4"; url: string; seconds: number };

function pickMime(): { mime: string; ext: VoiceNote["ext"] } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [["audio/webm", "webm"], ["audio/mp4", "mp4"], ["audio/ogg", "ogg"]] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Record → stop → play / pause → delete or re-record. Upload happens when the booking is sent. */
/** Lets the form finish a recording that is still running when the customer taps Book. */
export type VoiceControl = { finish: () => Promise<VoiceNote | null> };

export function VoiceRecorder({ value, onChange, status, control }: { value: VoiceNote | null; onChange: (v: VoiceNote | null) => void; status?: string | null; control?: React.MutableRefObject<VoiceControl | null> }) {
  const done = useRef<((v: VoiceNote | null) => void) | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const secondsRef = useRef(0);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
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
        const resolve = done.current;
        done.current = null;
        if (blob.size < 1000) {
          setError("The recording is empty. Please try again.");
          resolve?.(null);
          return;
        }
        if (blob.size > 10 * 1024 * 1024) {
          setError("That recording is too long. Keep it under 2 minutes.");
          resolve?.(null);
          return;
        }
        const note: VoiceNote = { blob, ext: fmt.ext, url: URL.createObjectURL(blob), seconds: secondsRef.current };
        onChange(note);
        resolve?.(note);
      };
      rec.current = r;
      r.start(1000);
      setRecording(true);
      secondsRef.current = 0;
      setSeconds(0);
      timer.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_VOICE_SECONDS) stop();
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

  // A recording still running when the form is sent is stopped and handed over, not lost.
  if (control) {
    control.current = {
      finish: () =>
        rec.current && rec.current.state !== "inactive"
          ? new Promise<VoiceNote | null>((resolve) => {
              done.current = resolve;
              stop();
            })
          : Promise.resolve(value),
    };
  }

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  const btn = "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#D4AF37]/40 bg-[#FBF8EE] p-4">
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <audio ref={audio} src={value.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />
          <button type="button" onClick={toggle} className={`${btn} bg-[#4B0082] text-white`}>
            {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            {playing ? <L en="Pause" ml="നിർത്തുക" /> : <L en="Play" ml="കേൾക്കുക" />} · {mmss(value.seconds)}
          </button>
          <button type="button" onClick={() => { onChange(null); void start(); }} className={`${btn} border bg-white text-[#1A0F2E]`}><RotateCcw aria-hidden className="size-4" /> <L en="Re-record" ml="വീണ്ടും" /></button>
          <button type="button" onClick={() => onChange(null)} className={`${btn} border bg-white text-danger`}><Trash2 aria-hidden className="size-4" /> <L en="Delete" ml="നീക്കുക" /></button>
          {status ? <span className="text-xs font-semibold text-[#4B0082]">{status}</span> : <span className="text-xs text-muted-foreground"><L en="Ready — uploads when you book" ml="ബുക്ക് ചെയ്യുമ്പോൾ അപ്‌ലോഡ് ആകും" /></span>}
        </div>
      ) : recording ? (
        <button type="button" onClick={stop} className={`${btn} w-fit bg-danger text-white`}>
          <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-white" />
          <Square aria-hidden className="size-4 fill-current" /> <L en="Stop" ml="നിർത്തുക" /> · <span className="tabular-nums">{mmss(seconds)}</span> / {mmss(MAX_VOICE_SECONDS)}
        </button>
      ) : (
        <button type="button" onClick={start} className={`${btn} w-fit bg-[#4B0082] text-white hover:bg-[#3a0066]`}>
          <Mic aria-hidden className="size-4" /> <L en="Record a voice note" ml="ശബ്ദ സന്ദേശം റെക്കോർഡ് ചെയ്യുക" />
        </button>
      )}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : <p className="text-xs text-muted-foreground"><L en="Up to 2 minutes. Malayalam or English is fine." ml="2 മിനിറ്റ് വരെ. മലയാളത്തിലോ ഇംഗ്ലീഷിലോ പറയാം." /></p>}
    </div>
  );
}

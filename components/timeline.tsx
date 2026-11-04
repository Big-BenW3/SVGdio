/* SVGdio timeline: tracks per layer-property, keyframes, playhead + scrub,
 * play/pause, duration + easing controls, Smart-Animate interpolation preview. */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import {
  EASING_CSS,
  PROPERTY_LABEL,
  valueAt,
  type AnimatableProperty,
  type EasingName,
  type Keyframe,
  type Timeline,
  type TimelineTrack,
} from "@/lib/compile";
import type { Layer } from "@/lib/layers";

const PX_PER_SEC = 150;
const EASINGS: EasingName[] = ["linear", "ease", "ease-out", "ease-in-out", "spring", "snap"];
const PROPS: AnimatableProperty[] = ["x", "y", "opacity", "rotation", "fill"];
const TRACK_COLORS: Record<AnimatableProperty, string> = {
  x: "#ff7ad9",
  y: "#7ad9ff",
  opacity: "#99e1bf",
  rotation: "#f0c987",
  fill: "#b184ff",
};

interface TimelineProps {
  timeline: Timeline;
  layers: Layer[];
  selectedIds: string[];
  onChange: (t: Timeline) => void;
  onPreview: (overrides: Map<string, Partial<Layer>>) => void;
  notify: (msg: string) => void;
}

function currentValue(layer: Layer, prop: AnimatableProperty): number | string {
  switch (prop) {
    case "x":
      return layer.x;
    case "y":
      return layer.y;
    case "opacity":
      return layer.opacity;
    case "rotation":
      return layer.rotation;
    case "fill":
      return layer.fill;
  }
}

const Lane = memo(function Lane({
  track,
  duration,
  selectedKf,
  onLaneClick,
  onKfDown,
  onKfSelect,
}: {
  track: TimelineTrack;
  duration: number;
  selectedKf: string | null;
  onLaneClick: (trackId: string, time: number) => void;
  onKfDown: (e: React.PointerEvent, trackId: string, kfId: string) => void;
  onKfSelect: (kfId: string | null) => void;
}) {
  return (
    <div
      className="tl-lane"
      style={{ width: duration * PX_PER_SEC }}
      onDoubleClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onLaneClick(
          track.id,
          Math.min(duration, Math.max(0, (e.clientX - rect.left) / PX_PER_SEC)),
        );
      }}
    >
      {track.keyframes.map((k) => (
        <div
          key={k.id}
          className={`tl-keyframe${selectedKf === k.id ? " selected" : ""}`}
          style={{ left: (k.time / duration) * 100 + "%" }}
          title={`${round2(k.time)}s = ${String(k.value)} (${k.easing}) — drag to move, double-click lane to add`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onKfSelect(k.id);
            onKfDown(e, track.id, k.id);
          }}
        />
      ))}
    </div>
  );
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TimelineDock({
  timeline,
  layers,
  selectedIds,
  onChange,
  onPreview,
  notify,
}: TimelineProps) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [selectedKf, setSelectedKf] = useState<string | null>(null);
  const [newProp, setNewProp] = useState<AnimatableProperty>("x");
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragKf = useRef<{
    trackId: string;
    kfId: string;
    startX: number;
    origTime: number;
    raf: number;
  } | null>(null);
  const byId = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);

  const duration = Math.max(0.2, timeline.duration);
  const width = duration * PX_PER_SEC;
  const ticks = useMemo(() => {
    const step = duration > 8 ? 2 : duration > 4 ? 1 : 0.5;
    const out: number[] = [];
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 100) / 100);
    return out;
  }, [duration]);

  /* Smart-Animate preview: interpolated overrides at current playhead */
  useEffect(() => {
    const ov = new Map<string, Partial<Layer>>();
    for (const track of timeline.tracks) {
      const v = valueAt(track, time);
      if (v == null) continue;
      const cur = ov.get(track.layerId) ?? {};
      if (track.property === "fill") cur.fill = String(v);
      else (cur as Record<string, number>)[track.property] = Number(v);
      ov.set(track.layerId, cur);
    }
    onPreview(ov);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, time]);

  /* playback loop */
  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const step = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= duration) {
          if (loop) return 0;
          setPlaying(false);
          return duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration, loop]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = lanesRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // lanes scroll container: ruler spans full width; account for scroll
      const x = clientX - rect.left + el.scrollLeft;
      const rulerOffset = 0;
      setTime(Math.min(duration, Math.max(0, (x - rulerOffset) / PX_PER_SEC)));
    },
    [duration],
  );

  const addTrack = useCallback(() => {
    const layerId = selectedIds[selectedIds.length - 1];
    const layer = layerId ? byId.get(layerId) : undefined;
    if (!layer) {
      notify("Select a layer first, then add a track");
      return;
    }
    const existing = timeline.tracks.find((t) => t.layerId === layer.id && t.property === newProp);
    if (existing) {
      notify(`Track already exists: ${layer.name} · ${PROPERTY_LABEL[newProp]}`);
      return;
    }
    const v = currentValue(layer, newProp);
    const track: TimelineTrack = {
      id: `trk-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      layerId: layer.id,
      property: newProp,
      keyframes: [
        { id: `kf-${Date.now().toString(36)}-a`, time: round2(time), value: v, easing: "ease-out" },
      ],
    };
    onChange({ ...timeline, tracks: [...timeline.tracks, track] });
    setSelectedKf(track.keyframes[0].id);
    notify(`Track added: ${layer.name} · ${PROPERTY_LABEL[newProp]} @ ${round2(time)}s`);
  }, [selectedIds, byId, newProp, timeline, time, onChange, notify]);

  const addKeyframe = useCallback(
    (trackId: string, at: number) => {
      const track = timeline.tracks.find((t) => t.id === trackId);
      const layer = track ? byId.get(track.layerId) : undefined;
      if (!track || !layer) return;
      const v = valueAt(track, at) ?? currentValue(layer, track.property);
      const kf: Keyframe = {
        id: `kf-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        time: round2(at),
        value: v,
        easing: "ease-out",
      };
      onChange({
        ...timeline,
        tracks: timeline.tracks.map((t) =>
          t.id === trackId ? { ...t, keyframes: [...t.keyframes, kf] } : t,
        ),
      });
      setSelectedKf(kf.id);
    },
    [timeline, byId, onChange],
  );

  const kfDown = useCallback(
    (e: React.PointerEvent, trackId: string, kfId: string) => {
      const track = timeline.tracks.find((t) => t.id === trackId);
      const kf = track?.keyframes.find((k) => k.id === kfId);
      if (!track || !kf) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragKf.current = { trackId, kfId, startX: e.clientX, origTime: kf.time, raf: 0 };
      const move = (ev: PointerEvent) => {
        const d = dragKf.current;
        if (!d) return;
        if (d.raf) return;
        d.raf = requestAnimationFrame(() => {
          d.raf = 0;
          const nt = Math.min(
            duration,
            Math.max(0, round2(d.origTime + (ev.clientX - d.startX) / PX_PER_SEC)),
          );
          onChange({
            ...timelineRef.current,
            tracks: timelineRef.current.tracks.map((t) =>
              t.id === d.trackId
                ? {
                    ...t,
                    keyframes: t.keyframes.map((k) => (k.id === d.kfId ? { ...k, time: nt } : k)),
                  }
                : t,
            ),
          });
        });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (dragKf.current?.raf) cancelAnimationFrame(dragKf.current.raf);
        dragKf.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [timeline, duration, onChange],
  );

  const timelineRef = useRef(timeline);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- latest-ref pattern: the async rAF drag handler must build on the newest timeline, not the one captured at drag start.
    timelineRef.current = timeline;
  }, [timeline]);

  const selectedTrack = timeline.tracks.find((t) => t.keyframes.some((k) => k.id === selectedKf));
  const selectedKeyframe = selectedTrack?.keyframes.find((k) => k.id === selectedKf);

  const updateSelectedKf = (patch: Partial<Keyframe>) => {
    if (!selectedTrack || !selectedKeyframe) return;
    onChange({
      ...timeline,
      tracks: timeline.tracks.map((t) =>
        t.id === selectedTrack.id
          ? {
              ...t,
              keyframes: t.keyframes.map((k) =>
                k.id === selectedKeyframe.id ? { ...k, ...patch } : k,
              ),
            }
          : t,
      ),
    });
  };

  const deleteSelectedKf = () => {
    if (!selectedTrack || !selectedKeyframe) return;
    const rest = selectedTrack.keyframes.filter((k) => k.id !== selectedKeyframe.id);
    const tracks =
      rest.length === 0
        ? timeline.tracks.filter((t) => t.id !== selectedTrack.id)
        : timeline.tracks.map((t) => (t.id === selectedTrack.id ? { ...t, keyframes: rest } : t));
    onChange({ ...timeline, tracks });
    setSelectedKf(null);
  };

  const deleteTrack = (trackId: string) => {
    onChange({ ...timeline, tracks: timeline.tracks.filter((t) => t.id !== trackId) });
    setSelectedKf(null);
  };

  return (
    <div className="timeline-dock" aria-label="Timeline">
      <div className="timeline-bar">
        <button
          className={`tl-btn${playing ? " playing" : ""}`}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          className={`tl-btn${loop ? " playing" : ""}`}
          onClick={() => setLoop((v) => !v)}
          title="Loop playback"
          aria-label="Loop"
        >
          <Repeat size={13} />
        </button>
        <span className="tl-time">
          <b>{time.toFixed(2)}s</b> / {duration.toFixed(1)}s
        </span>
        <label className="tl-field">
          Duration
          <input
            type="number"
            min={0.5}
            max={60}
            step={0.5}
            value={round2(duration)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v))
                onChange({ ...timeline, duration: Math.min(60, Math.max(0.2, v)) });
            }}
            style={{ width: 56 }}
          />
          s
        </label>
        <span className="topbar-spacer" />
        {selectedKeyframe && selectedTrack && (
          <label className="tl-field">
            Key @{selectedKeyframe.time.toFixed(2)}s =
            {selectedTrack.property === "fill" ? (
              <input
                type="color"
                value={String(selectedKeyframe.value)}
                onChange={(e) => updateSelectedKf({ value: e.target.value })}
                style={{ width: 34, height: 24, padding: 1 }}
              />
            ) : (
              <input
                type="number"
                step={selectedTrack.property === "opacity" ? 0.05 : 1}
                value={Number(selectedKeyframe.value)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) updateSelectedKf({ value: v });
                }}
                style={{ width: 64 }}
              />
            )}
          </label>
        )}
        {selectedKeyframe && (
          <>
            <label className="tl-field">
              Easing
              <select
                value={selectedKeyframe.easing}
                onChange={(e) => updateSelectedKf({ easing: e.target.value as EasingName })}
                title={EASING_CSS[selectedKeyframe.easing]}
              >
                {EASINGS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button className="tl-btn" onClick={deleteSelectedKf} title="Delete keyframe">
              <Trash2 size={13} />
            </button>
          </>
        )}
        <label className="tl-field">
          <select
            value={newProp}
            onChange={(e) => setNewProp(e.target.value as AnimatableProperty)}
          >
            {PROPS.map((p) => (
              <option key={p} value={p}>
                {PROPERTY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="tl-btn"
          onClick={addTrack}
          title="Add track for selected layer at playhead"
        >
          <Plus size={13} /> Track
        </button>
      </div>
      <div className="tl-body">
        <div className="tl-tracks-head">
          <div
            className="tl-track-label"
            style={{
              height: 24,
              color: "var(--dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.1em",
            }}
          >
            TRACKS · {timeline.tracks.length}
          </div>
          {timeline.tracks.map((t) => {
            const layer = byId.get(t.layerId);
            return (
              <div
                key={t.id}
                className="tl-track-label"
                title={`${layer?.name ?? "missing"} — ${t.property}`}
              >
                <span className="dot" style={{ background: TRACK_COLORS[t.property] }} />
                <span>{layer?.name ?? "(deleted)"}</span>
                <code>{PROPERTY_LABEL[t.property]}</code>
                <button
                  className="layer-icon-btn on"
                  style={{ opacity: 1 }}
                  onClick={() => deleteTrack(t.id)}
                  title="Delete track"
                  aria-label={`Delete track ${layer?.name}`}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
          {timeline.tracks.length === 0 && (
            <div className="tl-empty">
              <strong>No tracks.</strong>
              <br />
              Select a layer, pick a property, hit + Track.
            </div>
          )}
        </div>
        <div
          ref={lanesRef}
          className="tl-lanes"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest(".tl-keyframe")) return;
            scrubTo(e.clientX);
            const move = (ev: PointerEvent) => scrubTo(ev.clientX);
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          <div className="tl-ruler" style={{ width }}>
            {ticks.map((t) => (
              <span key={t} className="tl-tick" style={{ left: t * PX_PER_SEC }}>
                {t.toFixed(1)}
              </span>
            ))}
          </div>
          <div style={{ position: "relative", width }}>
            {timeline.tracks.map((t) => (
              <Lane
                key={t.id}
                track={t}
                duration={duration}
                selectedKf={selectedKf}
                onLaneClick={addKeyframe}
                onKfDown={kfDown}
                onKfSelect={setSelectedKf}
              />
            ))}
            <div className="tl-playhead" style={{ left: (time / duration) * width }} />
          </div>
        </div>
      </div>
    </div>
  );
}

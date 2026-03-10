"""
ClinicalVoice — Speech Emotion Recognition Microservice
Uses audEERING's wav2vec2-based model via audonnx to predict
arousal, valence, and dominance from audio segments.

Supports two modes:
  1. POST /analyze        — full-file analysis (post-session)
  2. POST /analyze-url    — download from S3 then analyze (post-session)
  3. POST /analyze-chunk  — real-time chunked analysis (in-session streaming)
     Accumulates audio bytes in a per-session sliding window buffer.
     Runs inference once the buffer reaches WINDOW_SECONDS.
     Returns AVD scores immediately for the current window.
"""
import os
import io
import sys
import json
import tempfile
import traceback
import math
import threading
import time
import numpy as np
import soundfile as sf
import scipy.signal as signal
from collections import defaultdict
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── Model Loading ────────────────────────────────────────────────────────────
MODEL = None
OPENSMILE = None
MODEL_LOAD_ERROR = None

def load_model():
    global MODEL, OPENSMILE, MODEL_LOAD_ERROR
    try:
        import audonnx
        model_root = os.path.expanduser("~/.cache/audonnx_models/w2v2-L-robust")
        if not os.path.exists(model_root):
            raise FileNotFoundError(f"Model not found at {model_root}")
        MODEL = audonnx.load(model_root)
        print("[SER] audonnx w2v2 model loaded successfully", flush=True)
    except Exception as e:
        MODEL_LOAD_ERROR = str(e)
        print(f"[SER] audonnx model load failed: {e}", flush=True)
        print("[SER] Falling back to openSMILE eGeMAPS heuristic mode", flush=True)

    try:
        import opensmile
        OPENSMILE = opensmile.Smile(
            feature_set=opensmile.FeatureSet.eGeMAPSv02,
            feature_level=opensmile.FeatureLevel.Functionals,
        )
        print("[SER] openSMILE eGeMAPS loaded successfully", flush=True)
    except Exception as e:
        print(f"[SER] openSMILE load failed: {e}", flush=True)

load_model()

# ─── Audio Helpers ────────────────────────────────────────────────────────────
TARGET_SR = 16000  # wav2vec2 requires 16 kHz mono

def load_audio_bytes(raw_bytes: bytes, suffix: str = ".webm") -> tuple:
    """Load audio from raw bytes, resample to 16 kHz mono."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name
    try:
        data, sr = sf.read(tmp_path, always_2d=False)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != TARGET_SR:
        num_samples = int(len(data) * TARGET_SR / sr)
        data = signal.resample(data, num_samples)
    return data.astype(np.float32), TARGET_SR

def load_audio(path: str) -> tuple:
    """Load audio file, resample to 16 kHz mono."""
    data, sr = sf.read(path, always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != TARGET_SR:
        num_samples = int(len(data) * TARGET_SR / sr)
        data = signal.resample(data, num_samples)
    return data.astype(np.float32), TARGET_SR

# ─── eGeMAPS Heuristic Fallback ───────────────────────────────────────────────
def heuristic_avd_from_egemaps(features: dict) -> tuple:
    def safe_get(key, default=0.0):
        return float(features.get(key, default) or default)

    pitch    = safe_get("F0semitoneFrom27.5Hz_sma3nz_amean")
    loudness = safe_get("loudness_sma3_amean")
    jitter   = safe_get("jitterLocal_sma3nz_amean")
    hnr      = safe_get("HNRdBACF_sma3nz_amean")
    mfcc1    = safe_get("mfcc1_sma3_amean")
    rate     = safe_get("equivalentSoundLevel_dBp")

    arousal_raw = (
        0.35 * min(max((loudness + 30) / 60, 0), 1) +
        0.30 * min(max((pitch - 10) / 40, 0), 1) +
        0.20 * min(max(jitter * 10, 0), 1) +
        0.15 * min(max((rate + 30) / 60, 0), 1)
    )
    valence_raw = (
        0.40 * min(max((hnr + 5) / 25, 0), 1) +
        0.30 * min(max((mfcc1 + 20) / 40, 0), 1) -
        0.30 * min(max(jitter * 8, 0), 1)
    )
    valence_raw = min(max(valence_raw, 0), 1)
    dominance_raw = (
        0.40 * min(max((loudness + 30) / 60, 0), 1) +
        0.30 * min(max((pitch - 10) / 40, 0), 1) +
        0.30 * (1 - min(max(jitter * 10, 0), 1))
    )
    return (
        float(np.clip(arousal_raw, 0, 1)),
        float(np.clip(valence_raw, 0, 1)),
        float(np.clip(dominance_raw, 0, 1)),
    )

# ─── Core Segment Analysis ────────────────────────────────────────────────────
SEGMENT_DURATION = 4.0   # seconds per analysis window (post-session)
SEGMENT_STEP     = 2.0   # step between windows (50% overlap, post-session)

def analyze_segment(segment: np.ndarray, sr: int, offset_sec: float) -> dict:
    """Analyze a single audio segment and return AVD scores."""
    arousal = valence = dominance = 0.5
    confidence = 0.5

    if MODEL is not None:
        try:
            output = MODEL(segment, sr)
            logits = output.get('logits', None)
            if logits is not None:
                vals = np.array(logits).flatten()
                arousal   = float(np.clip(vals[0], 0, 1))
                dominance = float(np.clip(vals[1], 0, 1))
                valence   = float(np.clip(vals[2], 0, 1))
                confidence = 0.85
        except Exception as e:
            print(f"[SER] w2v2 inference error at {offset_sec:.1f}s: {e}", flush=True)

    if OPENSMILE is not None and (MODEL is None or confidence < 0.5):
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                sf.write(tmp.name, segment, sr)
                tmp_path = tmp.name
            feats = OPENSMILE.process_file(tmp_path)
            os.unlink(tmp_path)
            feat_dict = feats.iloc[0].to_dict()
            if MODEL is None:
                arousal, valence, dominance = heuristic_avd_from_egemaps(feat_dict)
                confidence = 0.55
        except Exception as e:
            print(f"[SER] openSMILE error at {offset_sec:.1f}s: {e}", flush=True)

    return {
        "offset_seconds": round(offset_sec, 2),
        "arousal":    round(arousal, 4),
        "valence":    round(valence, 4),
        "dominance":  round(dominance, 4),
        "confidence": round(confidence, 4),
    }

def analyze_audio_file(audio_path: str) -> dict:
    """Full-file analysis: sliding window over entire recording."""
    audio, sr = load_audio(audio_path)
    total_duration = len(audio) / sr
    readings = []

    seg_samples  = int(SEGMENT_DURATION * sr)
    step_samples = int(SEGMENT_STEP * sr)
    min_samples  = int(0.5 * sr)

    offset = 0
    while offset < len(audio):
        segment = audio[offset: offset + seg_samples]
        if len(segment) < min_samples:
            break
        reading = analyze_segment(segment, sr, offset / sr)
        readings.append(reading)
        offset += step_samples

    return {
        "total_duration":  total_duration,
        "segment_count":   len(readings),
        "readings":        readings,
        "model_used":      "w2v2" if MODEL is not None else "egemaps_heuristic",
    }

# ─── Real-Time Chunked Streaming State ───────────────────────────────────────
# Each session has a rolling PCM buffer. The buffer grows as chunks arrive.
# When it reaches WINDOW_SECONDS, we run inference on the last WINDOW_SECONDS
# of audio and return the result. The buffer is then trimmed to keep only the
# last KEEP_SECONDS of audio (for overlap continuity).

WINDOW_SECONDS = 30   # run inference once this much audio has accumulated
STEP_SECONDS   = 5    # how often to run inference (new chunk triggers check)
KEEP_SECONDS   = 10   # retain this many seconds of tail audio after inference

_session_buffers: dict[str, dict] = defaultdict(lambda: {
    "pcm": np.array([], dtype=np.float32),
    "elapsed": 0.0,
    "lock": threading.Lock(),
    "last_inference_at": 0.0,
})
_buffer_lock = threading.Lock()

def get_session_buffer(session_id: str) -> dict:
    with _buffer_lock:
        return _session_buffers[session_id]

def clear_session_buffer(session_id: str):
    with _buffer_lock:
        if session_id in _session_buffers:
            del _session_buffers[session_id]

# ─── Flask Routes ─────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":          "ok",
        "model_loaded":    MODEL is not None,
        "opensmile_loaded": OPENSMILE is not None,
        "model_error":     MODEL_LOAD_ERROR,
        "mode":            "w2v2" if MODEL is not None else "egemaps_heuristic",
        "window_seconds":  WINDOW_SECONDS,
        "step_seconds":    STEP_SECONDS,
    })

@app.route("/analyze", methods=["POST"])
def analyze():
    """Full-file analysis via multipart upload."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    audio_file = request.files["audio"]
    suffix = os.path.splitext(audio_file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name
    try:
        result = analyze_audio_file(tmp_path)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

@app.route("/analyze-url", methods=["POST"])
def analyze_url():
    """Download audio from S3 URL and analyze."""
    data = request.get_json()
    if not data or "audioUrl" not in data:
        return jsonify({"error": "audioUrl required"}), 400
    import urllib.request
    audio_url = data["audioUrl"]
    suffix = ".wav"
    for ext in [".mp3", ".wav", ".webm", ".ogg", ".m4a", ".flac"]:
        if ext in audio_url.lower():
            suffix = ext
            break
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        urllib.request.urlretrieve(audio_url, tmp_path)
        result = analyze_audio_file(tmp_path)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

@app.route("/analyze-chunk", methods=["POST"])
def analyze_chunk():
    """
    Real-time chunked analysis endpoint.

    Expects multipart/form-data with:
      - audio:      binary audio chunk (webm/wav/ogg)
      - sessionId:  string session identifier
      - chunkIndex: integer (0-based)
      - elapsed:    float seconds elapsed in session so far
      - mimeType:   audio MIME type (default: audio/webm)
      - final:      'true' if this is the last chunk (triggers full-window inference)

    Returns JSON:
      - ready:    bool — whether inference was run on this chunk
      - reading:  {offset_seconds, arousal, valence, dominance, confidence} | null
      - buffered_seconds: float — how many seconds are in the buffer
      - model_used: str
    """
    session_id  = request.form.get("sessionId", "default")
    chunk_index = int(request.form.get("chunkIndex", 0))
    elapsed     = float(request.form.get("elapsed", 0.0))
    mime_type   = request.form.get("mimeType", "audio/webm")
    is_final    = request.form.get("final", "false").lower() == "true"

    if "audio" not in request.files:
        return jsonify({"error": "No audio chunk provided"}), 400

    chunk_bytes = request.files["audio"].read()
    if not chunk_bytes:
        return jsonify({"ready": False, "reading": None, "buffered_seconds": 0.0}), 200

    # Determine file suffix from MIME type
    mime_to_ext = {
        "audio/webm": ".webm",
        "audio/ogg":  ".ogg",
        "audio/wav":  ".wav",
        "audio/mp4":  ".mp4",
        "audio/mpeg": ".mp3",
    }
    suffix = mime_to_ext.get(mime_type.split(";")[0].strip(), ".webm")

    # Decode chunk to PCM
    try:
        pcm_chunk, sr = load_audio_bytes(chunk_bytes, suffix)
    except Exception as e:
        print(f"[SER] Chunk decode error (session={session_id}, idx={chunk_index}): {e}", flush=True)
        return jsonify({"ready": False, "reading": None, "buffered_seconds": 0.0,
                        "error": f"Chunk decode failed: {e}"}), 200

    buf = get_session_buffer(session_id)
    with buf["lock"]:
        # Append new PCM to buffer
        buf["pcm"] = np.concatenate([buf["pcm"], pcm_chunk])
        buf["elapsed"] = elapsed
        buffered_seconds = len(buf["pcm"]) / TARGET_SR

        # Decide whether to run inference:
        # - Buffer has reached WINDOW_SECONDS, AND
        # - At least STEP_SECONDS have passed since last inference
        # - OR this is the final chunk (flush everything)
        time_since_last = elapsed - buf["last_inference_at"]
        should_infer = (
            (buffered_seconds >= WINDOW_SECONDS and time_since_last >= STEP_SECONDS)
            or is_final
        )

        reading = None
        if should_infer:
            # Take the last WINDOW_SECONDS of audio for inference
            window_samples = int(WINDOW_SECONDS * TARGET_SR)
            analysis_audio = buf["pcm"][-window_samples:] if len(buf["pcm"]) > window_samples else buf["pcm"]

            # Offset is the start of this window in session time
            window_offset = max(0.0, elapsed - WINDOW_SECONDS)
            reading = analyze_segment(analysis_audio, TARGET_SR, window_offset)

            # Trim buffer: keep only last KEEP_SECONDS to maintain overlap continuity
            keep_samples = int(KEEP_SECONDS * TARGET_SR)
            buf["pcm"] = buf["pcm"][-keep_samples:] if len(buf["pcm"]) > keep_samples else buf["pcm"]
            buf["last_inference_at"] = elapsed

        if is_final:
            # Schedule buffer cleanup after a short delay
            def _cleanup():
                time.sleep(30)
                clear_session_buffer(session_id)
            threading.Thread(target=_cleanup, daemon=True).start()

    return jsonify({
        "ready":            reading is not None,
        "reading":          reading,
        "buffered_seconds": round(buffered_seconds, 2),
        "model_used":       "w2v2" if MODEL is not None else "egemaps_heuristic",
        "session_id":       session_id,
        "chunk_index":      chunk_index,
    })

@app.route("/session-clear", methods=["POST"])
def session_clear():
    """Clear the buffer for a session (call when session ends)."""
    data = request.get_json() or {}
    session_id = data.get("sessionId", "default")
    clear_session_buffer(session_id)
    return jsonify({"cleared": True, "session_id": session_id})

if __name__ == "__main__":
    port = int(os.environ.get("SER_PORT", 5001))
    print(f"[SER] Starting ClinicalVoice SER service on port {port}", flush=True)
    print(f"[SER] Real-time window: {WINDOW_SECONDS}s, step: {STEP_SECONDS}s, keep: {KEEP_SECONDS}s", flush=True)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

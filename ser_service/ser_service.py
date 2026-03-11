"""
ClinicalVoice — Speech Emotion Recognition Microservice
Uses audEERING's wav2vec2-based model via audonnx to predict
arousal, valence, and dominance from audio segments.

Endpoints:
  POST /analyze          — upload audio file for full analysis with clinical report
  POST /analyze-url      — download from S3 then analyze
  POST /analyze-chunk    — real-time chunked analysis with live feedback
  POST /upload           — upload audio + get comprehensive report (stored in DB)
  POST /sessions         — create a tracked session
  GET  /sessions         — list sessions
  GET  /sessions/<id>    — get session with readings and report
  GET  /sessions/<id>/feedback — get live feedback for an active session
  POST /session-clear    — end a session and generate final report
  GET  /health           — service status
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

# ─── Database Setup ──────────────────────────────────────────────────────────
DB_ENABLED = False
try:
    from models import db, init_db, Session, EmotionReading, ConversationReport
    from interpretation import (
        get_emotion_label, get_realtime_feedback, generate_session_report
    )
    DB_ENABLED = True
except ImportError:
    print("[SER] models/interpretation modules not found — DB features disabled", flush=True)

if DB_ENABLED:
    DB_ENABLED = init_db(app)

# Even without DB, import interpretation for in-memory use
if not DB_ENABLED:
    try:
        from interpretation import (
            get_emotion_label, get_realtime_feedback, generate_session_report
        )
    except ImportError:
        def get_emotion_label(a, v, d): return "neutral"
        def get_realtime_feedback(a, v, d, prev=None): return ""
        def generate_session_report(readings, duration=None): return {}

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
    """Analyze a single audio segment and return AVD scores with interpretation."""
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

    emotion_label = get_emotion_label(arousal, valence, dominance)

    return {
        "offset_seconds": round(offset_sec, 2),
        "arousal":    round(arousal, 4),
        "valence":    round(valence, 4),
        "dominance":  round(dominance, 4),
        "confidence": round(confidence, 4),
        "emotion_label": emotion_label,
    }

def analyze_audio_file(audio_path: str) -> dict:
    """Full-file analysis: sliding window over entire recording with report."""
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

    # Generate clinical report
    report = generate_session_report(readings, total_duration)

    return {
        "total_duration":  total_duration,
        "segment_count":   len(readings),
        "readings":        readings,
        "model_used":      "w2v2" if MODEL is not None else "egemaps_heuristic",
        "report":          report,
    }

# ─── Real-Time Chunked Streaming State ───────────────────────────────────────
WINDOW_SECONDS = 30
STEP_SECONDS   = 5
KEEP_SECONDS   = 10

_session_buffers: dict[str, dict] = defaultdict(lambda: {
    "pcm": np.array([], dtype=np.float32),
    "elapsed": 0.0,
    "lock": threading.Lock(),
    "last_inference_at": 0.0,
    "readings": [],  # accumulated readings for live feedback context
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
        "database_enabled": DB_ENABLED,
        "window_seconds":  WINDOW_SECONDS,
        "step_seconds":    STEP_SECONDS,
    })


# ─── Session Management ─────────────────────────────────────────────────────

@app.route("/sessions", methods=["POST"])
def create_session():
    """Create a new tracked session."""
    data = request.get_json() or {}
    client_name = data.get("client_name")

    if DB_ENABLED:
        session = Session(client_name=client_name, status="recording")
        db.session.add(session)
        db.session.commit()
        return jsonify({"session_id": session.id, "status": "recording"}), 201
    else:
        # In-memory fallback: return a generated ID
        import uuid
        sid = str(uuid.uuid4())
        return jsonify({"session_id": sid, "status": "recording", "note": "database disabled — session not persisted"}), 201


@app.route("/sessions", methods=["GET"])
def list_sessions():
    """List all sessions."""
    if not DB_ENABLED:
        return jsonify({"sessions": [], "note": "database disabled"}), 200

    limit = request.args.get("limit", 50, type=int)
    sessions = Session.query.order_by(Session.created_at.desc()).limit(limit).all()
    return jsonify({"sessions": [s.to_dict() for s in sessions]})


@app.route("/sessions/<session_id>", methods=["GET"])
def get_session(session_id):
    """Get a session with readings and report."""
    if not DB_ENABLED:
        return jsonify({"error": "database disabled"}), 503

    session = Session.query.get(session_id)
    if not session:
        return jsonify({"error": "session not found"}), 404

    return jsonify(session.to_dict(include_readings=True))


@app.route("/sessions/<session_id>/feedback", methods=["GET"])
def get_session_feedback(session_id):
    """Get live interpretive feedback for an active session based on accumulated readings."""
    buf = get_session_buffer(session_id)
    readings = buf.get("readings", [])

    if not readings:
        return jsonify({
            "session_id": session_id,
            "reading_count": 0,
            "current_state": "awaiting data",
            "feedback": "No readings yet — waiting for audio data to accumulate.",
            "trend": None,
        })

    latest = readings[-1]
    label = get_emotion_label(latest["arousal"], latest["valence"], latest["dominance"])
    feedback = get_realtime_feedback(
        latest["arousal"], latest["valence"], latest["dominance"],
        prev_readings=readings[:-1] if len(readings) > 1 else None,
    )

    # Compute running averages
    n = len(readings)
    avg_a = sum(r["arousal"] for r in readings) / n
    avg_v = sum(r["valence"] for r in readings) / n
    avg_d = sum(r["dominance"] for r in readings) / n

    # Trend over last 5 readings
    trend = None
    if n >= 5:
        recent5 = readings[-5:]
        older5 = readings[-10:-5] if n >= 10 else readings[:max(1, n-5)]
        trend = {
            "arousal_direction": "rising" if sum(r["arousal"] for r in recent5)/5 > sum(r["arousal"] for r in older5)/len(older5) + 0.05 else
                                 "falling" if sum(r["arousal"] for r in recent5)/5 < sum(r["arousal"] for r in older5)/len(older5) - 0.05 else "stable",
            "valence_direction": "rising" if sum(r["valence"] for r in recent5)/5 > sum(r["valence"] for r in older5)/len(older5) + 0.05 else
                                 "falling" if sum(r["valence"] for r in recent5)/5 < sum(r["valence"] for r in older5)/len(older5) - 0.05 else "stable",
            "dominance_direction": "rising" if sum(r["dominance"] for r in recent5)/5 > sum(r["dominance"] for r in older5)/len(older5) + 0.05 else
                                   "falling" if sum(r["dominance"] for r in recent5)/5 < sum(r["dominance"] for r in older5)/len(older5) - 0.05 else "stable",
        }

    return jsonify({
        "session_id": session_id,
        "reading_count": n,
        "current_state": label,
        "current_reading": latest,
        "feedback": feedback,
        "session_averages": {
            "arousal": round(avg_a, 4),
            "valence": round(avg_v, 4),
            "dominance": round(avg_d, 4),
        },
        "trend": trend,
        "elapsed_seconds": buf.get("elapsed", 0.0),
    })


# ─── Audio Upload with Full Report ──────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload_and_analyze():
    """
    Upload an audio file and get a comprehensive clinical report.
    Persists the session and all readings to the database.

    Accepts multipart/form-data:
      - audio: the audio file
      - client_name: (optional) client identifier
      - session_date: (optional) ISO date string
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided. Send as multipart with field name 'audio'."}), 400

    audio_file = request.files["audio"]
    client_name = request.form.get("client_name")
    suffix = os.path.splitext(audio_file.filename or "audio.wav")[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        result = analyze_audio_file(tmp_path)

        # Persist to database if enabled
        session_id = None
        if DB_ENABLED:
            session = Session(
                client_name=client_name,
                duration_seconds=result["total_duration"],
                status="completed",
                avg_arousal=result["report"]["summary_stats"]["avg_arousal"],
                avg_valence=result["report"]["summary_stats"]["avg_valence"],
                avg_dominance=result["report"]["summary_stats"]["avg_dominance"],
                emotional_summary=result["report"]["emotional_trajectory"],
                clinical_observations=result["report"]["clinical_observations"],
            )
            db.session.add(session)
            db.session.flush()
            session_id = session.id

            # Save readings
            for r in result["readings"]:
                reading = EmotionReading(
                    session_id=session_id,
                    offset_seconds=r["offset_seconds"],
                    arousal=r["arousal"],
                    valence=r["valence"],
                    dominance=r["dominance"],
                    confidence=r["confidence"],
                    emotion_label=r.get("emotion_label"),
                    feedback=get_realtime_feedback(r["arousal"], r["valence"], r["dominance"]),
                )
                db.session.add(reading)

            # Save report
            report_data = result["report"]
            report = ConversationReport(
                session_id=session_id,
                emotional_trajectory=report_data["emotional_trajectory"],
                key_moments=report_data["key_moments"],
                clinical_observations=report_data["clinical_observations"],
                risk_indicators=report_data["risk_indicators"],
                recommendations=report_data["recommendations"],
            )
            db.session.add(report)
            db.session.commit()

        result["session_id"] = session_id
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ─── Original Endpoints (preserved) ─────────────────────────────────────────

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

        # Persist if DB enabled
        if DB_ENABLED:
            session = Session(
                duration_seconds=result["total_duration"],
                status="completed",
                avg_arousal=result["report"]["summary_stats"]["avg_arousal"],
                avg_valence=result["report"]["summary_stats"]["avg_valence"],
                avg_dominance=result["report"]["summary_stats"]["avg_dominance"],
                emotional_summary=result["report"]["emotional_trajectory"],
                clinical_observations=result["report"]["clinical_observations"],
            )
            db.session.add(session)
            db.session.flush()
            for r in result["readings"]:
                db.session.add(EmotionReading(
                    session_id=session.id,
                    offset_seconds=r["offset_seconds"],
                    arousal=r["arousal"], valence=r["valence"], dominance=r["dominance"],
                    confidence=r["confidence"], emotion_label=r.get("emotion_label"),
                ))
            report_data = result["report"]
            db.session.add(ConversationReport(
                session_id=session.id,
                emotional_trajectory=report_data["emotional_trajectory"],
                key_moments=report_data["key_moments"],
                clinical_observations=report_data["clinical_observations"],
                risk_indicators=report_data["risk_indicators"],
                recommendations=report_data["recommendations"],
            ))
            db.session.commit()
            result["session_id"] = session.id

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
    Real-time chunked analysis with live clinical feedback.

    Expects multipart/form-data with:
      - audio:      binary audio chunk (webm/wav/ogg)
      - sessionId:  string session identifier
      - chunkIndex: integer (0-based)
      - elapsed:    float seconds elapsed in session so far
      - mimeType:   audio MIME type (default: audio/webm)
      - final:      'true' if this is the last chunk

    Returns JSON with AVD scores, emotion label, and clinical feedback.
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

    mime_to_ext = {
        "audio/webm": ".webm",
        "audio/ogg":  ".ogg",
        "audio/wav":  ".wav",
        "audio/mp4":  ".mp4",
        "audio/mpeg": ".mp3",
    }
    suffix = mime_to_ext.get(mime_type.split(";")[0].strip(), ".webm")

    try:
        pcm_chunk, sr = load_audio_bytes(chunk_bytes, suffix)
    except Exception as e:
        print(f"[SER] Chunk decode error (session={session_id}, idx={chunk_index}): {e}", flush=True)
        return jsonify({"ready": False, "reading": None, "buffered_seconds": 0.0,
                        "error": f"Chunk decode failed: {e}"}), 200

    buf = get_session_buffer(session_id)
    with buf["lock"]:
        buf["pcm"] = np.concatenate([buf["pcm"], pcm_chunk])
        buf["elapsed"] = elapsed
        buffered_seconds = len(buf["pcm"]) / TARGET_SR

        time_since_last = elapsed - buf["last_inference_at"]
        should_infer = (
            (buffered_seconds >= WINDOW_SECONDS and time_since_last >= STEP_SECONDS)
            or is_final
        )

        reading = None
        feedback = None
        emotion_label = None
        if should_infer:
            window_samples = int(WINDOW_SECONDS * TARGET_SR)
            analysis_audio = buf["pcm"][-window_samples:] if len(buf["pcm"]) > window_samples else buf["pcm"]
            window_offset = max(0.0, elapsed - WINDOW_SECONDS)
            reading = analyze_segment(analysis_audio, TARGET_SR, window_offset)

            # Store reading in buffer history for trend analysis
            buf["readings"].append(reading)
            emotion_label = reading.get("emotion_label")

            # Generate contextual feedback
            feedback = get_realtime_feedback(
                reading["arousal"], reading["valence"], reading["dominance"],
                prev_readings=buf["readings"][:-1] if len(buf["readings"]) > 1 else None,
            )
            reading["feedback"] = feedback

            # Persist to DB if enabled
            if DB_ENABLED:
                try:
                    db_reading = EmotionReading(
                        session_id=session_id,
                        offset_seconds=reading["offset_seconds"],
                        arousal=reading["arousal"],
                        valence=reading["valence"],
                        dominance=reading["dominance"],
                        confidence=reading["confidence"],
                        emotion_label=emotion_label,
                        feedback=feedback,
                    )
                    db.session.add(db_reading)
                    db.session.commit()
                except Exception as e:
                    print(f"[SER] DB save error: {e}", flush=True)
                    db.session.rollback()

            # Trim buffer
            keep_samples = int(KEEP_SECONDS * TARGET_SR)
            buf["pcm"] = buf["pcm"][-keep_samples:] if len(buf["pcm"]) > keep_samples else buf["pcm"]
            buf["last_inference_at"] = elapsed

        if is_final:
            # Generate final session report and persist
            all_readings = list(buf["readings"])

            def _finalize():
                time.sleep(2)  # brief delay to ensure last reading is committed
                if DB_ENABLED and all_readings:
                    try:
                        with app.app_context():
                            report_data = generate_session_report(all_readings, elapsed)
                            session = Session.query.get(session_id)
                            if session:
                                session.status = "completed"
                                session.duration_seconds = elapsed
                                stats = report_data.get("summary_stats", {})
                                session.avg_arousal = stats.get("avg_arousal")
                                session.avg_valence = stats.get("avg_valence")
                                session.avg_dominance = stats.get("avg_dominance")
                                session.emotional_summary = report_data.get("emotional_trajectory")
                                session.clinical_observations = report_data.get("clinical_observations")

                                existing_report = ConversationReport.query.filter_by(session_id=session_id).first()
                                if not existing_report:
                                    db.session.add(ConversationReport(
                                        session_id=session_id,
                                        emotional_trajectory=report_data.get("emotional_trajectory"),
                                        key_moments=report_data.get("key_moments"),
                                        clinical_observations=report_data.get("clinical_observations"),
                                        risk_indicators=report_data.get("risk_indicators"),
                                        recommendations=report_data.get("recommendations"),
                                    ))
                                db.session.commit()
                    except Exception as e:
                        print(f"[SER] Finalization error: {e}", flush=True)

                time.sleep(28)
                clear_session_buffer(session_id)

            threading.Thread(target=_finalize, daemon=True).start()

    return jsonify({
        "ready":            reading is not None,
        "reading":          reading,
        "feedback":         feedback,
        "emotion_label":    emotion_label,
        "buffered_seconds": round(buffered_seconds, 2),
        "model_used":       "w2v2" if MODEL is not None else "egemaps_heuristic",
        "session_id":       session_id,
        "chunk_index":      chunk_index,
    })

@app.route("/session-clear", methods=["POST"])
def session_clear():
    """Clear the buffer for a session and generate final report."""
    data = request.get_json() or {}
    session_id = data.get("sessionId", "default")

    # Generate report from accumulated readings before clearing
    buf = get_session_buffer(session_id)
    readings = buf.get("readings", [])
    report = None
    if readings:
        report = generate_session_report(readings, buf.get("elapsed", 0.0))

        # Persist final report
        if DB_ENABLED:
            try:
                session = Session.query.get(session_id)
                if session:
                    session.status = "completed"
                    session.duration_seconds = buf.get("elapsed")
                    stats = report.get("summary_stats", {})
                    session.avg_arousal = stats.get("avg_arousal")
                    session.avg_valence = stats.get("avg_valence")
                    session.avg_dominance = stats.get("avg_dominance")
                    session.emotional_summary = report.get("emotional_trajectory")
                    session.clinical_observations = report.get("clinical_observations")

                    existing = ConversationReport.query.filter_by(session_id=session_id).first()
                    if not existing:
                        db.session.add(ConversationReport(
                            session_id=session_id,
                            emotional_trajectory=report.get("emotional_trajectory"),
                            key_moments=report.get("key_moments"),
                            clinical_observations=report.get("clinical_observations"),
                            risk_indicators=report.get("risk_indicators"),
                            recommendations=report.get("recommendations"),
                        ))
                    db.session.commit()
            except Exception as e:
                print(f"[SER] Final report save error: {e}", flush=True)
                db.session.rollback()

    clear_session_buffer(session_id)
    return jsonify({
        "cleared": True,
        "session_id": session_id,
        "report": report,
    })

if __name__ == "__main__":
    port = int(os.environ.get("SER_PORT", 5001))
    print(f"[SER] Starting ClinicalVoice SER service on port {port}", flush=True)
    print(f"[SER] Real-time window: {WINDOW_SECONDS}s, step: {STEP_SECONDS}s, keep: {KEEP_SECONDS}s", flush=True)
    print(f"[SER] Database: {'enabled' if DB_ENABLED else 'disabled'}", flush=True)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

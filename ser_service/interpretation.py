"""
Emotion interpretation engine.
Translates raw AVD (arousal, valence, dominance) scores into
clinical labels, real-time feedback, and session-level reports.
"""


# ─── Emotion Label Mapping ───────────────────────────────────────────────────
# Based on the circumplex model of affect (Russell, 1980) extended with dominance

def get_emotion_label(arousal: float, valence: float, dominance: float) -> str:
    """Map AVD scores to a clinical emotion label."""
    high_a = arousal > 0.6
    low_a = arousal < 0.4
    high_v = valence > 0.6
    low_v = valence < 0.4
    high_d = dominance > 0.6
    low_d = dominance < 0.4

    if high_a and low_v and low_d:
        return "distressed"
    if high_a and low_v and high_d:
        return "angry"
    if high_a and low_v:
        return "anxious"
    if high_a and high_v and high_d:
        return "enthusiastic"
    if high_a and high_v:
        return "excited"
    if low_a and high_v and high_d:
        return "confident"
    if low_a and high_v:
        return "calm"
    if low_a and low_v and low_d:
        return "withdrawn"
    if low_a and low_v:
        return "sad"
    # Mid-range
    if high_d:
        return "assertive"
    if low_d:
        return "tentative"
    return "neutral"


LABEL_DESCRIPTIONS = {
    "distressed":   "Client appears distressed — elevated activation with negative affect and low sense of control.",
    "angry":        "Client shows signs of anger — high activation with negative affect but maintaining control.",
    "anxious":      "Client appears anxious — elevated activation paired with negative emotional tone.",
    "enthusiastic": "Client is enthusiastic — high energy, positive affect, and strong sense of agency.",
    "excited":      "Client shows excitement — elevated energy with positive emotional tone.",
    "confident":    "Client presents as confident — calm with positive affect and strong self-assurance.",
    "calm":         "Client appears calm and positive — low activation with pleasant emotional state.",
    "withdrawn":    "Client seems withdrawn — low energy, negative affect, and diminished sense of control.",
    "sad":          "Client shows sadness — low energy paired with negative emotional tone.",
    "assertive":    "Client is assertive — maintaining control and presence in the conversation.",
    "tentative":    "Client appears tentative — uncertain or hesitant in their expression.",
    "neutral":      "Client's emotional state is neutral — no strong indicators in any direction.",
}


def get_realtime_feedback(arousal: float, valence: float, dominance: float,
                          prev_readings: list = None) -> str:
    """Generate real-time clinical feedback for a single reading with trend context."""
    label = get_emotion_label(arousal, valence, dominance)
    feedback_parts = [LABEL_DESCRIPTIONS.get(label, "")]

    # Trend analysis if we have history
    if prev_readings and len(prev_readings) >= 3:
        recent = prev_readings[-3:]
        avg_prev_arousal = sum(r["arousal"] for r in recent) / len(recent)
        avg_prev_valence = sum(r["valence"] for r in recent) / len(recent)

        arousal_delta = arousal - avg_prev_arousal
        valence_delta = valence - avg_prev_valence

        if arousal_delta > 0.15:
            feedback_parts.append("Activation is rising — monitor for escalation.")
        elif arousal_delta < -0.15:
            feedback_parts.append("Activation is decreasing — client may be settling.")

        if valence_delta < -0.15:
            feedback_parts.append("Emotional tone is dropping — consider checking in.")
        elif valence_delta > 0.15:
            feedback_parts.append("Emotional tone is improving.")

    # Clinical alerts
    if arousal > 0.75 and valence < 0.35:
        feedback_parts.append("⚠ HIGH DISTRESS: Consider grounding techniques or a pause.")
    if dominance < 0.25:
        feedback_parts.append("⚠ LOW AGENCY: Client may feel overwhelmed — consider empowerment interventions.")
    if arousal > 0.8:
        feedback_parts.append("⚠ ELEVATED AROUSAL: Potential dysregulation risk.")

    return " ".join(feedback_parts)


# ─── Session-Level Analysis ──────────────────────────────────────────────────

def generate_session_report(readings: list, duration: float = None) -> dict:
    """
    Generate a comprehensive session report from a list of emotion readings.
    Each reading: {offset_seconds, arousal, valence, dominance, confidence}
    """
    if not readings:
        return {
            "emotional_trajectory": "No readings available for analysis.",
            "key_moments": [],
            "clinical_observations": "Insufficient data.",
            "risk_indicators": "None detected.",
            "recommendations": "Ensure audio quality and session length are sufficient for analysis.",
        }

    n = len(readings)
    avg_a = sum(r["arousal"] for r in readings) / n
    avg_v = sum(r["valence"] for r in readings) / n
    avg_d = sum(r["dominance"] for r in readings) / n

    # ── Emotional Trajectory ──
    # Split into thirds: opening, middle, closing
    third = max(1, n // 3)
    phases = {
        "opening": readings[:third],
        "middle": readings[third:2*third],
        "closing": readings[2*third:],
    }
    trajectory_parts = []
    for phase_name, phase_readings in phases.items():
        if not phase_readings:
            continue
        pa = sum(r["arousal"] for r in phase_readings) / len(phase_readings)
        pv = sum(r["valence"] for r in phase_readings) / len(phase_readings)
        pd = sum(r["dominance"] for r in phase_readings) / len(phase_readings)
        label = get_emotion_label(pa, pv, pd)
        trajectory_parts.append(
            f"{phase_name.capitalize()}: Predominant state was '{label}' "
            f"(arousal={pa:.2f}, valence={pv:.2f}, dominance={pd:.2f})."
        )
    emotional_trajectory = " ".join(trajectory_parts)

    # ── Key Moments ──
    key_moments = []

    # Find peaks and valleys
    max_arousal_r = max(readings, key=lambda r: r["arousal"])
    min_valence_r = min(readings, key=lambda r: r["valence"])
    min_dominance_r = min(readings, key=lambda r: r["dominance"])

    if max_arousal_r["arousal"] > 0.7:
        key_moments.append({
            "type": "peak_arousal",
            "offset_seconds": max_arousal_r["offset_seconds"],
            "description": f"Highest activation at {max_arousal_r['offset_seconds']:.0f}s "
                           f"(arousal={max_arousal_r['arousal']:.2f}) — "
                           f"state: {get_emotion_label(max_arousal_r['arousal'], max_arousal_r['valence'], max_arousal_r['dominance'])}",
            "severity": "high" if max_arousal_r["arousal"] > 0.8 else "medium",
        })

    if min_valence_r["valence"] < 0.3:
        key_moments.append({
            "type": "low_valence",
            "offset_seconds": min_valence_r["offset_seconds"],
            "description": f"Most negative affect at {min_valence_r['offset_seconds']:.0f}s "
                           f"(valence={min_valence_r['valence']:.2f}) — "
                           f"state: {get_emotion_label(min_valence_r['arousal'], min_valence_r['valence'], min_valence_r['dominance'])}",
            "severity": "high" if min_valence_r["valence"] < 0.2 else "medium",
        })

    # Detect sudden shifts (valence drop > 0.2 between consecutive readings)
    for i in range(1, n):
        valence_drop = readings[i-1]["valence"] - readings[i]["valence"]
        if valence_drop > 0.2:
            key_moments.append({
                "type": "sudden_shift",
                "offset_seconds": readings[i]["offset_seconds"],
                "description": f"Sudden negative shift at {readings[i]['offset_seconds']:.0f}s "
                               f"(valence dropped {valence_drop:.2f})",
                "severity": "high" if valence_drop > 0.3 else "medium",
            })

    # Detect sustained distress (3+ consecutive readings with high arousal + low valence)
    distress_streak = 0
    distress_start = None
    for r in readings:
        if r["arousal"] > 0.65 and r["valence"] < 0.4:
            if distress_streak == 0:
                distress_start = r["offset_seconds"]
            distress_streak += 1
        else:
            if distress_streak >= 3:
                key_moments.append({
                    "type": "sustained_distress",
                    "offset_seconds": distress_start,
                    "description": f"Sustained distress from {distress_start:.0f}s "
                                   f"({distress_streak} consecutive readings)",
                    "severity": "critical",
                })
            distress_streak = 0
            distress_start = None
    if distress_streak >= 3:
        key_moments.append({
            "type": "sustained_distress",
            "offset_seconds": distress_start,
            "description": f"Sustained distress from {distress_start:.0f}s "
                           f"({distress_streak} consecutive readings through end of session)",
            "severity": "critical",
        })

    # Sort by time
    key_moments.sort(key=lambda m: m["offset_seconds"])

    # ── Clinical Observations ──
    observations = []
    overall_label = get_emotion_label(avg_a, avg_v, avg_d)
    observations.append(
        f"Overall session affect: '{overall_label}' "
        f"(avg arousal={avg_a:.2f}, valence={avg_v:.2f}, dominance={avg_d:.2f})."
    )

    # Variability
    arousal_std = (sum((r["arousal"] - avg_a)**2 for r in readings) / n) ** 0.5
    valence_std = (sum((r["valence"] - avg_v)**2 for r in readings) / n) ** 0.5
    if arousal_std > 0.15:
        observations.append("High arousal variability suggests emotional lability or reactive responses to session content.")
    if valence_std > 0.15:
        observations.append("Significant valence fluctuation indicates shifting emotional engagement — content may be activating.")

    # Opening vs closing comparison
    if phases["opening"] and phases["closing"]:
        open_v = sum(r["valence"] for r in phases["opening"]) / len(phases["opening"])
        close_v = sum(r["valence"] for r in phases["closing"]) / len(phases["closing"])
        if close_v > open_v + 0.1:
            observations.append("Session ended on a more positive note than it began — possible therapeutic progress.")
        elif close_v < open_v - 0.1:
            observations.append("Session ended with lower valence than opening — may warrant follow-up or grounding before ending.")

    clinical_observations = " ".join(observations)

    # ── Risk Indicators ──
    risks = []
    if any(m["severity"] == "critical" for m in key_moments):
        risks.append("CRITICAL: Sustained distress pattern detected — review session content at flagged timestamps.")
    if avg_v < 0.3:
        risks.append("Overall negative affect throughout session — assess for depressive symptoms.")
    if avg_d < 0.3:
        risks.append("Consistently low dominance — client may feel disempowered or overwhelmed.")
    if avg_a > 0.7 and avg_v < 0.4:
        risks.append("Combined high arousal with low valence — elevated distress profile.")
    risk_indicators = " ".join(risks) if risks else "No significant risk indicators detected."

    # ── Recommendations ──
    recs = []
    if avg_a > 0.65:
        recs.append("Consider incorporating grounding or relaxation techniques (e.g., diaphragmatic breathing, progressive muscle relaxation).")
    if avg_v < 0.35:
        recs.append("Explore sources of negative affect — consider cognitive restructuring or behavioral activation.")
    if avg_d < 0.35:
        recs.append("Focus on empowerment interventions — values clarification, choice-making, strengths-based approaches.")
    if arousal_std > 0.15:
        recs.append("Emotional regulation skills may benefit from reinforcement — consider DBT distress tolerance modules.")
    if not recs:
        recs.append("Session emotional profile within normal range. Continue current therapeutic approach.")
    recommendations = " ".join(recs)

    return {
        "emotional_trajectory": emotional_trajectory,
        "key_moments": key_moments,
        "clinical_observations": clinical_observations,
        "risk_indicators": risk_indicators,
        "recommendations": recommendations,
        "summary_stats": {
            "avg_arousal": round(avg_a, 4),
            "avg_valence": round(avg_v, 4),
            "avg_dominance": round(avg_d, 4),
            "arousal_variability": round(arousal_std, 4),
            "valence_variability": round(valence_std, 4),
            "reading_count": n,
            "duration_seconds": duration,
            "overall_emotion": overall_label,
        },
    }

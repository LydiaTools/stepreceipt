"""Optional Python bridge for browser-use ActionResult; MIT, no runtime dependency."""
import inspect
import json
import re
import time
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("Expected non-empty text within the length limit")
    value = re.sub(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [redacted]", value, flags=re.I)
    value = re.sub(r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b", "[redacted]", value)
    return re.sub(r"\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+", r"\1=[redacted]", value, flags=re.I)


class BrowserUseReceipt:
    def __init__(self, title):
        self._run = {"schemaVersion": 1, "title": _text(title, 240), "startedAt": _now(), "steps": []}
        self._observing = set()

    async def attempt(self, *, label, kind, action):
        """Call one async action once. Keep its raw result only in the return value."""
        if kind not in ("read", "write") or not callable(action):
            raise ValueError("Provide a read/write kind and an async action")
        label = _text(label, 240)
        if len(self._run["steps"]) >= 1000:
            raise ValueError("At most 1,000 steps")
        step = {"id": f"step-{len(self._run['steps']) + 1}", "label": label, "kind": kind,
                "startedAt": _now(), "durationMs": 0, "toolStatus": "running"}
        self._run["steps"].append(step)
        started = time.monotonic()
        value = None
        try:
            value = await action()
            if not hasattr(value, "error"):
                raise TypeError("Expected a browser-use ActionResult")
            if value.error is not None:
                step.update(toolStatus="error", errorName="BrowserUseActionError")
            else:
                step["toolStatus"] = "ok"
        except Exception as error:
            name = type(error).__name__
            step.update(toolStatus="error", errorName=name if re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,59}", name) else "Error")
        finally:
            step["durationMs"] = round((time.monotonic() - started) * 1000)
        return {"id": step["id"], "ok": step["toolStatus"] == "ok", "value": value}

    async def verify(self, step_id, observe):
        """Run a caller-supplied check once; an observer exception stays unknown."""
        step = next((s for s in self._run["steps"] if s["id"] == step_id), None)
        if not step or step["toolStatus"] == "running" or "verification" in step or step_id in self._observing or not callable(observe):
            raise ValueError("Verify a completed step once")
        self._observing.add(step_id)
        try:
            try:
                result = observe()
                if inspect.isawaitable(result):
                    result = await result
            except Exception:
                result = {"status": "unknown", "summary": "The observation raised an error. The outcome is unknown."}
            if not isinstance(result, dict) or result.get("status") not in ("verified", "rejected", "unknown"):
                raise ValueError("Expected an explicit verification status")
            verification = {"status": result["status"], "summary": _text(result.get("summary"), 2000), "observedAt": _now()}
            step["verification"] = verification
            return dict(verification)
        finally:
            self._observing.remove(step_id)

    def to_dict(self):
        if self._observing or any(s["toolStatus"] == "running" for s in self._run["steps"]):
            raise ValueError("Wait for actions and observations to finish")
        result = json.loads(json.dumps(self._run))
        for step in result["steps"]:
            step.setdefault("verification", {"status": "unknown", "summary": "No observation was recorded."})
        return result

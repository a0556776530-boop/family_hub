from __future__ import annotations
import sys
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4


@dataclass
class StepTrace:
    step_id:    int
    tool:       str
    params:     dict
    result:     dict
    success:    bool
    duration_ms: int
    model_used: str = ''
    error:      str = ''


class AgentTrace:
    """Non-blocking observability: collects trace data during execution, persists async."""

    def __init__(self, family_id: str = '', user_id: str = '', message: str = ''):
        self.request_id    = str(uuid4())
        self.started_at    = time.time()
        self.family_id     = family_id
        self.user_id       = user_id
        self.message       = message
        self.understanding: dict | None = None
        self.plan_steps:    int         = 0
        self.steps:         list[StepTrace] = []
        self.errors:        list[str]       = []

    def log_understanding(self, data: dict) -> None:
        self.understanding = data

    def log_plan(self, plan) -> None:
        self.plan_steps = len(plan.steps) if plan else 0

    def log_step(self, step, result, validated, duration_ms: int) -> None:
        self.steps.append(StepTrace(
            step_id     = step.id,
            tool        = step.tool,
            params      = step.params,
            result      = result.data,
            success     = validated.verified,
            duration_ms = duration_ms,
            model_used  = getattr(result, 'model_used', ''),
            error       = result.error if not result.success else (validated.error if not validated.verified else ''),
        ))

    def log_error(self, error: str) -> None:
        self.errors.append(error)

    def finalize(self) -> dict:
        total_ms = int((time.time() - self.started_at) * 1000)
        return {
            'request_id':    self.request_id,
            'family_id':     self.family_id,
            'user_id':       self.user_id,
            'message':       self.message,
            'understanding': self.understanding,
            'plan_steps':    self.plan_steps,
            'executed':      len(self.steps),
            'steps':         [s.__dict__ for s in self.steps],
            'errors':        self.errors,
            'total_ms':      total_ms,
            'success':       all(s.success for s in self.steps) and not self.errors,
            'timestamp':     datetime.now(timezone.utc),
        }

    def save_async(self) -> None:
        data = self.finalize()
        def _save():
            try:
                from app import mongo
                mongo.db.agent_traces.insert_one(data)
            except Exception as e:
                print(f'[trace] save failed: {e!r}', file=sys.stderr)
        threading.Thread(target=_save, daemon=True).start()

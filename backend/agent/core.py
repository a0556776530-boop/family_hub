"""
AgentCore — the main orchestrator.

Lifecycle per request:
  1. UNDERSTAND  →  classify intents (instant regex OR LLM)
  2. PLAN        →  generate ExecutionPlan (instant OR LLM)
  3. PERMISSION  →  filter/annotate steps
  4. EXECUTE LOOP →  for each step:
       a. check permissions
       b. emit tool_start
       c. executor.run()
       d. validator.check()
       e. error recovery (retry / ask_user / skip)
       f. emit tool_done
  5. MEMORY      →  save conversation
  6. RESPOND     →  stream final answer
  7. TRACE       →  save observability log (async)
"""

from __future__ import annotations
import json
import os
import sys
import time
from datetime import datetime, timezone

from agent.memory      import ExecutionContext, ConversationMemory
from agent.permissions import PermissionGate
from agent.planner     import Planner, ExecutionPlan
from agent.executor    import Executor
from agent.validator   import Validator
from agent.router      import ModelRouter, GEMINI_FLASH, GEMINI_25, GROQ_FAST, GROQ_FALLBACK
from agent.observability import AgentTrace
from agent.registry    import REGISTRY, NON_CRITICAL_TOOLS

SYSTEM_PROMPT = """אתה עוזר המשפחה — AI חכם ועם אופי אמיתי. מדבר עברית כמו בן אדם, לא כמו מדריך.

האישיות שלך:
חכם וישיר. מביע דעות. חוש הומור עדין. לא מתחיל ב"כמובן!" "שאלה מצוינת!" — זה מזויף.

כללי ברזל:
1. לעולם אל תפלוט JSON — רק טקסט עברי רגיל.
2. לעולם אל תמציא נתוני משפחה — אירועים, משימות, קניות — רק מה שדווח בתוצאות הפעולות.
3. מידע עדכני שאינך בטוח בו (תוצאות ספורט, חדשות היום) — ציין שהמידע עשוי להיות לא עדכני.

תאריך היום: {today}"""


class AgentCore:

    def __init__(self):
        self.planner     = Planner()
        self.executor    = Executor()
        self.validator   = Validator()
        self.memory      = ConversationMemory()
        self.router      = ModelRouter()
        self.permissions = PermissionGate()

    def run(self, message: str, user: dict, conversation_id: str | None, history: list):
        """
        Generator that yields SSE event strings.
        Caller wraps this with stream_with_context().
        """
        trace = AgentTrace(
            family_id=str(user.get('family_id', '')),
            user_id=str(user.get('_id', '')),
            message=message,
        )

        def ev(obj: dict) -> str:
            return f'data: {json.dumps(obj, ensure_ascii=False)}\n\n'

        if not message:
            yield ev({'type': 'error', 'message': 'הודעה ריקה'})
            return

        # ── 1. UNDERSTAND ─────────────────────────────────────────────────
        yield ev({'type': 'status', 'text': '🧠 מבין את הבקשה...'})
        understanding = self._understand(message)
        trace.log_understanding(understanding)

        # ── 2. PLAN ───────────────────────────────────────────────────────
        plan = self.planner.generate(understanding, user, message)
        trace.log_plan(plan)

        # ── 3. PERMISSIONS ────────────────────────────────────────────────
        plan = self.permissions.filter(plan, user)

        # ── 4. EXECUTE LOOP ───────────────────────────────────────────────
        context = ExecutionContext(original_message=message, user=user)
        all_actions: list[dict] = []

        for step in plan.steps:
            # Permission check
            allowed, reason = self.permissions.check_step(step, user)
            if not allowed:
                yield ev({'type': 'status', 'text': f'🚫 {reason}'})
                context.add_failure(step, reason)
                continue

            # Confirmation required → ask the user
            if step.requires_confirmation:
                yield ev({'type': 'ask_user', 'question':
                    f'האם אתה בטוח שאתה רוצה: {step.rationale or step.tool}? (ענה כן/לא)'})
                # Save partial state and pause — the next message will resume
                # For now we stop and let the user confirm; a full resume
                # mechanism would require session state, which is a future phase.
                trace.save_async()
                return

            # Clarification needed
            if step.needs_clarification:
                q = step.clarification_question or f'נדרש מידע נוסף לביצוע {step.tool}'
                yield ev({'type': 'ask_user', 'question': q})
                trace.save_async()
                return

            # Execute
            yield ev({'type': 'tool_start', 'name': step.tool,
                       'params_preview': _params_preview(step.params)})
            t0     = time.time()
            result = self.executor.run(step, context, user)
            dur_ms = int((time.time() - t0) * 1000)

            # Validate
            validated = self.validator.check(step, result, user, context)
            trace.log_step(step, result, validated, dur_ms)

            if not validated.verified:
                recovery = self._recover(step, validated.error or result.error, context, user)

                if recovery == 'retry':
                    yield ev({'type': 'status', 'text': f'🔄 מנסה שוב את {step.tool}...'})
                    result    = self.executor.run(step, context, user)
                    validated = self.validator.check(step, result, user, context)

                elif recovery.startswith('ask:'):
                    yield ev({'type': 'ask_user', 'question': recovery[4:]})
                    trace.save_async()
                    return

                elif recovery == 'skip':
                    context.add_failure(step, validated.error or result.error)
                    yield ev({'type': 'tool_done', 'name': step.tool,
                               'success': False, 'duration_ms': dur_ms,
                               'error': result.error})
                    continue

                else:  # 'fail'
                    yield ev({'type': 'error', 'message': result.error or validated.error})
                    trace.save_async()
                    return

            context.add_result(step, result)
            all_actions.append({'tool': step.tool, 'result': result.data})
            yield ev({'type': 'tool_done', 'name': step.tool,
                       'success': True, 'duration_ms': dur_ms,
                       'result': result.data})

        # ── 5. STREAM RESPONSE ────────────────────────────────────────────
        yield ev({'type': 'status', 'text': '💬 מנסח תשובה...'})
        full_text: list[str] = []

        yield from self._stream_response(message, context, user, history, full_text, understanding)

        final_reply = ''.join(full_text).strip()
        if not final_reply:
            if context.search_results:
                # LLM failed but we have results — build basic reply from them
                lines = [f'מצאתי {len(context.search_results)} תוצאות:\n']
                for r in context.search_results[:4]:
                    title   = r.get('title', '')
                    content = r.get('content', '')[:200]
                    url     = r.get('url', '')
                    lines.append(f'**{title}**\n{content}\n[קישור]({url})\n')
                final_reply = '\n'.join(lines)
            else:
                yield ev({'type': 'error', 'message': 'לא הצלחתי לנסח תשובה — נסה שוב 🔄'})
                trace.save_async()
                return

        # ── 6. MEMORY ─────────────────────────────────────────────────────
        cid = self.memory.save(conversation_id, message, context, user, final_reply, all_actions)

        yield ev({
            'type':            'done',
            'reply':           final_reply,
            'actions':         all_actions,
            'sources':         context.sources,
            'images':          context.images,
            'conversation_id': cid,
        })

        # ── 7. TRACE ──────────────────────────────────────────────────────
        trace.save_async()

    # ── Understanding ─────────────────────────────────────────────────────────

    def _understand(self, message: str) -> dict:
        """
        Lightweight understanding — returns a dict used by the Planner.
        Full LLM understanding is not needed: the Planner does the heavy lifting.
        """
        from agent.planner import (
            _CONVERSATIONAL_RE, _ADD_SHOPPING_RE, _ADD_TASK_RE,
            _SHOW_TASKS_RE, _SHOW_SHOPPING_RE, _SHOW_CALENDAR_RE,
        )
        msg = message.strip()
        is_conv         = bool(_CONVERSATIONAL_RE.match(msg))
        is_simple_act   = bool(
            _ADD_SHOPPING_RE.search(msg) or _ADD_TASK_RE.search(msg) or
            _SHOW_TASKS_RE.search(msg)   or _SHOW_SHOPPING_RE.search(msg) or
            _SHOW_CALENDAR_RE.search(msg)
        )
        return {
            'is_conversational': is_conv,
            'is_simple_action':  is_simple_act,
            'needs_realtime':    not is_conv and not is_simple_act,
        }

    # ── Error recovery ────────────────────────────────────────────────────────

    def _recover(self, step, error: str, context: ExecutionContext, user: dict) -> str:
        """Returns 'retry' | 'ask:<question>' | 'skip' | 'fail'."""
        err = str(error or '').lower()

        if '429' in err or 'rate_limit' in err:
            time.sleep(1.5)
            return 'retry'

        if 'לא נמצא' in err or 'not found' in err:
            search_title = step.params.get('search_title', step.params.get('name', ''))
            return f'ask:לא מצאתי "{search_title}". תוכל לפרט יותר?'

        if '401' in err or '403' in err:
            return 'fail'

        td = REGISTRY.get(step.tool)
        if step.tool in NON_CRITICAL_TOOLS or (td and not td.destructive):
            return 'skip'

        return 'fail'

    # ── Response streaming ────────────────────────────────────────────────────

    def _stream_response(self, message: str, context: ExecutionContext,
                         user: dict, history: list, full_text: list,
                         understanding: dict | None = None):
        """Yields SSE delta events. Appends all text to full_text."""

        today      = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        system_txt = SYSTEM_PROMPT.replace('{today}', today)

        # Build messages list
        msgs: list[dict] = [{'role': 'system', 'content': system_txt}]
        for h in (history or [])[-12:]:
            if h.get('role') in ('user', 'assistant') and h.get('content'):
                msgs.append({'role': h['role'], 'content': str(h['content'])})

        # Build LLM context based on what actually succeeded
        has_successes = bool(context.results)

        if context.search_results:
            # Web search succeeded → inject results + question in ONE user message
            ctx = 'תוצאות חיפוש מהאינטרנט:\n\n'
            for i, r in enumerate(context.search_results[:5]):
                ctx += f'[{i+1}] {r.get("title","")}\n{r.get("content","")[:300]}\nמקור: {r.get("url","")}\n\n'
            ctx += f'בהתבסס על התוצאות האלה בלבד, ענה בעברית: {message}'
            msgs.append({'role': 'user', 'content': ctx})
        elif has_successes:
            # Other tools succeeded (shopping/tasks/calendar) → summarize what happened
            exec_ctx = context.to_response_context()
            msgs.append({'role': 'user', 'content':
                f'פעולות שבוצעו:\n{exec_ctx}\n\nענה על בקשת המשתמש: {message}'})
        else:
            # No tools succeeded (or pure conversation) → just answer from knowledge
            msgs.append({'role': 'user', 'content': message})

        def ev(obj):
            return f'data: {json.dumps(obj, ensure_ascii=False)}\n\n'

        streamed = [False]

        # ── Path 1: Gemini Native (only when Tavily has no results) ─────
        needs_realtime = (understanding or {}).get('needs_realtime', True)
        if not streamed[0] and needs_realtime and not context.search_results and self.router._gemini_native_available():
            yield from self._stream_gemini_native(message, user, history, full_text, streamed)

        # ── Path 2: OpenAI-compat (Gemini then Groq) ──────────────────────
        if not streamed[0]:
            yield from self._stream_openai_compat(msgs, full_text, streamed)

        if not streamed[0]:
            yield ev({'type': 'error', 'message': 'הגענו לגבול השימוש — נסה שוב מחר 🌅'})

    def _stream_gemini_native(self, message, user, history, full_text, streamed):
        import google.generativeai as _gnai
        from agent.skills.family import FamilySkill

        key = os.environ.get('GEMINI_API_KEY', '')
        if not key:
            return

        def ev(obj):
            return f'data: {json.dumps(obj, ensure_ascii=False)}\n\n'

        fam = FamilySkill().execute('get_family_info', {}, user, None)
        fam_ctx = ''
        if fam.success:
            d = fam.data
            names = ', '.join(m.get('name', '').split()[0] for m in d.get('members', []) if m.get('name'))
            fam_ctx = f'\n\nהקשר משפחתי: {names}'

        today  = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        sys_p  = SYSTEM_PROMPT.replace('{today}', today) + fam_ctx
        parts  = [sys_p + '\n\n']
        for h in (history or [])[-8:]:
            r, c = h.get('role'), h.get('content', '')
            if r == 'user' and c:      parts.append(f'משתמש: {c}\n')
            elif r == 'assistant' and c: parts.append(f'עוזר: {c}\n')
        parts.append(f'משתמש: {message}\nעוזר:')
        prompt = ''.join(parts)

        yield ev({'type': 'status', 'text': '🔍 מחפש ב-Google...'})
        try:
            _gnai.configure(api_key=key)
            model = None
            for tools_cfg, model_name in [
                ([{'google_search': {}}],             'gemini-2.0-flash'),
                ([{'google_search_retrieval': {}}],   'gemini-1.5-flash'),
                ([],                                   'gemini-2.0-flash'),
            ]:
                try:
                    kwargs = {'model_name': model_name}
                    if tools_cfg:
                        kwargs['tools'] = tools_cfg
                    model = _gnai.GenerativeModel(**kwargs)
                    break
                except Exception:
                    continue
            if model is None:
                return

            response   = model.generate_content(
                prompt, stream=True,
                generation_config={'temperature': 0.7, 'max_output_tokens': 2048},
            )
            got_native = False
            for chunk in response:
                try:
                    delta = chunk.text or ''
                except Exception:
                    delta = ''
                if delta:
                    got_native = True
                    full_text.append(delta)
                    yield ev({'type': 'delta', 'text': delta})
            if got_native:
                streamed[0] = True
        except Exception as e:
            print(f'[agent] gemini-native failed: {e!r}', file=sys.stderr)

    def _stream_openai_compat(self, msgs, full_text, streamed):
        from openai import OpenAI

        def ev(obj):
            return f'data: {json.dumps(obj, ensure_ascii=False)}\n\n'

        clients_models: list[tuple] = []
        gem_key  = os.environ.get('GEMINI_API_KEY', '')
        gem_key2 = os.environ.get('GEMINI_API_KEY_2', '')
        groq_key = os.environ.get('GROQ_API_KEY', '')
        gem_base = 'https://generativelanguage.googleapis.com/v1beta/openai/'
        gem_models = ['gemini-2.0-flash', 'gemini-1.5-flash']
        groq_models = [GROQ_FAST, GROQ_FALLBACK, 'compound-beta']

        if gem_key:
            for gm in gem_models:
                clients_models.append((OpenAI(api_key=gem_key, base_url=gem_base), gm))
        if gem_key2:
            for gm in gem_models:
                clients_models.append((OpenAI(api_key=gem_key2, base_url=gem_base), gm))
        if groq_key:
            try:
                from groq import Groq
                for gm in groq_models:
                    clients_models.append((Groq(api_key=groq_key), gm))
            except Exception:
                pass

        for client, model in clients_models:
            if streamed[0]:
                break
            try:
                stream = client.chat.completions.create(
                    model=model, messages=msgs,
                    temperature=0.7, max_tokens=2048, stream=True,
                )
                got = False
                for chunk in stream:
                    delta = ''
                    try:
                        delta = (chunk.choices[0].delta.content or '') if chunk.choices else ''
                    except Exception:
                        pass
                    if delta:
                        got = True
                        full_text.append(delta)
                        yield ev({'type': 'delta', 'text': delta})
                if got:
                    streamed[0] = True
                else:
                    print(f'[agent] {model}: empty response', file=sys.stderr)
            except Exception as e:
                print(f'[agent] {model}: {e!r}', file=sys.stderr)
                continue

    @property
    def _gemini_available(self) -> bool:
        return bool(os.environ.get('GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY_2'))

    @property
    def _ai_available(self) -> bool:
        return bool(os.environ.get('GROQ_API_KEY') or os.environ.get('GEMINI_API_KEY'))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _params_preview(params: dict) -> str:
    """Short human-readable summary of params for the UI."""
    if not params:
        return ''
    parts = []
    for k, v in list(params.items())[:3]:
        if isinstance(v, list) and v:
            parts.append(f'{k}: [{", ".join(str(x) for x in v[:3])}...]' if len(v) > 3
                         else f'{k}: {v}')
        else:
            parts.append(f'{k}: {str(v)[:40]}')
    return ', '.join(parts)


# Singleton to avoid recreating clients on every request
_agent_core: AgentCore | None = None

def get_agent() -> AgentCore:
    global _agent_core
    if _agent_core is None:
        _agent_core = AgentCore()
    return _agent_core

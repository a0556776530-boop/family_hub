from __future__ import annotations
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone

from agent.registry import REGISTRY, to_llm_description


@dataclass
class PlanStep:
    id:                    int
    skill:                 str
    tool:                  str
    params:                dict
    depends_on:            int | None = None
    requires_confirmation: bool       = False
    needs_clarification:   bool       = False
    clarification_question: str       = ''
    rationale:             str        = ''
    # Set by PermissionGate
    role_override:         dict       = field(default_factory=dict)
    blocked:               bool       = False
    block_reason:          str        = ''


@dataclass
class ExecutionPlan:
    steps:        list[PlanStep]
    is_simple:    bool = False
    complexity:   str  = 'single'


# ── Instant regex plan for unambiguous commands (0 LLM calls) ─────────────────

_ADD_SHOPPING_RE = re.compile(
    r'(?:תוסיף|הוסף|תכניס|הכנס|תרשום|רשום)\s+(.+?)\s+'
    r'(?:לקניות|לרשימ(?:ה|ת)(?:\s+(?:ה)?קניות)?|למכולת|לסופר|לחנות)',
    re.IGNORECASE
)
_ADD_TASK_RE = re.compile(
    r'(?:תוסיף|הוסף|צור|תצור|תיצור)\s+(?:לי\s+)?משימה\s+(.+)', re.IGNORECASE
)
_SHOW_TASKS_RE     = re.compile(r'(?:מה|תראה|הצג|תציג)\s+(?:ה)?משימות|(?:אילו|יש)\s+משימות', re.IGNORECASE)
_SHOW_SHOPPING_RE  = re.compile(r'(?:מה|תראה|הצג|תציג)\s+(?:יש\s+)?(?:ב)?(?:קניות|רשימ(?:ה|ת))|רשימת\s+קניות', re.IGNORECASE)
_SHOW_CALENDAR_RE  = re.compile(
    r'(?:מה\s+(?:יש\s+)?(?:לנו\s+)?(?:ב)?(?:יומן|לוח|אירועים?)|(?:תראה|הצג)\s+(?:יומן|לוח|אירועים?)|(?:מה|אילו)\s+(?:אירועים?|פגישות?)(?:\s+(?:קרובים?|השבוע))?)',
    re.IGNORECASE
)
_CONVERSATIONAL_RE = re.compile(
    r'^(?:שלום|היי|הי|בוקר\s+טוב|ערב\s+טוב|לילה\s+טוב|תודה|בסדר|כן|לא|אוקי|אוקיי|'
    r'נכון|מגניב|יופי|סבבה|ברור|וואו|מעולה|כן\s+בבקשה|תודה\s+רבה|'
    r'עזור\s+לי|עזרי\s+לי|המשך|תמשיך|מה\s+שלומך|בבקשה)[\s!?.]*$',
    re.IGNORECASE
)


def _instant_plan(message: str, user: dict) -> ExecutionPlan | None:
    """Try to build a plan with zero LLM calls. Returns None if message is not unambiguous."""
    msg = message.strip()

    m = _ADD_SHOPPING_RE.search(msg)
    if m:
        raw   = m.group(1).strip()
        items = [i.strip() for i in re.split(r'[,וְ\n]+', raw) if i.strip() and len(i.strip()) > 1]
        if items:
            return ExecutionPlan(is_simple=True, steps=[PlanStep(
                id=1, skill='Shopping', tool='add_shopping_items',
                params={'items': [{'name': n} for n in items]},
                rationale=f'הוספת {", ".join(items)} לקניות',
            )])

    m = _ADD_TASK_RE.search(msg)
    if m:
        title = m.group(1).strip().rstrip('?!.')
        if title and len(title) > 1:
            return ExecutionPlan(is_simple=True, steps=[PlanStep(
                id=1, skill='Tasks', tool='create_task',
                params={'title': title},
                rationale=f'יצירת משימה: {title}',
            )])

    if _SHOW_TASKS_RE.search(msg):
        return ExecutionPlan(is_simple=True, steps=[PlanStep(
            id=1, skill='Tasks', tool='get_tasks', params={}, rationale='הצגת משימות',
        )])

    if _SHOW_SHOPPING_RE.search(msg):
        return ExecutionPlan(is_simple=True, steps=[PlanStep(
            id=1, skill='Shopping', tool='get_shopping_list', params={}, rationale='הצגת רשימת קניות',
        )])

    if _SHOW_CALENDAR_RE.search(msg):
        return ExecutionPlan(is_simple=True, steps=[PlanStep(
            id=1, skill='Calendar', tool='get_upcoming_events', params={}, rationale='הצגת אירועים',
        )])

    return None


# ── LLM Planner ──────────────────────────────────────────────────────────────

_PLANNER_PROMPT = """אתה מתכנן פעולות עבור AI Agent משפחתי.

תאריך היום: {today}
הקשר משפחתי: {family_context}
הודעת המשתמש: {message}

כלים זמינים:
{tools}

חוקים:
1. צור רק steps הנדרשים — לא יותר
2. אם step תלוי בתוצאת step קודם: ציין depends_on (מספר ה-id של ה-step הקודם)
3. web_search חייב להיות לפני כל step שתלוי במידע ממנו
4. פעולות מחיקה (delete_*): requires_confirmation: true
5. אם חסר מידע לביצוע (למשל: "תמחק משימה" בלי ציון איזו): needs_clarification: true
6. בקשות ידע/שאלות ללא פעולה: step אחד — web_search בלבד

החזר JSON בלבד, ללא שום טקסט אחר:
{{
  "steps": [
    {{
      "id": 1,
      "skill": "<שם הSkill>",
      "tool": "<שם הtool>",
      "params": {{}},
      "depends_on": null,
      "requires_confirmation": false,
      "needs_clarification": false,
      "clarification_question": "",
      "rationale": "<למה בחרתי בtool הזה>"
    }}
  ],
  "complexity": "single|multi_step|question"
}}"""


class Planner:

    def generate(self, understanding: dict, user: dict, message: str) -> ExecutionPlan:
        """
        Try instant plan first (0ms), then LLM plan.
        Falls back to a single web_search for questions.
        """
        # Pure conversational → empty plan (will go straight to response)
        if _CONVERSATIONAL_RE.match(message.strip()):
            return ExecutionPlan(steps=[], is_simple=True, complexity='conversational')

        # Instant regex plan
        instant = _instant_plan(message, user)
        if instant:
            return instant

        # LLM plan
        try:
            plan = self._llm_plan(message, user)
            if plan and plan.steps:
                return plan
        except Exception as e:
            print(f'[planner] LLM plan failed: {e!r}', file=sys.stderr)

        # Default: web_search for any question/unknown
        needs_search = not understanding.get('is_simple_action')
        if needs_search:
            return ExecutionPlan(steps=[PlanStep(
                id=1, skill='Search', tool='web_search',
                params={'query': message},
                rationale='שאלת ידע — חיפוש באינטרנט',
            )], complexity='question')

        return ExecutionPlan(steps=[], complexity='conversational')

    def _llm_plan(self, message: str, user: dict) -> ExecutionPlan | None:
        from agent.router import ModelRouter
        from agent.skills.family import FamilySkill

        router = ModelRouter()
        client, model = router.for_planning('single')
        if not client:
            return None

        # Family context for the prompt
        fam_result = FamilySkill().execute('get_family_info', {}, user, None)
        fam_ctx    = ''
        if fam_result.success:
            d = fam_result.data
            names = ', '.join(m.get('name', '').split()[0] for m in d.get('members', []) if m.get('name'))
            fam_ctx = f'בני המשפחה: {names} | משימות פתוחות: {d.get("pending_tasks",0)}'

        today   = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        prompt  = _PLANNER_PROMPT.format(
            today=today, family_context=fam_ctx,
            message=message, tools=to_llm_description(),
        )

        resp = client.chat.completions.create(
            model=model,
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0,
            max_tokens=800,
        )
        raw = (resp.choices[0].message.content or '').strip()
        return self._parse_plan(raw)

    def _parse_plan(self, raw: str) -> ExecutionPlan | None:
        try:
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return None
            data = json.loads(m.group(0))
        except Exception:
            return None

        steps = []
        for s in (data.get('steps') or []):
            tool = s.get('tool', '')
            if tool not in REGISTRY:
                print(f'[planner] unknown tool in plan: {tool!r}', file=sys.stderr)
                continue
            td = REGISTRY[tool]
            steps.append(PlanStep(
                id                    = int(s.get('id', len(steps) + 1)),
                skill                 = td.skill,
                tool                  = tool,
                params                = s.get('params') or {},
                depends_on            = s.get('depends_on'),
                requires_confirmation = bool(s.get('requires_confirmation', False)) or td.destructive,
                needs_clarification   = bool(s.get('needs_clarification', False)),
                clarification_question = str(s.get('clarification_question', '')),
                rationale             = str(s.get('rationale', '')),
            ))

        if not steps:
            return None

        complexity = str(data.get('complexity', 'single'))
        return ExecutionPlan(steps=steps, is_simple=len(steps) == 1, complexity=complexity)

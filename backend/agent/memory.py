from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from agent.skills.base import ToolResult


@dataclass
class ExecutionContext:
    """Lives for the duration of one agent request. Shared across all steps."""
    original_message: str
    user:             dict
    results:          dict[int, 'ToolResult']  = field(default_factory=dict)
    failures:         list[tuple]              = field(default_factory=list)
    search_results:   list[dict]               = field(default_factory=list)
    resolved_ids:     dict[str, str]           = field(default_factory=dict)
    sources:          list[dict]               = field(default_factory=list)
    images:           list[str]                = field(default_factory=list)

    def add_result(self, step, result: 'ToolResult') -> None:
        self.results[step.id] = result
        # Cache any _id returned so subsequent steps can reference it
        if result.data.get('id'):
            self.resolved_ids[f"{step.tool}:{step.id}"] = result.data['id']
        # Collect search sources
        if step.tool == 'web_search' and result.success:
            self.search_results = result.data.get('results', [])
            self.sources        = result.data.get('results', [])[:4]
            self.images         = result.data.get('images', [])

    def add_failure(self, step, error: str) -> None:
        self.failures.append((step.id, step.tool, error))

    def resolve_dep(self, ref: str) -> Any:
        """Resolve $steps[N].field references in params."""
        import re
        m = re.match(r'\$steps\[(\d+)\]\.(.+)', str(ref))
        if not m:
            return ref
        step_id = int(m.group(1))
        field   = m.group(2)
        result  = self.results.get(step_id)
        if result and result.success:
            return result.data.get(field, ref)
        return ref

    @property
    def has_search_results(self) -> bool:
        return bool(self.search_results)

    @property
    def all_succeeded(self) -> bool:
        return len(self.failures) == 0

    def to_response_context(self) -> str:
        """Summarize execution results for the response LLM."""
        parts = []
        for step_id, result in self.results.items():
            if result.success:
                parts.append(f'✅ {_summarize_result(result.data)}')
            else:
                parts.append(f'❌ שגיאה: {result.error}')
        for sid, tool, err in self.failures:
            parts.append(f'⏭️ דולג ({tool}): {err}')
        if self.search_results:
            parts.append('\n--- תוצאות חיפוש ---')
            for r in self.search_results[:4]:
                parts.append(f'• {r.get("title","")} | {r.get("url","")}\n  {r.get("content","")[:200]}')
        return '\n'.join(parts) if parts else '(לא בוצעו פעולות)'


def _summarize_result(data: dict) -> str:
    if data.get('added'):
        return f'נוספו לקניות: {", ".join(data.get("items", []))}'
    if data.get('created') and data.get('title'):
        return f'נוצר: {data["title"]}'
    if data.get('completed') and data.get('title'):
        return f'הושלם: {data["title"]} (סטטוס: {data.get("status","")})'
    if data.get('tasks'):
        return f'{len(data["tasks"])} משימות פתוחות'
    if data.get('events'):
        return f'{len(data["events"])} אירועים קרובים'
    if data.get('items') is not None and 'count' in data:
        return f'רשימת קניות: {data["count"]} פריטים'
    if data.get('answer'):
        return f'חיפוש: {data["answer"][:120]}'
    if data.get('deleted'):
        return f'נמחקו {data["deleted"]} פריטים'
    if data.get('updated'):
        return f'עודכן: {data.get("title","")}'
    return str(data)[:120]


class ConversationMemory:
    """Persists conversation messages to MongoDB."""

    def save(self, conversation_id: str | None, message: str,
             context: ExecutionContext, user: dict, reply: str,
             actions: list) -> str | None:
        from app import mongo
        from bson import ObjectId
        try:
            family_id = user['family_id']
            user_id   = str(user['_id'])
            now       = datetime.now(timezone.utc)

            user_entry = {'role': 'user', 'content': message, 'timestamp': now.isoformat()}
            asst_entry = {
                'role':      'assistant',
                'content':   reply,
                'timestamp': now.isoformat(),
                'actions':   actions or [],
                'sources':   [{'title': s.get('title', ''), 'url': s.get('url', '')}
                               for s in context.sources[:4]],
            }

            cid = self._parse_id(conversation_id)
            if cid:
                mongo.db.ai_conversations.update_one(
                    {'_id': ObjectId(cid), 'family_id': family_id},
                    {'$push': {'messages': {'$each': [user_entry, asst_entry]}},
                     '$set':  {'updated_at': now},
                     '$setOnInsert': {'created_at': now}},
                    upsert=True,
                )
                return cid
            else:
                result = mongo.db.ai_conversations.insert_one({
                    'family_id':  family_id,
                    'user_id':    user_id,
                    'title':      message[:40],
                    'messages':   [user_entry, asst_entry],
                    'created_at': now,
                    'updated_at': now,
                })
                return str(result.inserted_id)
        except Exception:
            return None

    @staticmethod
    def _parse_id(raw) -> str | None:
        try:
            from bson import ObjectId
            return str(ObjectId(str(raw))) if raw else None
        except Exception:
            return None

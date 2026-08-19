from __future__ import annotations
from datetime import datetime, timezone, timedelta

from agent.skills.base import Skill, ToolResult, ValidationResult


class FamilySkill(Skill):
    name  = 'Family'
    tools = ['get_family_info']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        if tool == 'get_family_info':
            return self._get_family_info(user)
        return ToolResult.fail(f'FamilySkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        return ValidationResult.ok(result.data)

    def _get_family_info(self, user: dict) -> ToolResult:
        from app import mongo
        family_id = user['family_id']
        now       = datetime.now(timezone.utc)
        today_str = now.strftime('%Y-%m-%d')
        week_str  = (now + timedelta(days=7)).strftime('%Y-%m-%d')

        members = list(mongo.db.users.find({'family_id': family_id}, {'name': 1, 'role': 1, '_id': 0}))
        events  = list(mongo.db.events.find(
            {'family_id': family_id, 'date': {'$gte': today_str, '$lte': week_str}}
        ).sort('date', 1).limit(5))
        pending_tasks   = mongo.db.tasks.count_documents({'family_id': family_id, 'status': 'pending'})
        shopping_count  = mongo.db.shopping_items.count_documents({'family_id': family_id, 'done': False})

        return ToolResult.ok({
            'members': [{'name': m.get('name', ''), 'role': m.get('role', '')} for m in members],
            'upcoming_events': [{'title': e.get('title'), 'date': e.get('date'), 'emoji': e.get('emoji', '📅')} for e in events],
            'pending_tasks':   pending_tasks,
            'shopping_count':  shopping_count,
        })

from __future__ import annotations
import re
from datetime import datetime, timezone

from agent.skills.base import Skill, ToolResult, ValidationResult


class CalendarSkill(Skill):
    name  = 'Calendar'
    tools = ['get_upcoming_events', 'create_event', 'update_event', 'delete_event']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        from app import mongo, socketio
        family_id = user['family_id']
        now       = datetime.now(timezone.utc)

        if tool == 'get_upcoming_events':
            today_str = now.strftime('%Y-%m-%d')
            events = list(mongo.db.events.find(
                {'family_id': family_id, 'date': {'$gte': today_str}}
            ).sort('date', 1).limit(15))
            return ToolResult.ok({'events': [
                {'id': str(e['_id']), 'title': e.get('title'), 'date': e.get('date'),
                 'time': e.get('time', ''), 'emoji': e.get('emoji', '📅'),
                 'location': e.get('location', '')}
                for e in events
            ]})

        if tool == 'create_event':
            title = str(params.get('title', '')).strip()
            date  = str(params.get('date', '')).strip()
            if not title or not date:
                return ToolResult.fail('missing title or date')
            result = mongo.db.events.insert_one({
                'family_id':  family_id,
                'title':      title,
                'date':       date,
                'time':       str(params.get('time', '')),
                'location':   str(params.get('location', '')),
                'emoji':      str(params.get('emoji', '📅')),
                'type':       'general',
                'created_by': str(user['_id']),
                'created_at': now,
            })
            event = mongo.db.events.find_one({'_id': result.inserted_id})
            if event:
                socketio.emit('event_created', self._event_public(event), room=family_id)
            return ToolResult.ok({'created': True, 'title': title, 'date': date, 'id': str(result.inserted_id)})

        if tool == 'update_event':
            search  = str(params.get('search_title', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            event   = mongo.db.events.find_one({'family_id': family_id, 'title': {'$regex': pattern}})
            if not event:
                return ToolResult.fail(f'לא נמצא אירוע עם השם "{search}"')
            allowed = ('title', 'date', 'time', 'location', 'emoji')
            updates = {k: v for k, v in params.items() if k in allowed and v}
            if not updates:
                return ToolResult.fail('nothing to update')
            mongo.db.events.update_one({'_id': event['_id']}, {'$set': updates})
            updated = mongo.db.events.find_one({'_id': event['_id']})
            if updated:
                socketio.emit('event_updated', self._event_public(updated), room=family_id)
            return ToolResult.ok({'updated': True, 'title': event['title'], 'changes': list(updates.keys())})

        if tool == 'delete_event':
            search  = str(params.get('search_title', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            result  = mongo.db.events.delete_many({'family_id': family_id, 'title': {'$regex': pattern}})
            if result.deleted_count:
                socketio.emit('event_deleted', {'search': search}, room=family_id)
            return ToolResult.ok({'deleted': result.deleted_count, 'search': search})

        return ToolResult.fail(f'CalendarSkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        from app import mongo
        family_id = user['family_id']

        if not result.success:
            return ValidationResult.fail(result.error)

        if tool == 'create_event':
            title = result.data.get('title', '')
            date  = result.data.get('date', '')
            found = mongo.db.events.find_one({'family_id': family_id, 'title': title, 'date': date})
            if not found:
                return ValidationResult.fail(f'Event "{title}" on {date} not found in DB')
            return ValidationResult.ok({'id': str(found['_id'])})

        return ValidationResult.ok(result.data)

    @staticmethod
    def _event_public(e: dict) -> dict:
        return {
            'id':       str(e['_id']),
            'title':    e.get('title', ''),
            'date':     e.get('date', ''),
            'time':     e.get('time', ''),
            'emoji':    e.get('emoji', '📅'),
            'location': e.get('location', ''),
        }

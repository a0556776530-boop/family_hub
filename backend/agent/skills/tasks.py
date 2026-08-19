from __future__ import annotations
import re
from datetime import datetime, timezone

from agent.skills.base import Skill, ToolResult, ValidationResult

VALID_CATS      = {'ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר'}
VALID_PRIOS     = {'low', 'medium', 'high'}
PARENT_ROLES    = {'parent', 'admin'}


class TasksSkill(Skill):
    name  = 'Tasks'
    tools = ['get_tasks', 'create_task', 'complete_task', 'update_task', 'delete_task']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        from app import mongo, socketio
        family_id = user['family_id']
        now       = datetime.now(timezone.utc)

        if tool == 'get_tasks':
            tasks = list(mongo.db.tasks.find(
                {'family_id': family_id, 'status': 'pending'}
            ).sort('created_at', -1).limit(15))
            return ToolResult.ok({
                'tasks': [{'id': str(t['_id']), 'title': t.get('title'),
                           'priority': t.get('priority', 'medium'),
                           'due_date': t.get('due_date', ''),
                           'category': t.get('category', '')} for t in tasks],
                'count': len(tasks),
            })

        if tool == 'create_task':
            title = str(params.get('title', '')).strip()
            if not title:
                return ToolResult.fail('missing title')
            priority = params.get('priority', 'medium')
            if priority not in VALID_PRIOS:
                priority = 'medium'
            category = params.get('category', 'אחר')
            if category not in VALID_CATS:
                category = 'אחר'
            result = mongo.db.tasks.insert_one({
                'family_id':   family_id,
                'title':       title,
                'description': '',
                'priority':    priority,
                'category':    category,
                'due_date':    str(params.get('due_date', '')),
                'score_value': 10,
                'status':      'pending',
                'created_by':  str(user['_id']),
                'created_at':  now,
            })
            task = mongo.db.tasks.find_one({'_id': result.inserted_id})
            pub  = self._task_public(task)
            socketio.emit('task_created', pub, room=family_id)
            return ToolResult.ok({'created': True, 'title': title, 'id': str(result.inserted_id)})

        if tool == 'complete_task':
            search  = str(params.get('search_title', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            task    = mongo.db.tasks.find_one(
                {'family_id': family_id, 'title': {'$regex': pattern}, 'status': 'pending'}
            )
            if not task:
                return ToolResult.fail(f'לא נמצאה משימה פתוחה עם השם "{search}"')
            # Role-aware: children → awaiting_approval
            role       = str(user.get('role', 'member'))
            new_status = 'done' if role in PARENT_ROLES else 'awaiting_approval'
            mongo.db.tasks.update_one(
                {'_id': task['_id']},
                {'$set': {'status': new_status, 'completed_by': str(user['_id']), 'completed_at': now}}
            )
            updated = mongo.db.tasks.find_one({'_id': task['_id']})
            socketio.emit('task_updated', self._task_public(updated), room=family_id)
            return ToolResult.ok({'completed': True, 'title': task['title'], 'status': new_status})

        if tool == 'update_task':
            search  = str(params.get('search_title', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            task    = mongo.db.tasks.find_one({'family_id': family_id, 'title': {'$regex': pattern}})
            if not task:
                return ToolResult.fail(f'לא נמצאה משימה עם השם "{search}"')
            allowed  = ('title', 'priority', 'due_date', 'category')
            updates  = {k: v for k, v in params.items() if k in allowed and v}
            if not updates:
                return ToolResult.fail('nothing to update')
            mongo.db.tasks.update_one({'_id': task['_id']}, {'$set': updates})
            updated = mongo.db.tasks.find_one({'_id': task['_id']})
            socketio.emit('task_updated', self._task_public(updated), room=family_id)
            return ToolResult.ok({'updated': True, 'title': task['title'], 'changes': list(updates.keys())})

        if tool == 'delete_task':
            search  = str(params.get('search_title', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            result  = mongo.db.tasks.delete_many({'family_id': family_id, 'title': {'$regex': pattern}})
            if result.deleted_count:
                socketio.emit('task_deleted', {'search': search, 'family_id': family_id}, room=family_id)
            return ToolResult.ok({'deleted': result.deleted_count, 'search': search})

        return ToolResult.fail(f'TasksSkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        from app import mongo
        family_id = user['family_id']

        if not result.success:
            return ValidationResult.fail(result.error)

        if tool == 'create_task':
            title = result.data.get('title', '')
            found = mongo.db.tasks.find_one({'family_id': family_id, 'title': title})
            if not found:
                return ValidationResult.fail(f'Task "{title}" not found in DB after insert')
            return ValidationResult.ok({'id': str(found['_id'])})

        if tool == 'complete_task':
            title = result.data.get('title', '')
            task  = mongo.db.tasks.find_one({'family_id': family_id, 'title': title})
            if task and task.get('status') in ('done', 'awaiting_approval'):
                return ValidationResult.ok({'status': task['status']})
            return ValidationResult.fail(f'Task status not updated for "{title}"')

        return ValidationResult.ok(result.data)

    @staticmethod
    def _task_public(t: dict) -> dict:
        return {
            'id':         str(t['_id']),
            'family_id':  t['family_id'],
            'title':      t['title'],
            'priority':   t.get('priority', 'medium'),
            'category':   t.get('category', 'אחר'),
            'status':     t.get('status', 'pending'),
            'due_date':   t.get('due_date'),
            'xp_value':   t.get('score_value', 10),
            'created_by': t.get('created_by'),
        }

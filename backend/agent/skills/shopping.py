from __future__ import annotations
import re
from datetime import datetime, timezone

from agent.skills.base import Skill, ToolResult, ValidationResult

VALID_CATEGORIES = {'ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר'}


class ShoppingSkill(Skill):
    name  = 'Shopping'
    tools = ['add_shopping_items', 'get_shopping_list', 'delete_shopping_item',
             'toggle_shopping_done', 'clear_completed_shopping']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        from app import mongo
        family_id = user['family_id']
        now       = datetime.now(timezone.utc)

        if tool == 'add_shopping_items':
            existing = {
                i['name'].strip().lower()
                for i in mongo.db.shopping_items.find(
                    {'family_id': family_id, 'done': False}, {'name': 1}
                )
            }
            docs    = []
            skipped = []
            for item in (params.get('items') or [])[:20]:
                iname = str(item.get('name', '')).strip()[:100]
                if not iname:
                    continue
                if iname.lower() in existing:
                    skipped.append(iname)
                    continue
                cat = item.get('category', 'אחר')
                if cat not in VALID_CATEGORIES:
                    cat = 'אחר'
                docs.append({
                    'family_id':  family_id,
                    'name':       iname,
                    'quantity':   max(1, int(item.get('quantity') or 1)),
                    'unit':       str(item.get('unit') or '')[:20],
                    'category':   cat,
                    'note':       '',
                    'done':       False,
                    'added_by':   (user.get('name') or 'AI').split()[0],
                    'created_at': now,
                })
                existing.add(iname.lower())
            if docs:
                mongo.db.shopping_items.insert_many(docs)
            return ToolResult.ok({'added': len(docs), 'items': [d['name'] for d in docs], 'skipped': skipped})

        if tool == 'get_shopping_list':
            items = list(mongo.db.shopping_items.find(
                {'family_id': family_id}, sort=[('created_at', 1)]
            ))
            return ToolResult.ok({
                'items': [{'name': i['name'], 'quantity': i.get('quantity', 1),
                           'unit': i.get('unit', ''), 'done': i.get('done', False)} for i in items],
                'count': len(items),
            })

        if tool == 'delete_shopping_item':
            search  = str(params.get('name', '')).strip()
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            result  = mongo.db.shopping_items.delete_many({'family_id': family_id, 'name': {'$regex': pattern}})
            return ToolResult.ok({'deleted': result.deleted_count, 'search': search})

        if tool == 'toggle_shopping_done':
            search  = str(params.get('name', '')).strip()
            done    = bool(params.get('done', True))
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            result  = mongo.db.shopping_items.update_many(
                {'family_id': family_id, 'name': {'$regex': pattern}},
                {'$set': {'done': done}}
            )
            return ToolResult.ok({'updated': result.modified_count, 'done': done, 'search': search})

        if tool == 'clear_completed_shopping':
            result = mongo.db.shopping_items.delete_many({'family_id': family_id, 'done': True})
            return ToolResult.ok({'deleted': result.deleted_count})

        return ToolResult.fail(f'ShoppingSkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        from app import mongo
        family_id = user['family_id']

        if not result.success:
            return ValidationResult.fail(result.error)

        if tool == 'add_shopping_items':
            added_names = result.data.get('items', [])
            if not added_names:
                return ValidationResult.ok()
            current = list(mongo.db.shopping_items.find(
                {'family_id': family_id, 'done': False}, {'name': 1}
            ))
            current_names = {i['name'].lower() for i in current}
            confirmed = [n for n in added_names if n.lower() in current_names]
            if len(confirmed) < len(added_names):
                missing = [n for n in added_names if n.lower() not in current_names]
                return ValidationResult(
                    verified=False,
                    actual_data={'confirmed': confirmed},
                    error=f'לא אומת ב-DB: {missing}',
                )
            return ValidationResult.ok({'confirmed_added': confirmed})

        return ValidationResult.ok(result.data)

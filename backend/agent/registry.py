from dataclasses import dataclass
from enum import Enum


class Permission(Enum):
    AUTO       = 'auto'
    CONFIRM    = 'confirm'
    ROLE_AWARE = 'role_aware'
    ADMIN_ONLY = 'admin_only'


@dataclass
class ToolDefinition:
    name: str
    skill: str
    description_he: str
    parameters: dict
    returns: dict
    permission: Permission
    destructive: bool
    requires_search: bool = False
    rate_limit: int | None = None
    example: str = ''


REGISTRY: dict[str, ToolDefinition] = {

    # ── Shopping ─────────────────────────────────────────────────────────────
    'add_shopping_items': ToolDefinition(
        name='add_shopping_items', skill='Shopping',
        description_he='מוסיף פריטים לרשימת הקניות המשפחתית',
        parameters={'items': {'type': 'array', 'items': {'type': 'object',
            'properties': {'name': {'type': 'string'}, 'quantity': {'type': 'number'},
                           'unit': {'type': 'string'}, 'category': {'type': 'string'}},
            'required': ['name']}}},
        returns={'added': 'int', 'items': 'list[str]', 'skipped': 'list[str]'},
        permission=Permission.AUTO, destructive=False,
        example='תוסיף חלב ולחם לקניות',
    ),
    'get_shopping_list': ToolDefinition(
        name='get_shopping_list', skill='Shopping',
        description_he='מחזיר את רשימת הקניות הנוכחית',
        parameters={}, returns={'items': 'list', 'count': 'int'},
        permission=Permission.AUTO, destructive=False,
        example='מה יש ברשימת הקניות?',
    ),
    'delete_shopping_item': ToolDefinition(
        name='delete_shopping_item', skill='Shopping',
        description_he='מוחק פריט מרשימת הקניות לפי שם',
        parameters={'name': {'type': 'string'}},
        returns={'deleted': 'int'},
        permission=Permission.CONFIRM, destructive=True,
        example='תמחק חלב מהרשימה',
    ),
    'toggle_shopping_done': ToolDefinition(
        name='toggle_shopping_done', skill='Shopping',
        description_he='מסמן פריט בקניות כנקנה או מבטל סימון',
        parameters={'name': {'type': 'string'}, 'done': {'type': 'boolean'}},
        returns={'updated': 'int'},
        permission=Permission.AUTO, destructive=False,
        example='קניתי חלב',
    ),
    'clear_completed_shopping': ToolDefinition(
        name='clear_completed_shopping', skill='Shopping',
        description_he='מנקה את כל הפריטים שסומנו כנקנו',
        parameters={}, returns={'deleted': 'int'},
        permission=Permission.CONFIRM, destructive=True,
        example='נקה את הפריטים שנקנו',
    ),

    # ── Tasks ─────────────────────────────────────────────────────────────────
    'get_tasks': ToolDefinition(
        name='get_tasks', skill='Tasks',
        description_he='מחזיר משימות פתוחות של המשפחה',
        parameters={}, returns={'tasks': 'list', 'count': 'int'},
        permission=Permission.AUTO, destructive=False,
        example='מה המשימות שלנו?',
    ),
    'create_task': ToolDefinition(
        name='create_task', skill='Tasks',
        description_he='יוצר משימה חדשה',
        parameters={'title': {'type': 'string'},
                    'priority': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                    'category': {'type': 'string'}, 'due_date': {'type': 'string'}},
        returns={'created': 'bool', 'title': 'str', 'id': 'str'},
        permission=Permission.AUTO, destructive=False,
        example='צור משימה לנקות את הבית',
    ),
    'complete_task': ToolDefinition(
        name='complete_task', skill='Tasks',
        description_he='מסמן משימה כהושלמה לפי שם. ילדים מקבלים סטטוס awaiting_approval',
        parameters={'search_title': {'type': 'string'}},
        returns={'completed': 'bool', 'title': 'str', 'status': 'str'},
        permission=Permission.ROLE_AWARE, destructive=False,
        example='סיימתי לנקות',
    ),
    'update_task': ToolDefinition(
        name='update_task', skill='Tasks',
        description_he='עורך משימה קיימת — שינוי שם, עדיפות, תאריך יעד',
        parameters={'search_title': {'type': 'string'}, 'title': {'type': 'string'},
                    'priority': {'type': 'string'}, 'due_date': {'type': 'string'},
                    'category': {'type': 'string'}},
        returns={'updated': 'bool'},
        permission=Permission.AUTO, destructive=False,
        example='שנה את עדיפות המשימה לנקות לגבוהה',
    ),
    'delete_task': ToolDefinition(
        name='delete_task', skill='Tasks',
        description_he='מוחק משימה לפי שם',
        parameters={'search_title': {'type': 'string'}},
        returns={'deleted': 'int'},
        permission=Permission.CONFIRM, destructive=True,
        example='מחק את משימת הנקיון',
    ),

    # ── Calendar ──────────────────────────────────────────────────────────────
    'get_upcoming_events': ToolDefinition(
        name='get_upcoming_events', skill='Calendar',
        description_he='מחזיר אירועים קרובים ביומן המשפחתי',
        parameters={'days_ahead': {'type': 'integer'}},
        returns={'events': 'list'},
        permission=Permission.AUTO, destructive=False,
        example='מה יש ביומן השבוע?',
    ),
    'create_event': ToolDefinition(
        name='create_event', skill='Calendar',
        description_he='יוצר אירוע ביומן המשפחתי',
        parameters={'title': {'type': 'string'}, 'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'time': {'type': 'string', 'description': 'HH:MM'},
                    'location': {'type': 'string'}, 'emoji': {'type': 'string'}},
        returns={'created': 'bool', 'title': 'str', 'date': 'str'},
        permission=Permission.AUTO, destructive=False,
        example='קבע פגישה עם רופא ב-2026-09-15',
    ),
    'update_event': ToolDefinition(
        name='update_event', skill='Calendar',
        description_he='עורך אירוע קיים ביומן לפי שם',
        parameters={'search_title': {'type': 'string'}, 'title': {'type': 'string'},
                    'date': {'type': 'string'}, 'time': {'type': 'string'},
                    'location': {'type': 'string'}, 'emoji': {'type': 'string'}},
        returns={'updated': 'bool'},
        permission=Permission.AUTO, destructive=False,
        example='שנה את מועד הפגישה עם הרופא',
    ),
    'delete_event': ToolDefinition(
        name='delete_event', skill='Calendar',
        description_he='מוחק אירוע מהיומן לפי שם',
        parameters={'search_title': {'type': 'string'}},
        returns={'deleted': 'int'},
        permission=Permission.CONFIRM, destructive=True,
        example='מחק את הפגישה עם הרופא',
    ),

    # ── Search ────────────────────────────────────────────────────────────────
    'web_search': ToolDefinition(
        name='web_search', skill='Search',
        description_he='מחפש מידע עדכני באינטרנט — חדשות, ספורט, תוצאות, מחירים, מתכונים',
        parameters={'query': {'type': 'string'}, 'max_results': {'type': 'integer'},
                    'topic': {'type': 'string', 'enum': ['general', 'news']},
                    'domains': {'type': 'array', 'items': {'type': 'string'}}},
        returns={'results': 'list', 'answer': 'str', 'images': 'list'},
        permission=Permission.AUTO, destructive=False, requires_search=True,
        example='מה התוצאה של ברצלונה אמש?',
    ),

    # ── Family ────────────────────────────────────────────────────────────────
    'get_family_info': ToolDefinition(
        name='get_family_info', skill='Family',
        description_he='מחזיר מידע על המשפחה — שמות חברים, ספירת משימות וקניות',
        parameters={}, returns={'members': 'list', 'pending_tasks': 'int', 'shopping_count': 'int'},
        permission=Permission.AUTO, destructive=False,
        example='כמה משימות יש לנו?',
    ),

    # ── Reminders ─────────────────────────────────────────────────────────────
    'send_push_notification': ToolDefinition(
        name='send_push_notification', skill='Reminders',
        description_he='שולח התראה push לכל בני המשפחה',
        parameters={'title': {'type': 'string'}, 'body': {'type': 'string'},
                    'url': {'type': 'string'}},
        returns={'sent': 'int'},
        permission=Permission.AUTO, destructive=False,
        example='שלח התראה שהארוחה מוכנה',
    ),
}

NON_CRITICAL_TOOLS: set[str] = {'web_search', 'get_family_info'}
READ_ONLY_TOOLS:    set[str] = {
    'get_tasks', 'get_shopping_list', 'get_upcoming_events', 'get_family_info', 'web_search'
}


def get_skill_for_tool(tool_name: str) -> str:
    td = REGISTRY.get(tool_name)
    return td.skill if td else 'Search'


def to_llm_description() -> str:
    """Render all tools as a compact Hebrew description for the planner LLM."""
    lines = []
    for name, td in REGISTRY.items():
        tag = ''
        if td.destructive:
            tag += ' [⚠️ הרסני]'
        if td.permission == Permission.ROLE_AWARE:
            tag += ' [תלוי ב-role]'
        if td.requires_search:
            tag += ' [דורש רשת]'
        lines.append(f'• {name}: {td.description_he}{tag}')
    return '\n'.join(lines)

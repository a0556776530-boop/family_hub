import os
import json
import re
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth

ai_bp = Blueprint('ai', __name__)

try:
    from groq import Groq
    _GROQ_KEY = os.environ.get('GROQ_API_KEY', '')
    _groq_client = Groq(api_key=_GROQ_KEY) if _GROQ_KEY else None
    _AI_AVAILABLE = bool(_GROQ_KEY)
except Exception:
    _groq_client = None
    _AI_AVAILABLE = False

try:
    from tavily import TavilyClient
    _TAVILY_KEY = os.environ.get('TAVILY_API_KEY', '')
    _tavily_client = TavilyClient(api_key=_TAVILY_KEY) if _TAVILY_KEY else None
except Exception:
    _tavily_client = None

MODEL_PRIMARY  = 'llama-3.3-70b-versatile'
MODEL_FALLBACK = 'llama-3.1-8b-instant'
MODEL = MODEL_PRIMARY
VALID_CATEGORIES = {'ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר'}
VALID_TASK_CATS  = {'ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר'}

# ─── Tools ─────────────────────────────────────────────────────────────────

TOOLS = [
    # ── Web Search ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "מחפש באינטרנט ומחזיר תוצאות עם קישורים. השתמש כשהמשתמש מבקש מתכון, מידע עדכני, המלצות, חדשות, או כל שאלה שדורשת מידע מהאינטרנט.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "שאילתת החיפוש — כתוב בעברית או באנגלית לפי הנושא"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "מספר תוצאות (ברירת מחדל 5)"
                    }
                },
                "required": ["query"]
            }
        }
    },

    # ── Shopping ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "add_shopping_items",
            "description": "מוסיף פריטים לרשימת הקניות. השתמש כשהמשתמש מציין בפירוש מה להוסיף — מוצרים, מתכון, ארוחה, ציוד לטיול וכו'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name":     {"type": "string"},
                                "quantity": {"type": "number"},
                                "unit":     {"type": "string"},
                                "category": {"type": "string", "description": "ירקות/פירות/מזון/ניקיון/פארם/תינוקות/אחר"}
                            },
                            "required": ["name"]
                        }
                    }
                },
                "required": ["items"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_shopping_list",
            "description": "מחזיר את רשימת הקניות הנוכחית. השתמש כשהמשתמש שואל מה יש ברשימה, לפני מחיקה/עריכה של פריט.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_shopping_item",
            "description": "מוחק פריט מרשימת הקניות לפי שם. השתמש כשהמשתמש מבקש למחוק פריט.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "שם הפריט למחיקה (חיפוש חלקי)"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_shopping_done",
            "description": "מסמן פריט בקניות כנקנה או מבטל סימון. השתמש כשהמשתמש אומר 'קניתי X' או 'תסמן X כנקנה'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "שם הפריט"},
                    "done": {"type": "boolean", "description": "true=נקנה, false=לא נקנה"}
                },
                "required": ["name", "done"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "clear_completed_shopping",
            "description": "מנקה את כל הפריטים שסומנו כנקנו. השתמש כשהמשתמש אומר 'נקה נקנו' או 'מחק שהושלם'.",
            "parameters": {"type": "object", "properties": {}}
        }
    },

    # ── Calendar ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_upcoming_events",
            "description": "מחזיר אירועים קרובים ביומן. השתמש כשהמשתמש שואל מה יש ביומן, השבוע, הלילה וכו'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {"type": "integer", "description": "כמה ימים קדימה (ברירת מחדל 7)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": "יוצר אירוע ביומן.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":    {"type": "string"},
                    "date":     {"type": "string", "description": "YYYY-MM-DD"},
                    "time":     {"type": "string", "description": "HH:MM (אופציונלי)"},
                    "location": {"type": "string"},
                    "emoji":    {"type": "string"}
                },
                "required": ["title", "date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_event",
            "description": "עורך אירוע קיים ביומן לפי שם. השתמש כשהמשתמש רוצה לשנות תאריך/שעה/כותרת/מיקום של אירוע.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_title": {"type": "string", "description": "חלק מהשם הנוכחי של האירוע"},
                    "title":    {"type": "string", "description": "שם חדש (אופציונלי)"},
                    "date":     {"type": "string", "description": "תאריך חדש YYYY-MM-DD (אופציונלי)"},
                    "time":     {"type": "string", "description": "שעה חדשה HH:MM (אופציונלי)"},
                    "location": {"type": "string"},
                    "emoji":    {"type": "string"}
                },
                "required": ["search_title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_event",
            "description": "מוחק אירוע מהיומן לפי שם.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_title": {"type": "string", "description": "חלק מהשם של האירוע למחיקה"}
                },
                "required": ["search_title"]
            }
        }
    },

    # ── Tasks ─────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_tasks",
            "description": "מחזיר משימות פתוחות. השתמש כשהמשתמש שואל מה המשימות שלנו.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "יוצר משימה חדשה.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":    {"type": "string"},
                    "priority": {"type": "string", "description": "low/medium/high"},
                    "category": {"type": "string", "description": "ניקיון/מטבח/לימודים/סידורים/קניות/תחזוקת הבית/אחר"},
                    "due_date": {"type": "string", "description": "YYYY-MM-DD (אופציונלי)"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "מסמן משימה כהושלמה לפי שם. השתמש כשהמשתמש אומר 'סיימתי X' או 'תסמן X כבוצע'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_title": {"type": "string", "description": "חלק מהשם של המשימה"}
                },
                "required": ["search_title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "מוחק משימה לפי שם.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_title": {"type": "string", "description": "חלק מהשם של המשימה"}
                },
                "required": ["search_title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "עורך משימה קיימת — שם, עדיפות, תאריך יעד.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_title": {"type": "string", "description": "חלק מהשם הנוכחי"},
                    "title":    {"type": "string"},
                    "priority": {"type": "string"},
                    "due_date": {"type": "string"},
                    "category": {"type": "string"}
                },
                "required": ["search_title"]
            }
        }
    },
]


# ─── Tool executor ──────────────────────────────────────────────────────────

def _find_item_by_name(family_id, collection, name_field, search):
    """Case-insensitive partial name search."""
    pattern = re.compile(re.escape(search), re.IGNORECASE)
    return mongo.db[collection].find_one({'family_id': family_id, name_field: {'$regex': pattern}})


def execute_tool(name, args, user):
    family_id = user['family_id']
    now = datetime.now(timezone.utc)

    # ── Web Search ────────────────────────────────────────────────────────
    if name == 'web_search':
        if not _tavily_client:
            return {'error': 'חיפוש אינטרנט לא זמין — TAVILY_API_KEY חסר'}
        query = str(args.get('query', '')).strip()
        max_r = min(int(args.get('max_results', 5)), 8)
        if not query:
            return {'error': 'missing query'}
        try:
            resp = _tavily_client.search(query, max_results=max_r, include_answer=True)
            results = []
            for r in resp.get('results', []):
                results.append({
                    'title':   r.get('title', ''),
                    'url':     r.get('url', ''),
                    'content': r.get('content', '')[:500],
                })
            return {
                'query':   query,
                'answer':  resp.get('answer', ''),
                'results': results,
            }
        except Exception as e:
            return {'error': str(e)}

    # ── Shopping ──────────────────────────────────────────────────────────
    if name == 'add_shopping_items':
        docs = []
        for item in (args.get('items') or [])[:20]:
            iname = str(item.get('name', '')).strip()[:100]
            if not iname:
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
                'added_by':   user.get('name', '').split()[0] or 'AI',
                'created_at': now,
            })
        if docs:
            mongo.db.shopping_items.insert_many(docs)
        return {'added': len(docs), 'items': [d['name'] for d in docs]}

    elif name == 'get_shopping_list':
        items = list(mongo.db.shopping_items.find(
            {'family_id': family_id}, sort=[('created_at', 1)]
        ))
        pending = [{'name': i['name'], 'quantity': i.get('quantity', 1), 'unit': i.get('unit', ''), 'done': i.get('done', False)} for i in items]
        return {'items': pending, 'count': len(pending)}

    elif name == 'delete_shopping_item':
        search = str(args.get('name', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        result = mongo.db.shopping_items.delete_many({'family_id': family_id, 'name': {'$regex': pattern}})
        return {'deleted': result.deleted_count, 'search': search}

    elif name == 'toggle_shopping_done':
        search = str(args.get('name', '')).strip()
        done   = bool(args.get('done', True))
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        result = mongo.db.shopping_items.update_many(
            {'family_id': family_id, 'name': {'$regex': pattern}},
            {'$set': {'done': done}}
        )
        return {'updated': result.modified_count, 'done': done}

    elif name == 'clear_completed_shopping':
        result = mongo.db.shopping_items.delete_many({'family_id': family_id, 'done': True})
        return {'deleted': result.deleted_count}

    # ── Calendar ──────────────────────────────────────────────────────────
    elif name == 'get_upcoming_events':
        today_str = now.strftime('%Y-%m-%d')
        events = list(mongo.db.events.find(
            {'family_id': family_id, 'date': {'$gte': today_str}}
        ).sort('date', 1).limit(15))
        return {'events': [{'id': str(e['_id']), 'title': e.get('title'), 'date': e.get('date'), 'time': e.get('time', ''), 'emoji': e.get('emoji', '📅'), 'location': e.get('location', '')} for e in events]}

    elif name == 'create_event':
        title = str(args.get('title', '')).strip()
        date  = str(args.get('date', '')).strip()
        if not title or not date:
            return {'error': 'missing title or date'}
        mongo.db.events.insert_one({
            'family_id':  family_id,
            'title':      title,
            'date':       date,
            'time':       str(args.get('time', '')),
            'location':   str(args.get('location', '')),
            'emoji':      str(args.get('emoji', '📅')),
            'type':       'general',
            'created_by': str(user['_id']),
            'created_at': now,
        })
        return {'created': True, 'title': title, 'date': date}

    elif name == 'update_event':
        search = str(args.get('search_title', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        event = mongo.db.events.find_one({'family_id': family_id, 'title': {'$regex': pattern}})
        if not event:
            return {'error': f'לא נמצא אירוע עם השם "{search}"'}
        allowed = ('title', 'date', 'time', 'location', 'emoji')
        updates = {k: v for k, v in args.items() if k in allowed and v}
        if not updates:
            return {'error': 'nothing to update'}
        mongo.db.events.update_one({'_id': event['_id']}, {'$set': updates})
        return {'updated': True, 'title': event['title'], 'changes': list(updates.keys())}

    elif name == 'delete_event':
        search = str(args.get('search_title', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        result = mongo.db.events.delete_many({'family_id': family_id, 'title': {'$regex': pattern}})
        return {'deleted': result.deleted_count, 'search': search}

    # ── Tasks ─────────────────────────────────────────────────────────────
    elif name == 'get_tasks':
        tasks = list(mongo.db.tasks.find(
            {'family_id': family_id, 'status': 'pending'}
        ).sort('created_at', -1).limit(15))
        return {'tasks': [{'id': str(t['_id']), 'title': t.get('title'), 'priority': t.get('priority', 'medium'), 'due_date': t.get('due_date', ''), 'category': t.get('category', '')} for t in tasks], 'count': len(tasks)}

    elif name == 'create_task':
        title = str(args.get('title', '')).strip()
        if not title:
            return {'error': 'missing title'}
        priority = args.get('priority', 'medium')
        if priority not in ('low', 'medium', 'high'):
            priority = 'medium'
        category = args.get('category', 'אחר')
        if category not in VALID_TASK_CATS:
            category = 'אחר'
        mongo.db.tasks.insert_one({
            'family_id':  family_id,
            'title':      title,
            'description': '',
            'priority':   priority,
            'category':   category,
            'due_date':   str(args.get('due_date', '')),
            'status':     'pending',
            'created_by': str(user['_id']),
            'created_at': now,
        })
        return {'created': True, 'title': title}

    elif name == 'complete_task':
        search = str(args.get('search_title', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        task = mongo.db.tasks.find_one({'family_id': family_id, 'title': {'$regex': pattern}, 'status': 'pending'})
        if not task:
            return {'error': f'לא נמצאה משימה פתוחה עם השם "{search}"'}
        mongo.db.tasks.update_one({'_id': task['_id']}, {'$set': {'status': 'done', 'completed_by': str(user['_id']), 'completed_at': now}})
        return {'completed': True, 'title': task['title']}

    elif name == 'delete_task':
        search = str(args.get('search_title', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        result = mongo.db.tasks.delete_many({'family_id': family_id, 'title': {'$regex': pattern}})
        return {'deleted': result.deleted_count, 'search': search}

    elif name == 'update_task':
        search = str(args.get('search_title', '')).strip()
        pattern = re.compile(re.escape(search), re.IGNORECASE)
        task = mongo.db.tasks.find_one({'family_id': family_id, 'title': {'$regex': pattern}})
        if not task:
            return {'error': f'לא נמצאה משימה עם השם "{search}"'}
        allowed = ('title', 'priority', 'due_date', 'category')
        updates = {k: v for k, v in args.items() if k in allowed and v}
        if not updates:
            return {'error': 'nothing to update'}
        mongo.db.tasks.update_one({'_id': task['_id']}, {'$set': updates})
        return {'updated': True, 'title': task['title'], 'changes': list(updates.keys())}

    return {'error': f'unknown tool: {name}'}


# ─── System Prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """אתה עוזר AI חכם, ידידותי ורב-עוצמה — כמו Grok או Gemini — אבל מותאם לעברית ולמשפחה הישראלית.

אתה יכול לעזור בכל דבר:
• לחפש באינטרנט ולהביא תוצאות אמיתיות עם קישורים (השתמש ב-web_search)
• מתכונים — תמיד חפש באינטרנט ותחזיר קישורים לאתרי מתכונים
• חדשות, מזג אוויר, מחירים, מידע עדכני — חפש באינטרנט
• תכנון טיולים, המלצות מסעדות, אטרקציות — חפש באינטרנט
• עצות לחינוך ילדים, זוגיות, עבודה
• ניתוח, כתיבה, תרגום, הסבר מושגים — ענה מהידע שלך

ובנוסף, יש לך שליטה מלאה על האפליקציה המשפחתית:
🛒 קניות — הוספה, מחיקה, סימון כנקנה, ניקוי, צפייה
📅 יומן — צפייה, הוספה, עריכה, מחיקת אירועים
✅ משימות — צפייה, הוספה, עריכה, סימון כבוצע, מחיקה

━━━ כלל ברזל — חובה לשמור תמיד ━━━
אל תשתמש באף כלי (קניות, יומן, משימות, חיפוש) אלא אם המשתמש אמר במפורש פועל כמו:
"תוסיף", "הוסף", "תמחק", "מחק", "תצור", "צור", "תחפש", "חפש", "תסמן", "תעדכן"

אם המשתמש שואל שאלה, מבקש מתכון, מספר משהו, או מדבר בכלל — אל תגע בשום כלי.
רק ענה בטקסט.

דוגמאות:
❌ "אני רוצה עוגת גבינה" → אל תוסיף לכלום — תן מתכון/מידע בלבד
❌ "מה עושים עם עגבניות?" → אל תוסיף לכלום — ענה בטקסט
❌ "יש לי פגישה מחר" → אל תוסיף ליומן — ענה רק בטקסט
✅ "תוסיף עגבניות לקניות" → השתמש ב-add_shopping_items
✅ "תחפש מתכון לפסטה" → השתמש ב-web_search
✅ "תצור משימה לנקות" → השתמש ב-create_task

אחרי מתכון — שאל בלבד: "אילו מצרכים חסרים לך? אוסיף רק אותם 🛒"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

סגנון:
- עברית טבעית, חמה, בוטחת
- תשובות מלאות כשצריך, קצרות כשמספיק
- אין נושאים אסורים — ענה על הכל בפתיחות ובחכמה
- אל תמציא פריטים שלא ביקשו לקניות

כשמביא תוצאות מהאינטרנט — הצג קישורים בפורמט: [שם האתר](URL)

חשוב מאוד: אם אתה לא בטוח בתשובה לשאלה עובדתית — אל תגיד "לא יודע". במקום זה, השתמש ב-web_search כדי למצוא את התשובה. תמיד נסה לחפש לפני שאתה מוותר.

תאריך היום: {today}"""


# ─── Chat endpoint ──────────────────────────────────────────────────────────

@ai_bp.route('/chat', methods=['POST'])
@require_auth
def ai_chat():
    if not _AI_AVAILABLE:
        return jsonify({'error': 'ai_unavailable', 'message': 'יש להגדיר GROQ_API_KEY.'}), 503

    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data    = request.get_json() or {}
    message = (data.get('message') or '').strip()
    history = data.get('history') or []

    if not message:
        return jsonify({'error': 'missing_message'}), 400

    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    system    = SYSTEM_PROMPT.replace('{today}', today_str)

    messages = [{'role': 'system', 'content': system}]
    for h in history[-20:]:
        if h.get('role') in ('user', 'assistant') and h.get('content'):
            messages.append({'role': h['role'], 'content': str(h['content'])})
    messages.append({'role': 'user', 'content': message})

    actions = []

    def _call(model, **kwargs):
        return _groq_client.chat.completions.create(model=model, **kwargs)

    def _call_with_fallback(**kwargs):
        try:
            return _call(MODEL_PRIMARY, **kwargs), MODEL_PRIMARY
        except Exception as e:
            if 'rate_limit' in str(e).lower() or '429' in str(e):
                return _call(MODEL_FALLBACK, **kwargs), MODEL_FALLBACK
            raise

    try:
        response, used_model = _call_with_fallback(
            messages=messages,
            tools=TOOLS,
            tool_choice='auto',
            temperature=0.6,
            max_tokens=2048,
        )

        choice = response.choices[0]

        if choice.message.tool_calls:
            messages.append({
                'role':       'assistant',
                'content':    choice.message.content or '',
                'tool_calls': [
                    {
                        'id':   tc.id,
                        'type': 'function',
                        'function': {
                            'name':      tc.function.name,
                            'arguments': tc.function.arguments,
                        }
                    }
                    for tc in choice.message.tool_calls
                ]
            })

            for tc in choice.message.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except Exception:
                    tool_args = {}

                result = execute_tool(tool_name, tool_args, user)
                actions.append({'tool': tool_name, 'result': result})

                messages.append({
                    'role':         'tool',
                    'tool_call_id': tc.id,
                    'content':      json.dumps(result, ensure_ascii=False),
                })

            final, _ = _call_with_fallback(
                messages=messages,
                temperature=0.6,
                max_tokens=2048,
            )
            reply = final.choices[0].message.content.strip()
        else:
            reply = choice.message.content.strip()

        return jsonify({'reply': reply, 'actions': actions}), 200

    except Exception as e:
        return jsonify({'error': 'ai_error', 'message': str(e)}), 500


# ─── Legacy shopping endpoint ───────────────────────────────────────────────

SHOPPING_SYSTEM_PROMPT = """אתה עוזר קניות חכם. החזר JSON בלבד.
פורמט: [{"name":"שם בעברית","category":"מזון","quantity":1,"unit":""}]
קטגוריות: ירקות, פירות, מזון, ניקיון, פארם, תינוקות, אחר"""


@ai_bp.route('/shopping', methods=['POST'])
@require_auth
def ai_shopping():
    if not _AI_AVAILABLE:
        return jsonify({'error': 'ai_unavailable', 'message': 'יש להגדיר GROQ_API_KEY.'}), 503

    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data = request.get_json() or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'missing_text'}), 400

    try:
        completion = _groq_client.chat.completions.create(
            model=MODEL,
            messages=[
                {'role': 'system', 'content': SHOPPING_SYSTEM_PROMPT},
                {'role': 'user', 'content': text},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
        raw = completion.choices[0].message.content.strip()
        match = re.search(r'\[[\s\S]*\]', raw)
        raw = match.group(0) if match else raw
        items_data = json.loads(raw)
        if not isinstance(items_data, list):
            raise ValueError('not a list')

        now  = datetime.now(timezone.utc)
        docs = []
        for item in items_data[:20]:
            iname = str(item.get('name', '')).strip()[:100]
            if not iname:
                continue
            cat = item.get('category', 'אחר')
            if cat not in VALID_CATEGORIES:
                cat = 'אחר'
            docs.append({
                'family_id':  user['family_id'],
                'name':       iname,
                'quantity':   max(1, int(item.get('quantity') or 1)),
                'unit':       str(item.get('unit') or '')[:20],
                'category':   cat,
                'note':       '',
                'done':       False,
                'added_by':   user.get('name', '').split()[0] or 'AI',
                'created_at': now,
            })
        if docs:
            mongo.db.shopping_items.insert_many(docs)
        return jsonify({'count': len(docs), 'items': [d['name'] for d in docs]}), 200

    except (json.JSONDecodeError, ValueError):
        return jsonify({'error': 'parse_error', 'message': 'לא הצלחתי לפרש, נסה שוב'}), 422
    except Exception as e:
        return jsonify({'error': 'ai_error', 'message': str(e)}), 500

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
except Exception:
    _groq_client = None
    _GROQ_KEY = ''

try:
    from tavily import TavilyClient
    _TAVILY_KEY = os.environ.get('TAVILY_API_KEY', '')
    _tavily_client = TavilyClient(api_key=_TAVILY_KEY) if _TAVILY_KEY else None
except Exception:
    _tavily_client = None

try:
    from openai import OpenAI as _OpenAIClient
    _GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
    _gemini_client = _OpenAIClient(
        api_key=_GEMINI_KEY,
        base_url='https://generativelanguage.googleapis.com/v1beta/openai/'
    ) if _GEMINI_KEY else None
except Exception:
    _gemini_client = None
    _GEMINI_KEY = ''

# AI is available if at least one model provider is configured
_AI_AVAILABLE = bool(_GROQ_KEY or _GEMINI_KEY)

MODEL_PRIMARY  = 'llama-3.3-70b-versatile'              # 100K tokens/day
MODEL_FALLBACK = 'llama-3.1-8b-instant'                 # 500K tokens/day
MODEL_BASIC    = 'llama3-8b-8192'                       # separate 8b quota
MODEL_EXTRA1   = 'deepseek-r1-distill-llama-70b'        # separate deepseek quota
MODEL_EXTRA2   = 'qwen-qwq-32b'                         # separate qwen quota
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


# ─── Intent classifier (~200 tokens, understands any Hebrew phrasing) ────────

_INTENT_PROMPT = """ענה ב-JSON בלבד, ללא שום טקסט אחר.

זהה מה המשתמש רוצה מתוך האפשרויות:
add_task | add_shopping | delete_task | complete_task | get_tasks | get_shopping | other

הודעה: "{msg}"

חוקים:
- add_task: כל בקשה להוסיף/ליצור משימה → {{"intent":"add_task","title":"שם המשימה"}}
- add_shopping: כל בקשה להוסיף לקניות/לרשימה → {{"intent":"add_shopping","items":["פריט1","פריט2"]}}
- delete_task: כל בקשה למחוק משימה → {{"intent":"delete_task","title":"שם"}}
- complete_task: כל בקשה לסמן משימה כבוצע/הושלם → {{"intent":"complete_task","title":"שם"}}
- get_tasks: כל בקשה לראות/להציג משימות → {{"intent":"get_tasks"}}
- get_shopping: כל בקשה לראות רשימת קניות → {{"intent":"get_shopping"}}
- other: שאלה, שיחה, מתכון, מידע, כל דבר אחר → {{"intent":"other"}}

JSON:"""


def _classify_and_execute(message, user):
    """Tiny LLM call (~200 tokens) to understand intent, then execute locally."""
    if not _groq_client:
        return None, None
    try:
        resp = _groq_client.chat.completions.create(
            model=MODEL_FALLBACK,
            messages=[{'role': 'user', 'content': _INTENT_PROMPT.format(msg=message)}],
            temperature=0,
            max_tokens=80,
        )
        raw = resp.choices[0].message.content.strip()
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if not m:
            return None, None
        data = json.loads(m.group(0))
    except Exception:
        return None, None

    intent = data.get('intent', 'other')
    if intent == 'other':
        return None, None

    if intent == 'add_task':
        title = str(data.get('title', '')).strip()
        if not title:
            return None, None
        result = execute_tool('create_task', {'title': title}, user)
        if result.get('created'):
            return f'✅ נוצרה משימה: **{title}**', [{'tool': 'create_task', 'result': result}]

    elif intent == 'add_shopping':
        items = [str(i).strip() for i in (data.get('items') or []) if str(i).strip()]
        if not items:
            return None, None
        result = execute_tool('add_shopping_items', {'items': [{'name': n} for n in items]}, user)
        if result.get('added', 0) > 0:
            return f'🛒 נוסף לקניות: {", ".join(result["items"])}', [{'tool': 'add_shopping_items', 'result': result}]

    elif intent == 'delete_task':
        title = str(data.get('title', '')).strip()
        if not title:
            return None, None
        result = execute_tool('delete_task', {'search_title': title}, user)
        if result.get('deleted', 0) > 0:
            return f'🗑️ המשימה "{title}" נמחקה.', [{'tool': 'delete_task', 'result': result}]

    elif intent == 'complete_task':
        title = str(data.get('title', '')).strip()
        if not title:
            return None, None
        result = execute_tool('complete_task', {'search_title': title}, user)
        if result.get('completed'):
            return f'🎉 משימה הושלמה: **{title}**', [{'tool': 'complete_task', 'result': result}]

    elif intent == 'get_tasks':
        result = execute_tool('get_tasks', {}, user)
        tasks = result.get('tasks', [])
        if not tasks:
            return 'אין משימות פתוחות כרגע 🎉', []
        lines = '\n'.join(f'• {t["title"]}' for t in tasks[:10])
        return f'📋 **משימות פתוחות ({len(tasks)}):**\n{lines}', []

    elif intent == 'get_shopping':
        result = execute_tool('get_shopping_list', {}, user)
        items = result.get('items', [])
        if not items:
            return 'רשימת הקניות ריקה 🛒', []
        lines = '\n'.join(f'{"✅" if i["done"] else "•"} {i["name"]}' for i in items[:15])
        return f'🛒 **רשימת קניות ({len(items)} פריטים):**\n{lines}', []

    return None, None


# ─── Basic regex fallback (zero tokens, absolute last resort) ─────────────────

def _keyword_parse_basic(message, user):
    """Simple regex for when ALL LLM models are down — covers only obvious patterns."""
    msg = message.strip()
    # Add task: "תוסיף משימה X"
    m = re.search(r'(?:תוסיף|הוסף|צור)\s+(?:לי\s+)?משימה\s+(.+)', msg, re.IGNORECASE)
    if m:
        title = m.group(1).strip().rstrip('?!.')
        if title:
            result = execute_tool('create_task', {'title': title}, user)
            if result.get('created'):
                return f'✅ נוצרה משימה: **{title}**', [{'tool': 'create_task', 'result': result}]
    # Add shopping: "תוסיף X לקניות"
    m = re.search(r'(?:תוסיף|הוסף)\s+(.+?)\s+לקניות', msg, re.IGNORECASE)
    if m:
        items = [i.strip() for i in re.split(r'[,ו]', m.group(1)) if i.strip()]
        if items:
            result = execute_tool('add_shopping_items', {'items': [{'name': n} for n in items]}, user)
            if result.get('added', 0) > 0:
                return f'🛒 נוסף לקניות: {", ".join(result["items"])}', [{'tool': 'add_shopping_items', 'result': result}]
    return None, None


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

    # Intent classifier: ~200 tokens, understands any natural Hebrew phrasing
    ci_reply, ci_actions = _classify_and_execute(message, user)
    if ci_reply:
        return jsonify({'reply': ci_reply, 'actions': ci_actions or []}), 200

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

    def _is_retryable(e):
        s = str(e).lower()
        return 'rate_limit' in s or '429' in s or 'model_decommissioned' in s or 'decommissioned' in s

    def _call_gemini(**kwargs):
        if not _gemini_client:
            raise Exception('no_gemini')
        simple = {k: v for k, v in kwargs.items() if k not in ('tools', 'tool_choice')}
        try:
            resp = _gemini_client.chat.completions.create(model='gemini-2.0-flash', **kwargs)
            return resp, 'gemini-2.0-flash'
        except Exception:
            resp = _gemini_client.chat.completions.create(model='gemini-2.0-flash', **simple)
            return resp, 'gemini-2.0-flash'

    def _call_with_fallback(**kwargs):
        no_web_kwargs = {**kwargs}
        if 'tools' in no_web_kwargs:
            no_web_kwargs['tools'] = [t for t in no_web_kwargs['tools'] if t['function']['name'] != 'web_search']

        if _groq_client:
            # Tier 1+2: full Groq models with all tools
            for model in (MODEL_PRIMARY, MODEL_FALLBACK):
                try:
                    return _call(model, **kwargs), model
                except Exception as e:
                    if _is_retryable(e):
                        continue
                    raise
            # Tier 3+4+5: Groq fallback models without web_search
            for model in (MODEL_BASIC, MODEL_EXTRA1, MODEL_EXTRA2):
                try:
                    return _call(model, **no_web_kwargs), model
                except Exception as e:
                    if _is_retryable(e):
                        continue
                    raise

        # Final fallback: Gemini (free, 1.5M tokens/day)
        try:
            return _call_gemini(**no_web_kwargs)
        except Exception:
            pass

        raise Exception('הגענו לגבול השימוש היומי — נסה שוב מחר בבוקר 🌅')

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
        err = str(e)
        # Last resort: try keyword-based parsing (no tokens at all)
        kw_reply, kw_actions = _classify_and_execute(message, user)
        if not kw_reply:
            kw_reply, kw_actions = _keyword_parse_basic(message, user)
        if kw_reply:
            return jsonify({'reply': kw_reply, 'actions': kw_actions or []}), 200

        if 'גבול' in err or 'מחר' in err:
            user_msg = err + '\n\n💡 פקודות פשוטות עדיין עובדות: "תוסיף משימה X", "תוסיף X לקניות", "מה המשימות?"'
        elif 'rate_limit' in err.lower() or '429' in err:
            user_msg = 'הגענו לגבול השימוש היומי — נסה שוב מחר בבוקר 🌅'
        elif 'api_key' in err.lower() or 'authentication' in err.lower():
            user_msg = 'שגיאת הגדרות AI — פנה למנהל המערכת'
        elif 'timeout' in err.lower() or 'connection' in err.lower():
            user_msg = 'העיכוב ארוך מדי — נסה שוב 🔄'
        else:
            user_msg = 'שגיאה זמנית — נסה שוב בעוד כמה שניות 🔄'
        return jsonify({'error': 'ai_error', 'message': user_msg}), 500


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

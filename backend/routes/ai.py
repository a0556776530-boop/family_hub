import os
import json
import re
import time
from flask import Blueprint, request, jsonify, Response, stream_with_context
from bson import ObjectId
from datetime import datetime, timezone, timedelta
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
    _GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    _GEMINI_KEY  = os.environ.get('GEMINI_API_KEY', '')
    _GEMINI_KEY2 = os.environ.get('GEMINI_API_KEY_2', '')
    _gemini_client  = _OpenAIClient(api_key=_GEMINI_KEY,  base_url=_GEMINI_BASE) if _GEMINI_KEY  else None
    _gemini_client2 = _OpenAIClient(api_key=_GEMINI_KEY2, base_url=_GEMINI_BASE) if _GEMINI_KEY2 else None
except Exception:
    _gemini_client  = None
    _gemini_client2 = None
    _GEMINI_KEY  = ''
    _GEMINI_KEY2 = ''

# Native Gemini SDK with Google Search grounding (same as Gemini.ai)
_gemini_native_available = False
try:
    import google.generativeai as _genai_sdk
    _gemini_native_available = bool(_GEMINI_KEY)
    if _gemini_native_available:
        print('[gemini-native] google-generativeai SDK loaded OK', file=__import__('sys').stderr)
except Exception as _ge:
    print(f'[gemini-native] SDK not available: {_ge}', file=__import__('sys').stderr)

# AI is available if at least one model provider is configured
_AI_AVAILABLE = bool(_GROQ_KEY or _GEMINI_KEY or _GEMINI_KEY2)

# Rate limiting: max 30 requests per minute per family
_rate_cache: dict = {}

def _check_rate(family_id: str) -> bool:
    now   = time.time()
    calls = [t for t in _rate_cache.get(family_id, []) if now - t < 60]
    if len(calls) >= 30:
        return False
    _rate_cache[family_id] = calls + [now]
    return True


def _conv_id(raw) -> str | None:
    """Safely convert raw conversation_id to string ObjectId or None."""
    try:
        return str(ObjectId(str(raw))) if raw else None
    except Exception:
        return None


def _save_conversation(family_id, user_id, conversation_id, user_msg, assistant_msg, actions=None, sources=None):
    """Upsert a conversation in ai_conversations. Returns the conversation _id as string."""
    try:
        now = datetime.now(timezone.utc)
        user_entry = {
            'role':      'user',
            'content':   user_msg,
            'timestamp': now.isoformat(),
        }
        assistant_entry = {
            'role':      'assistant',
            'content':   assistant_msg,
            'timestamp': now.isoformat(),
            'actions':   actions or [],
            'sources':   [{'title': s.get('title',''), 'url': s.get('url','')} for s in (sources or [])][:4],
        }
        cid = _conv_id(conversation_id)
        if cid:
            mongo.db.ai_conversations.update_one(
                {'_id': ObjectId(cid), 'family_id': family_id},
                {
                    '$push':        {'messages': {'$each': [user_entry, assistant_entry]}},
                    '$set':         {'updated_at': now},
                    '$setOnInsert': {'created_at': now},
                },
                upsert=True,
            )
            return cid
        else:
            title = user_msg[:40]
            result = mongo.db.ai_conversations.insert_one({
                'family_id':  family_id,
                'user_id':    user_id,
                'title':      title,
                'messages':   [user_entry, assistant_entry],
                'created_at': now,
                'updated_at': now,
            })
            return str(result.inserted_id)
    except Exception:
        return None

MODEL_PRIMARY  = 'llama-3.3-70b-versatile'
MODEL_FALLBACK = 'llama-3.1-70b-versatile'
MODEL_BASIC    = 'compound-beta'
MODEL_EXTRA1   = 'llama3-8b-8192'
MODEL_EXTRA2   = 'compound-beta-mini'
MODEL = MODEL_PRIMARY
VALID_CATEGORIES = {'ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר'}
VALID_TASK_CATS  = {'ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר'}

# Gemini model list — real models only, ordered by preference
GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
]

# Short conversational phrases that don't need web search
_CONVERSATIONAL_RE = re.compile(
    r'^(?:שלום|היי|הי|בוקר\s+טוב|ערב\s+טוב|לילה\s+טוב|תודה|בסדר|כן|לא|אוקי|אוקיי|'
    r'נכון|מגניב|יופי|סבבה|ברור|וואו|מעולה|כן\s+בבקשה|תודה\s+רבה|'
    r'עזור\s+לי|עזרי\s+לי|המשך|תמשיך|מה\s+שלומך|מה\s+שלום|שלומך|בבקשה)[\s!?.]*$',
    re.IGNORECASE
)

# Patterns for operations that should require explicit user confirmation
_DESTRUCTIVE_RE = re.compile(
    r'(?:מחק|תמחק|נקה|תנקה|הסר|תסיר|ביטול|בטל)\s+(?:הכל|כל\s+ה|את\s+כל|הרשימה\s+כולה|כולם)',
    re.IGNORECASE
)


def _get_family_context(user):
    """Query DB for lightweight family snapshot to inject into system prompt."""
    try:
        family_id = user.get('family_id', '')
        if not family_id:
            return ''
        now       = datetime.now(timezone.utc)
        today_str = now.strftime('%Y-%m-%d')
        week_str  = (now + timedelta(days=7)).strftime('%Y-%m-%d')

        events = list(mongo.db.events.find(
            {'family_id': family_id, 'date': {'$gte': today_str, '$lte': week_str}}
        ).sort('date', 1).limit(5))
        tasks_count    = mongo.db.tasks.count_documents({'family_id': family_id, 'status': 'pending'})
        shopping_count = mongo.db.shopping_items.count_documents({'family_id': family_id, 'done': False})
        members        = list(mongo.db.users.find({'family_id': family_id}, {'name': 1, '_id': 0}))

        parts = []
        if members:
            names = [m.get('name', '').split()[0] for m in members if m.get('name')]
            if names:
                parts.append(f'בני המשפחה: {", ".join(names)}')
        if events:
            ev_strs = []
            for e in events:
                s = e.get('emoji', '📅') + ' ' + e.get('title', '')
                if e.get('time'):
                    s += f' ב-{e["time"]}'
                s += f' ({e.get("date", "")})'
                ev_strs.append(s)
            parts.append(f'אירועים אמיתיים בדאטאבייס (דווח רק עליהם, אל תוסיף): {" | ".join(ev_strs)}')
        else:
            parts.append('אירועים: אין אירועים קרובים ביומן (אל תמציא)')
        if tasks_count:
            parts.append(f'משימות פתוחות: {tasks_count}')
        if shopping_count:
            parts.append(f'פריטים לקנייה: {shopping_count}')

        return '\n'.join(parts)
    except Exception:
        return ''

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
            resp = _tavily_client.search(query, max_results=max_r, include_answer=True, include_images=True)
            results = []
            for r in resp.get('results', []):
                results.append({
                    'title':   r.get('title', ''),
                    'url':     r.get('url', ''),
                    'content': r.get('content', '')[:500],
                })
            images = [img for img in (resp.get('images') or []) if isinstance(img, str)][:6]
            return {
                'query':   query,
                'answer':  resp.get('answer', ''),
                'results': results,
                'images':  images,
            }
        except Exception as e:
            return {'error': str(e)}

    # ── Shopping ──────────────────────────────────────────────────────────
    if name == 'add_shopping_items':
        # Dedup: check what's already in the list
        existing = {
            i['name'].strip().lower()
            for i in mongo.db.shopping_items.find(
                {'family_id': family_id, 'done': False}, {'name': 1}
            )
        }
        docs    = []
        skipped = []
        for item in (args.get('items') or [])[:20]:
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
                'added_by':   user.get('name', '').split()[0] or 'AI',
                'created_at': now,
            })
            existing.add(iname.lower())
        if docs:
            mongo.db.shopping_items.insert_many(docs)
        return {'added': len(docs), 'items': [d['name'] for d in docs], 'skipped': skipped}

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

SYSTEM_PROMPT = """אתה עוזר המשפחה — AI חכם ועם אופי אמיתי. מדבר עברית כמו בן אדם, לא כמו מדריך למשתמש.

האישיות שלך:
אתה חכם וידוע זאת, אבל לא יהיר. מדבר ישיר, קצר כשאפשר, מעמיק כשצריך. יש לך חוש הומור — עדין, חד, בזמן הנכון. אתה מביע דעות אמיתיות. אתה לא מתחיל תשובות ב"כמובן!" "בטח!" "שאלה מצוינת!" — זה מזויף ומעצבן.

═══════════════════════════════════════
🚨 CRITICAL RULES — NEVER BREAK THESE:
═══════════════════════════════════════

1. NEVER OUTPUT JSON — only plain Hebrew text with markdown.
   NEVER write {"action": ...} or any code/JSON as an answer.

2. NEVER INVENT FACTS — especially scores, results, dates, names, prices.
   If search results are provided in [...] brackets: cite ONLY what's there.
   If a specific fact (score, result, statistic) is NOT in the search results:
   → Say "לא מצאתי מידע מאומת על כך" and give a Google search link.
   NEVER guess, interpolate, or "complete" missing data.

3. NEVER INVENT FAMILY DATA — events, tasks, shopping items.
   Only report what appears in the family context. If none → "אין אירועים קרובים".

═══════════════════════════════════════
פורמט תשובה:
• ידע כללי (היסטוריה, מדע, אנשים): ענה מלא ובטוח — זה מה שיודע AI
• מידע עדכני (תוצאות ספורט, מחירים, חדשות): הסתמך אך ורק על תוצאות החיפוש ב[...]
  אם הן מכילות את התשובה — צטט ותן קישור [מקור](URL)
  אם לא מכילות — כתוב: "לא מצאתי תוצאה מאומתת — 🔍 [חפש ב-Google](https://www.google.com/search?q=TERMS)"
• תמיד בסוף תשובה פקטואלית: 🔍 [חפש ב-Google](https://www.google.com/search?q=SEARCH_TERMS)
  החלף SEARCH_TERMS במילות החיפוש המתאימות (באנגלית לספורט, עברית לשאר)

תאריך היום: {today}"""


# ─── Intent classifier (~200 tokens, understands any Hebrew phrasing) ────────

_INTENT_PROMPT = """ענה ב-JSON בלבד, ללא שום טקסט אחר.

זהה מה המשתמש רוצה מתוך האפשרויות:
add_task | add_shopping | delete_task | complete_task | get_tasks | get_shopping | other

הודעה: "{msg}"

חוקים:
- add_task: בקשה להוסיף/ליצור משימה → {{"intent":"add_task","title":"שם המשימה המדויק"}}
  ⚠️ שמור תחיליות ל׳ מ׳ ב׳ כחלק מהכותרת! "לתת נשיקה" ≠ "תת נשיקה". "לנקות" ≠ "נקות".
  דוגמה: "תצור משימה לתת נשיקה לדבורה" → {{"intent":"add_task","title":"לתת נשיקה לדבורה"}}
- add_shopping: בקשה להוסיף לקניות/לרשימה → {{"intent":"add_shopping","items":["פריט1","פריט2"]}}
- delete_task: בקשה למחוק משימה → {{"intent":"delete_task","title":"שם"}}
- complete_task: בקשה לסמן משימה כבוצע/הושלם → {{"intent":"complete_task","title":"שם"}}
- get_tasks: בקשה לראות/להציג משימות → {{"intent":"get_tasks"}}
- get_shopping: בקשה לראות רשימת קניות → {{"intent":"get_shopping"}}
- other: שאלה, תלונה, שיחה, מתכון, מידע, תיקון, כל דבר שאינו פקודה ישירה → {{"intent":"other"}}

JSON:"""


def _classify_and_execute(message, user):
    """Tiny LLM call (~80 tokens) to understand intent, then execute locally.
    Tries Groq first (faster), then Gemini as fallback."""
    raw = None
    prompt_msgs = [{'role': 'user', 'content': _INTENT_PROMPT.format(msg=message)}]

    if _groq_client:
        try:
            resp = _groq_client.chat.completions.create(
                model=MODEL_FALLBACK,
                messages=prompt_msgs,
                temperature=0,
                max_tokens=80,
            )
            raw = resp.choices[0].message.content.strip()
        except Exception:
            pass

    if not raw and _gemini_client:
        try:
            resp = _gemini_client.chat.completions.create(
                model='gemini-2.0-flash',
                messages=prompt_msgs,
                temperature=0,
                max_tokens=80,
            )
            raw = resp.choices[0].message.content.strip()
        except Exception:
            pass

    if not raw:
        return None, None

    try:
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


# ─── Fast regex parser (zero LLM calls — instant response) ───────────────────

def _keyword_parse_basic(message, user):
    """Zero-LLM regex for common commands — runs before any AI call for instant results."""
    msg = message.strip()

    # ── Shopping: "תוסיף X לקניות/לרשימה/לסופר" ──────────────────────────
    m = re.search(
        r'(?:תוסיף|הוסף|תכניס|הכנס|תרשום|רשום)\s+(.+?)\s+'
        r'(?:לקניות|לרשימ(?:ה|ת)(?:\s+(?:ה)?קניות)?|למכולת|לסופר|לחנות)',
        msg, re.IGNORECASE)
    if m:
        raw   = m.group(1).strip()
        items = [i.strip() for i in re.split(r'[,וְ\n]+', raw) if i.strip() and len(i.strip()) > 1]
        if items:
            result = execute_tool('add_shopping_items', {'items': [{'name': n} for n in items]}, user)
            if result.get('added', 0) > 0:
                names = ', '.join(result['items'])
                return f'🛒 נוסף לקניות: {names}', [{'tool': 'add_shopping_items', 'result': result}]

    # ── Task: "תוסיף/צור משימה X" ────────────────────────────────────────
    m = re.search(r'(?:תוסיף|הוסף|צור|תצור|תיצור)\s+(?:לי\s+)?משימה\s+(.+)', msg, re.IGNORECASE)
    if m:
        title = m.group(1).strip().rstrip('?!.')
        if title and len(title) > 1:
            result = execute_tool('create_task', {'title': title}, user)
            if result.get('created'):
                return f'✅ נוצרה משימה: **{title}**', [{'tool': 'create_task', 'result': result}]

    # ── Show tasks: "מה המשימות / תראה משימות" ───────────────────────────
    if re.search(r'(?:מה|תראה|הצג|תציג)\s+(?:ה)?משימות|(?:אילו|יש)\s+משימות', msg, re.IGNORECASE):
        result = execute_tool('get_tasks', {}, user)
        tasks  = result.get('tasks', [])
        if not tasks:
            return 'אין משימות פתוחות כרגע 🎉', []
        lines = '\n'.join(f'• {t["title"]}' for t in tasks[:10])
        return f'📋 **משימות פתוחות ({len(tasks)}):**\n{lines}', []

    # ── Show shopping: "מה יש בקניות / תראה רשימה" ──────────────────────
    if re.search(r'(?:מה|תראה|הצג|תציג)\s+(?:יש\s+)?(?:ב)?(?:קניות|רשימ(?:ה|ת))|רשימת\s+קניות', msg, re.IGNORECASE):
        result = execute_tool('get_shopping_list', {}, user)
        items  = result.get('items', [])
        if not items:
            return 'רשימת הקניות ריקה 🛒', []
        lines = '\n'.join(f'{"✅" if i["done"] else "•"} {i["name"]}' for i in items[:15])
        return f'🛒 **רשימת קניות ({len(items)} פריטים):**\n{lines}', []

    # ── Show calendar/events: "מה יש השבוע/היום ביומן/לוח שנה/אירועים" ─
    _CALENDAR_QUERY_RE = re.compile(
        r'(?:'
        r'מה\s+(?:יש\s+)?(?:לנו\s+)?(?:ה)?(?:יום|מחר|השבוע|הערב|בשבוע|הקרוב|בחודש|הבא)(?:\s+ב)?(?:יומן|לוח|אירועים?)?|'
        r'מה\s+(?:יש\s+)?(?:לנו\s+)?(?:ב)?(?:יומן|לוח\s+שנה|אירועים?)|'
        r'(?:מה|אילו|יש)\s+(?:אירועים?|תאריכים?|פגישות?|ימי\s+הולדת)(?:\s+(?:קרובים?|בקרוב|השבוע|הקרובים?))?|'
        r'תראה\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:יומן|לוח\s+שנה|אירועים?|לוח)|'
        r'(?:ה)?יומן|אירועים\s+(?:קרובים?|השבוע)|מה\s+(?:יש\s+)?(?:לנו\s+)?(?:בתאריך|ב-)'
        r')',
        re.IGNORECASE
    )
    if _CALENDAR_QUERY_RE.search(msg):
        result = execute_tool('get_upcoming_events', {}, user)
        events = result.get('events', [])
        if not events:
            return '📅 אין אירועים קרובים ביומן שלכם.', []
        now_d  = datetime.now(timezone.utc)
        today  = now_d.strftime('%Y-%m-%d')
        tmrw   = (now_d + timedelta(days=1)).strftime('%Y-%m-%d')
        week   = (now_d + timedelta(days=7)).strftime('%Y-%m-%d')

        def _label(date_str):
            if date_str == today:  return 'היום'
            if date_str == tmrw:   return 'מחר'
            if date_str <= week:   return f'ב-{date_str}'
            return f'{date_str}'

        lines = []
        for e in events[:10]:
            d = e.get('date', '')
            t = f' ב-{e["time"]}' if e.get('time') else ''
            lines.append(f'{e.get("emoji","📅")} **{e.get("title","")}** — {_label(d)}{t}')
        header = f'📅 **אירועים קרובים ({len(events)}):**\n'
        return header + '\n'.join(lines), []

    return None, None


# Explicit Hebrew action verbs — only these allow tool use / classifier
_ACTION_RE = re.compile(
    r'(?:תוסיף|הוסף|תכניס|הכנס|צור|תצור|תיצור|להוסיף|לצור|תכתוב|'
    r'רשום|תרשום|הוסיפי|תוסיפי|הכניסי|תכניסי|קח|תקח|שים|תשים|'
    r'תמחק|מחק|הסר|תסיר|למחוק|להסיר|תבטל|בטל|מחקי|תמחקי|'
    r'סמן|תסמן|בצע|תבצע|השלם|תשלים|'
    r'תחפש|חפש|תחפשי|חפשי|'
    r'מה\s+(?:יש\s+)?(?:לנו\s+)?(?:ה)?(?:יום|מחר|השבוע|הערב)(?:\s+ב)?(?:יומן|אירועים?)?|'
    r'מה\s+(?:יש\s+)?(?:לנו\s+)?(?:ב)?(?:יומן|לוח\s+שנה|אירועים?)|'
    r'(?:מה|אילו|יש)\s+(?:אירועים?|תאריכים?|פגישות?)(?:\s+(?:קרובים?|בקרוב|השבוע))?|'
    r'תראה\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:יומן|לוח\s+שנה|אירועים?)|'
    r'מה\s+(?:יש\s+)?(?:ב)?(?:משימות|רשימ(?:ה|ת)|קניות)|'
    r'אשמח\s+(?:אם\s+)?(?:ש)?ת(?:וסיף|כניס|צור)|'
    r'(?:אני\s+)?(?:צריך|צריכה)\s+(?:ש)?(?:תוסיף|להוסיף)|'
    r'(?:צריך|צריכה|חסר|חסרה)\s+(?:לנו\s+)?(?:עוד\s+)?(?!ל(?:עשות|לעשות)))',
    re.IGNORECASE
)


# ─── Diagnostics endpoint ────────────────────────────────────────────────────

@ai_bp.route('/diagnose', methods=['GET'])
@require_auth
def ai_diagnose():
    """Test each AI provider and return status — no auth needed for debugging."""
    import sys
    results = {}

    # List available Groq models first (most reliable way)
    if _groq_client:
        try:
            models = _groq_client.models.list()
            results['groq_available_models'] = sorted([m.id for m in models.data])
        except Exception as e:
            results['groq_models_list_error'] = str(e)[:200]

    # Test Gemini — try many plausible current model names
    gemini_test_models = [
        # 2025-2026 stable releases
        'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
        'gemini-2.5-flash-001', 'gemini-2.5-pro-001',
        # 2026 generation (if released)
        'gemini-3.0-flash', 'gemini-3.5-flash', 'gemini-3.0-pro',
        # 2.0 stable
        'gemini-2.0-flash', 'gemini-2.0-flash-001',
        # Legacy previews from 2025
        'gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash-preview-04-17',
        'gemini-2.0-flash-exp', 'gemini-exp-1206',
    ]
    for label, client in [('gemini_key1', _gemini_client), ('gemini_key2', _gemini_client2)]:
        if not client:
            results[label] = 'no key'
            continue
        found = False
        for model in gemini_test_models:
            try:
                r = client.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': 'say ok'}],
                    max_tokens=5,
                )
                results[label] = f'OK ({model}): {r.choices[0].message.content}'
                found = True
                break
            except Exception as e:
                results[f'{label}_{model}'] = str(e)[:120]
        if not found:
            results[f'{label}_status'] = 'ALL FAILED'
        # Try to list Gemini models via the OpenAI-compat endpoint
        try:
            mlist = client.models.list()
            results[f'{label}_available'] = [m.id for m in mlist.data][:20]
        except Exception as e:
            results[f'{label}_list_error'] = str(e)[:120]

    # Test Groq — try many plausible current model names
    groq_test_models = [
        # Llama 4 (released 2025)
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'llama-4-maverick-17b-128e-instruct',
        'llama-4-scout-17b-16e-instruct',
        # Llama 3.x still active on Groq?
        'llama-3.1-70b-versatile', 'llama-3.1-8b-instant',
        'llama3-70b-8192', 'llama3-8b-8192',
        # Other providers on Groq
        'compound-beta', 'compound-beta-mini',
        'moonshotai/kimi-k2-instruct',
        # DeepSeek v3
        'deepseek-r1-distill-llama-70b', 'deepseek-r1',
        # Legacy
        'llama-3.3-70b-versatile', 'gemma2-9b-it',
    ]
    if _groq_client:
        for model in groq_test_models:
            try:
                r = _groq_client.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': 'say ok'}],
                    max_tokens=5,
                )
                results['groq'] = f'OK ({model}): {r.choices[0].message.content}'
                break
            except Exception as e:
                results[f'groq_{model}'] = str(e)[:120]
        if 'groq' not in results:
            results['groq_status'] = 'ALL FAILED'
    else:
        results['groq'] = 'no key'

    return jsonify(results), 200


# ─── Streaming chat endpoint ────────────────────────────────────────────────

@ai_bp.route('/chat/stream', methods=['POST'])
@require_auth
def ai_chat_stream():
    import sys as _sys

    def _instant_err(msg):
        def _g():
            yield f'data: {json.dumps({"type":"error","message":msg}, ensure_ascii=False)}\n\n'
        return Response(stream_with_context(_g()), content_type='text/event-stream',
                        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    if not _AI_AVAILABLE:
        return _instant_err('AI לא זמין — יש להגדיר מפתח API')

    user = request.current_user
    if not user.get('family_id'):
        return _instant_err('no family')

    if not _check_rate(str(user.get('family_id', ''))):
        return _instant_err('הגעת למגבלת הבקשות — נסה שוב עוד כמה שניות ⏳')

    body            = request.get_json() or {}
    message         = (body.get('message') or '').strip()
    history_raw     = body.get('history') or []
    conversation_id = body.get('conversation_id')

    def ev(obj):
        return f'data: {json.dumps(obj, ensure_ascii=False)}\n\n'

    def generate():
        if not message:
            yield ev({'type': 'error', 'message': 'הודעה ריקה'})
            return

        # Fast path: action verbs → instant done (no streaming needed)
        if _ACTION_RE.search(message):
            kw_reply, kw_actions = _keyword_parse_basic(message, user)
            if kw_reply:
                cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, kw_reply, kw_actions, [])
                yield ev({'type': 'done', 'reply': kw_reply, 'actions': kw_actions or [], 'sources': [], 'images': [], 'conversation_id': cid})
                return
            ci_reply, ci_actions = _classify_and_execute(message, user)
            if ci_reply:
                cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, ci_reply, ci_actions, [])
                yield ev({'type': 'done', 'reply': ci_reply, 'actions': ci_actions or [], 'sources': [], 'images': [], 'conversation_id': cid})
                return

        # Knowledge path: build message list with family context
        today_str   = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        system_text = SYSTEM_PROMPT.replace('{today}', today_str)
        fam_ctx     = _get_family_context(user)
        if fam_ctx:
            system_text += f'\n\nהקשר משפחתי (עדכני):\n{fam_ctx}'
        msgs = [{'role': 'system', 'content': system_text}]
        for h in history_raw[-20:]:
            if h.get('role') in ('user', 'assistant') and h.get('content'):
                msgs.append({'role': h['role'], 'content': str(h['content'])})
        msgs.append({'role': 'user', 'content': message})

        all_actions   = []
        sources       = []
        images_out    = []
        already_searched = False

        # Decide whether to pre-search:
        # Search for any factual/knowledge query that isn't a short conversational phrase.
        # This ensures the AI can answer ANY question, not just those matching specific keywords.
        _should_search = (
            _tavily_client and
            len(message) > 12 and
            not _CONVERSATIONAL_RE.match(message.strip())
        )

        # Detect query type for smarter search targeting
        _SPORTS_TERMS_RE = re.compile(
            r'(?:משחק|תוצאה|ניצחון|הפסד|גול|ליגה|מחזור|אליפות|כדורגל|כדורסל|טניס|'
            r'שחקן|מאמן|קבוצה|ברצלונה|ריאל|מנצ\'סטר|ליברפול|פריז|מ\.ס\.|הפועל|מכבי|'
            r'בייסבול|NFL|NBA|UEFA|FIFA|Champions|Premier|LaLiga|Serie|Bundesliga)',
            re.IGNORECASE
        )
        _NEWS_TERMS_RE = re.compile(
            r'(?:חדשות|מה קרה|מה קורה|עדכון|פוליטיקה|כלכלה|מזג אוויר|תאונה|'
            r'פיגוע|בחירות|ממשלה|כנסת|ביטחון|צבא|צה\"ל)',
            re.IGNORECASE
        )
        _is_sports_query = bool(_SPORTS_TERMS_RE.search(message))
        _is_news_query   = bool(_NEWS_TERMS_RE.search(message))

        _IL_SPORTS_DOMAINS = [
            'sport5.co.il', 'one.co.il', 'mako.co.il', 'ynet.co.il',
            'walla.co.il', 'sport1.co.il', 'globes.co.il',
        ]
        _INTL_SPORTS_DOMAINS = [
            'goal.com', 'bbc.com', 'espn.com', 'skysports.com',
            'football-italia.net', 'transfermarkt.com', 'sofascore.com',
            'flashscore.com', 'livescore.com', 'whoscored.com',
        ]
        _IL_NEWS_DOMAINS = [
            'ynet.co.il', 'walla.co.il', 'mako.co.il', 'haaretz.co.il',
            'maariv.co.il', 'israelhayom.co.il', 'kan.org.il',
        ]

        def _do_tavily_search(query, max_results=5, include_images=True):
            nonlocal already_searched, sources, images_out
            yield ev({'type': 'tool_start', 'name': 'web_search', 'query': query[:80]})
            yield ev({'type': 'status', 'text': f'🔍 מחפש: {query[:50]}...'})
            try:
                # Build smart search kwargs based on query type
                kwargs = {
                    'max_results':    max_results,
                    'include_answer': True,
                    'include_images': include_images,
                }
                if _is_sports_query:
                    kwargs['topic']           = 'news'
                    kwargs['include_domains'] = _IL_SPORTS_DOMAINS + _INTL_SPORTS_DOMAINS
                elif _is_news_query:
                    kwargs['topic']           = 'news'
                    kwargs['include_domains'] = _IL_NEWS_DOMAINS

                resp = _tavily_client.search(query, **kwargs)
                results_list = [
                    {'title': r.get('title', ''), 'url': r.get('url', ''), 'content': r.get('content', '')[:400]}
                    for r in resp.get('results', [])[:max_results]
                ]

                # For sports: if Hebrew search returned no results, retry in English
                if _is_sports_query and not results_list:
                    resp2 = _tavily_client.search(
                        query + ' latest result score 2026',
                        max_results=max_results,
                        include_answer=True,
                        topic='news',
                        include_domains=_INTL_SPORTS_DOMAINS,
                    )
                    results_list = [
                        {'title': r.get('title', ''), 'url': r.get('url', ''), 'content': r.get('content', '')[:400]}
                        for r in resp2.get('results', [])[:max_results]
                    ]
                    resp = resp2 if results_list else resp

                if include_images:
                    images_out = [img for img in (resp.get('images') or []) if isinstance(img, str)][:4]
                search_result = {
                    'query': query, 'answer': resp.get('answer', ''),
                    'results': results_list, 'images': images_out,
                }
                all_actions.append({'tool': 'web_search', 'result': search_result})
                if not sources:
                    sources = results_list
                yield ev({'type': 'tool_done', 'name': 'web_search', 'result': search_result})

                ctx = (
                    '⚠️ SEARCH RESULTS — cite ONLY these. Do NOT add facts not found here.\n'
                    'If the specific fact asked is not in these results → say "לא מצאתי מידע מאומת" and give a Google link.\n\n'
                )
                if resp.get('answer'):
                    ctx += f'תשובה מסוכמת: {resp["answer"]}\n\n'
                for i, r in enumerate(results_list[:5]):
                    ctx += f'[{i+1}] {r["title"]} | {r.get("url","")}\n{r["content"][:300]}\n\n'
                msgs.append({'role': 'user', 'content': f'[{ctx.strip()}]'})
                already_searched = True
            except Exception as se:
                print(f'[stream/search] {se!r}', file=_sys.stderr)

        yield ev({'type': 'status', 'text': '💭 מנסח תשובה...'})

        full_text = []
        streamed  = [False]

        # ── Path 1: Gemini Native with Google Search grounding ────────────────
        # This is the same technology Gemini.ai uses — real Google Search results
        if _gemini_native_available:
            try:
                # Build prompt: system + conversation history + user message
                today_str_g = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                native_sys  = SYSTEM_PROMPT.replace('{today}', today_str_g)
                fam_ctx_g   = _get_family_context(user)
                if fam_ctx_g:
                    native_sys += f'\n\nהקשר משפחתי:\n{fam_ctx_g}'

                # Flatten to single prompt with history
                parts = [native_sys + '\n\n']
                for h in history_raw[-10:]:
                    role = h.get('role', '')
                    content = h.get('content', '')
                    if role == 'user' and content:
                        parts.append(f'משתמש: {content}\n')
                    elif role == 'assistant' and content:
                        parts.append(f'עוזר: {content}\n')
                parts.append(f'משתמש: {message}\nעוזר:')
                native_prompt = ''.join(parts)

                yield ev({'type': 'status', 'text': '🔍 מחפש ב-Google...'})
                import google.generativeai as _gnai
                _gnai.configure(api_key=_GEMINI_KEY)
                # Try Gemini 2.0 tool name first, fall back to 1.5 name
                for _tool_name, _model_name in [
                    ('google_search', 'gemini-2.0-flash'),
                    ('google_search_retrieval', 'gemini-1.5-flash'),
                ]:
                    try:
                        _native_model = _gnai.GenerativeModel(
                            model_name=_model_name,
                            tools=_tool_name,
                        )
                        break
                    except Exception:
                        continue
                response = _native_model.generate_content(
                    native_prompt,
                    stream=True,
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
                    print('[stream] gemini-native with google-search: OK', file=_sys.stderr)
            except Exception as _ne:
                print(f'[stream] gemini-native failed: {_ne!r}', file=_sys.stderr)

        # ── Path 2: Tavily pre-search + OpenAI-compat Gemini/Groq ─────────────
        if not streamed[0]:
            if _should_search:
                yield from _do_tavily_search(message)

        def do_stream(clients, models):
            for client in clients:
                if not client:
                    continue
                for model in models:
                    try:
                        stream = client.chat.completions.create(
                            model=model, messages=msgs,
                            temperature=0.7, max_tokens=1024, stream=True,
                        )
                        got_content = False
                        for chunk in stream:
                            delta = ''
                            try:
                                delta = (chunk.choices[0].delta.content or '') if chunk.choices else ''
                            except Exception:
                                pass
                            if delta:
                                got_content = True
                                full_text.append(delta)
                                yield ev({'type': 'delta', 'text': delta})
                        if got_content:
                            streamed[0] = True
                            return
                        # Empty response from this model — try next
                        print(f'[stream] {model}: empty response, trying next', file=_sys.stderr)
                        continue
                    except Exception as me:
                        print(f'[stream] {model}: {me!r}', file=_sys.stderr)
                        continue

        if not streamed[0]:
            yield from do_stream([_gemini_client, _gemini_client2], GEMINI_MODELS)

        if not streamed[0] and _groq_client:
            yield from do_stream(
                [_groq_client],
                [MODEL_FALLBACK, MODEL_EXTRA2, 'llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'],
            )

        # Fallback: if nothing worked and we haven't searched yet — try search + one more attempt
        if not streamed[0] and _tavily_client and not already_searched:
            yield ev({'type': 'status', 'text': '🔍 מחפש מידע עדכני...'})
            yield from _do_tavily_search(message, max_results=3, include_images=False)
            if already_searched:
                full_text.clear()
                yield from do_stream([_gemini_client, _gemini_client2], GEMINI_MODELS[:2])
                if not streamed[0] and _groq_client:
                    yield from do_stream([_groq_client], [MODEL_FALLBACK])

        if streamed[0]:
            final_reply = ''.join(full_text).strip()
            if not final_reply:
                yield ev({'type': 'error', 'message': 'קיבלתי תשובה ריקה מה-AI — נסה שוב 🔄'})
                return
            # Detect if model output raw JSON tool-call instead of real answer
            _json_leak = re.match(r'^\s*[\{\}]|"action"\s*:', final_reply)
            if _json_leak:
                print(f'[stream] JSON leak detected, retrying without tool context', file=_sys.stderr)
                # Strip any prior search context and retry with explicit "answer only" instruction
                msgs_clean = [m for m in msgs if not (m.get('role') == 'user' and m.get('content', '').startswith('[⚠️'))]
                msgs_clean.append({'role': 'user', 'content': f'ענה בעברית רגילה (ללא JSON): {message}'})
                full_text.clear()
                streamed[0] = False
                def _do_clean_stream():
                    for client in [_gemini_client, _gemini_client2, _groq_client]:
                        if not client: continue
                        models = GEMINI_MODELS if client != _groq_client else [MODEL_FALLBACK]
                        for model in models:
                            try:
                                st = client.chat.completions.create(
                                    model=model, messages=msgs_clean,
                                    temperature=0.7, max_tokens=1024, stream=True,
                                )
                                got = False
                                for chunk in st:
                                    d = (chunk.choices[0].delta.content or '') if chunk.choices else ''
                                    if d:
                                        got = True
                                        full_text.append(d)
                                        yield ev({'type': 'delta', 'text': d})
                                if got:
                                    streamed[0] = True
                                    return
                            except Exception:
                                continue
                yield from _do_clean_stream()
                final_reply = ''.join(full_text).strip()

            if not final_reply:
                yield ev({'type': 'error', 'message': 'קיבלתי תשובה ריקה מה-AI — נסה שוב 🔄'})
                return
            cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, final_reply, all_actions, sources)
            yield ev({
                'type': 'done', 'reply': final_reply,
                'actions': all_actions, 'sources': sources, 'images': images_out,
                'conversation_id': cid,
            })
        else:
            yield ev({'type': 'error', 'message': 'הגענו לגבול השימוש — נסה שוב מחר 🌅'})

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={
            'Cache-Control':     'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection':        'keep-alive',
        },
    )


# ─── Agent streaming endpoint (new architecture) ────────────────────────────

@ai_bp.route('/agent/stream', methods=['POST'])
@require_auth
def agent_stream():
    """
    The new Agent endpoint.
    Replaces /chat/stream once fully validated.
    """
    import json as _json

    def _instant_err(msg):
        def _g():
            yield f'data: {_json.dumps({"type": "error", "message": msg}, ensure_ascii=False)}\n\n'
        return Response(stream_with_context(_g()), content_type='text/event-stream',
                        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    if not _AI_AVAILABLE:
        return _instant_err('AI לא זמין — יש להגדיר מפתח API')

    user = request.current_user
    if not user.get('family_id'):
        return _instant_err('no family')

    if not _check_rate(str(user.get('family_id', ''))):
        return _instant_err('הגעת למגבלת הבקשות — נסה שוב עוד כמה שניות ⏳')

    body            = request.get_json() or {}
    message         = (body.get('message') or '').strip()
    history         = body.get('history') or []
    conversation_id = body.get('conversation_id')

    def generate():
        try:
            from agent.core import get_agent
            agent = get_agent()
            yield from agent.run(message, user, conversation_id, history)
        except Exception as exc:
            import sys
            print(f'[agent/stream] uncaught: {exc!r}', file=sys.stderr)
            yield f'data: {_json.dumps({"type": "error", "message": "שגיאה פנימית — נסה שוב"}, ensure_ascii=False)}\n\n'

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={
            'Cache-Control':     'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection':        'keep-alive',
        },
    )


# ─── Chat endpoint ──────────────────────────────────────────────────────────

@ai_bp.route('/chat', methods=['POST'])
@require_auth
def ai_chat():
    if not _AI_AVAILABLE:
        return jsonify({'error': 'ai_unavailable', 'message': 'יש להגדיר GROQ_API_KEY.'}), 503

    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    if not _check_rate(str(user.get('family_id', ''))):
        return jsonify({'error': 'rate_limit', 'message': 'הגעת למגבלת הבקשות — נסה שוב עוד כמה שניות ⏳'}), 429

    data            = request.get_json() or {}
    message         = (data.get('message') or '').strip()
    history         = data.get('history') or []
    conversation_id = data.get('conversation_id')

    # Only allow tools/classifier when message has an explicit action verb.
    # Questions, complaints, corrections → text-only path (zero Groq tokens).
    frontend_no_tools = data.get('no_tools', False)
    use_tools = bool(_ACTION_RE.search(message)) and not frontend_no_tools

    if use_tools:
        # Fast path: pure regex, zero LLM calls — instant for common commands
        kw_reply, kw_actions = _keyword_parse_basic(message, user)
        if kw_reply:
            cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, kw_reply, kw_actions, [])
            return jsonify({'reply': kw_reply, 'actions': kw_actions or [], 'conversation_id': cid}), 200
        # Fallback: LLM classifier for complex phrasing (~80 tokens, fast)
        ci_reply, ci_actions = _classify_and_execute(message, user)
        if ci_reply:
            cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, ci_reply, ci_actions, [])
            return jsonify({'reply': ci_reply, 'actions': ci_actions or [], 'conversation_id': cid}), 200

    if not message:
        return jsonify({'error': 'missing_message'}), 400

    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    system    = SYSTEM_PROMPT.replace('{today}', today_str)
    fam_ctx   = _get_family_context(user)
    if fam_ctx:
        system += f'\n\nהקשר משפחתי (עדכני):\n{fam_ctx}'

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

    def _call_with_fallback(**kwargs):
        import sys
        simple = {k: v for k, v in kwargs.items() if k not in ('tools', 'tool_choice')}
        no_web_kwargs = {**kwargs}
        if 'tools' in no_web_kwargs:
            no_web_kwargs['tools'] = [t for t in no_web_kwargs['tools'] if t['function']['name'] != 'web_search']

        # Tier 1: try all Gemini models with both API keys
        # Try with full kwargs (tools) first; fall back to simple if model rejects them
        for gclient, glabel in [(_gemini_client, 'key1'), (_gemini_client2, 'key2')]:
            if not gclient:
                continue
            for gmodel in GEMINI_MODELS:
                try:
                    try:
                        resp = gclient.chat.completions.create(model=gmodel, **kwargs)
                    except Exception:
                        resp = gclient.chat.completions.create(model=gmodel, **simple)
                    return resp, gmodel
                except Exception as e:
                    print(f'[AI] Gemini {gmodel} ({glabel}) failed: {e!r}', file=sys.stderr)
                    continue

        # Tier 2: Groq — try every model before giving up
        if _groq_client:
            for model, kw in [
                (MODEL_PRIMARY,  kwargs),
                (MODEL_FALLBACK, kwargs),
                (MODEL_BASIC,    no_web_kwargs),
                (MODEL_EXTRA1,   no_web_kwargs),
                (MODEL_EXTRA2,   no_web_kwargs),
            ]:
                try:
                    return _call(model, **kw), model
                except Exception as e:
                    err_str = str(e).lower()
                    print(f'[AI] {model} failed: {e!r}', file=sys.stderr)
                    if 'invalid_api_key' in err_str or 'invalid api key' in err_str:
                        raise Exception('שגיאת הגדרות AI — מפתח API שגוי')
                    continue

        raise Exception('הגענו לגבול השימוש היומי — נסה שוב מחר בבוקר 🌅')

    try:
        if use_tools:
            response, used_model = _call_with_fallback(
                messages=messages,
                tools=TOOLS,
                tool_choice='auto',
                temperature=0.6,
                max_tokens=2048,
            )
        else:
            # No tools — text only. Saves Groq tokens, prevents accidental tool calls.
            response, used_model = _call_with_fallback(
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
            )

        choice = response.choices[0]

        if use_tools and choice.message.tool_calls:
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
            reply = (choice.message.content or '').strip()
            if not reply:
                reply = 'לא הצלחתי לנסח תשובה, נסה שוב.'

        cid = _save_conversation(user['family_id'], str(user['_id']), conversation_id, message, reply, actions, [])
        return jsonify({'reply': reply, 'actions': actions, 'conversation_id': cid}), 200

    except Exception as e:
        err = str(e)
        # Last resort: keyword parsing only for action messages
        if use_tools:
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


# ─── Conversation persistence endpoints ────────────────────────────────────

@ai_bp.route('/conversations', methods=['GET'])
@require_auth
def list_conversations():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'conversations': []}), 200
    convs = list(
        mongo.db.ai_conversations
        .find({'family_id': user['family_id']}, {'messages': 0})
        .sort('updated_at', -1)
        .limit(20)
    )
    return jsonify({'conversations': [
        {
            'id':         str(c['_id']),
            'title':      c.get('title', ''),
            'updated_at': c.get('updated_at', c.get('created_at', '')).isoformat() if hasattr(c.get('updated_at', ''), 'isoformat') else str(c.get('updated_at', '')),
            'created_at': c.get('created_at', '').isoformat() if hasattr(c.get('created_at', ''), 'isoformat') else str(c.get('created_at', '')),
        }
        for c in convs
    ]}), 200


@ai_bp.route('/conversations/<conv_id>', methods=['GET'])
@require_auth
def get_conversation(conv_id):
    user = request.current_user
    try:
        conv = mongo.db.ai_conversations.find_one(
            {'_id': ObjectId(conv_id), 'family_id': user.get('family_id', '')}
        )
    except Exception:
        return jsonify({'error': 'not_found'}), 404
    if not conv:
        return jsonify({'error': 'not_found'}), 404
    return jsonify({
        'id':       str(conv['_id']),
        'title':    conv.get('title', ''),
        'messages': conv.get('messages', []),
    }), 200


@ai_bp.route('/conversations/<conv_id>', methods=['DELETE'])
@require_auth
def delete_conversation(conv_id):
    user = request.current_user
    try:
        mongo.db.ai_conversations.delete_one(
            {'_id': ObjectId(conv_id), 'family_id': user.get('family_id', '')}
        )
    except Exception:
        pass
    return jsonify({'deleted': True}), 200


# ─── Feedback endpoint ──────────────────────────────────────────────────────

@ai_bp.route('/feedback', methods=['POST'])
@require_auth
def ai_feedback():
    user = request.current_user
    data = request.get_json() or {}
    rating = data.get('rating')
    if rating not in (1, -1):
        return jsonify({'error': 'rating must be 1 or -1'}), 400
    try:
        mongo.db.ai_feedback.insert_one({
            'family_id':       user.get('family_id', ''),
            'user_id':         str(user['_id']),
            'message_id':      str(data.get('message_id', '')),
            'conversation_id': str(data.get('conversation_id', '')),
            'rating':          rating,
            'created_at':      datetime.now(timezone.utc),
        })
    except Exception:
        pass
    return jsonify({'ok': True}), 200


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

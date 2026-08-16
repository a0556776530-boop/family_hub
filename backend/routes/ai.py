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

MODEL = 'llama-3.3-70b-versatile'

VALID_CATEGORIES = {'ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר'}

# ─── Tool definitions for Groq ─────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "add_shopping_items",
            "description": "מוסיף פריטים לרשימת הקניות של המשפחה. השתמש בכלי הזה כשהמשתמש מבקש להוסיף משהו לקניות, מזכיר מתכון, ארוחה, או כל צורך שמצריך קניית מוצרים.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "description": "רשימת הפריטים להוספה",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name":     {"type": "string",  "description": "שם הפריט בעברית"},
                                "quantity": {"type": "number",  "description": "כמות (ברירת מחדל 1)"},
                                "unit":     {"type": "string",  "description": "יחידה: גר/קג/מל/ל/יח/אריזה או ריק"},
                                "category": {"type": "string",  "description": "אחת מ: ירקות, פירות, מזון, ניקיון, פארם, תינוקות, אחר"}
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
            "name": "get_upcoming_events",
            "description": "מחזיר את האירועים הקרובים ביומן המשפחתי. השתמש כשהמשתמש שואל על לוח הזמנים, מה יש השבוע, מה קורה, וכו'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {
                        "type": "integer",
                        "description": "כמה ימים קדימה לחפש (ברירת מחדל 7)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": "יוצר אירוע חדש ביומן המשפחתי.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":    {"type": "string", "description": "שם האירוע"},
                    "date":     {"type": "string", "description": "תאריך בפורמט YYYY-MM-DD"},
                    "time":     {"type": "string", "description": "שעה בפורמט HH:MM (אופציונלי)"},
                    "location": {"type": "string", "description": "מיקום (אופציונלי)"},
                    "emoji":    {"type": "string", "description": "אמוג'י מתאים לאירוע"}
                },
                "required": ["title", "date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_tasks",
            "description": "מחזיר את המשימות הפתוחות של המשפחה.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "יוצר משימה חדשה לבית.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":       {"type": "string", "description": "תיאור המשימה"},
                    "priority":    {"type": "string", "description": "עדיפות: low/medium/high"},
                    "category":    {"type": "string", "description": "קטגוריה: ניקיון/מטבח/לימודים/סידורים/קניות/תחזוקת הבית/אחר"},
                    "due_date":    {"type": "string", "description": "תאריך יעד YYYY-MM-DD (אופציונלי)"}
                },
                "required": ["title"]
            }
        }
    }
]

SYSTEM_PROMPT = """אתה עוזר AI חכם, ידידותי ורב-עוצמה — כמו Grok או Gemini — אבל מותאם לעברית ולמשפחה הישראלית.

אתה יכול לעזור בכל דבר:
• לענות על כל שאלה — מדע, היסטוריה, טכנולוגיה, בריאות, משפט, כלכלה, ספורט
• מתכונים מפורטים עם כמויות ושלבים
• תכנון טיולים ורשימות ציוד
• עצות לחינוך ילדים, זוגיות, עבודה
• ניתוח, כתיבה, תרגום, הסבר מושגים
• כל שאלה שתבוא — תענה עליה

ובנוסף, יש לך כלים לניהול הבית:
🛒 הוספה ישירה לרשימת קניות
📅 צפייה ויצירת אירועים ביומן המשפחתי
✅ צפייה ויצירת משימות בבית

כללי השימוש בכלים:
- כשמשתמש מבקש להוסיף פריטים ספציפיים לקניות → השתמש בכלי add_shopping_items עם הפריטים שציין
- כשמשתמש מבקש לראות היומן → השתמש בכלי get_upcoming_events
- כשמשתמש מבקש ליצור אירוע → השתמש בכלי create_event
- כשמשתמש מבקש לראות משימות → השתמש בכלי get_tasks
- כשמשתמש מבקש ליצור משימה → השתמש בכלי create_task
- אם המשתמש שואל "מה צריך לפיצה?" — ענה עם מתכון/רשימה, ושאל אם להוסיף לקניות
- אם המשתמש אומר "תוסיף לקניות" בלי לציין מה — שאל "מה תרצה להוסיף?"
- אל תמציא פריטים שלא ביקשו

סגנון:
- עברית טבעית, חמה, חכמה ובוטחת
- תשובות מלאות ומועילות — לא קצר מדי כשהשאלה מצדיקה תשובה ארוכה
- אחרי שימוש בכלי — ספר בפשטות מה עשית, בלי לציין "כלי" או "פונקציה"

תאריך היום: {today}"""


# ─── Tool executor ──────────────────────────────────────────────────────────

def execute_tool(name, args, user):
    family_id = user['family_id']
    now = datetime.now(timezone.utc)

    if name == 'add_shopping_items':
        docs = []
        for item in (args.get('items') or [])[:20]:
            item_name = str(item.get('name', '')).strip()[:100]
            if not item_name:
                continue
            cat = item.get('category', 'אחר')
            if cat not in VALID_CATEGORIES:
                cat = 'אחר'
            docs.append({
                'family_id':  family_id,
                'name':       item_name,
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

    elif name == 'get_upcoming_events':
        days = int(args.get('days_ahead', 7))
        today_str = now.strftime('%Y-%m-%d')
        events = list(mongo.db.events.find(
            {'family_id': family_id, 'date': {'$gte': today_str}}
        ).sort('date', 1).limit(10))
        result = []
        for e in events:
            result.append({
                'title': e.get('title', ''),
                'date':  e.get('date', ''),
                'time':  e.get('time', ''),
                'emoji': e.get('emoji', '📅'),
                'location': e.get('location', ''),
            })
        return {'events': result, 'count': len(result)}

    elif name == 'create_event':
        title = str(args.get('title', '')).strip()
        date  = str(args.get('date', '')).strip()
        if not title or not date:
            return {'error': 'missing title or date'}
        result = mongo.db.events.insert_one({
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

    elif name == 'get_tasks':
        tasks = list(mongo.db.tasks.find(
            {'family_id': family_id, 'status': 'pending'}
        ).sort('created_at', -1).limit(10))
        result = []
        for t in tasks:
            result.append({
                'title':    t.get('title', ''),
                'priority': t.get('priority', 'medium'),
                'due_date': t.get('due_date', ''),
                'category': t.get('category', ''),
            })
        return {'tasks': result, 'count': len(result)}

    elif name == 'create_task':
        title = str(args.get('title', '')).strip()
        if not title:
            return {'error': 'missing title'}
        priority = args.get('priority', 'medium')
        if priority not in ('low', 'medium', 'high'):
            priority = 'medium'
        valid_cats = {'ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר'}
        category = args.get('category', 'אחר')
        if category not in valid_cats:
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

    return {'error': f'unknown tool: {name}'}


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

    # Build messages: system + last 20 turns of history + new user message
    messages = [{'role': 'system', 'content': system}]
    for h in history[-20:]:
        if h.get('role') in ('user', 'assistant') and h.get('content'):
            messages.append({'role': h['role'], 'content': str(h['content'])})
    messages.append({'role': 'user', 'content': message})

    actions = []

    try:
        # First call — may return tool calls
        response = _groq_client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice='auto',
            temperature=0.6,
            max_tokens=2048,
        )

        choice = response.choices[0]

        # Handle tool calls
        if choice.message.tool_calls:
            # Serialize the assistant message as a plain dict (Groq requires this)
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

            # Second call — get the natural language reply
            final = _groq_client.chat.completions.create(
                model=MODEL,
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


# ─── Legacy shopping endpoint (kept for backward compat) ───────────────────

SHOPPING_SYSTEM_PROMPT = """אתה עוזר קניות חכם לאפליקציה משפחתית ישראלית.
החזר JSON בלבד — ללא טקסט, הסברים או markdown.
פורמט: [{"name":"שם בעברית","category":"מזון","quantity":1,"unit":""}]
קטגוריות: ירקות, פירות, מזון, ניקיון, פארם, תינוקות, אחר
יחידות: גר, קג, מל, ל, יח, אריזה"""


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
            name = str(item.get('name', '')).strip()[:100]
            if not name:
                continue
            cat = item.get('category', 'אחר')
            if cat not in VALID_CATEGORIES:
                cat = 'אחר'
            docs.append({
                'family_id':  user['family_id'],
                'name':       name,
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

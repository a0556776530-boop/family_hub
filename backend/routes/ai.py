import os
import json
import re
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from bson import ObjectId
from app import mongo
from utils.jwt_utils import require_auth

ai_bp = Blueprint('ai', __name__)

_PREFERRED_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-pro',
]

def _pick_model(client):
    try:
        available = [m.name.replace('models/', '') for m in client.models.list()]
        for preferred in _PREFERRED_MODELS:
            for name in available:
                if preferred in name:
                    return name
    except Exception:
        pass
    return _PREFERRED_MODELS[0]

try:
    from google import genai as _genai_sdk
    _GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
    if _GEMINI_KEY:
        _genai_client = _genai_sdk.Client(api_key=_GEMINI_KEY)
        _GEMINI_MODEL = _pick_model(_genai_client)
        _AI_AVAILABLE = True
    else:
        _AI_AVAILABLE = False
except Exception:
    _AI_AVAILABLE = False

SYSTEM_PROMPT = """אתה עוזר קניות חכם לאפליקציה משפחתית ישראלית.

כשהמשתמש מזכיר מתכון ספציפי (כמו "עוגת גבינה", "לזניה", "מוסקה", "פסטה בולונז" וכדומה):
- זהה את המתכון הפופולרי הקלאסי
- ספק את המצרכים המדויקים עם כמויות ריאליות לארוחה משפחתית (4-6 מנות)

כשהמשתמש מתאר ארוחה כללית (כמו "ארוחת שישי", "ברביקיו", "ארוחת בוקר"):
- ספק רשימת קניות מלאה ומעשית לאותה ארוחה

כשהמשתמש מתאר צורך כללי (כמו "ניקיון הבית", "ילד חולה"):
- ספק את המוצרים הרלוונטיים ביותר

כללים:
- שמות מוצרים תמיד בעברית
- כמויות ריאליות (לא "1 קג עגבנייה" לפיצה — "500 גר")
- מוצרים שקיימים בסופר ישראלי רגיל (רמי לוי, שופרסל, ויקטורי)
- החזר JSON בלבד — ללא טקסט, הסברים או markdown

פורמט מדויק:
[{"name":"שם המוצר","category":"מזון","quantity":500,"unit":"גר"}]

קטגוריות: ירקות, פירות, מזון, ניקיון, פארם, תינוקות, אחר
יחידות: גר, קג, מל, ל, יח, אריזה, כוס, כף, כפית"""


@ai_bp.route('/shopping', methods=['POST'])
@require_auth
def ai_shopping():
    if not _AI_AVAILABLE:
        return jsonify({'error': 'ai_unavailable', 'message': 'שירות ה-AI אינו מופעל. יש להגדיר GEMINI_API_KEY.'}), 503

    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data = request.get_json() or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'missing_text'}), 400
    if len(text) > 500:
        return jsonify({'error': 'too_long'}), 400

    try:
        response = _genai_client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=f"{SYSTEM_PROMPT}\n\nבקשת המשתמש: {text}"
        )
        raw = response.text.strip()

        # Strip markdown code fences if present
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        items_data = json.loads(raw)
        if not isinstance(items_data, list):
            raise ValueError('not a list')

        VALID_CATEGORIES = {'ירקות', 'פירות', 'מזון', 'ניקיון', 'פארם', 'תינוקות', 'אחר'}
        now = datetime.now(timezone.utc)
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
        return jsonify({'error': 'parse_error', 'message': 'לא הצלחתי לפרש את הבקשה, נסה שוב'}), 422
    except Exception as e:
        return jsonify({'error': 'ai_error', 'message': str(e)}), 500

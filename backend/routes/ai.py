import os
import json
import re
from flask import Blueprint, request, jsonify
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

SYSTEM_PROMPT = """אתה עוזר קניות חכם לאפליקציה משפחתית ישראלית.

כשהמשתמש מזכיר מתכון ספציפי (כמו "עוגת גבינה", "לזניה", "פסטה בולונז"):
- זהה את המתכון הפופולרי הקלאסי
- ספק את המצרכים המדויקים עם כמויות ריאליות לארוחה משפחתית (4-6 מנות)

כשהמשתמש מתאר ארוחה כללית (כמו "ארוחת שישי", "ברביקיו", "ארוחת בוקר"):
- ספק רשימת קניות מלאה ומעשית

כשהמשתמש מתאר צורך כללי (כמו "ניקיון הבית", "טיול לאילת", "ילד חולה"):
- ספק את המוצרים הרלוונטיים ביותר

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
            model='llama-3.1-8b-instant',
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': text},
            ],
            temperature=0.3,
            max_tokens=1024,
        )
        raw = completion.choices[0].message.content.strip()

        match = re.search(r'\[[\s\S]*\]', raw)
        raw = match.group(0) if match else raw

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
        return jsonify({'error': 'parse_error', 'message': 'לא הצלחתי לפרש, נסה שוב'}), 422
    except Exception as e:
        return jsonify({'error': 'ai_error', 'message': str(e)}), 500

import os
import json
import re
import requests as _requests
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth

ai_bp = Blueprint('ai', __name__)

_GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
_AI_AVAILABLE = bool(_GEMINI_KEY)

_MODELS_TO_TRY = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-pro',
]

SYSTEM_PROMPT = """אתה עוזר קניות חכם לאפליקציה משפחתית ישראלית.

כשהמשתמש מזכיר מתכון ספציפי (כמו "עוגת גבינה", "לזניה", "פסטה בולונז"):
- זהה את המתכון הפופולרי הקלאסי
- ספק את המצרכים המדויקים עם כמויות ריאליות לארוחה משפחתית (4-6 מנות)

כשהמשתמש מתאר ארוחה כללית (כמו "ארוחת שישי", "ברביקיו"):
- ספק רשימת קניות מלאה ומעשית

כשהמשתמש מתאר צורך כללי (כמו "ניקיון הבית", "טיול לאילת", "ילד חולה"):
- ספק את המוצרים הרלוונטיים ביותר

החזר JSON בלבד — ללא טקסט, הסברים או markdown.
פורמט: [{"name":"שם בעברית","category":"מזון","quantity":1,"unit":""}]
קטגוריות: ירקות, פירות, מזון, ניקיון, פארם, תינוקות, אחר"""


def _list_available_models():
    try:
        r = _requests.get(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={_GEMINI_KEY}",
            timeout=10
        )
        models = r.json().get('models', [])
        return [
            m['name'].replace('models/', '')
            for m in models
            if 'generateContent' in m.get('supportedGenerationMethods', [])
        ]
    except Exception:
        return []


def _call_gemini(text):
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }

    # First try hardcoded list, then fall back to live model list
    available = _MODELS_TO_TRY + [
        m for m in _list_available_models() if m not in _MODELS_TO_TRY
    ]

    for model in available:
        for api_ver in ('v1beta', 'v1'):
            url = f"https://generativelanguage.googleapis.com/{api_ver}/models/{model}:generateContent?key={_GEMINI_KEY}"
            try:
                r = _requests.post(url, json=payload, timeout=30)
                if r.status_code == 200:
                    return r.json()['candidates'][0]['content']['parts'][0]['text']
            except Exception:
                continue
    raise RuntimeError('no working gemini model found')


@ai_bp.route('/models', methods=['GET'])
@require_auth
def list_models():
    models = _list_available_models()
    return jsonify({'models': models, 'key_set': bool(_GEMINI_KEY)}), 200


@ai_bp.route('/shopping', methods=['POST'])
@require_auth
def ai_shopping():
    if not _AI_AVAILABLE:
        return jsonify({'error': 'ai_unavailable', 'message': 'יש להגדיר GEMINI_API_KEY.'}), 503

    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data = request.get_json() or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'missing_text'}), 400

    try:
        raw = _call_gemini(text).strip()
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
        return jsonify({'error': 'parse_error', 'message': 'לא הצלחתי לפרש, נסה שוב'}), 422
    except Exception as e:
        return jsonify({'error': 'ai_error', 'message': str(e)}), 500

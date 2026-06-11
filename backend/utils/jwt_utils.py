import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, current_app
from bson import ObjectId

def generate_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=current_app.config['JWT_EXPIRY_DAYS'])
    }
    return jwt.encode(payload, current_app.config['JWT_SECRET'], algorithm='HS256')

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, current_app.config['JWT_SECRET'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'token_missing'}), 401

        token = auth_header.split(' ', 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'token_invalid'}), 401

        from app import mongo
        user = mongo.db.users.find_one({'_id': ObjectId(payload['sub'])})
        if not user:
            return jsonify({'error': 'user_not_found'}), 401

        request.current_user = user
        return f(*args, **kwargs)
    return decorated

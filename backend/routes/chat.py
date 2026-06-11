from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo, socketio
from utils.jwt_utils import require_auth
from flask_socketio import join_room, emit

chat_bp = Blueprint('chat', __name__)

def message_public(m):
    return {
        'id':         str(m['_id']),
        'sender_id':  m['sender_id'],
        'sender_name': m.get('sender_name', ''),
        'avatar_url': m.get('avatar_url', ''),
        'content':    m['content'],
        'type':       m.get('type', 'text'),
        'created_at': m['created_at'].isoformat() if isinstance(m.get('created_at'), datetime) else m.get('created_at'),
    }

@chat_bp.route('/messages', methods=['GET'])
@require_auth
def get_messages():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403
    msgs = list(mongo.db.messages.find(
        {'family_id': user['family_id']}
    ).sort('created_at', -1).limit(50))
    msgs.reverse()
    return jsonify({'messages': [message_public(m) for m in msgs]}), 200

# ── SocketIO events ──────────────────────────────────────────────
@socketio.on('join_family')
def on_join(data):
    family_id = data.get('family_id')
    if family_id:
        join_room(family_id)

@socketio.on('send_message')
def on_message(data):
    family_id = data.get('family_id')
    if not family_id:
        return

    result = mongo.db.messages.insert_one({
        'family_id':   family_id,
        'sender_id':   data.get('sender_id'),
        'sender_name': data.get('sender_name', ''),
        'avatar_url':  data.get('avatar_url', ''),
        'content':     data.get('content', ''),
        'type':        'text',
        'created_at':  datetime.now(timezone.utc),
    })
    msg = mongo.db.messages.find_one({'_id': result.inserted_id})
    emit('new_message', message_public(msg), room=family_id)

@socketio.on('typing')
def on_typing(data):
    family_id = data.get('family_id')
    if family_id:
        emit('user_typing', {'name': data.get('name')}, room=family_id, include_self=False)

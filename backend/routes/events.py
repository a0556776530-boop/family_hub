from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth

events_bp = Blueprint('events', __name__)

def event_public(e):
    return {
        'id':         str(e['_id']),
        'family_id':  e['family_id'],
        'title':      e['title'],
        'date':       e.get('date'),
        'time':       e.get('time', ''),
        'location':   e.get('location', ''),
        'emoji':      e.get('emoji', '📅'),
        'type':       e.get('type', 'general'),
        'created_by': e.get('created_by'),
    }

@events_bp.route('/', methods=['GET'])
@require_auth
def get_events():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    events = list(mongo.db.events.find(
        {'family_id': user['family_id']}
    ).sort('date', 1))
    return jsonify({'events': [event_public(e) for e in events]}), 200


@events_bp.route('/', methods=['POST'])
@require_auth
def create_event():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data  = request.get_json() or {}
    title = (data.get('title') or '').strip()
    date  = (data.get('date') or '').strip()
    if not title or not date:
        return jsonify({'error': 'missing_fields', 'message': 'כותרת ותאריך הם שדות חובה'}), 400

    result = mongo.db.events.insert_one({
        'family_id':  user['family_id'],
        'title':      title,
        'date':       date,
        'time':       data.get('time', ''),
        'location':   data.get('location', ''),
        'emoji':      data.get('emoji', '📅'),
        'type':       data.get('type', 'general'),
        'created_by': str(user['_id']),
        'created_at': datetime.now(timezone.utc),
    })

    event = mongo.db.events.find_one({'_id': result.inserted_id})
    return jsonify({'event': event_public(event)}), 201


@events_bp.route('/<event_id>', methods=['DELETE'])
@require_auth
def delete_event(event_id):
    user  = request.current_user
    event = mongo.db.events.find_one({'_id': ObjectId(event_id), 'family_id': user.get('family_id')})
    if not event:
        return jsonify({'error': 'not_found'}), 404

    is_admin   = user.get('role') == 'admin'
    is_creator = event.get('created_by') == str(user['_id'])
    if not (is_admin or is_creator):
        return jsonify({'error': 'forbidden'}), 403

    mongo.db.events.delete_one({'_id': ObjectId(event_id)})
    return jsonify({'message': 'האירוע נמחק'}), 200

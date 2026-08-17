import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app import mongo
from utils.jwt_utils import require_auth
from utils.helpers import normalize_role

location_bp = Blueprint('location', __name__)

try:
    mongo.db.devices.create_index('user_id')
    mongo.db.locations.create_index('user_id', unique=True)
except Exception:
    pass


def _is_uuid4(value):
    try:
        return str(uuid.UUID(str(value), version=4)).lower() == str(value).lower()
    except (ValueError, AttributeError, TypeError):
        return False


@location_bp.route('/devices/register', methods=['POST'])
@require_auth
def register_device():
    user = request.current_user
    data = request.get_json() or {}
    device_id = data.get('device_id')
    platform  = data.get('platform')

    if not _is_uuid4(device_id):
        return jsonify({'error': 'invalid_device_id', 'message': 'מזהה מכשיר לא תקין'}), 400
    if platform not in ('android', 'ios', 'web'):
        return jsonify({'error': 'invalid_platform', 'message': 'פלטפורמה לא תקינה'}), 400

    now = datetime.now(timezone.utc)
    mongo.db.devices.update_one(
        {'_id': device_id},
        {
            '$set': {
                'user_id':      str(user['_id']),
                'family_id':    user.get('family_id') or '',
                'platform':     platform,
                'device_name':  str(data.get('device_name') or '').strip()[:60],
                'last_seen_at': now,
            },
            '$setOnInsert': {'created_at': now},
        },
        upsert=True,
    )
    return jsonify({'message': 'המכשיר נרשם בהצלחה', 'device_id': device_id}), 200


@location_bp.route('/devices/<device_id>', methods=['DELETE'])
@require_auth
def unregister_device(device_id):
    user = request.current_user
    device = mongo.db.devices.find_one({'_id': device_id})
    if not device:
        return jsonify({'error': 'not_found'}), 404

    is_owner  = device['user_id'] == str(user['_id'])
    is_parent = (
        normalize_role(user.get('role')) == 'parent'
        and user.get('family_id')
        and device.get('family_id') == user.get('family_id')
    )
    if not (is_owner or is_parent):
        return jsonify({'error': 'forbidden'}), 403

    mongo.db.devices.delete_one({'_id': device_id})
    mongo.db.locations.delete_one({'user_id': device['user_id'], 'device_id': device_id})
    return jsonify({'message': 'המכשיר הוסר'}), 200


@location_bp.route('/update', methods=['POST'])
@require_auth
def update_location():
    user = request.current_user
    data = request.get_json() or {}
    device_id = data.get('device_id')

    try:
        lat = float(data.get('lat'))
        lng = float(data.get('lng'))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid_coordinates', 'message': 'קואורדינטות לא תקינות'}), 400

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify({'error': 'invalid_coordinates', 'message': 'קואורדינטות לא תקינות'}), 400

    device = mongo.db.devices.find_one({'_id': device_id})
    if not device:
        return jsonify({'error': 'device_not_registered', 'message': 'המכשיר לא רשום — יש לרשום אותו קודם'}), 404
    if device['user_id'] != str(user['_id']):
        return jsonify({'error': 'device_not_owned', 'message': 'המכשיר לא שייך למשתמש המחובר'}), 403

    accuracy_m = data.get('accuracy_m')
    try:
        accuracy_m = float(accuracy_m) if accuracy_m is not None else None
    except (TypeError, ValueError):
        accuracy_m = None

    now = datetime.now(timezone.utc)
    mongo.db.devices.update_one({'_id': device_id}, {'$set': {'last_seen_at': now}})
    mongo.db.locations.update_one(
        {'user_id': str(user['_id'])},
        {
            '$set': {
                'family_id':   user.get('family_id') or '',
                'device_id':   device_id,
                'lat':         lat,
                'lng':         lng,
                'accuracy_m':  accuracy_m,
                'captured_at': data.get('captured_at') or now.isoformat(),
                'updated_at':  now,
            },
            '$setOnInsert': {'_id': str(uuid.uuid4())},
        },
        upsert=True,
    )
    return jsonify({'message': 'המיקום עודכן'}), 200

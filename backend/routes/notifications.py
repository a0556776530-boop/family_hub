import os, json, datetime
from flask import Blueprint, request, jsonify
from app import mongo
from utils.jwt_utils import require_auth
from bson import ObjectId

try:
    from pywebpush import webpush, WebPushException
    _PUSH_AVAILABLE = True
except Exception:
    _PUSH_AVAILABLE = False

notifications_bp = Blueprint('notifications', __name__)

VAPID_PRIVATE = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC  = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_EMAIL   = 'mailto:admin@familyhub.app'


def _send_push(sub, payload):
    try:
        webpush(
            subscription_info=sub['subscription'],
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE,
            vapid_claims={'sub': VAPID_EMAIL},
        )
    except WebPushException as e:
        if '410' in str(e) or '404' in str(e):
            mongo.db.push_subscriptions.delete_one({'_id': sub['_id']})


def send_push_to_family(family_id, title, body, url='/'):
    if not _PUSH_AVAILABLE or not VAPID_PRIVATE or not VAPID_PUBLIC:
        return
    for sub in mongo.db.push_subscriptions.find({'family_id': family_id}):
        _send_push(sub, {'title': title, 'body': body, 'url': url})


def send_push_to_user(user_id, title, body, url='/'):
    if not _PUSH_AVAILABLE or not VAPID_PRIVATE or not VAPID_PUBLIC:
        return
    for sub in mongo.db.push_subscriptions.find({'user_id': user_id}):
        _send_push(sub, {'title': title, 'body': body, 'url': url})


@notifications_bp.route('/vapid-public-key', methods=['GET'])
def vapid_public_key():
    return jsonify({'public_key': VAPID_PUBLIC}), 200


@notifications_bp.route('/subscribe', methods=['POST'])
@require_auth
def subscribe():
    user = request.current_user
    data = request.get_json() or {}
    subscription = data.get('subscription')
    if not subscription:
        return jsonify({'error': 'missing_subscription'}), 400

    mongo.db.push_subscriptions.update_one(
        {'user_id': str(user['_id']), 'subscription.endpoint': subscription['endpoint']},
        {'$set': {
            'user_id':    str(user['_id']),
            'family_id':  user.get('family_id', ''),
            'subscription': subscription,
        }},
        upsert=True
    )
    return jsonify({'message': 'נרשמת להתראות'}), 200


@notifications_bp.route('/unsubscribe', methods=['POST'])
@require_auth
def unsubscribe():
    user = request.current_user
    data = request.get_json() or {}
    endpoint = data.get('endpoint')
    if endpoint:
        mongo.db.push_subscriptions.delete_one({'user_id': str(user['_id']), 'subscription.endpoint': endpoint})
    else:
        mongo.db.push_subscriptions.delete_many({'user_id': str(user['_id'])})
    return jsonify({'message': 'בוטלו ההתראות'}), 200


@notifications_bp.route('/ring/<target_user_id>', methods=['POST'])
@require_auth
def ring_phone(target_user_id):
    caller = request.current_user
    try:
        target = mongo.db.users.find_one({'_id': ObjectId(target_user_id)})
    except Exception:
        return jsonify({'error': 'invalid_id'}), 400
    if not target:
        return jsonify({'error': 'user_not_found'}), 404
    if target.get('family_id') != caller.get('family_id'):
        return jsonify({'error': 'forbidden'}), 403

    caller_name = caller.get('name', 'ההורים')

    # Store ring session (non-blocking — push must go out regardless)
    try:
        mongo.db.ring_sessions.update_one(
            {'target_user_id': target_user_id},
            {'$set': {
                'target_user_id': target_user_id,
                'caller_name':    caller_name,
                'family_id':      caller.get('family_id', ''),
                'active':         True,
                'started_at':     datetime.datetime.utcnow(),
            }},
            upsert=True,
        )
    except Exception:
        pass  # session tracking failed but push must still go out

    sent = 0
    if _PUSH_AVAILABLE and VAPID_PRIVATE and VAPID_PUBLIC:
        payload = {'type': 'ring', 'caller': caller_name}
        for sub in mongo.db.push_subscriptions.find({'user_id': target_user_id}):
            _send_push(sub, payload)
            sent += 1

    return jsonify({'message': 'נשלח', 'sent': sent}), 200


@notifications_bp.route('/ring/<target_user_id>/stop', methods=['POST'])
@require_auth
def stop_ring(target_user_id):
    caller = request.current_user
    try:
        target = mongo.db.users.find_one({'_id': ObjectId(target_user_id)})
    except Exception:
        return jsonify({'error': 'invalid_id'}), 400
    if not target:
        return jsonify({'error': 'user_not_found'}), 404
    if target.get('family_id') != caller.get('family_id'):
        return jsonify({'error': 'forbidden'}), 403

    # Mark session as inactive — child's polling will pick this up immediately
    try:
        mongo.db.ring_sessions.update_one(
            {'target_user_id': target_user_id},
            {'$set': {'active': False}},
        )
    except Exception:
        pass

    sent = 0
    if _PUSH_AVAILABLE and VAPID_PRIVATE and VAPID_PUBLIC:
        for sub in mongo.db.push_subscriptions.find({'user_id': target_user_id}):
            _send_push(sub, {'type': 'stop_ring'})
            sent += 1

    return jsonify({'message': 'עצור', 'sent': sent}), 200


@notifications_bp.route('/ring/my-status', methods=['GET'])
@require_auth
def ring_my_status():
    try:
        user    = request.current_user
        user_id = str(user['_id'])
        session = mongo.db.ring_sessions.find_one({'target_user_id': user_id})
        if not session or not session.get('active'):
            return jsonify({'active': False}), 200
        age = (datetime.datetime.utcnow() - session.get('started_at', datetime.datetime.min)).total_seconds()
        if age > 300:
            mongo.db.ring_sessions.update_one({'_id': session['_id']}, {'$set': {'active': False}})
            return jsonify({'active': False}), 200
        return jsonify({'active': True, 'caller': session.get('caller_name', 'ההורים')}), 200
    except Exception:
        return jsonify({'active': False}), 200

import os, json
from flask import Blueprint, request, jsonify
from app import mongo
from utils.jwt_utils import require_auth

try:
    from pywebpush import webpush, WebPushException
    _PUSH_AVAILABLE = True
except Exception:
    _PUSH_AVAILABLE = False

notifications_bp = Blueprint('notifications', __name__)

VAPID_PRIVATE = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC  = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_EMAIL   = 'mailto:admin@familyhub.app'


def send_push_to_family(family_id, title, body, url='/'):
    if not _PUSH_AVAILABLE or not VAPID_PRIVATE or not VAPID_PUBLIC:
        return
    subs = list(mongo.db.push_subscriptions.find({'family_id': family_id}))
    for sub in subs:
        try:
            webpush(
                subscription_info=sub['subscription'],
                data=json.dumps({'title': title, 'body': body, 'url': url}),
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={'sub': VAPID_EMAIL},
            )
        except WebPushException as e:
            if '410' in str(e) or '404' in str(e):
                mongo.db.push_subscriptions.delete_one({'_id': sub['_id']})


def send_push_to_user(user_id, title, body, url='/'):
    if not _PUSH_AVAILABLE or not VAPID_PRIVATE or not VAPID_PUBLIC:
        return
    subs = list(mongo.db.push_subscriptions.find({'user_id': user_id}))
    for sub in subs:
        try:
            webpush(
                subscription_info=sub['subscription'],
                data=json.dumps({'title': title, 'body': body, 'url': url}),
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={'sub': VAPID_EMAIL},
            )
        except WebPushException as e:
            if '410' in str(e) or '404' in str(e):
                mongo.db.push_subscriptions.delete_one({'_id': sub['_id']})


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

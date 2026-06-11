from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo, socketio
from utils.jwt_utils import require_auth
from utils.helpers import user_public

rewards_bp = Blueprint('rewards', __name__)

PARENT_ROLES = ('parent', 'admin')

def reward_public(r):
    return {
        'id':         str(r['_id']),
        'family_id':  r['family_id'],
        'title':      r['title'],
        'cost':       r.get('cost', 100),
        'emoji':      r.get('emoji', '🎁'),
        'created_by': r.get('created_by'),
    }


@rewards_bp.route('/', methods=['GET'])
@require_auth
def get_rewards():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403
    rewards = list(mongo.db.rewards.find({'family_id': user['family_id']}).sort('cost', 1))
    return jsonify({'rewards': [reward_public(r) for r in rewards]}), 200


@rewards_bp.route('/', methods=['POST'])
@require_auth
def create_reward():
    user = request.current_user
    if user.get('role') not in PARENT_ROLES:
        return jsonify({'error': 'forbidden', 'message': 'רק הורה יכול ליצור פרסים'}), 403
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data  = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'missing_title', 'message': 'שם הפרס הוא שדה חובה'}), 400

    cost = max(1, int(data.get('cost') or 100))

    result = mongo.db.rewards.insert_one({
        'family_id':  user['family_id'],
        'title':      title,
        'cost':       cost,
        'emoji':      data.get('emoji', '🎁'),
        'created_by': str(user['_id']),
        'created_at': datetime.now(timezone.utc),
    })
    reward = mongo.db.rewards.find_one({'_id': result.inserted_id})
    return jsonify({'reward': reward_public(reward)}), 201


@rewards_bp.route('/<reward_id>', methods=['DELETE'])
@require_auth
def delete_reward(reward_id):
    user = request.current_user
    if user.get('role') not in PARENT_ROLES:
        return jsonify({'error': 'forbidden'}), 403

    reward = mongo.db.rewards.find_one({'_id': ObjectId(reward_id), 'family_id': user.get('family_id')})
    if not reward:
        return jsonify({'error': 'not_found'}), 404

    mongo.db.rewards.delete_one({'_id': ObjectId(reward_id)})
    return jsonify({'message': 'הפרס נמחק'}), 200


@rewards_bp.route('/<reward_id>/redeem', methods=['POST'])
@require_auth
def redeem_reward(reward_id):
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    reward = mongo.db.rewards.find_one({'_id': ObjectId(reward_id), 'family_id': user.get('family_id')})
    if not reward:
        return jsonify({'error': 'not_found'}), 404

    cost    = reward.get('cost', 100)
    balance = user.get('wallet_balance', 0)
    if balance < cost:
        return jsonify({'error': 'insufficient_balance', 'message': f'אין מספיק XP. יש לך {balance}, נדרש {cost}'}), 400

    mongo.db.users.update_one({'_id': user['_id']}, {'$inc': {'wallet_balance': -cost}})
    updated = mongo.db.users.find_one({'_id': user['_id']})

    socketio.emit('reward_redeemed', {
        'user_id':     str(user['_id']),
        'user_name':   user.get('name', ''),
        'reward':      reward_public(reward),
        'new_balance': updated.get('wallet_balance', 0),
    }, room=user['family_id'])

    return jsonify({
        'message':     f'פדית: {reward["title"]} 🎉',
        'new_balance': updated.get('wallet_balance', 0),
        'cost':        cost,
    }), 200

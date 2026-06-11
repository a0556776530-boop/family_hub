from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth
from utils.helpers import generate_invite_code, user_public

family_bp = Blueprint('family', __name__)

def family_public(fam, members_data):
    return {
        'id':          str(fam['_id']),
        'name':        fam['name'],
        'invite_code': fam['invite_code'],
        'admin_id':    str(fam['admin_id']),
        'score':       fam.get('score', 0),
        'level':       (fam.get('score', 0) // 500) + 1,
        'xp_current':  fam.get('score', 0) % 500,
        'xp_next':     500,
        'members':     members_data,
        'member_count': len(fam.get('members', [])),
    }

def get_members(family):
    ids = [ObjectId(m) for m in family.get('members', [])]
    docs = list(mongo.db.users.find({'_id': {'$in': ids}}, {'password': 0}))
    return [user_public(d) for d in docs]

@family_bp.route('/create', methods=['POST'])
@require_auth
def create_family():
    user = request.current_user
    if user.get('family_id'):
        return jsonify({'error': 'already_in_family', 'message': 'אתה כבר חלק ממשפחה'}), 400

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'missing_name', 'message': 'שם המשפחה הוא שדה חובה'}), 400

    invite_code = generate_invite_code()
    while mongo.db.families.find_one({'invite_code': invite_code}):
        invite_code = generate_invite_code()

    result = mongo.db.families.insert_one({
        'name':        name,
        'invite_code': invite_code,
        'admin_id':    user['_id'],
        'members':     [str(user['_id'])],
        'score':       0,
        'created_at':  datetime.now(timezone.utc),
    })

    mongo.db.users.update_one(
        {'_id': user['_id']},
        {'$set': {'family_id': str(result.inserted_id), 'role': 'admin'}}
    )

    fam = mongo.db.families.find_one({'_id': result.inserted_id})
    members = get_members(fam)
    return jsonify({'family': family_public(fam, members)}), 201


@family_bp.route('/join', methods=['POST'])
@require_auth
def join_family():
    user = request.current_user
    if user.get('family_id'):
        return jsonify({'error': 'already_in_family', 'message': 'אתה כבר חלק ממשפחה'}), 400

    data = request.get_json() or {}
    code = (data.get('invite_code') or '').strip().upper()
    if not code:
        return jsonify({'error': 'missing_code', 'message': 'קוד הזמנה הוא שדה חובה'}), 400

    fam = mongo.db.families.find_one({'invite_code': code})
    if not fam:
        return jsonify({'error': 'invalid_code', 'message': 'קוד הזמנה לא תקין'}), 404

    mongo.db.families.update_one(
        {'_id': fam['_id']},
        {'$addToSet': {'members': str(user['_id'])}}
    )
    mongo.db.users.update_one(
        {'_id': user['_id']},
        {'$set': {'family_id': str(fam['_id'])}}
    )

    fam = mongo.db.families.find_one({'_id': fam['_id']})
    members = get_members(fam)
    return jsonify({'family': family_public(fam, members)}), 200


@family_bp.route('/me', methods=['GET'])
@require_auth
def get_family():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 404

    fam = mongo.db.families.find_one({'_id': ObjectId(user['family_id'])})
    if not fam:
        return jsonify({'error': 'family_not_found'}), 404

    members = get_members(fam)
    return jsonify({'family': family_public(fam, members)}), 200


@family_bp.route('/dashboard', methods=['GET'])
@require_auth
def dashboard():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    fam = mongo.db.families.find_one({'_id': ObjectId(user['family_id'])})
    if not fam:
        return jsonify({'error': 'family_not_found'}), 404

    members = get_members(fam)

    pending_tasks = mongo.db.tasks.count_documents({
        'family_id': str(fam['_id']),
        'status': 'pending'
    })
    done_tasks = mongo.db.tasks.count_documents({
        'family_id': str(fam['_id']),
        'status': 'done'
    })

    from datetime import date
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming_events = mongo.db.events.count_documents({
        'family_id': str(fam['_id']),
        'date': {'$gte': today.isoformat()}
    })

    return jsonify({
        'family':         family_public(fam, members),
        'pending_tasks':  pending_tasks,
        'done_tasks':     done_tasks,
        'upcoming_events': upcoming_events,
        'current_user':   user_public(user),
    }), 200

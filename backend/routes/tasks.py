from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo, socketio
from utils.jwt_utils import require_auth
from utils.helpers import serialize_doc

tasks_bp = Blueprint('tasks', __name__)

CATEGORIES = ['ניקיון', 'מטבח', 'לימודים', 'סידורים', 'קניות', 'תחזוקת הבית', 'אחר']
PRIORITIES  = ['low', 'medium', 'high']
CHILD_ROLES  = ('child', 'member')
PARENT_ROLES = ('parent', 'admin')

def task_public(t):
    return {
        'id':          str(t['_id']),
        'family_id':   t['family_id'],
        'title':       t['title'],
        'description': t.get('description', ''),
        'assigned_to': t.get('assigned_to'),
        'due_date':    t.get('due_date'),
        'priority':    t.get('priority', 'medium'),
        'category':    t.get('category', 'אחר'),
        'xp_value':    t.get('score_value', 10),
        'status':      t.get('status', 'pending'),
        'created_by':  t.get('created_by'),
        'completed_by': t.get('completed_by'),
        'created_at':  t['created_at'].isoformat() if isinstance(t.get('created_at'), datetime) else t.get('created_at'),
    }


@tasks_bp.route('/', methods=['GET'])
@require_auth
def get_tasks():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    filter_status = request.args.get('status')
    query = {'family_id': user['family_id']}
    if filter_status:
        query['status'] = filter_status

    tasks = list(mongo.db.tasks.find(query).sort('created_at', -1))
    return jsonify({'tasks': [task_public(t) for t in tasks]}), 200


@tasks_bp.route('/', methods=['POST'])
@require_auth
def create_task():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'missing_title', 'message': 'כותרת המשימה היא שדה חובה'}), 400

    result = mongo.db.tasks.insert_one({
        'family_id':   user['family_id'],
        'title':       title,
        'description': data.get('description', ''),
        'assigned_to': data.get('assigned_to'),
        'due_date':    data.get('due_date'),
        'priority':    data.get('priority', 'medium') if data.get('priority') in PRIORITIES else 'medium',
        'category':    data.get('category', 'אחר') if data.get('category') in CATEGORIES else 'אחר',
        'score_value': max(1, min(100, int(data.get('xp_value') or data.get('score_value') or 10))),
        'status':      'pending',
        'created_by':  str(user['_id']),
        'created_at':  datetime.now(timezone.utc),
    })

    task = mongo.db.tasks.find_one({'_id': result.inserted_id})
    pub  = task_public(task)
    socketio.emit('task_created', pub, room=user['family_id'])
    return jsonify({'task': pub}), 201


@tasks_bp.route('/<task_id>/complete', methods=['PATCH'])
@require_auth
def complete_task(task_id):
    user = request.current_user
    task = mongo.db.tasks.find_one({'_id': ObjectId(task_id), 'family_id': user.get('family_id')})
    if not task:
        return jsonify({'error': 'not_found'}), 404
    if task['status'] in ('done', 'awaiting_approval'):
        return jsonify({'error': 'already_done', 'message': 'המשימה כבר הושלמה או ממתינה לאישור'}), 400

    is_parent = user.get('role') in PARENT_ROLES
    xp_value  = task.get('score_value', 10)

    if is_parent:
        # הורה — השלמה מיידית
        mongo.db.tasks.update_one(
            {'_id': ObjectId(task_id)},
            {'$set': {'status': 'done', 'completed_by': str(user['_id']), 'completed_at': datetime.now(timezone.utc)}}
        )
        mongo.db.users.update_one({'_id': user['_id']}, {'$inc': {'score': xp_value, 'wallet_balance': xp_value}})
        mongo.db.families.update_one({'_id': ObjectId(user['family_id'])}, {'$inc': {'score': xp_value}})

        updated_user = mongo.db.users.find_one({'_id': user['_id']})
        task_updated = mongo.db.tasks.find_one({'_id': ObjectId(task_id)})
        pub = task_public(task_updated)
        socketio.emit('task_updated', pub, room=user['family_id'])
        return jsonify({'message': 'המשימה הושלמה!', 'xp_earned': xp_value, 'user_score': updated_user.get('score', 0)}), 200
    else:
        # ילד — ממתין לאישור הורה
        mongo.db.tasks.update_one(
            {'_id': ObjectId(task_id)},
            {'$set': {'status': 'awaiting_approval', 'completed_by': str(user['_id']), 'completed_at': datetime.now(timezone.utc)}}
        )
        task_updated = mongo.db.tasks.find_one({'_id': ObjectId(task_id)})
        pub = task_public(task_updated)
        socketio.emit('task_updated', pub, room=user['family_id'])
        return jsonify({'message': 'נשלח לאישור הורה! ⏳', 'awaiting': True}), 200


@tasks_bp.route('/<task_id>/approve', methods=['PATCH'])
@require_auth
def approve_task(task_id):
    user = request.current_user
    if user.get('role') not in PARENT_ROLES:
        return jsonify({'error': 'forbidden', 'message': 'רק הורה יכול לאשר משימות'}), 403

    task = mongo.db.tasks.find_one({'_id': ObjectId(task_id), 'family_id': user.get('family_id')})
    if not task:
        return jsonify({'error': 'not_found'}), 404
    if task['status'] != 'awaiting_approval':
        return jsonify({'error': 'not_awaiting', 'message': 'המשימה אינה ממתינה לאישור'}), 400

    xp_value    = task.get('score_value', 10)
    completer_id = task.get('completed_by')

    mongo.db.tasks.update_one(
        {'_id': ObjectId(task_id)},
        {'$set': {'status': 'done', 'approved_by': str(user['_id']), 'approved_at': datetime.now(timezone.utc)}}
    )

    if completer_id:
        mongo.db.users.update_one(
            {'_id': ObjectId(completer_id)},
            {'$inc': {'score': xp_value, 'wallet_balance': xp_value}}
        )

    mongo.db.families.update_one({'_id': ObjectId(user['family_id'])}, {'$inc': {'score': xp_value}})

    task_updated   = mongo.db.tasks.find_one({'_id': ObjectId(task_id)})
    completer_user = mongo.db.users.find_one({'_id': ObjectId(completer_id)}) if completer_id else None

    pub = task_public(task_updated)
    socketio.emit('task_approved', {
        'task':          pub,
        'xp_earned':     xp_value,
        'completer_id':  completer_id,
        'new_balance':   completer_user.get('wallet_balance', 0) if completer_user else 0,
    }, room=user['family_id'])

    return jsonify({'message': f'אושר! +{xp_value} XP', 'xp_earned': xp_value}), 200


@tasks_bp.route('/<task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id):
    user = request.current_user
    task = mongo.db.tasks.find_one({'_id': ObjectId(task_id), 'family_id': user.get('family_id')})
    if not task:
        return jsonify({'error': 'not_found'}), 404

    is_parent  = user.get('role') in PARENT_ROLES
    is_creator = task.get('created_by') == str(user['_id'])
    if not (is_parent or is_creator):
        return jsonify({'error': 'forbidden'}), 403

    mongo.db.tasks.delete_one({'_id': ObjectId(task_id)})
    socketio.emit('task_deleted', {'id': task_id}, room=user['family_id'])
    return jsonify({'message': 'המשימה נמחקה'}), 200

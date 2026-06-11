from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth

shopping_bp = Blueprint('shopping', __name__)

CATEGORY_EMOJI = {
    'מזון': '🥫', 'ירקות': '🥦', 'פירות': '🍎',
    'ניקיון': '🧹', 'פארם': '💊', 'תינוקות': '🍼', 'אחר': '🛒'
}

def item_public(item):
    return {
        'id':       str(item['_id']),
        'name':     item['name'],
        'quantity': int(item.get('quantity') or 1),
        'unit':     item.get('unit', ''),
        'category': item.get('category', 'אחר'),
        'note':     item.get('note', ''),
        'done':     item.get('done', False),
        'added_by': item.get('added_by', ''),
    }


@shopping_bp.route('/', methods=['GET'])
@require_auth
def get_items():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403
    items = list(mongo.db.shopping_items.find(
        {'family_id': user['family_id']},
        sort=[('created_at', 1)]
    ))
    return jsonify({'items': [item_public(i) for i in items]}), 200


@shopping_bp.route('/', methods=['POST'])
@require_auth
def add_item():
    user = request.current_user
    if not user.get('family_id'):
        return jsonify({'error': 'no_family'}), 403

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'missing_name'}), 400

    category = data.get('category', 'אחר')
    try:
        qty = max(1, int(data.get('quantity', 1)))
    except (ValueError, TypeError):
        qty = 1

    result = mongo.db.shopping_items.insert_one({
        'family_id':  user['family_id'],
        'name':       name,
        'quantity':   qty,
        'unit':       (data.get('unit') or '').strip(),
        'category':   category,
        'note':       (data.get('note') or '').strip()[:100],
        'done':       False,
        'added_by':   user.get('name', '').split()[0] if user.get('name') else '',
        'created_at': datetime.now(timezone.utc),
    })
    item = mongo.db.shopping_items.find_one({'_id': result.inserted_id})
    return jsonify({'item': item_public(item)}), 201


@shopping_bp.route('/suggestions', methods=['GET'])
@require_auth
def suggestions():
    user = request.current_user
    family_id = user.get('family_id')

    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'suggestions': []}), 200

    prefix_re   = {'$regex': '^' + q, '$options': 'i'}
    contains_re = {'$regex': q,       '$options': 'i'}

    family_results = []
    if family_id:
        pipeline = [
            {'$match': {'family_id': family_id, 'name': contains_re}},
            {'$group': {'_id': '$name', 'count': {'$sum': 1}, 'category': {'$last': '$category'}}},
            {'$sort': {'count': -1}},
            {'$limit': 5},
        ]
        family_results = list(mongo.db.shopping_items.aggregate(pipeline))

    family_names = {r['_id'].strip().lower() for r in family_results}

    catalog_results = list(
        mongo.db.global_catalog.find({'name': prefix_re}, {'name': 1, 'category': 1, '_id': 0}).limit(10)
    )

    seen   = set(family_names)
    merged = [{'name': r['_id'], 'category': r.get('category', 'אחר'), 'family': True} for r in family_results]
    for item in catalog_results:
        key = item['name'].strip().lower()
        if key not in seen:
            seen.add(key)
            merged.append({'name': item['name'], 'category': item.get('category', 'אחר'), 'family': False})

    return jsonify({'suggestions': merged[:8]}), 200


@shopping_bp.route('/frequent', methods=['GET'])
@require_auth
def frequent():
    user = request.current_user
    family_id = user.get('family_id')
    if not family_id:
        return jsonify({'items': []}), 200

    pipeline = [
        {'$match': {'family_id': family_id}},
        {'$group': {'_id': '$name', 'count': {'$sum': 1}, 'category': {'$last': '$category'}}},
        {'$sort': {'count': -1}},
        {'$limit': 20},
    ]
    results = list(mongo.db.shopping_items.aggregate(pipeline))
    return jsonify({'items': [
        {'name': r['_id'], 'category': r.get('category', 'אחר'), 'count': r['count']}
        for r in results
    ]}), 200


@shopping_bp.route('/<item_id>/toggle', methods=['PATCH'])
@require_auth
def toggle_item(item_id):
    user = request.current_user
    item = mongo.db.shopping_items.find_one({'_id': ObjectId(item_id), 'family_id': user.get('family_id')})
    if not item:
        return jsonify({'error': 'not_found'}), 404
    new_done = not item['done']
    mongo.db.shopping_items.update_one({'_id': ObjectId(item_id)}, {'$set': {'done': new_done}})
    return jsonify({'done': new_done}), 200


@shopping_bp.route('/<item_id>/quantity', methods=['PATCH'])
@require_auth
def update_quantity(item_id):
    user = request.current_user
    data   = request.get_json() or {}
    delta  = data.get('delta')   # +1 or -1
    qty    = data.get('quantity') # absolute value

    item = mongo.db.shopping_items.find_one({'_id': ObjectId(item_id), 'family_id': user.get('family_id')})
    if not item:
        return jsonify({'error': 'not_found'}), 404

    if delta is not None:
        new_qty = max(1, int(item.get('quantity') or 1) + int(delta))
    elif qty is not None:
        new_qty = max(1, int(qty))
    else:
        return jsonify({'error': 'missing_param'}), 400

    mongo.db.shopping_items.update_one({'_id': ObjectId(item_id)}, {'$set': {'quantity': new_qty}})
    return jsonify({'quantity': new_qty}), 200


@shopping_bp.route('/<item_id>', methods=['DELETE'])
@require_auth
def delete_item(item_id):
    user = request.current_user
    mongo.db.shopping_items.delete_one({'_id': ObjectId(item_id), 'family_id': user.get('family_id')})
    return jsonify({'message': 'נמחק'}), 200

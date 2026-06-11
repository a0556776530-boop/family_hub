import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth

moments_bp = Blueprint('moments', __name__)

ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def moment_public(m):
    return {
        'id':             str(m['_id']),
        'family_id':      str(m.get('family_id', '')),
        'uploader_id':    str(m.get('uploader_id', '')),
        'uploader_name':  m.get('uploader_name', ''),
        'uploader_avatar': m.get('uploader_avatar', ''),
        'image_url':      m.get('image_url', ''),
        'caption':        m.get('caption', ''),
        'created_at':     m['created_at'].isoformat() if isinstance(m.get('created_at'), datetime) else str(m.get('created_at', '')),
    }


@moments_bp.route('/', methods=['GET'])
@require_auth
def list_moments():
    user = request.current_user
    family_id = user.get('family_id')
    if not family_id:
        return jsonify({'message': 'לא חבר במשפחה'}), 403

    moments = list(
        mongo.db.moments.find({'family_id': ObjectId(family_id)})
        .sort('created_at', -1)
        .limit(100)
    )
    return jsonify({'moments': [moment_public(m) for m in moments]}), 200


@moments_bp.route('/', methods=['POST'])
@require_auth
def upload_moment():
    user = request.current_user
    family_id = user.get('family_id')
    if not family_id:
        return jsonify({'message': 'לא חבר במשפחה'}), 403

    file = request.files.get('image')
    if not file or not file.filename:
        return jsonify({'message': 'לא נשלחה תמונה'}), 400
    if not allowed_file(file.filename):
        return jsonify({'message': 'סוג קובץ לא נתמך'}), 400

    caption = (request.form.get('caption') or '').strip()[:200]

    moments_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'moments')
    os.makedirs(moments_dir, exist_ok=True)

    filename = secure_filename(f"{ObjectId()}_{file.filename}")
    file.save(os.path.join(moments_dir, filename))
    image_url = f"/static/uploads/moments/{filename}"

    doc = {
        'family_id':       ObjectId(family_id),
        'uploader_id':     ObjectId(user['_id']),
        'uploader_name':   user.get('name', ''),
        'uploader_avatar': user.get('avatar_url', ''),
        'image_url':       image_url,
        'caption':         caption,
        'created_at':      datetime.now(timezone.utc),
    }
    result = mongo.db.moments.insert_one(doc)
    doc['_id'] = result.inserted_id
    return jsonify({'moment': moment_public(doc)}), 201


@moments_bp.route('/<moment_id>', methods=['DELETE'])
@require_auth
def delete_moment(moment_id):
    user = request.current_user
    try:
        oid = ObjectId(moment_id)
    except Exception:
        return jsonify({'message': 'מזהה לא תקין'}), 400

    moment = mongo.db.moments.find_one({'_id': oid})
    if not moment:
        return jsonify({'message': 'לא נמצא'}), 404

    is_uploader = str(moment.get('uploader_id')) == str(user['_id'])
    is_parent   = user.get('role', '') in ('parent', 'admin')

    if not (is_uploader or is_parent):
        return jsonify({'message': 'אין הרשאה'}), 403

    filename = os.path.basename(moment.get('image_url', ''))
    if filename:
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'moments', filename)
        try:
            os.remove(path)
        except OSError:
            pass

    mongo.db.moments.delete_one({'_id': oid})
    return jsonify({'message': 'נמחק'}), 200

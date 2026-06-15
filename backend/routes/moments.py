import cloudinary
import cloudinary.uploader
from flask import Blueprint, request, jsonify, current_app
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo
from utils.jwt_utils import require_auth
import os

cloudinary.config(
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key    = os.environ.get('CLOUDINARY_API_KEY'),
    api_secret = os.environ.get('CLOUDINARY_API_SECRET'),
    secure     = True
)

moments_bp = Blueprint('moments', __name__)

IMAGE_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'avif'}
VIDEO_EXT = {'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', '3gp'}
ALLOWED_EXT = IMAGE_EXT | VIDEO_EXT

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def get_resource_type(filename):
    ext = filename.rsplit('.', 1)[-1].lower()
    return 'video' if ext in VIDEO_EXT else 'image'

def optimized_url(url, resource_type='image'):
    """Insert f_auto,q_auto into Cloudinary URL for best format per browser."""
    if not url or 'cloudinary.com' not in url:
        return url
    marker = f'/{resource_type}/upload/'
    if marker in url:
        left, right = url.split(marker, 1)
        # skip if already has transformations
        if not right.startswith('f_auto'):
            transform = 'f_auto,q_auto' if resource_type == 'image' else 'q_auto'
            return f"{left}{marker}{transform}/{right}"
    return url

def moment_public(m):
    return {
        'id':              str(m['_id']),
        'family_id':       str(m.get('family_id', '')),
        'uploader_id':     str(m.get('uploader_id', '')),
        'uploader_name':   m.get('uploader_name', ''),
        'uploader_avatar': m.get('uploader_avatar', ''),
        'image_url':       m.get('image_url', ''),
        'resource_type':   m.get('resource_type', 'image'),
        'caption':         m.get('caption', ''),
        'created_at':      m['created_at'].isoformat() if isinstance(m.get('created_at'), datetime) else str(m.get('created_at', '')),
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
    resource_type = get_resource_type(file.filename)

    if resource_type == 'video':
        result = cloudinary.uploader.upload(
            file,
            folder='family_hub/moments',
            resource_type='video',
            transformation=[{'quality': 'auto', 'width': 1280, 'crop': 'limit'}]
        )
    else:
        result = cloudinary.uploader.upload(
            file,
            folder='family_hub/moments',
            resource_type='image',
            transformation=[{'width': 1200, 'crop': 'limit', 'quality': 'auto'}],
            format='jpg'  # converts HEIC/PNG/BMP → JPEG as base
        )

    image_url = optimized_url(result['secure_url'], resource_type)

    doc = {
        'family_id':       ObjectId(family_id),
        'uploader_id':     ObjectId(user['_id']),
        'uploader_name':   user.get('name', ''),
        'uploader_avatar': user.get('avatar_url', ''),
        'image_url':       image_url,
        'resource_type':   resource_type,
        'public_id':       result.get('public_id', ''),
        'caption':         caption,
        'created_at':      datetime.now(timezone.utc),
    }
    res = mongo.db.moments.insert_one(doc)
    doc['_id'] = res.inserted_id
    return jsonify({'moment': moment_public(doc)}), 201


@moments_bp.route('/<moment_id>', methods=['DELETE'])
@require_auth
def delete_moment(moment_id):
    user = request.current_user
    try:
        oid = ObjectId(moment_id)
    except Exception:
        return jsonify({'message': 'מזהה לא תקין'}), 400

    moment = mongo.db.moments.find_one({'_id': oid, 'family_id': ObjectId(user.get('family_id'))})
    if not moment:
        return jsonify({'message': 'לא נמצא'}), 404

    is_uploader = str(moment.get('uploader_id')) == str(user['_id'])
    is_parent   = user.get('role', '') in ('parent', 'admin')

    if not (is_uploader or is_parent):
        return jsonify({'message': 'אין הרשאה'}), 403

    public_id = moment.get('public_id')
    if public_id:
        try:
            cloudinary.uploader.destroy(
                public_id,
                resource_type=moment.get('resource_type', 'image')
            )
        except Exception:
            pass

    mongo.db.moments.delete_one({'_id': oid})
    return jsonify({'message': 'נמחק'}), 200

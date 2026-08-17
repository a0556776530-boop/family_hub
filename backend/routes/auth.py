import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime, timezone
from app import mongo, bcrypt
from utils.jwt_utils import generate_token, require_auth
from utils.helpers import user_public

auth_bp = Blueprint('auth', __name__)

ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.form if request.form else request.get_json() or {}
    name     = (data.get('name') or '').strip()
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not name or not email or not password:
        return jsonify({'error': 'missing_fields', 'message': 'שם, אימייל וסיסמה הם שדות חובה'}), 400

    if len(password) < 6:
        return jsonify({'error': 'password_too_short', 'message': 'הסיסמה חייבת להכיל לפחות 6 תווים'}), 400

    if mongo.db.users.find_one({'email': email}):
        return jsonify({'error': 'email_exists', 'message': 'האימייל הזה כבר רשום במערכת'}), 409

    avatar_url = ''
    file = request.files.get('avatar')
    if file and file.filename and allowed_file(file.filename):
        filename = secure_filename(f"{ObjectId()}_{file.filename}")
        file.save(os.path.join(current_app.config['UPLOAD_FOLDER'], filename))
        avatar_url = f"/static/uploads/{filename}"

    raw_role = (data.get('role') or 'child').lower()
    role = raw_role if raw_role in ('parent', 'child') else 'child'

    secret_answer = (data.get('secret_answer') or '').strip().lower()

    result = mongo.db.users.insert_one({
        'name':           name,
        'email':          email,
        'password':       bcrypt.generate_password_hash(password).decode('utf-8'),
        'avatar_url':     avatar_url,
        'family_id':      None,
        'role':           role,
        'score':          0,
        'wallet_balance': 0,
        'secret_answer':  secret_answer,
        'created_at':     datetime.now(timezone.utc),
    })

    user = mongo.db.users.find_one({'_id': result.inserted_id})
    token = generate_token(str(result.inserted_id))
    return jsonify({'token': token, 'user': user_public(user)}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data  = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = mongo.db.users.find_one({'email': email})
    if not user or not bcrypt.check_password_hash(user['password'], password):
        return jsonify({'error': 'invalid_credentials', 'message': 'אימייל או סיסמה שגויים'}), 401

    token = generate_token(str(user['_id']))
    return jsonify({'token': token, 'user': user_public(user)}), 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    return jsonify({'user': user_public(request.current_user)}), 200


@auth_bp.route('/profile', methods=['PATCH'])
@require_auth
def update_profile():
    user = request.current_user
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'missing_name', 'message': 'שם הוא שדה חובה'}), 400
    mongo.db.users.update_one({'_id': user['_id']}, {'$set': {'name': name}})
    updated = mongo.db.users.find_one({'_id': user['_id']})
    return jsonify({'user': user_public(updated)}), 200


@auth_bp.route('/change-password', methods=['PATCH'])
@require_auth
def change_password():
    user = request.current_user
    data = request.get_json() or {}
    current  = data.get('current_password') or ''
    new_pass = data.get('new_password') or ''

    if not current or not new_pass:
        return jsonify({'message': 'חסרים פרטים'}), 400
    if len(new_pass) < 6:
        return jsonify({'message': 'הסיסמה חייבת להכיל לפחות 6 תווים'}), 400
    if not bcrypt.check_password_hash(user['password'], current):
        return jsonify({'message': 'הסיסמה הנוכחית שגויה'}), 400

    mongo.db.users.update_one(
        {'_id': user['_id']},
        {'$set': {'password': bcrypt.generate_password_hash(new_pass).decode('utf-8')}}
    )
    return jsonify({'message': 'הסיסמה עודכנה בהצלחה'}), 200


@auth_bp.route('/set-secret-answer', methods=['PATCH'])
@require_auth
def set_secret_answer():
    user = request.current_user
    data = request.get_json() or {}
    answer = (data.get('secret_answer') or '').strip().lower()
    if not answer:
        return jsonify({'message': 'חסרת תשובה'}), 400
    mongo.db.users.update_one({'_id': user['_id']}, {'$set': {'secret_answer': answer}})
    return jsonify({'message': 'שאלת הביטחון נשמרה'}), 200


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data     = request.get_json() or {}
    email    = (data.get('email') or '').strip().lower()
    new_pass = data.get('new_password') or ''
    answer   = (data.get('secret_answer') or '').strip().lower()

    if not email or not new_pass or not answer:
        return jsonify({'message': 'חסרים פרטים'}), 400
    if len(new_pass) < 6:
        return jsonify({'message': 'הסיסמה חייבת להכיל לפחות 6 תווים'}), 400

    user = mongo.db.users.find_one({'email': email})
    if not user:
        return jsonify({'message': 'אימייל לא נמצא במערכת'}), 404

    stored = (user.get('secret_answer') or '').strip().lower()
    if not stored:
        return jsonify({'message': 'לא הגדרת שאלת אבטחה. בקש מהורה לאפס את סיסמתך.'}), 400
    if answer != stored:
        return jsonify({'message': 'תשובת הביטחון שגויה'}), 400

    mongo.db.users.update_one(
        {'_id': user['_id']},
        {'$set': {'password': bcrypt.generate_password_hash(new_pass).decode('utf-8')}}
    )
    return jsonify({'message': 'הסיסמה שונתה בהצלחה'}), 200


@auth_bp.route('/avatar', methods=['DELETE'])
@require_auth
def delete_avatar():
    user = request.current_user
    mongo.db.users.update_one({'_id': user['_id']}, {'$unset': {'avatar_url': ''}})
    updated = mongo.db.users.find_one({'_id': user['_id']})
    return jsonify({'user': user_public(updated)}), 200


@auth_bp.route('/avatar', methods=['POST'])
@require_auth
def update_avatar():
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(
        cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
        api_key=os.environ.get('CLOUDINARY_API_KEY'),
        api_secret=os.environ.get('CLOUDINARY_API_SECRET'),
        secure=True
    )
    user = request.current_user
    file = request.files.get('avatar')
    if not file or not file.filename:
        return jsonify({'error': 'no_file'}), 400
    result = cloudinary.uploader.upload(
        file,
        folder='family_hub/avatars',
        transformation=[{'width': 200, 'height': 200, 'crop': 'fill', 'gravity': 'face'}]
    )
    avatar_url = result['secure_url']
    mongo.db.users.update_one({'_id': user['_id']}, {'$set': {'avatar_url': avatar_url}})
    updated = mongo.db.users.find_one({'_id': user['_id']})
    return jsonify({'user': user_public(updated)}), 200

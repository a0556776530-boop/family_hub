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

    result = mongo.db.users.insert_one({
        'name':           name,
        'email':          email,
        'password':       bcrypt.generate_password_hash(password).decode('utf-8'),
        'avatar_url':     avatar_url,
        'family_id':      None,
        'role':           role,
        'score':          0,
        'wallet_balance': 0,
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

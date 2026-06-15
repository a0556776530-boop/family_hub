import os
import random
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from bson import ObjectId
from datetime import datetime, timezone, timedelta
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


def send_reset_email(to_email, code, name):
    mail_user = os.environ.get('MAIL_EMAIL', '')
    mail_pass = os.environ.get('MAIL_PASSWORD', '')
    if not mail_user or not mail_pass:
        return False
    html = f"""
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#f8fafc;border-radius:16px;padding:32px;border:1px solid #e2e8f0">
      <div style="text-align:center;font-size:48px;margin-bottom:16px">🏠</div>
      <h2 style="color:#1e3a5f;text-align:center;margin:0 0 8px">Family Hub</h2>
      <p style="color:#64748b;text-align:center;margin:0 0 32px">איפוס סיסמה</p>
      <p style="color:#334155">שלום {name},</p>
      <p style="color:#334155">קיבלנו בקשה לאיפוס הסיסמה שלך. הקוד שלך הוא:</p>
      <div style="background:#1d4ed8;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
        <span style="color:white;font-size:40px;font-weight:bold;letter-spacing:12px">{code}</span>
      </div>
      <p style="color:#64748b;font-size:14px">הקוד תקף ל-15 דקות בלבד.</p>
      <p style="color:#64748b;font-size:14px">אם לא ביקשת איפוס סיסמה — אפשר להתעלם מהמייל הזה.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px;text-align:center">Family Hub — האפליקציה של המשפחה</p>
    </div>
    """
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'קוד איפוס סיסמה — Family Hub'
        msg['From']    = mail_user
        msg['To']      = to_email
        msg.attach(MIMEText(html, 'html', 'utf-8'))
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(mail_user, mail_pass)
            server.sendmail(mail_user, to_email, msg.as_string())
        return True
    except Exception:
        return False


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data  = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'message': 'נדרש אימייל'}), 400

    user = mongo.db.users.find_one({'email': email})
    if not user:
        # don't reveal if email exists
        return jsonify({'message': 'אם האימייל קיים במערכת — נשלח קוד'}), 200

    code    = str(random.randint(100000, 999999))
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)

    mongo.db.password_resets.delete_many({'email': email})
    mongo.db.password_resets.insert_one({
        'email':      email,
        'code_hash':  bcrypt.generate_password_hash(code).decode('utf-8'),
        'expires_at': expires,
    })
    mongo.db.password_resets.create_index('expires_at', expireAfterSeconds=0)

    sent = send_reset_email(email, code, user.get('name', ''))
    if not sent:
        return jsonify({'message': 'שגיאה בשליחת מייל. בדוק הגדרות MAIL_EMAIL ו-MAIL_PASSWORD'}), 500

    return jsonify({'message': 'אם האימייל קיים במערכת — נשלח קוד'}), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data     = request.get_json() or {}
    email    = (data.get('email') or '').strip().lower()
    code     = (data.get('code') or '').strip()
    password = data.get('password') or ''

    if not email or not code or not password:
        return jsonify({'message': 'חסרים פרטים'}), 400
    if len(password) < 6:
        return jsonify({'message': 'הסיסמה חייבת להכיל לפחות 6 תווים'}), 400

    record = mongo.db.password_resets.find_one({'email': email})
    if not record:
        return jsonify({'message': 'קוד לא תקין או פג תוקף'}), 400

    if record['expires_at'].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        mongo.db.password_resets.delete_one({'_id': record['_id']})
        return jsonify({'message': 'הקוד פג תוקף — בקש קוד חדש'}), 400

    if not bcrypt.check_password_hash(record['code_hash'], code):
        return jsonify({'message': 'קוד שגוי'}), 400

    new_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    mongo.db.users.update_one({'email': email}, {'$set': {'password': new_hash}})
    mongo.db.password_resets.delete_one({'_id': record['_id']})

    return jsonify({'message': 'הסיסמה עודכנה בהצלחה'}), 200


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

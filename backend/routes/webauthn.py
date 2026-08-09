import os, json, base64
from flask import Blueprint, request, jsonify
from app import mongo
from utils.jwt_utils import require_auth, generate_token
from utils.helpers import user_public
from bson import ObjectId
from datetime import datetime, timezone, timedelta

try:
    from webauthn import (
        generate_registration_options,
        verify_registration_response,
        generate_authentication_options,
        verify_authentication_response,
        options_to_json,
    )
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        UserVerificationRequirement,
        ResidentKeyRequirement,
        PublicKeyCredentialDescriptor,
    )
    _WEBAUTHN_OK = True
except Exception:
    _WEBAUTHN_OK = False

webauthn_bp = Blueprint('webauthn', __name__)

RP_ID   = os.environ.get('RP_ID',       'family-hub-app.onrender.com')
RP_NAME = 'Family Hub'
ORIGIN  = os.environ.get('FRONTEND_URL', 'https://family-hub-app.onrender.com')


def _b64_pad(s):
    return s + '=' * (-len(s) % 4)


def _unavailable():
    return jsonify({'error': 'webauthn_unavailable', 'message': 'WebAuthn לא זמין'}), 503


# ── Registration ─────────────────────────────────────────────────────────────

@webauthn_bp.route('/register/begin', methods=['POST'])
@require_auth
def register_begin():
    if not _WEBAUTHN_OK:
        return _unavailable()

    user    = request.current_user
    user_id = str(user['_id'])

    existing = list(mongo.db.webauthn_credentials.find({'user_id': user_id}))
    exclude  = [
        PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(_b64_pad(c['credential_id'])))
        for c in existing
    ]

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user_id.encode(),
        user_name=user.get('email', ''),
        user_display_name=user.get('name', ''),
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.DISCOURAGED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )

    challenge_b64 = base64.urlsafe_b64encode(options.challenge).decode().rstrip('=')
    mongo.db.webauthn_challenges.replace_one(
        {'user_id': user_id, 'type': 'registration'},
        {
            'user_id':    user_id,
            'type':       'registration',
            'challenge':  challenge_b64,
            'expires_at': datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        upsert=True,
    )

    return jsonify(json.loads(options_to_json(options))), 200


@webauthn_bp.route('/register/complete', methods=['POST'])
@require_auth
def register_complete():
    if not _WEBAUTHN_OK:
        return _unavailable()

    user    = request.current_user
    user_id = str(user['_id'])

    stored = mongo.db.webauthn_challenges.find_one({'user_id': user_id, 'type': 'registration'})
    if not stored:
        return jsonify({'error': 'no_challenge', 'message': 'לא נמצא אתגר'}), 400

    expires = stored['expires_at']
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return jsonify({'error': 'challenge_expired', 'message': 'פג תוקף האתגר'}), 400

    challenge = base64.urlsafe_b64decode(_b64_pad(stored['challenge']))
    data      = request.get_json() or {}

    try:
        verification = verify_registration_response(
            credential=data,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            require_user_verification=False,
        )
    except Exception as e:
        return jsonify({'error': 'verification_failed', 'message': str(e)}), 400

    cred_id_b64  = base64.urlsafe_b64encode(verification.credential_id).decode().rstrip('=')
    pub_key_b64  = base64.urlsafe_b64encode(verification.credential_public_key).decode().rstrip('=')

    mongo.db.webauthn_credentials.update_one(
        {'user_id': user_id, 'credential_id': cred_id_b64},
        {'$set': {
            'user_id':       user_id,
            'credential_id': cred_id_b64,
            'public_key':    pub_key_b64,
            'sign_count':    verification.sign_count,
            'created_at':    datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    mongo.db.webauthn_challenges.delete_one({'user_id': user_id, 'type': 'registration'})

    return jsonify({'message': 'טביעת האצבע נרשמה בהצלחה! ✅'}), 200


# ── Authentication ────────────────────────────────────────────────────────────

@webauthn_bp.route('/login/begin', methods=['POST'])
def login_begin():
    if not _WEBAUTHN_OK:
        return _unavailable()

    data  = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'missing_email'}), 400

    user = mongo.db.users.find_one({'email': {'$regex': f'^{email}$', '$options': 'i'}})
    if not user:
        return jsonify({'error': 'user_not_found', 'message': 'משתמש לא נמצא'}), 404

    user_id     = str(user['_id'])
    credentials = list(mongo.db.webauthn_credentials.find({'user_id': user_id}))
    if not credentials:
        return jsonify({'error': 'no_credentials', 'message': 'לא נרשמה טביעת אצבע למשתמש זה'}), 404

    allow = [
        PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(_b64_pad(c['credential_id'])))
        for c in credentials
    ]

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    challenge_b64 = base64.urlsafe_b64encode(options.challenge).decode().rstrip('=')
    mongo.db.webauthn_challenges.replace_one(
        {'user_id': user_id, 'type': 'authentication'},
        {
            'user_id':    user_id,
            'type':       'authentication',
            'challenge':  challenge_b64,
            'expires_at': datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        upsert=True,
    )

    return jsonify({**json.loads(options_to_json(options)), 'user_id': user_id}), 200


@webauthn_bp.route('/login/complete', methods=['POST'])
def login_complete():
    if not _WEBAUTHN_OK:
        return _unavailable()

    data        = request.get_json() or {}
    user_id     = data.get('user_id', '')
    credential  = data.get('credential')

    if not user_id or not credential:
        return jsonify({'error': 'missing_data'}), 400

    stored = mongo.db.webauthn_challenges.find_one({'user_id': user_id, 'type': 'authentication'})
    if not stored:
        return jsonify({'error': 'no_challenge', 'message': 'לא נמצא אתגר'}), 400

    expires = stored['expires_at']
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return jsonify({'error': 'challenge_expired'}), 400

    challenge = base64.urlsafe_b64decode(_b64_pad(stored['challenge']))

    cred_id_b64  = credential.get('id', '')
    stored_cred  = mongo.db.webauthn_credentials.find_one(
        {'user_id': user_id, 'credential_id': cred_id_b64}
    )
    if not stored_cred:
        return jsonify({'error': 'credential_not_found'}), 404

    pub_key    = base64.urlsafe_b64decode(_b64_pad(stored_cred['public_key']))
    sign_count = stored_cred.get('sign_count', 0)

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=pub_key,
            credential_current_sign_count=sign_count,
            require_user_verification=False,
        )
    except Exception as e:
        return jsonify({'error': 'verification_failed', 'message': str(e)}), 400

    mongo.db.webauthn_credentials.update_one(
        {'user_id': user_id, 'credential_id': cred_id_b64},
        {'$set': {'sign_count': verification.new_sign_count}},
    )
    mongo.db.webauthn_challenges.delete_one({'user_id': user_id, 'type': 'authentication'})

    user  = mongo.db.users.find_one({'_id': ObjectId(user_id)})
    token = generate_token(user_id)
    return jsonify({'token': token, 'user': user_public(user)}), 200


# ── Status ────────────────────────────────────────────────────────────────────

@webauthn_bp.route('/status', methods=['GET'])
@require_auth
def status():
    user_id = str(request.current_user['_id'])
    count   = mongo.db.webauthn_credentials.count_documents({'user_id': user_id})
    return jsonify({'registered': count > 0, 'count': count}), 200


@webauthn_bp.route('/unregister', methods=['DELETE'])
@require_auth
def unregister():
    user_id = str(request.current_user['_id'])
    mongo.db.webauthn_credentials.delete_many({'user_id': user_id})
    return jsonify({'message': 'טביעות האצבע הוסרו'}), 200

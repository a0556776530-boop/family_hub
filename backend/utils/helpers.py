import random
import string
from bson import ObjectId

def generate_invite_code(length=6) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB _id ObjectId to string recursively."""
    if doc is None:
        return None
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, list):
            result[k] = [str(i) if isinstance(i, ObjectId) else i for i in v]
        else:
            result[k] = v
    return result

def user_public(user: dict) -> dict:
    raw_role = user.get('role', 'child')
    # normalise legacy 'admin'/'member' values
    if raw_role == 'admin':
        role = 'parent'
    elif raw_role == 'member':
        role = 'child'
    else:
        role = raw_role  # 'parent' or 'child' already
    return {
        'id':             str(user['_id']),
        'name':           user.get('name', ''),
        'email':          user.get('email', ''),
        'avatar_url':     user.get('avatar_url', ''),
        'role':           role,
        'score':          user.get('score', 0),
        'wallet_balance': user.get('wallet_balance', 0),
        'family_id':      str(user['family_id']) if user.get('family_id') else None,
    }

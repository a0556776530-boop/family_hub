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

def normalize_role(raw_role: str) -> str:
    """Map legacy 'admin'/'member' role values to the current 'parent'/'child' scheme."""
    if raw_role == 'admin':
        return 'parent'
    if raw_role == 'member':
        return 'child'
    return raw_role or 'child'

def user_public(user: dict) -> dict:
    role = normalize_role(user.get('role', 'child'))
    return {
        'id':             str(user['_id']),
        'name':           user.get('name', ''),
        'email':          user.get('email', ''),
        'avatar_url':     user.get('avatar_url', ''),
        'role':      role,
        'family_id': str(user['family_id']) if user.get('family_id') else None,
    }

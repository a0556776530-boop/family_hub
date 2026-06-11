import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    MONGO_URI          = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/family_hub')
    JWT_SECRET         = os.environ.get('JWT_SECRET', 'dev-secret-change-in-production')
    FRONTEND_URL       = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    UPLOAD_FOLDER      = os.environ.get('UPLOAD_FOLDER', 'static/uploads')
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 5 * 1024 * 1024))
    JWT_EXPIRY_DAYS    = 7

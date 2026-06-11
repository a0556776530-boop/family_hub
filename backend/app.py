from flask import Flask
from pymongo import MongoClient
from flask_bcrypt import Bcrypt
from flask_socketio import SocketIO
from flask_cors import CORS
from config import Config

# Initialize DB at module level so it survives the Werkzeug reloader
_uri     = Config.MONGO_URI
_db_name = _uri.rsplit('/', 1)[-1].split('?')[0] or 'family_hub'
_client  = MongoClient(_uri)

class _MongoProxy:
    @property
    def db(self):
        return _client[_db_name]

mongo    = _MongoProxy()
bcrypt   = Bcrypt()
socketio = SocketIO()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    bcrypt.init_app(app)
    CORS(app, origins=[Config.FRONTEND_URL], supports_credentials=True)
    socketio.init_app(app, cors_allowed_origins='*', async_mode='gevent')

    from routes.auth     import auth_bp
    from routes.family   import family_bp
    from routes.tasks    import tasks_bp
    from routes.events   import events_bp
    from routes.chat     import chat_bp
    from routes.shopping import shopping_bp
    from routes.rewards  import rewards_bp
    from routes.moments  import moments_bp

    app.register_blueprint(auth_bp,     url_prefix='/api/auth')
    app.register_blueprint(family_bp,   url_prefix='/api/family')
    app.register_blueprint(tasks_bp,    url_prefix='/api/tasks')
    app.register_blueprint(events_bp,   url_prefix='/api/events')
    app.register_blueprint(chat_bp,     url_prefix='/api/chat')
    app.register_blueprint(shopping_bp, url_prefix='/api/shopping')
    app.register_blueprint(rewards_bp,  url_prefix='/api/rewards')
    app.register_blueprint(moments_bp,  url_prefix='/api/moments')

    import os
    from flask import send_from_directory

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'moments'), exist_ok=True)

    @app.route('/static/uploads/moments/<path:filename>')
    def serve_moment_image(filename):
        return send_from_directory(
            os.path.join(app.config['UPLOAD_FOLDER'], 'moments'), filename
        )

    return app


if __name__ == '__main__':
    import os
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)

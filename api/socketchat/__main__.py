import flask

from flask_socketio import SocketIO, emit

app = flask.Flask(__name__)
app.config['SECRET_KEY'] = 'a;lskdfja;lsdkfj'
socketio = SocketIO(app, cors_allowed_origins='*')


@app.route('/')
def index():
    print('received')
    emit('index_response', {'data': 'Server'})


@app.route('/update')
def update():
    return


@socketio.on('connect')
def handle_connection():
    print('someone arrived')


@socketio.on('chat message')
def handle_chat_message(message):
    print(f'received json: {message}')


if __name__ == '__main__':
    # app.run(host='127.0.0.1', port='8090')
    socketio.run(app, host='127.0.0.1', port='8090')

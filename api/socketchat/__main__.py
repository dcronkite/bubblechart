import math
import random
from datetime import datetime, timedelta

import flask
from flask_cors import CORS, cross_origin

from flask_socketio import SocketIO, emit

app = flask.Flask(__name__)
app.config['SECRET_KEY'] = 'a;lskdfja;lsdkfj'
cors = CORS(app)
socketio = SocketIO(app, cors_allowed_origins='*')
TIME = datetime.now()


@app.route('/')
def index():
    print('received')
    emit('index_response', {'data': 'Server'})


@app.route('/login', methods=['POST'])
@cross_origin()
def login():
    """Login user, jwt, etc."""
    return flask.jsonify({'username': f'User {random.randint(1000, 9999)}'})


@socketio.on('connect')
def handle_connection():
    print('someone arrived')


@socketio.on('chat message')
def handle_chat_message(json_data):
    data = {
        'username': json_data['username'],
        'message': json_data['message'],
    }
    emit('chat message', data, broadcast=True)


@socketio.on('update graph')
def update_graph(data=None):
    global TIME
    TIME += timedelta(minutes=1)
    new_data = {
        "Uhrzeit": TIME.strftime('%H:%M'),
        "Durchschn": math.floor((random.random() * 4000) + 0),
        "Anz": math.floor((random.random() * 1500) + 0),
        "Gesamt": math.floor((random.random() * 15000) + 0)
    }
    print(new_data)
    emit('update graph', {'data': new_data})


if __name__ == '__main__':
    # app.run(host='127.0.0.1', port='8090')
    socketio.run(app, host='127.0.0.1', port='8090')

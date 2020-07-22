import itertools
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import ClassVar

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


@dataclass
class Bubble:
    bubble_cnt: ClassVar = itertools.count()
    topic: str
    description: str = 'No description'
    category: str = 'R'
    highlighted: bool = False
    xcoord: int = field(default_factory=lambda: random.randint(50, 500))
    ycoord: int = field(default_factory=lambda: random.randint(50, 500))
    value: str = 'S'  # size
    bubble_id: int = field(init=False)

    def __post_init__(self):
        self.bubble_id = next(self.bubble_cnt)

    def to_json(self):
        return {
            'id': self.bubble_id,
            'value': self.value,
            'radius': 50,  # HACK
            'title': self.topic,
            'description': self.description,
            'category': self.category,
            'highlighted': self.highlighted,
            'x': self.xcoord,
            'y': self.ycoord,
        }


@dataclass
class Relationship:
    relation_cnt: ClassVar = itertools.count()
    source: int
    target: int
    relation_id: int = field(init=False)

    def __post_init__(self):
        self.relation_id = next(self.relation_cnt)

    def to_json(self):
        return {
            'id': self.relation_id,
            'source': self.source,
            'target': self.target,
        }


NODES = [
    Bubble(topic='Hello'),
    Bubble(topic='Hello Again'),
    Bubble(topic='Bonjour'),
]  # fake database

RELATIONSHIPS = [
    Relationship(source=0, target=1),
]


@app.route('/nodes', methods=['GET'])
@cross_origin()
def get_nodes():
    return {
        'data': [n.to_json() for n in NODES]
    }


@app.route('/relationships', methods=['GET'])
@cross_origin()
def get_relationships():
    return {
        'data': [r.to_json() for r in RELATIONSHIPS]
    }


@socketio.on('bubble moving')
def bubble_moving(json_data):
    emit('bubble moving', json_data, broadcast=True)


def update_node_position(bid, x, y):
    for bubble in NODES:
        if bubble.bubble_id == bid:
            bubble.xcoord = x
            bubble.ycoord = y
            break


@socketio.on('bubble moved')
def bubble_moving(json_data):
    emit('bubble moved', json_data, broadcast=True)
    update_node_position(json_data['id'], json_data['x'], json_data['y'])


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

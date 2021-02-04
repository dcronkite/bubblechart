import itertools
import math
import pathlib
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
    return flask.render_template(str(pathlib.Path(__file__).parent.parent.parent.absolute() / 'client' / 'index.html'))


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
    category: str = 'PV'
    highlighted: bool = True
    xcoord: int = field(default_factory=lambda: random.randint(50, 500))
    ycoord: int = field(default_factory=lambda: random.randint(50, 500))
    value: str = 'S'  # size
    bubble_id: int = field(init=False)
    size: str = 'M'

    def __post_init__(self):
        self.bubble_id = next(self.bubble_cnt)

    def to_json(self):
        return {
            'id': self.bubble_id,
            'value': self.value,
            'size': self.size,
            'label': self.topic,
            'title': self.description,
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
    Bubble(topic='Hello Again', category='SD', size='S'),
    Bubble(topic='Bonjour', category='HR', size='L'),
    Bubble(topic='Hello', category='HR', size='L'),
    Bubble(topic='ʔi, syaʔyaʔ', category='HR'),
    Bubble(topic='Türü medjü', size='L'),
    Bubble(topic='扎西德勒', category='SD', size='L'),
    Bubble(topic='Bonjour'),
    Bubble(topic='안녕하싴콰'),
    Bubble(topic='!Ka tseya?'),
    Bubble(topic='Hola', category='SD'),
    Bubble(topic='Hei', category='HR'),
    Bubble(topic='Moi'),
    Bubble(topic='Terve', category='SD', size='S'),
    Bubble(topic='Hallo', size='S'),
    Bubble(topic='መዓልኩም', category='SD'),
    Bubble(topic='Aloha', size='L'),
    Bubble(topic='Фэсапщи', size='S'),
    Bubble(topic='Tata bini', category='SD'),
    Bubble(topic='Oro', category='HR', size='L'),
    Bubble(topic='Fo'),
    Bubble(topic='Χαίρετε'),
    Bubble(topic='Γεια', category='SD', size='S'),
    Bubble(topic='سَّلام', category='HR'),
    Bubble(topic='שלמה'),
    Bubble(topic='བཀྲ་ཤིས་བདེ་ལེགས།', category='SD'),
    Bubble(topic='أَهْلاً'),
    Bubble(topic='nder momo', size='S'),
    Bubble(topic='Miiŋa bo', category='SD', size='S'),
    Bubble(topic='Салaм', category='HR', size='L'),
    Bubble(topic='प्रणाम।'),
    Bubble(topic='こんにちは。', category='SD'),
    Bubble(topic='Assalamu\'alaikum'),
    Bubble(topic='Hello Again', category='SD', size='S'),
    Bubble(topic='Bonjour', category='HR', size='L'),
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


@socketio.on('add relationship')
def add_relationship(json_data):
    new_relationship = Relationship(**json_data)
    RELATIONSHIPS.append(new_relationship)
    emit('add relationship', new_relationship.to_json(), broadcast=True)


@socketio.on('bubble moving')
def bubble_moving(json_data):
    emit('bubble moving', json_data, broadcast=True)


@socketio.on('delete node')
def delete_node(json_data):
    for node in NODES:
        if node.bubble_id == json_data['id']:
            node.highlighted = False
            delete_edges_for_node(node.bubble_id)
            break
    emit('delete node', json_data, broadcast=True)


def delete_edges_for_node(node_id):
    global RELATIONSHIPS
    n_before = len(RELATIONSHIPS)
    RELATIONSHIPS = [r for r in RELATIONSHIPS if r.source != node_id and r.target != node_id]
    n_after = len(RELATIONSHIPS)
    print(f'Deleted node #{node_id}: Removed {n_before - n_after} relationships; currently {n_after}')


@socketio.on('delete edge')
def delete_edge(json_data):
    global RELATIONSHIPS
    RELATIONSHIPS = [r for r in RELATIONSHIPS if r.relation_id != json_data['id']]
    emit('delete edge', json_data, broadcast=True)


def update_node_position(bid, x, y):
    for bubble in NODES:
        if bubble.bubble_id == bid:
            bubble.xcoord = x
            bubble.ycoord = y
            break


@socketio.on('bubble moved')
def bubble_moved(json_data):
    emit('bubble moved', json_data, broadcast=True)
    update_node_position(json_data['id'], json_data['x'], json_data['y'])


@socketio.on('change bubble size')
def bubble_moved(json_data):
    emit('change bubble size', json_data, broadcast=True)
    change_bubble_size(json_data['id'], json_data['size'])


@socketio.on('bubble selected')
def bubble_moved(json_data):
    print(json_data)
    emit('bubble selected', json_data, broadcast=True)


def change_bubble_size(bid, size):
    for bubble in NODES:
        if bubble.bubble_id == bid:
            bubble.size = size
            break


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
    socketio.run(app, host='0.0.0.0', port='8090')

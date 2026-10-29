"""Synthetic local model/tool exercise. No real model or account is used."""
import json
import importlib.metadata
import os
import socket
import urllib.request

_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex
_real_getaddrinfo = socket.getaddrinfo


def _allow_loopback(address):
    if not isinstance(address, tuple) or address[0] not in ('127.0.0.1', '::1'):
        raise PermissionError('non-loopback connection denied')


def _connect(self, address):
    _allow_loopback(address)
    return _real_connect(self, address)


def _connect_ex(self, address):
    _allow_loopback(address)
    return _real_connect_ex(self, address)


def _getaddrinfo(host, *args, **kwargs):
    if host not in ('127.0.0.1', '::1', 'localhost'):
        raise PermissionError('non-loopback DNS denied')
    return _real_getaddrinfo(host, *args, **kwargs)


# Application-level fixture guard only; this is not an operating-system sandbox.
socket.socket.connect = _connect
socket.socket.connect_ex = _connect_ex
socket.getaddrinfo = _getaddrinfo

from agno.agent import Agent
from agno.models.openai.like import OpenAILike

if importlib.metadata.version('agno') != '3.0.10' or importlib.metadata.version('openai') != '3.16.2':
    raise RuntimeError('Install the exact versions in examples/agno/requirements.txt')

origin = os.environ['FIXTURE_ORIGIN']


def save_draft(title: str) -> str:
    """Save one synthetic draft to the local fixture."""
    request = urllib.request.Request(
        origin + '/records', data=json.dumps({'title': title}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        print('synthetic tool returned HTTP', response.status, flush=True)
        return 'synthetic saved HTTP ' + str(response.status)


model = OpenAILike(id='scripted', api_key='synthetic-not-a-key', base_url=origin + '/v1', max_retries=0, timeout=5)
agent = Agent(model=model, tools=[save_draft], retries=1, delay_between_retries=0, telemetry=False)
try:
    result = agent.run('Save the synthetic draft.')
    print('agent.run returned normally; result status:', str(getattr(result, 'status', 'unavailable')), flush=True)
except Exception as exc:
    print('agent.run raised:', type(exc).__name__, flush=True)

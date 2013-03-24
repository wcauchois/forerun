from __future__ import with_statement
import os
from fabric.api import run, local, settings, abort, env, cd, lcd
from fabric.operations import put

def linode():
  env.host_string = 'linode'

def run_with_path(cmd):
  # path weirdness when using ssh
  run('. ~/.bash_profile && export PATH="/usr/local/bin:$PATH" && %s' % cmd)

def start():
  with cd('forerun'):
    run_with_path('scripts/start.sh')

def stop():
  with cd('forerun'):
    run('. ~/.bash_profile && scripts/stop.sh')

def restart():
  with cd('forerun'):
    run('. ~/.bash_profile && scripts/restart.sh')


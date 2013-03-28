#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
scp linode:forerun.git/hooks/post-receive $DIR/post-receive.example

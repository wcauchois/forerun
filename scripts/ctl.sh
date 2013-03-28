#!/bin/bash

if [ -f $HOME/run/forerun.pid ]; then
  if pgrep -F $HOME/run/forerun.pid >/dev/null; then
    STATUS="running"
  else
    rm $HOME/run/forerun.pid
    STATUS="stopped"
  fi
else
  STATUS="stopped"
fi

case $1 in
  start)
    mkdir -p log
    case $STATUS in
      running)
        echo "Forerun is already running"
        exit 0
        ;;
      stopped)
        nohup foreman start >log/out.log 2>log/error.log &
        if [ $? -eq 0 ]; then
          echo $! >$HOME/run/forerun.pid
          echo "Started Forerun"
          exit 0
        else
          echo "Error starting Forerun"
          cat log/error.log
          exit 1
        fi
        ;;
    esac
    ;;
  stop)
    case $STATUS in
      running)
        PID=`cat $HOME/run/forerun.pid`
        if kill $PID; then
          while [ -e /proc/$PID ]; do sleep 0.1; done
          rm $HOME/run/forerun.pid
          echo "Stopped Forerun"
          exit 0
        else
          echo "Error stopping Forerun"
          exit 1
        fi
        ;;
      stopped)
        echo "Forerun is not running"
        exit 0
        ;;
    esac
    ;;
  restart)
    echo "Restarting Forerun..."
    $0 stop && $0 start
esac

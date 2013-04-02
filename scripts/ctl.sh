#!/bin/bash
# NOTE this script should be used for PRODUCTION only
# for development, just run `foreman start` yourself

LOGDIR=$HOME/log
mkdir -p $LOGDIR

if pgrep foreman >/dev/null; then
  STATUS="running"
else
  STATUS="stopped"
fi

case $1 in
  start)
    case $STATUS in
      running)
        echo "Forerun is already running"
        exit 0
        ;;
      stopped)
        export NODE_ENV=production
        nohup foreman start >>$LOGDIR/out.log 2>>$LOGDIR/err.log &
        if [ $? -eq 0 ]; then
          echo "Started Forerun"
          exit 0
        else
          echo "Error starting Forerun"
          exit 1
        fi
        ;;
    esac
    ;;
  stop)
    case $STATUS in
      running)
        PID=`pidof foreman`
        if kill $PID; then
          while [ -e /proc/$PID ]; do sleep 0.1; done
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

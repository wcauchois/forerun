#!/bin/bash
case `bash scripts/check_status.sh` in
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
esac

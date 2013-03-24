#!/bin/bash
mkdir -p log
case `bash scripts/check_status.sh` in
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
      exit 1
    fi
    ;;
esac

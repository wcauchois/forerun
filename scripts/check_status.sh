if [ -f forerun.pid ]; then
  if pgrep -F $HOME/run/forerun.pid >/dev/null; then
    echo "running"
  else
    rm $HOME/run/forerun.pid
    echo "stopped"
  fi
else
  echo "stopped"
fi


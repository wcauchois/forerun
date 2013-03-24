if [ -f forerun.pid ]; then
  if pgrep -F forerun.pid >/dev/null; then
    echo "running"
  else
    rm forerun.pid
    echo "stopped"
  fi
else
  echo "stopped"
fi


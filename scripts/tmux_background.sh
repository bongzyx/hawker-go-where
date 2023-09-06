#!/bin/bash

SESSION_NAME="hawker-go-where"
SCRIPT_DIR="$(dirname "$0")"
RELATIVE_SCRIPT="../hawker_go_where_bot.py"
PYTHON_SCRIPT="$SCRIPT_DIR/$RELATIVE_SCRIPT"

if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    tmux attach -t $SESSION_NAME
else
    tmux new-session -d -s $SESSION_NAME
    tmux send-keys -t $SESSION_NAME "python3 $PYTHON_SCRIPT" C-m
fi

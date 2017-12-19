#! /usr/bin/env bash

# Download and build the model-preview binary if not present
echo "Install Printrbot/fauxgl"
cd $HOME
if [ -d fauxgl ]; then
    echo "-- Printrbot/fauxgl repository already cloned"
else
    FAUXGL_REPO=git@github.com:Printrbot/fauxgl.git
    echo "-- Cloning fauxgl repo"
    git clone $FAUXGL_REPO
fi

cd fauxgl

# TODO remove once merged to master
BRANCH=model-preview
if [ ! "`git br | grep '^\*' | cut -f 2 -d ' '`" = "$BRANCH" ]; then
    echo "Checking out branch: $BRANCH"
    git checkout "$BRANCH"
fi

if [ ! -x ./model-preview ]; then
    echo "-- Building model-preview"
    go build cmd/model-preview/model-preview.go
fi

if [ ! -x ./model-preview ]; then
    echo "ERROR: model-preview not found. Check logs for details"
    exit 1
fi

INSTALL_PATH=$HOME/cloud-services/render
if [ ! -d "$INSTALL_PATH" ]; then
    echo "ERROR: $INSTALL_PATH directory not found. Make sure the cloud-services repo has been cloned"
    exit 1
fi

cp model-preview $INSTALL_PATH

echo "model-preview built successfully"

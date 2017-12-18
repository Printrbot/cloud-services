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
git checkout model-preview
echo "-- Building model-preview"
go build cmd/model-preview/model-preview.go

if [ ! -x ./model-preview ]; then
    echo "ERROR: model-preview not found. Check logs for details"
    exit 1
fi

echo "model-preview built successfully"

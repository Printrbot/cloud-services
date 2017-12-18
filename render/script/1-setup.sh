#! /usr/bin/env bash

# sudo required - fail fast if running as normal user
if [ ! `whoami` = "root" ]; then
    echo "setup.sh must be run as root: try 'sudo setup.sh'"
    exit 1
fi

# Ensure temp directory exists for preview image rendering files
# TODO set env variable and have both this script and app.js reference variable
RENDER_TMP_DIR=/tmp/render
echo "Temp render directory: $RENDER_TMP_DIR"
if [ -d "$RENDER_TMP_DIR" ]; then
    echo "-- Directory already exists"
else
    echo "-- Creating render temp directory: $RENDER_TMP_DIR"
    mkdir $RENDER_TMP_DIR
    chmod 777 $RENDER_TMP_DIR
fi

# Ensure go has been installed
PKG_NAME=go1.9.2.linux-amd64.tar.gz
echo "Install Go: $PKG_NAME"
if [ -d /usr/local/go ]; then
    echo "-- Go already installed"
else
    echo "-- Installing $PKG_NAME"

    # Ensure download directory exists
    DL_DIR=/tmp/dl
    if [ ! -d $DL_DIR ]; then
        echo "-- Creating download directory: $DL_DIR"
        mkdir $DL_DIR
    fi
    cd $DL_DIR

    # Download distribution if not already present
    if [ ! -f $PKG_NAME ]; then
        PKG_URL=https://storage.googleapis.com/golang/$PKG_NAME
        echo "-- Downloading $PKG_URL"
        wget $PKG_URL
    fi

    # Unpack distribution to /usr/local
    echo "-- Unpacking: $PKG_NAME"
    tar -C /usr/local -xzf $PKG_NAME

    # Update system-wide profile to add Go binaries to PATH
    echo "-- Adding /usr/local/go/bin to path in /etc/profile"
    echo 'export PATH=$PATH:/usr/local/go/bin' # TODO  >> /etc/profile
    source /etc/profile

    # Ensure we can find the go binary
    if [ $(whereis go) = "go:" ]; then
        echo "ERROR: Cannot locate go binary. Check installation"
        exit 1
    fi
fi

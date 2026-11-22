"""Shared SSH settings for the operational / deploy scripts.

Credentials are read from the environment, never from source code:

    DEPLOY_HOST          server address (default: the production server's public IP)
    DEPLOY_USER          login user (default: root; prefer a dedicated deploy user)
    DEPLOY_SSH_KEY       path to a private key file (preferred)
    DEPLOY_SSH_PASSWORD  password (fallback; DEPLOY_PASSWORD is also accepted)

Usage:  from _ssh_config import HOST, USER, PASSWORD, ssh_connect_kwargs
        client.connect(**ssh_connect_kwargs(), timeout=30)
"""
import os
import sys

HOST = os.environ.get("DEPLOY_HOST", "95.217.14.198")
USER = os.environ.get("DEPLOY_USER", "root")
KEY_FILE = os.environ.get("DEPLOY_SSH_KEY") or None
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD") or None

if not KEY_FILE and not PASSWORD:
    sys.exit(
        "No SSH credentials. Set DEPLOY_SSH_KEY (key file path) or DEPLOY_SSH_PASSWORD in your shell "
        "environment. Credentials must never be written into scripts."
    )


def ssh_connect_kwargs() -> dict:
    """Keyword arguments for paramiko's SSHClient.connect (host, user and key or password)."""
    kwargs = {"hostname": HOST, "username": USER}
    if KEY_FILE:
        kwargs["key_filename"] = KEY_FILE
    else:
        kwargs["password"] = PASSWORD
    return kwargs

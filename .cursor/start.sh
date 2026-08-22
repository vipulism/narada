#!/usr/bin/env bash
# Per-boot startup for Narada's backing services.
# Starts MariaDB and RabbitMQ (this base image has no systemd), waits until each
# is ready, and idempotently ensures the narada database + user exist.
# Tolerates restarts: skips services that are already running.
set -euo pipefail

echo "==> Starting MariaDB"
if sudo mariadb-admin ping >/dev/null 2>&1; then
    echo "    MariaDB already running"
else
    sudo mkdir -p /var/log/mysql /run/mysqld
    sudo chown mysql:mysql /run/mysqld 2>/dev/null || true
    sudo bash -c 'nohup mariadbd-safe --datadir=/var/lib/mysql >/var/log/mysql/mariadbd-safe.log 2>&1 &'
    for _ in $(seq 1 30); do
        if sudo mariadb-admin ping >/dev/null 2>&1; then break; fi
        sleep 1
    done
    sudo mariadb-admin ping >/dev/null 2>&1 && echo "    MariaDB ready" || {
        echo "    MariaDB failed to start"; exit 1; }
fi

echo "==> Ensuring narada database and user exist"
sudo mariadb <<'SQL'
CREATE DATABASE IF NOT EXISTS narada CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'narada'@'localhost' IDENTIFIED BY 'narada';
CREATE USER IF NOT EXISTS 'narada'@'127.0.0.1' IDENTIFIED BY 'narada';
GRANT ALL PRIVILEGES ON narada.* TO 'narada'@'localhost';
GRANT ALL PRIVILEGES ON narada.* TO 'narada'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "==> Starting RabbitMQ"
if sudo rabbitmqctl status >/dev/null 2>&1; then
    echo "    RabbitMQ already running"
else
    sudo rabbitmq-server -detached
    for _ in $(seq 1 40); do
        if sudo rabbitmqctl status >/dev/null 2>&1; then break; fi
        sleep 2
    done
    sudo rabbitmqctl status >/dev/null 2>&1 && echo "    RabbitMQ ready" || {
        echo "    RabbitMQ failed to start"; exit 1; }
fi

echo "==> Backing services ready"

#!/bin/bash

set -a
source .env
set +a

docker-compose --env-file .env up -d

docker ps --filter "name=${POLICE_DB_NAME}"


# Команда запуска базы данных ./start.sh                                
.PHONY: help up down logs pull ps backup restore jitsi-up jitsi-down zammad-up zammad-down monitoring-up monitoring-down onboard wire smoke fmt-check

SHELL := /bin/bash

help:
	@echo "Corehub / MedTheris stack"
	@echo ""
	@echo "  make up            - start core stack"
	@echo "  make down          - stop core stack"
	@echo "  make logs s=<svc>  - tail logs for one service"
	@echo "  make ps            - show container status"
	@echo "  make pull          - update images"
	@echo ""
	@echo "  make jitsi-up / jitsi-down"
	@echo "  make zammad-up / zammad-down"
	@echo "  make monitoring-up / monitoring-down"
	@echo ""
	@echo "  make backup        - run offsite backup now"
	@echo "  make restore S=s3://corehub-backups/.../corehub-<ts>.tar"
	@echo ""
	@echo "  make onboard SLUG=mueller NAME='Physio Müller AG' EMAIL=info@example.ch"
	@echo "  make wire REALM=corehub                  - wire OIDC for all apps in a realm"
	@echo "  make wire REALM=practice-mueller APP=nextcloud"
	@echo "  make smoke [TENANT=mueller]              - post-deploy smoke test"

up:
	docker compose --env-file .env up -d

down:
	docker compose down

ps:
	docker compose ps

logs:
	docker compose logs -f $(s)

pull:
	docker compose pull
	docker compose up -d

jitsi-up:
	docker compose -f docker-compose.jitsi.yml --env-file .env up -d

jitsi-down:
	docker compose -f docker-compose.jitsi.yml down

zammad-up:
	docker compose -f docker-compose.zammad.yml --env-file .env up -d

zammad-down:
	docker compose -f docker-compose.zammad.yml down

monitoring-up:
	docker compose -f docker-compose.monitoring.yml --env-file .env up -d

monitoring-down:
	docker compose -f docker-compose.monitoring.yml down

backup:
	./scripts/backup.sh

restore:
	./scripts/restore.sh $(S)

onboard:
	./scripts/onboard-practice.sh $(SLUG) "$(NAME)" $(EMAIL)

wire:
	./scripts/wire-oidc.sh $(REALM) $(APP)

smoke:
	@if [ -n "$(TENANT)" ]; then ./scripts/smoke-test.sh --tenant $(TENANT); \
	 else ./scripts/smoke-test.sh; fi

fmt-check:
	docker compose config -q
	docker compose -f docker-compose.jitsi.yml config -q
	docker compose -f docker-compose.zammad.yml config -q
	docker compose -f docker-compose.monitoring.yml config -q
	@echo "compose files OK"

# PostgreSQL with the schema and seed baked in. On the first start (empty data
# directory) the image's entrypoint runs /docker-entrypoint-initdb.d/*.sql in
# filename order: 001 creates the table, 002 seeds it. Later starts skip them.
# Baking them into the image means Compose and Kubernetes apply the exact same
# versioned SQL without extra mounts or ConfigMaps. Exact tag, never "latest".
FROM postgres:16.6-alpine3.21

COPY --chown=postgres:postgres migrations/001_create_loans_table.sql /docker-entrypoint-initdb.d/
COPY --chown=postgres:postgres seed/002_seed_loans.sql /docker-entrypoint-initdb.d/

# Run as the image's non-root "postgres" user (uid 70 on alpine) instead of
# starting as root. The data directory must therefore be writable by uid 70:
# a fresh named volume inherits that ownership from the image, and on
# Kubernetes fsGroup 70 does the same for the PVC.
USER postgres
EXPOSE 5432
